# Reproducible verification that DVCC refuses a second simultaneous process (F-3 / E-1).
#
# Phase 0 (fail-closed start-up gate, P1-1): starts DVCC on a hidden, isolated Windows desktop while
# the start-up lock is (a) held by this script, so the process's wait times out, and (b) taken by a
# named event, so the process cannot create the mutex. In both cases DVCC must exit by itself with
# exit code 75 (the refused-gate exit) without reaching the app build: the single-instance plugin's
# mutex never appears, the process owns no window (visible or hidden) and starts no child process
# (WebView2), and its data folder is never created. -FailClosedOnly runs only this phase.
#
# Phase 1 (sequential): starts instance A with an isolated data folder, then instance B with the
# same data folder, and checks that:
#   - A holds the data-folder lock (.dvcc.lock cannot be opened by another process),
#   - B exits by itself (start-up lock + single-instance plugin hand-over),
#   - A keeps running (same PID, still responding),
#   - exactly one DVCC process remains,
#   - B did not change any file in the data folder.
# Phase 2 (race): -RaceRounds times, starts -RaceSize processes with a short pause between the starts
# (cycling through -DelaysMs, 0 = back to back) and checks that exactly one survives, it is
# responding, and no data file changed. A failed
# round prints the state of both processes (window, responsiveness, threads, child processes).
# Every instance is closed gracefully at the end. Never point -DataDir at real runtime data.
#
# Usage (PowerShell):
#   .\scripts\verify-single-instance.ps1 -Exe .\src-tauri\target\release\devvault-control-center.exe -DataDir D:\scratch\dvcc-si-data
param(
  [Parameter(Mandatory = $true)][string] $Exe,
  [Parameter(Mandatory = $true)][string] $DataDir,
  [int] $TimeoutSeconds = 30,
  [int] $RaceRounds = 10,
  [ValidateRange(2, 8)][int] $RaceSize = 2,
  # Pause between consecutive starts, cycled per round. Non-zero pauses hit the window in which the
  # first process is registering while the next one starts.
  [int[]] $DelaysMs = @(0, 0, 10, 20, 50, 100, 200, 300, 500, 1000),
  [switch] $FailClosedOnly,
  # Must match STARTUP_WAIT in src-tauri/src/instance.rs.
  [int] $StartupWaitSeconds = 15
)

$ErrorActionPreference = "Stop"
$processName = [IO.Path]::GetFileNameWithoutExtension($Exe)
$exePath = (Resolve-Path -LiteralPath $Exe).Path
$lockName = ".dvcc.lock"

# The lock file is held open without sharing while DVCC runs, so it is excluded from hashing.
function Get-DataFingerprint([string] $root) {
  if (-not (Test-Path -LiteralPath $root)) { return "" }
  (Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Name -ne $lockName } | Sort-Object FullName | ForEach-Object {
      "$($_.FullName.Substring($root.Length))|$($_.Length)|$((Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash)"
    }) -join "`n"
}

function Test-LockHeld([string] $root) {
  $path = Join-Path $root $lockName
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  try {
    $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $stream.Dispose()
    return $false
  }
  catch [System.IO.IOException] {
    return $true
  }
}

function Get-DvccProcesses {
  @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
}

function Wait-ForWindow($process, [int] $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    Start-Sleep -Milliseconds 300
    $process.Refresh()
  } while (-not $process.HasExited -and [string]::IsNullOrEmpty($process.MainWindowTitle) -and (Get-Date) -lt $deadline)
}

function Stop-Gracefully($process) {
  $process.Refresh()
  if ($process.HasExited) { return }
  [void] $process.CloseMainWindow()
  if (-not $process.WaitForExit(15000)) { Stop-Process -Id $process.Id -Force }
}

function Wait-ForNoProcess([int] $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-DvccProcesses).Count -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
  return (Get-DvccProcesses).Count -eq 0
}

function Start-Direct {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $exePath
  $info.UseShellExecute = $false
  return [System.Diagnostics.Process]::Start($info)
}

Add-Type -Namespace DvccDiag -Name Win -MemberDefinition @"
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string cls, string name);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
"@

# Printed for a failed race round: state of both processes and the owner of the plugin event window.
function Write-Diagnostics($group) {
  for ($index = 0; $index -lt $group.Count; $index++) {
    $process = $group[$index]
    $process.Refresh()
    $role = "#$($index + 1)"
    if ($process.HasExited) { "  diag {0} pid={1} exited code={2}" -f $role, $process.Id, $process.ExitCode; continue }
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($process.Id)" | ForEach-Object Name)
    $states = ($process.Threads | Group-Object ThreadState | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ","
    $waits = ($process.Threads | Where-Object { $_.ThreadState -eq 'Wait' } | Group-Object WaitReason | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ","
    "  diag {0} pid={1} title='{2}' hwnd={3} responding={4} threads={5} [{6}] waits[{7}] cpu={8:n2}s children=[{9}]" -f $role, $process.Id, $process.MainWindowTitle, $process.MainWindowHandle, $process.Responding, $process.Threads.Count, $states, $waits, $process.TotalProcessorTime.TotalSeconds, ($children -join ",")
  }
  $hwnd = [DvccDiag.Win]::FindWindowW("com.devvault.controlcenter-sic", "com.devvault.controlcenter-siw")
  $owner = 0
  if ($hwnd -ne [IntPtr]::Zero) { [void][DvccDiag.Win]::GetWindowThreadProcessId($hwnd, [ref]$owner) }
  "  diag plugin event window hwnd=$hwnd ownerPid=$owner"
}

if ((Get-DvccProcesses).Count -gt 0) {
  throw "A $processName process is already running; close it before verification."
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$env:DVCC_DATA_DIR = (Resolve-Path -LiteralPath $DataDir).Path
$dataRoot = $env:DVCC_DATA_DIR

# Phase 0: fail-closed start-up gate. Names and exit code must match src-tauri/src/instance.rs and
# the single-instance plugin (`<identifier>-sim`).
$startupMutexName = "Local\com.devvault.controlcenter.startup"
$pluginMutexName = "com.devvault.controlcenter-sim"
$gateRefusedExitCode = 75

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DvccGate {
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
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateDesktopW(string name, IntPtr dev, IntPtr dm, int flags, uint access, IntPtr sa);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr OpenDesktopW(string name, int flags, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr desktop, EnumWindowsProc cb, IntPtr lparam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

  const uint GENERIC_ALL = 0x10000000;
  public const long StillActive = 259;
  static IntPtr desktop = IntPtr.Zero;
  static Dictionary<int, IntPtr> handles = new Dictionary<int, IntPtr>();

  public static void CreateDesktop(string name) {
    desktop = CreateDesktopW(name, IntPtr.Zero, IntPtr.Zero, 0, GENERIC_ALL, IntPtr.Zero);
    if (desktop == IntPtr.Zero) throw new Exception("CreateDesktopW failed: " + Marshal.GetLastWin32Error());
  }
  public static void Release() {
    foreach (IntPtr h in handles.Values) CloseHandle(h);
    handles.Clear();
    if (desktop != IntPtr.Zero) { CloseDesktop(desktop); desktop = IntPtr.Zero; }
  }
  /// Starts `exe` (inheriting this process's environment) on the named desktop; returns its PID.
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
  /// Exit code read from the creation handle (259 = still running).
  public static long ExitCode(int pid) {
    uint code;
    if (!GetExitCodeProcess(handles[pid], out code)) return -2;
    return (long)code;
  }
  /// Number of top-level windows, visible or hidden, that `pid` owns on the named desktop.
  public static int WindowCount(string desktopName, int pid) {
    int count = 0;
    IntPtr h = OpenDesktopW(desktopName, 0, false, GENERIC_ALL);
    if (h == IntPtr.Zero) throw new Exception("OpenDesktopW failed: " + Marshal.GetLastWin32Error());
    try {
      EnumDesktopWindows(h, delegate (IntPtr hwnd, IntPtr lp) {
        uint owner; GetWindowThreadProcessId(hwnd, out owner);
        if (owner == (uint)pid) count++;
        return true;
      }, IntPtr.Zero);
    } finally { CloseDesktop(h); }
    return count;
  }
}
"@

function Test-FailClosedStart([string] $case, [string] $desktopName) {
  # Never created by a passing run: the process must not reach the data folder.
  $caseRoot = Join-Path $dataRoot "fail-closed-$case-$([guid]::NewGuid().ToString('N'))"
  $env:DVCC_DATA_DIR = $caseRoot
  $createdNew = $false
  if ($case -eq "held") {
    $blocker = [System.Threading.Mutex]::new($true, $startupMutexName, [ref]$createdNew)
  }
  else {
    $blocker = [System.Threading.EventWaitHandle]::new($false, [System.Threading.EventResetMode]::ManualReset, $startupMutexName, [ref]$createdNew)
  }
  try {
    if (-not $createdNew) { throw "the start-up lock name is already in use; close every DVCC process first" }
    $started = Get-Date
    $childId = [DvccGate]::Start($exePath, $desktopName)
    $deadline = $started.AddSeconds($StartupWaitSeconds + $TimeoutSeconds)
    $windows = 0
    $children = 0
    $pluginSeen = $false
    do {
      Start-Sleep -Milliseconds 250
      $windows = [math]::Max($windows, [DvccGate]::WindowCount($desktopName, $childId))
      $children = [math]::Max($children, @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$childId").Count)
      $pluginMutex = $null
      if ([System.Threading.Mutex]::TryOpenExisting($pluginMutexName, [ref]$pluginMutex)) { $pluginSeen = $true; $pluginMutex.Dispose() }
      $code = [DvccGate]::ExitCode($childId)
    } while ($code -eq [DvccGate]::StillActive -and (Get-Date) -lt $deadline)
    $elapsed = ((Get-Date) - $started).TotalSeconds
    $exitedByItself = $code -ne [DvccGate]::StillActive
    if (-not $exitedByItself) { Stop-Process -Id $childId -Force }
    $waitedAsExpected = if ($case -eq "held") { $elapsed -ge ($StartupWaitSeconds - 1) } else { $elapsed -lt 5 }
    $dataUntouched = -not (Test-Path -LiteralPath $caseRoot)
    $pass = $exitedByItself -and $code -eq $gateRefusedExitCode -and $waitedAsExpected -and $windows -eq 0 -and $children -eq 0 -and (-not $pluginSeen) -and $dataUntouched
    "fail-closed {0}: exitedByItself={1} exitCode={2} elapsed={3:n1}s windows={4} childProcesses={5} pluginMutexSeen={6} dataFolderUntouched={7} -> {8}" -f $case, $exitedByItself, $(if ($exitedByItself) { $code } else { 'n/a' }), $elapsed, $windows, $children, $pluginSeen, $dataUntouched, $(if ($pass) { "PASS" } else { "FAIL" })
    return $pass
  }
  finally {
    if ($case -eq "held" -and $createdNew) { try { $blocker.ReleaseMutex() } catch { } }
    $blocker.Dispose()
    $env:DVCC_DATA_DIR = $dataRoot
  }
}

$failClosedDesktop = "dvcc-fail-closed-$PID"
[DvccGate]::CreateDesktop($failClosedDesktop)
try {
  $failClosedPass = $true
  foreach ($case in @("held", "uncreatable")) {
    $output = @(Test-FailClosedStart $case $failClosedDesktop)
    $output | Select-Object -SkipLast 1
    if (-not $output[-1]) { $failClosedPass = $false }
    if (-not (Wait-ForNoProcess 15)) { throw "a $processName process is still running after the fail-closed $case case" }
  }
}
finally {
  [DvccGate]::Release()
}
"FAIL-CLOSED START-UP GATE: $(if ($failClosedPass) { 'PASS' } else { 'FAIL' })"
if ($FailClosedOnly) { if ($failClosedPass) { exit 0 } else { exit 1 } }

# Phase 1: sequential second launch.
$results = [ordered]@{}
$a = Start-Process -FilePath $exePath -PassThru
try {
  Wait-ForWindow $a $TimeoutSeconds
  if ($a.HasExited) { throw "instance A exited early (code $($a.ExitCode))" }
  $results["A started"] = "pid=$($a.Id) title='$($a.MainWindowTitle)'"
  Start-Sleep -Seconds 2
  $lockHeld = Test-LockHeld $dataRoot
  $results["data folder lock held by A"] = "$lockHeld"
  $before = Get-DataFingerprint $dataRoot

  $b = Start-Process -FilePath $exePath -PassThru
  $bExited = $b.WaitForExit($TimeoutSeconds * 1000)
  $results["B exited by itself"] = "$bExited (pid=$($b.Id), exitCode=$(if ($bExited) { $b.ExitCode } else { 'n/a' }))"
  if (-not $bExited) { Stop-Process -Id $b.Id -Force; throw "instance B did not exit within $TimeoutSeconds s" }

  Start-Sleep -Seconds 1
  $a.Refresh()
  $running = Get-DvccProcesses
  $results["A still running"] = "$(-not $a.HasExited) responding=$($a.Responding)"
  $results["processes remaining"] = "$($running.Count) (pids: $(($running | ForEach-Object Id) -join ','))"
  $after = Get-DataFingerprint $dataRoot
  $results["data folder unchanged by B"] = "$($before -eq $after)"

  $sequentialPass = $lockHeld -and $bExited -and (-not $a.HasExited) -and $a.Responding -and $running.Count -eq 1 -and $running[0].Id -eq $a.Id -and ($before -eq $after)
}
finally {
  Stop-Gracefully $a
}
$results.GetEnumerator() | ForEach-Object { "{0}: {1}" -f $_.Key, $_.Value }
"SEQUENTIAL: $(if ($sequentialPass) { 'PASS' } else { 'FAIL' })"
if (-not (Wait-ForNoProcess 15)) { throw "a $processName process is still running after phase 1" }

# Phase 2: -RaceSize processes started with a short pause between the starts.
$racePass = $true
for ($round = 1; $round -le $RaceRounds; $round++) {
  $before = Get-DataFingerprint $dataRoot
  $delay = $DelaysMs[($round - 1) % $DelaysMs.Count]
  $group = @(1..$RaceSize | ForEach-Object {
      if ($_ -gt 1 -and $delay -gt 0) { Start-Sleep -Milliseconds $delay }
      Start-Direct
    })
  try {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
      Start-Sleep -Milliseconds 300
      foreach ($process in $group) { $process.Refresh() }
      $alive = @($group | Where-Object { -not $_.HasExited })
      $windowed = @($alive | Where-Object { -not [string]::IsNullOrEmpty($_.MainWindowTitle) })
    } while (($alive.Count -gt 1 -or $windowed.Count -lt 1) -and (Get-Date) -lt $deadline)
    # Give a late loser time to show a window or change data if the guard were broken.
    Start-Sleep -Seconds 3
    foreach ($process in $group) { $process.Refresh() }
    $alive = @($group | Where-Object { -not $_.HasExited })
    $exited = @($group | Where-Object { $_.HasExited })
    $running = Get-DvccProcesses
    $after = Get-DataFingerprint $dataRoot
    $roundPass = $alive.Count -eq 1 -and $running.Count -eq 1 -and $running[0].Id -eq $alive[0].Id -and $alive[0].Responding -and ($before -eq $after)
    $survivor = if ($alive.Count -eq 1) { "#" + ([array]::IndexOf(@($group | ForEach-Object Id), $alive[0].Id) + 1) } else { "count=$($alive.Count)" }
    $loserExit = ($exited | ForEach-Object { $_.ExitCode }) -join ","
    "race {0}: size={1} delayMs={2} survivor={3} loserExitCodes={4} processes={5} dataUnchanged={6} -> {7}" -f $round, $RaceSize, $delay, $survivor, $loserExit, $running.Count, ($before -eq $after), $(if ($roundPass) { "PASS" } else { "FAIL" })
    if (-not $roundPass) { $racePass = $false; Write-Diagnostics $group; Start-Sleep -Seconds 20; "  after 20 s more:"; Write-Diagnostics $group }
  }
  finally {
    foreach ($process in $group) { Stop-Gracefully $process }
  }
  if (-not (Wait-ForNoProcess 15)) { throw "a $processName process is still running after race round $round" }
}
"RACE ($RaceRounds rounds of $RaceSize): $(if ($racePass) { 'PASS' } else { 'FAIL' })"

if ($failClosedPass -and $sequentialPass -and $racePass) { "SINGLE INSTANCE: PASS" } else { "SINGLE INSTANCE: FAIL"; exit 1 }
