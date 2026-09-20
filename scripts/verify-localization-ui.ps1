# Localization UI smoke (Wave 5, LR-20260920-DVCC-003).
#
# Runs the release build on a hidden isolated desktop against a dedicated data folder seeded from
# the synthetic fixtures. Nothing appears on the operator's desktop, nothing outside the temporary
# data folder is written, and the clipboard is saved before the one action that uses it and put
# back afterwards.
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

function Check([string] $name, [bool] $ok, $detail) {
  $script:results.Add([pscustomobject]@{ check = $name; ok = $ok; detail = $detail })
  if (-not $ok) { $script:failures++ }
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  Write-Output ("[{0}] {1} :: {2}" -f $mark, $name, ($detail | Out-String).Trim())
}

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DvccDesktop {
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
  if (-not (Connect-Cdp $Port $ReadySeconds)) { throw "$label : no CDP page appeared" }
  if (-not (Wait-For "document.querySelector('[data-testid=queue-list]') !== null" 30)) {
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

$clipboardBefore = $null
try { $clipboardBefore = Get-Clipboard -Raw -ErrorAction SilentlyContinue } catch { }

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
  Invoke-Cdp "document.querySelector('[data-testid=action-copy-prompt]').click(); true" | Out-Null
  Start-Sleep -Milliseconds 1500
  $requestEn = if (Test-Path $requestPath) { Get-Content -Path $requestPath -Raw -Encoding UTF8 } else { "" }
  Check "the request is written in English" ($requestEn -like "*# Independent Review Request*") ($requestEn.Split("`n")[0])

  Invoke-Cdp ($switchScript -replace "__LOCALE__", "ja") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'ja'" 15)) { throw "the interface never switched back to Japanese" }
  Invoke-Cdp "document.querySelector('[data-testid=action-copy-prompt]').click(); true" | Out-Null
  Start-Sleep -Milliseconds 1500
  $requestJa = if (Test-Path $requestPath) { Get-Content -Path $requestPath -Raw -Encoding UTF8 } else { "" }
  Check "the request is written in Japanese" ($requestJa -like "*# 独立レビュー依頼*") ($requestJa.Split("`n")[0])
  Check "both requests carry the same PR fact" (($requestEn -like "*#12*") -and ($requestJa -like "*#12*")) "pr=#12"

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
}
finally {
  Close-Cdp
  Get-Process -Name "devvault-control-center" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $Exe } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
  [DvccDesktop]::Release()
  Remove-Item Env:\DVCC_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  if ($null -ne $clipboardBefore -and $clipboardBefore -ne "") {
    try { Set-Clipboard -Value $clipboardBefore } catch { }
  }
}

Write-Output ""
Write-Output ("checks: {0} passed, {1} failed" -f ($results.Count - $failures), $failures)
Write-Output ("data folder: {0}" -f $dataDir)
if ($failures -gt 0) { exit 1 }
