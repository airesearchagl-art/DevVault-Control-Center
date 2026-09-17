# Reproducible verification that DVCC refuses a second simultaneous process (F-3 / E-1).
#
# Phase 1 (sequential): starts instance A with an isolated data folder, then instance B with the
# same data folder, and checks that:
#   - A holds the data-folder lock (.dvcc.lock cannot be opened by another process),
#   - B exits by itself (named mutex / single-instance plugin),
#   - A keeps running (same PID, still responding),
#   - exactly one DVCC process remains,
#   - B did not change any file in the data folder.
# Phase 2 (race): -RaceRounds times, starts two processes back to back (no wait between the two
# starts) and checks that exactly one survives, it is responding, and no data file changed.
# Every instance is closed gracefully at the end. Never point -DataDir at real runtime data.
#
# Usage (PowerShell):
#   .\scripts\verify-single-instance.ps1 -Exe .\src-tauri\target\release\devvault-control-center.exe -DataDir D:\scratch\dvcc-si-data
param(
  [Parameter(Mandatory = $true)][string] $Exe,
  [Parameter(Mandatory = $true)][string] $DataDir,
  [int] $TimeoutSeconds = 30,
  [int] $RaceRounds = 10
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

if ((Get-DvccProcesses).Count -gt 0) {
  throw "A $processName process is already running; close it before verification."
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$env:DVCC_DATA_DIR = (Resolve-Path -LiteralPath $DataDir).Path
$dataRoot = $env:DVCC_DATA_DIR

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

# Phase 2: two processes started back to back.
$racePass = $true
for ($round = 1; $round -le $RaceRounds; $round++) {
  $before = Get-DataFingerprint $dataRoot
  $first = Start-Direct
  $second = Start-Direct
  $pair = @($first, $second)
  try {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
      Start-Sleep -Milliseconds 300
      foreach ($process in $pair) { $process.Refresh() }
      $alive = @($pair | Where-Object { -not $_.HasExited })
      $windowed = @($alive | Where-Object { -not [string]::IsNullOrEmpty($_.MainWindowTitle) })
    } while (($alive.Count -gt 1 -or $windowed.Count -lt 1) -and (Get-Date) -lt $deadline)
    # Give a late loser time to show a window or change data if the guard were broken.
    Start-Sleep -Seconds 3
    foreach ($process in $pair) { $process.Refresh() }
    $alive = @($pair | Where-Object { -not $_.HasExited })
    $exited = @($pair | Where-Object { $_.HasExited })
    $running = Get-DvccProcesses
    $after = Get-DataFingerprint $dataRoot
    $roundPass = $alive.Count -eq 1 -and $running.Count -eq 1 -and $running[0].Id -eq $alive[0].Id -and $alive[0].Responding -and ($before -eq $after)
    $survivor = if ($alive.Count -eq 1) { if ($alive[0].Id -eq $first.Id) { "first" } else { "second" } } else { "count=$($alive.Count)" }
    $loserExit = ($exited | ForEach-Object { $_.ExitCode }) -join ","
    "race {0}: survivor={1} loserExitCode={2} processes={3} dataUnchanged={4} -> {5}" -f $round, $survivor, $loserExit, $running.Count, ($before -eq $after), $(if ($roundPass) { "PASS" } else { "FAIL" })
    if (-not $roundPass) { $racePass = $false }
  }
  finally {
    foreach ($process in $pair) { Stop-Gracefully $process }
  }
  if (-not (Wait-ForNoProcess 15)) { throw "a $processName process is still running after race round $round" }
}
"RACE ($RaceRounds rounds): $(if ($racePass) { 'PASS' } else { 'FAIL' })"

if ($sequentialPass -and $racePass) { "SINGLE INSTANCE: PASS" } else { "SINGLE INSTANCE: FAIL"; exit 1 }
