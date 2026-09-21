# Localization UI smoke (Wave 5, LR-20260920-DVCC-003).
#
# Runs the release build on a hidden isolated desktop against a dedicated data folder seeded from
# the synthetic fixtures. Nothing appears on the operator's desktop and nothing outside the
# temporary data folder is written.
#
# The clipboard is shared across desktops, so the one action that writes it (Copy review prompt) is
# guarded: the clipboard is only touched when it holds text this test can put back, it is restored
# immediately after each copy rather than at the end of the run, and it is left alone if anyone
# else wrote to it in between (checked with the Windows clipboard sequence number). A clipboard
# holding an image or files is never overwritten — those checks are skipped instead.
#
# Checks: Japanese by default, the switch to English, the review state untouched by a switch,
# settings.json after each switch, the language restored after a restart, and the review request
# written in the language in use.

param(
  [string] $Exe = "",
  [int] $Port = 9333,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-l10n-$runId"
$dataDir = Join-Path $root "data"
$desktopName = "dvcc-l10n-$runId"
$results = [System.Collections.Generic.List[object]]::new()
$failures = 0

$skipped = 0

function Check([string] $name, [bool] $ok, $detail) {
  $script:results.Add([pscustomobject]@{ check = $name; ok = $ok; detail = $detail })
  if (-not $ok) { $script:failures++ }
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  Write-Output ("[{0}] {1} :: {2}" -f $mark, $name, ($detail | Out-String).Trim())
}

# Not a pass and not a failure: the run could not put the operator's clipboard back, so it did not
# take it in the first place.
function Skip([string] $name, $detail) {
  $script:results.Add([pscustomobject]@{ check = $name; ok = $null; detail = $detail })
  $script:skipped++
  Write-Output ("[INCONCLUSIVE] {0} :: {1}" -f $name, ($detail | Out-String).Trim())
}

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

function Invoke-Cdp([string] $expression) {
  $script:cdpId++
  $payload = @{
    id     = $script:cdpId
    method = "Runtime.evaluate"
    params = @{ expression = $expression; returnByValue = $true; awaitPromise = $true }
  } | ConvertTo-Json -Depth 8 -Compress
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
      $text = $sb.ToString()
      $message = $text | ConvertFrom-Json
      if ($message.id -eq $script:cdpId) {
        if ($message.result.exceptionDetails) { throw "evaluate failed: $($message.result.exceptionDetails.text)" }
        return $message.result.result.value
      }
      [void]$sb.Clear()
    }
  }
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
  if (-not (Wait-For "document.querySelector('[data-testid=queue-list]') !== null" 30)) {
    throw "$label : the app never rendered its queue"
  }
  return $childPid
}

# --- clipboard ----------------------------------------------------------------------------------
#
# The sequence number changes on every write by anyone, which is what makes it safe to put back
# only what this run itself displaced.

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

function Invoke-CopyPrompt([string] $label) {
  $kind = Get-ClipboardKind
  if ($kind -ne "text" -and $kind -ne "empty") {
    Skip $label "the clipboard holds $kind, which this run cannot put back; Copy review prompt not pressed"
    return $false
  }
  $snapshot = if ($kind -eq "text") { Get-Clipboard -Raw } else { $null }
  $before = [DvccDesktop]::GetClipboardSequenceNumber()

  Invoke-Cdp "document.querySelector('[data-testid=action-copy-prompt]').click(); true" | Out-Null

  # Wait for DVCC's own write, bounded; the request file is written on the same action.
  $deadline = (Get-Date).AddSeconds(6)
  $afterCopy = $before
  while ((Get-Date) -lt $deadline) {
    $current = [DvccDesktop]::GetClipboardSequenceNumber()
    if ($current -ne $before) { $afterCopy = $current; break }
    Start-Sleep -Milliseconds 100
  }

  if ($afterCopy -ne $before) {
    # Put it back at once, and only if nothing has written to it since DVCC did.
    if ([DvccDesktop]::GetClipboardSequenceNumber() -eq $afterCopy) {
      try {
        if ($null -eq $snapshot) { $null | clip.exe } else { Set-Clipboard -Value $snapshot }
      }
      catch { Write-Output "[note] the clipboard could not be put back: $_" }
    }
    else {
      Write-Output "[note] the clipboard changed after the copy; left exactly as it is"
    }
  }
  return $true
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

function Get-DataHashes {
  Get-ChildItem -Path $dataDir -Recurse -File |
    Where-Object { $_.Name -ne "settings.json" -and $_.Name -ne "settings.json.bak" -and $_.Name -ne ".dvcc.lock" } |
    Sort-Object FullName |
    ForEach-Object { "{0}:{1}" -f $_.FullName.Substring($dataDir.Length), (Get-FileHash $_.FullName -Algorithm SHA256).Hash }
}

function Get-Settings {
  $path = Join-Path $dataDir "settings.json"
  if (-not (Test-Path $path)) { return $null }
  return (Get-Content -Path $path -Raw -Encoding UTF8) | ConvertFrom-Json
}

$switchScript = @'
(() => {
  const select = document.querySelector('[data-testid=language-selector]');
  if (!select) return "no selector";
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(select, "__LOCALE__");
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
})()
'@

# --- run --------------------------------------------------------------------------------------------
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Copy-Item -Path (Join-Path $repo "fixtures\v1\valid\*") -Destination $dataDir -Recurse -Force
[DvccDesktop]::Create($desktopName)

# Only processes this run started are ever stopped.
$started = [System.Collections.Generic.List[int]]::new()

try {
  # --- first start: Japanese, nothing written ------------------------------------------------------
  $appPid = Start-App "first start"
  $lang = Invoke-Cdp "document.documentElement.lang"
  Check "fresh start is Japanese" ($lang -eq "ja") "lang=$lang"
  $newProject = Invoke-Cdp "document.querySelector('[data-testid=btn-new-project]').textContent.trim()"
  Check "top bar is Japanese" ($newProject -eq "＋ プロジェクト") "button=$newProject"
  Check "a fresh install writes no preference file" ($null -eq (Get-Settings)) "settings.json absent"

  $before = Get-DataHashes
  $beta = "document.querySelector('[data-review-id=rv-20260102-beta01]')"
  Invoke-Cdp "$beta.click(); true" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=detail-review-state]') !== null" 15)) {
    throw "the detail pane never opened"
  }
  $stateJa = Invoke-Cdp "document.querySelector('[data-testid=detail-review-state]').textContent.trim()"
  $stateValue = Invoke-Cdp "document.querySelector('[data-testid=detail-review-state]').dataset.state"
  Check "review state reads in Japanese" ($stateJa -eq "レビュー中") "badge=$stateJa"
  Check "the stored review state is untouched by the language" ($stateValue -eq "REVIEWING") "data-state=$stateValue"

  # --- switch to English -----------------------------------------------------------------------------
  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English" }
  $stateEn = Invoke-Cdp "document.querySelector('[data-testid=detail-review-state]').textContent.trim()"
  $stateValueEn = Invoke-Cdp "document.querySelector('[data-testid=detail-review-state]').dataset.state"
  Check "the same review reads in English" ($stateEn -eq "Reviewing") "badge=$stateEn"
  Check "switching the language does not change the review state" ($stateValueEn -eq "REVIEWING") "data-state=$stateValueEn"
  $selectedAfter = Invoke-Cdp "document.querySelector('[data-testid=detail]').dataset.reviewId"
  Check "the selected review survives the switch" ($selectedAfter -eq "rv-20260102-beta01") "selected=$selectedAfter"

  Start-Sleep -Milliseconds 700
  $settings = Get-Settings
  Check "the choice is written" ($null -ne $settings -and $settings.locale -eq "en" -and $settings.schemaVersion -eq 1) ($settings | ConvertTo-Json -Compress)
  $after = Get-DataHashes
  Check "no project or review file is written on a language switch" (($before -join "|") -eq ($after -join "|")) ("files=" + $after.Count)

  # --- restart: the language is restored ---------------------------------------------------------------
  Stop-App $appPid
  $appPid = Start-App "second start"
  $langRestart = Invoke-Cdp "document.documentElement.lang"
  $newProjectEn = Invoke-Cdp "document.querySelector('[data-testid=btn-new-project]').textContent.trim()"
  Check "the language survives a restart" ($langRestart -eq "en") "lang=$langRestart"
  Check "the restored interface is English" ($newProjectEn -eq "+ Project") "button=$newProjectEn"

  # --- the review request follows the language ----------------------------------------------------------
  $requestPath = Join-Path $dataDir "reviews\rv-20260102-beta01\request-r1.md"
  Invoke-Cdp "$beta.click(); true" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=action-copy-prompt]') !== null" 15)) {
    throw "the copy-prompt button never appeared"
  }
  $copiedEn = Invoke-CopyPrompt "the request is written in English"
  Start-Sleep -Milliseconds 1200
  $requestEn = if (Test-Path $requestPath) { Get-Content -Path $requestPath -Raw -Encoding UTF8 } else { "" }
  if ($copiedEn) {
    Check "the request is written in English" ($requestEn -like "*# Independent Review Request*") ($requestEn.Split("`n")[0])
  }

  Invoke-Cdp ($switchScript -replace "__LOCALE__", "ja") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'ja'" 15)) { throw "the interface never switched back to Japanese" }
  $copiedJa = Invoke-CopyPrompt "the request is written in Japanese"
  Start-Sleep -Milliseconds 1200
  $requestJa = if (Test-Path $requestPath) { Get-Content -Path $requestPath -Raw -Encoding UTF8 } else { "" }
  if ($copiedJa) {
    Check "the request is written in Japanese" ($requestJa -like "*# 独立レビュー依頼*") ($requestJa.Split("`n")[0])
  }
  if ($copiedEn -and $copiedJa) {
    Check "both requests carry the same PR fact" (($requestEn -like "*#12*") -and ($requestJa -like "*#12*")) "pr=#12"
  }

  # --- and back again ------------------------------------------------------------------------------------
  Start-Sleep -Milliseconds 700
  $settingsJa = Get-Settings
  Check "the second choice is written" ($settingsJa.locale -eq "ja") ($settingsJa | ConvertTo-Json -Compress)
  Stop-App $appPid
  $appPid = Start-App "third start"
  $langFinal = Invoke-Cdp "document.documentElement.lang"
  $newProjectJa = Invoke-Cdp "document.querySelector('[data-testid=btn-new-project]').textContent.trim()"
  Check "the interface comes back in Japanese" (($langFinal -eq "ja") -and ($newProjectJa -eq "＋ プロジェクト")) "lang=$langFinal button=$newProjectJa"
  $queueCount = Invoke-Cdp "document.querySelectorAll('[data-testid=queue-item]').length"
  $projectCount = Invoke-Cdp "document.querySelectorAll('[data-testid=project-row]').length"
  Check "Phase 1 data is intact after all of it" (($queueCount -eq 2) -and ($projectCount -eq 3)) "reviews=$queueCount projects=$projectCount"
  Stop-App $appPid

  # --- a preference file this version must not replace ------------------------------------------------------
  $settingsPath = Join-Path $dataDir "settings.json"
  $future = @'
{
  "schemaVersion": 2,
  "locale": "en",
  "futureField": {
    "example": true
  }
}
'@
  [System.IO.File]::WriteAllText($settingsPath, $future)
  $futureBytes = [System.IO.File]::ReadAllBytes($settingsPath)
  Remove-Item -Path (Join-Path $dataDir "settings.json.bak") -Force -ErrorAction SilentlyContinue

  $appPid = Start-App "future settings start"
  $langFuture = Invoke-Cdp "document.documentElement.lang"
  Check "a preference file from a later version means Japanese" ($langFuture -eq "ja") "lang=$langFuture"
  $warned = Wait-For "Array.from(document.querySelectorAll('[data-testid=toast]')).some((t) => t.dataset.kind === 'warning')" 10
  Check "and says so" $warned "a warning is shown at start-up"

  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  Start-Sleep -Milliseconds 1500
  $langAfterAttempt = Invoke-Cdp "document.documentElement.lang"
  Check "the interface stays with the language that is stored" ($langAfterAttempt -eq "ja") "lang=$langAfterAttempt"
  $refusalShown = Invoke-Cdp "Array.from(document.querySelectorAll('[data-testid=toast]')).some((t) => t.dataset.kind === 'warning')"
  Check "the refusal is visible to the Human" $refusalShown "a warning toast is shown"

  $afterBytes = [System.IO.File]::ReadAllBytes($settingsPath)
  $identical = ($afterBytes.Length -eq $futureBytes.Length) -and (-not (Compare-Object $afterBytes $futureBytes -SyncWindow 0))
  Check "the file from the later version is byte-identical" $identical ("bytes=" + $afterBytes.Length)
  Check "and no backup of it was made" (-not (Test-Path (Join-Path $dataDir "settings.json.bak"))) "settings.json.bak absent"
  Stop-App $appPid
}
finally {
  Close-Cdp
  # Only what this run started, by process id: another DVCC belongs to the operator.
  foreach ($id in $started) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  [DvccDesktop]::Release()
  Remove-Item Env:\DVCC_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output ("checks: {0} passed, {1} failed, {2} inconclusive" -f ($results.Count - $failures - $skipped), $failures, $skipped)
Write-Output ("data folder: {0}" -f $dataDir)
if ($failures -gt 0) { exit 1 }
