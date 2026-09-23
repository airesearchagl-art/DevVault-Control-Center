# Shared harness for the DVCC running-app smokes (dot-sourced by scripts/verify-*.ps1).
#
# Safety rules every smoke built on this follows:
# - the app runs on a hidden desktop created by this run, so nothing appears on the operator's screen;
# - it runs against a data folder the caller created under %TEMP% (DVCC_DATA_DIR), never the
#   operator's %APPDATA% folders;
# - only processes this run started are stopped, by process id — never by name, so an operator's
#   DVCC, browser or other WebView2 host is never touched;
# - the clipboard is shared across desktops, so a copy is only pressed when the clipboard holds text
#   (or nothing) this run can put back; it is put back at once, and only if nobody else wrote to it
#   since DVCC did (Windows clipboard sequence number). Anything else is INCONCLUSIVE, not skipped
#   silently and never overwritten.
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
  return $childPid
}

function Stop-App([int] $processId) {
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

# Presses a control that writes the clipboard, under the guard described at the top. Returns $false
# (and records INCONCLUSIVE) when the clipboard could not be put back, in which case nothing is pressed.
function Invoke-GuardedCopy([string] $testId, [string] $label) {
  $kind = Get-ClipboardKind
  if ($kind -ne "text" -and $kind -ne "empty") {
    Skip $label "the clipboard holds $kind, which this run cannot put back; $testId not pressed"
    return $false
  }
  $snapshot = if ($kind -eq "text") { Get-Clipboard -Raw } else { $null }
  $before = [DvccDesktop]::GetClipboardSequenceNumber()

  Invoke-Cdp "document.querySelector('[data-testid=$testId]').click(); true" | Out-Null

  $deadline = (Get-Date).AddSeconds(6)
  $afterCopy = $before
  while ((Get-Date) -lt $deadline) {
    $current = [DvccDesktop]::GetClipboardSequenceNumber()
    if ($current -ne $before) { $afterCopy = $current; break }
    Start-Sleep -Milliseconds 100
  }

  if ($afterCopy -ne $before) {
    if ([DvccDesktop]::GetClipboardSequenceNumber() -eq $afterCopy) {
      try {
        if ($null -eq $snapshot) { $null | clip.exe } else { Set-Clipboard -Value $snapshot }
      }
      catch { Write-Host "[note] the clipboard could not be put back: $_" }
    }
    else {
      Write-Host "[note] the clipboard changed after the copy; left exactly as it is"
    }
  }
  return $true
}

function Write-Summary {
  Write-Output ""
  Write-Output ("checks: {0} passed, {1} failed, {2} inconclusive" -f ($script:results.Count - $script:failures - $script:skipped), $script:failures, $script:skipped)
  Write-Output ("data folder: {0}" -f $dataDir)
}
