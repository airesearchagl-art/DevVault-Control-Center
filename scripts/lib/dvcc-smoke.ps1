# Shared harness for the DVCC running-app smokes (dot-sourced by scripts/verify-*.ps1).
#
# Safety rules every smoke built on this follows:
# - the app runs on a hidden desktop created by this run, so nothing appears on the operator's screen;
# - it runs against a data folder the caller created under %TEMP% (DVCC_DATA_DIR), never the
#   operator's %APPDATA% folders;
# - only processes this run started are stopped, by process id — never by name, so an operator's
#   DVCC, browser or other WebView2 host is never touched;
# - the operator's clipboard is never written, not even to put something back (SF-WF-01). DVCC's one
#   clipboard command is intercepted inside the app's page, before it reaches Windows: see
#   "clipboard" below. The operator's clipboard is only ever read, as a fingerprint.
#
# Results are written to the host, never to the output stream, so a helper that records a check still
# returns only its own value (a skipped copy must return $false, not a truthy array of text).
#
# The caller defines $Exe, $Port, $ReadySeconds, $dataDir and $desktopName before calling Start-App.

$script:results = [System.Collections.Generic.List[object]]::new()
$script:failures = 0
$script:skipped = 0
$script:started = [System.Collections.Generic.List[int]]::new()

function Check([string] $name, [bool] $ok, $detail) {
  $script:results.Add([pscustomobject]@{ check = $name; ok = $ok; detail = $detail })
  if (-not $ok) { $script:failures++ }
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} :: {2}" -f $mark, $name, ($detail | Out-String).Trim())
}

# Not a pass and not a failure: the run could not do this safely, so it did not do it.
function Skip([string] $name, $detail) {
  $script:results.Add([pscustomobject]@{ check = $name; ok = $null; detail = $detail })
  $script:skipped++
  Write-Host ("[INCONCLUSIVE] {0} :: {1}" -f $name, ($detail | Out-String).Trim())
}

if (-not ("DvccDesktop" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DvccDesktop {
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit,
    uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateDesktopW(string name, IntPtr dev, IntPtr dm, int flags, uint access, IntPtr sa);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  const uint GENERIC_ALL = 0x10000000;
  static IntPtr desktop = IntPtr.Zero;
  static Dictionary<int, IntPtr> handles = new Dictionary<int, IntPtr>();
  public static void Create(string name) {
    desktop = CreateDesktopW(name, IntPtr.Zero, IntPtr.Zero, 0, GENERIC_ALL, IntPtr.Zero);
    if (desktop == IntPtr.Zero) throw new Exception("CreateDesktopW failed: " + Marshal.GetLastWin32Error());
  }
  public static void Release() {
    foreach (IntPtr h in handles.Values) CloseHandle(h);
    handles.Clear();
    if (desktop != IntPtr.Zero) { CloseDesktop(desktop); desktop = IntPtr.Zero; }
  }
  public static int Start(string exe, string desktopName) {
    var si = new STARTUPINFO();
    si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    si.lpDesktop = desktopName;
    PROCESS_INFORMATION pi;
    if (!CreateProcessW(exe, null, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, null, ref si, out pi))
      throw new Exception("CreateProcessW failed: " + Marshal.GetLastWin32Error());
    CloseHandle(pi.hThread);
    handles[pi.dwProcessId] = pi.hProcess;
    return pi.dwProcessId;
  }
}
"@
}

# --- CDP -------------------------------------------------------------------------------------------
$script:socket = $null
$script:cdpId = 0

function Connect-Cdp([int] $port, [int] $timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json" -TimeoutSec 3
      $page = $targets | Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl } | Select-Object -First 1
      if ($page) {
        $ws = [System.Net.WebSockets.ClientWebSocket]::new()
        $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait(5000) | Out-Null
        if ($ws.State -eq "Open") { $script:socket = $ws; return $true }
      }
    }
    catch { }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Close-Cdp {
  if ($script:socket) {
    try { $script:socket.Dispose() } catch { }
    $script:socket = $null
  }
}

# Sends one CDP command and returns its `result`.
function Invoke-CdpMethod([string] $method, [hashtable] $params) {
  $script:cdpId++
  $payload = @{ id = $script:cdpId; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [System.ArraySegment[byte]]::new($bytes)
  $script:socket.SendAsync($segment, "Text", $true, [System.Threading.CancellationToken]::None).Wait(5000) | Out-Null
  $buffer = [byte[]]::new(262144)
  $sb = [System.Text.StringBuilder]::new()
  while ($true) {
    $segmentIn = [System.ArraySegment[byte]]::new($buffer)
    $task = $script:socket.ReceiveAsync($segmentIn, [System.Threading.CancellationToken]::None)
    if (-not $task.Wait(15000)) { throw "CDP receive timed out" }
    $received = $task.Result
    [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $received.Count))
    if ($received.EndOfMessage) {
      $message = $sb.ToString() | ConvertFrom-Json
      if ($message.id -eq $script:cdpId) {
        if ($message.error) { throw "CDP $method failed: $($message.error.message)" }
        return $message.result
      }
      [void]$sb.Clear()
    }
  }
}

function Invoke-Cdp([string] $expression) {
  $result = Invoke-CdpMethod "Runtime.evaluate" @{ expression = $expression; returnByValue = $true; awaitPromise = $true }
  if ($result.exceptionDetails) { throw "evaluate failed: $($result.exceptionDetails.text) $($result.exceptionDetails.exception.description)" }
  return $result.result.value
}

function Wait-For([string] $expression, [int] $seconds = 20) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try { if (Invoke-Cdp $expression) { return $true } } catch { }
    Start-Sleep -Milliseconds 300
  }
  return $false
}

function Start-App([string] $label) {
  $env:DVCC_DATA_DIR = $dataDir
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
  $childPid = [DvccDesktop]::Start($Exe, $desktopName)
  $script:started.Add($childPid)
  if (-not (Connect-Cdp $Port $ReadySeconds)) { throw "$label : no CDP page appeared" }
  if (-not (Wait-For "document.querySelector('[data-testid=queue-list]') !== null || document.querySelector('[data-testid=empty-no-projects]') !== null" 30)) {
    throw "$label : the app never rendered its queue"
  }
  # Every page this harness drives has the interceptor, or the run stops before anything is clicked.
  Install-ClipboardInterceptor $label
  return $childPid
}

function Stop-App([int] $processId) {
  if ($script:socket) { Remove-ClipboardInterceptor | Out-Null }
  Close-Cdp
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
}

# Only what this run started, by process id: another DVCC belongs to the operator.
function Stop-Started {
  if ($script:socket) { Remove-ClipboardInterceptor | Out-Null }
  Close-Cdp
  foreach ($id in $script:started) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  [DvccDesktop]::Release()
  Remove-Item Env:\DVCC_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
}

# --- clipboard ----------------------------------------------------------------------------------

function Get-ClipboardKind {
  try {
    if (Get-Clipboard -Format Image -ErrorAction SilentlyContinue) { return "image" }
    $files = Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue
    if ($files -and @($files).Count -gt 0) { return "files" }
    $text = Get-Clipboard -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrEmpty($text)) { return "empty" }
    return "text"
  }
  catch { return "unknown" }
}

# What the clipboard holds, without reading it into the log: kind, length and SHA-256 of the text,
# and the Windows sequence number. Used to show that a run left the operator's clipboard as it was.
function Get-ClipboardFingerprint {
  $kind = Get-ClipboardKind
  $sequence = [DvccDesktop]::GetClipboardSequenceNumber()
  if ($kind -ne "text") { return "kind=$kind seq=$sequence" }
  $text = Get-Clipboard -Raw
  $sha = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))).Replace("-", "").Substring(0, 16)
  return "kind=text length=$($text.Length) sha256=$sha seq=$sequence"
}

# --- clipboard interception (SF-WF-01) ---------------------------------------------------------------
#
# DVCC copies with `@tauri-apps/plugin-clipboard-manager` 2.3.3 `writeText(text)`, which calls
# `invoke('plugin:clipboard-manager|write_text', { label, text })`. In Tauri 2.11.5
# `__TAURI_INTERNALS__.invoke`, `.ipc` and `.postMessage` are non-writable, so the interception sits
# one step further down, at the transport they all use: `fetch(convertFileSrc(cmd, 'ipc'))`, a POST to
# `http://ipc.localhost/plugin%3Aclipboard-manager%7Cwrite_text` with the JSON body `{"text": ...}`.
#
# The wrapper answers exactly that one URL itself — the text is kept in page state and the app is told
# the write succeeded, the way Tauri's own transport reports success (`Tauri-Response: ok`, JSON
# `null`) — and passes every other request to the original `fetch` unchanged. Nothing reaches the
# Windows clipboard. No production code changes; the wrapper lives only in the page this run started,
# and Remove-ClipboardInterceptor puts the original `fetch` back.

$script:interceptorJs = @'
(() => {
  if (window.__dvccClipboard) return window.__dvccClipboard.target;
  const internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.convertFileSrc !== "function") return "";
  const target = internals.convertFileSrc("plugin:clipboard-manager|write_text", "ipc");
  const original = window.fetch;
  const state = { target, original, writes: [], forwarded: 0, wrapper: null };
  state.wrapper = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (url === target) {
      let text = null;
      try { text = JSON.parse(init && init.body).text; } catch (e) { text = null; }
      state.writes.push(typeof text === "string" ? text : null);
      return Promise.resolve(new Response("null", { status: 200, headers: { "Content-Type": "application/json", "Tauri-Response": "ok" } }));
    }
    if (typeof url === "string" && url.indexOf("://ipc.localhost/") >= 0) state.forwarded++;
    return original.apply(this, arguments);
  };
  window.fetch = state.wrapper;
  window.__dvccClipboard = state;
  return target;
})()
'@

$script:interceptorTarget = "http://ipc.localhost/plugin%3Aclipboard-manager%7Cwrite_text"

function Install-ClipboardInterceptor([string] $label) {
  $target = Invoke-Cdp $script:interceptorJs
  if ($target -ne $script:interceptorTarget) { throw "$label : the clipboard interceptor could not be installed (target '$target')" }
}

function Test-ClipboardInterceptor {
  return [bool](Invoke-Cdp '!!window.__dvccClipboard && window.fetch === window.__dvccClipboard.wrapper')
}

function Remove-ClipboardInterceptor {
  try {
    return [bool](Invoke-Cdp '(() => { const s = window.__dvccClipboard; if (!s) return true; window.fetch = s.original; delete window.__dvccClipboard; return window.fetch === s.original; })()')
  }
  catch { return $false }
}

# Any change of the Windows clipboard sequence while this run was driving the app. The harness never
# writes the clipboard, so a change is someone else's (or a leak the self-check exists to catch); it
# is never answered by writing anything back.
$script:clipboardSequenceAtStart = [DvccDesktop]::GetClipboardSequenceNumber()
$script:externalClipboardActivity = $false
$script:lastCopied = $null

# Presses a control that copies, with the interceptor in place, and returns what DVCC tried to put on
# the clipboard, or $null (INCONCLUSIVE) when it cannot be done safely. Never touches the clipboard.
function Invoke-InterceptedCopy([string] $testId, [string] $label) {
  $script:lastCopied = $null
  if (-not (Test-ClipboardInterceptor)) {
    Skip $label "the clipboard interceptor is not in place; $testId not pressed"
    return $null
  }
  $count = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
  $sequence = [DvccDesktop]::GetClipboardSequenceNumber()
  Invoke-Cdp "document.querySelector('[data-testid=$testId]').click(); true" | Out-Null
  $seen = Wait-For "window.__dvccClipboard.writes.length > $count" 8
  if ([DvccDesktop]::GetClipboardSequenceNumber() -ne $sequence) {
    $script:externalClipboardActivity = $true
    Write-Host "[note] EXTERNAL_CLIPBOARD_ACTIVITY during $testId (nothing was restored)"
  }
  if (-not $seen) {
    Skip $label "no clipboard write reached the interceptor after $testId"
    return $null
  }
  $writes = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
  if ($writes -ne $count + 1) {
    Skip $label "expected one intercepted clipboard write, saw $($writes - $count)"
    return $null
  }
  $script:lastCopied = Invoke-Cdp "window.__dvccClipboard.writes[$count]"
  return $script:lastCopied
}

# The file DVCC wrote and the text it tried to copy are the same, allowing only for CRLF/LF and the
# final newline the storage layer guarantees.
function Test-SameText([string] $a, [string] $b) {
  if ($null -eq $a -or $null -eq $b) { return $false }
  return (($a -replace "`r`n", "`n").TrimEnd("`n") -eq ($b -replace "`r`n", "`n").TrimEnd("`n"))
}

# The operator's clipboard at the end of a run: unchanged (PASS), changed by someone while nothing of
# this run could have written it (INCONCLUSIVE, EXTERNAL_CLIPBOARD_ACTIVITY), never "restored".
function Test-OperatorClipboard([string] $before) {
  $after = Get-ClipboardFingerprint
  Write-Host ("clipboard at end:   " + $after)
  $sequenceNow = [DvccDesktop]::GetClipboardSequenceNumber()
  if ($sequenceNow -ne $script:clipboardSequenceAtStart -or $script:externalClipboardActivity) {
    Skip "the operator's clipboard is untouched" "EXTERNAL_CLIPBOARD_ACTIVITY: sequence $($script:clipboardSequenceAtStart) -> $sequenceNow; nothing was restored ($before -> $after)"
    return
  }
  Check "the operator's clipboard is untouched" ($before -eq $after) "$before -> $after"
}

function Write-Summary {
  Write-Output ""
  Write-Output ("checks: {0} passed, {1} failed, {2} inconclusive" -f ($script:results.Count - $script:failures - $script:skipped), $script:failures, $script:skipped)
  Write-Output ("data folder: {0}" -f $dataDir)
}
