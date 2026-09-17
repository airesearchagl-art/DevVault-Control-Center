# Reproducible verification that DVCC refuses a second simultaneous process (F-3).
#
# Starts instance A with an isolated data folder, then starts instance B with the same data
# folder and checks that:
#   - B exits by itself (the single-instance plugin hands over to A),
#   - A keeps running (same PID, still responding),
#   - exactly one DVCC process remains,
#   - B did not change any file in the data folder.
# A is closed gracefully at the end. Never point -DataDir at real runtime data.
#
# Usage (PowerShell):
#   .\scripts\verify-single-instance.ps1 -Exe .\src-tauri\target\release\devvault-control-center.exe -DataDir D:\scratch\dvcc-si-data
param(
  [Parameter(Mandatory = $true)][string] $Exe,
  [Parameter(Mandatory = $true)][string] $DataDir,
  [int] $TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"
$processName = [IO.Path]::GetFileNameWithoutExtension($Exe)

function Get-DataFingerprint([string] $root) {
  if (-not (Test-Path -LiteralPath $root)) { return "" }
  (Get-ChildItem -LiteralPath $root -Recurse -File | Sort-Object FullName | ForEach-Object {
      "$($_.FullName.Substring($root.Length))|$($_.Length)|$((Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash)"
    }) -join "`n"
}

function Wait-ForWindow($process, [int] $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    Start-Sleep -Milliseconds 300
    $process.Refresh()
  } while (-not $process.HasExited -and [string]::IsNullOrEmpty($process.MainWindowTitle) -and (Get-Date) -lt $deadline)
}

if (Get-Process -Name $processName -ErrorAction SilentlyContinue) {
  throw "A $processName process is already running; close it before verification."
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$env:DVCC_DATA_DIR = (Resolve-Path -LiteralPath $DataDir).Path

$results = [ordered]@{}
$a = Start-Process -FilePath $Exe -PassThru
try {
  Wait-ForWindow $a $TimeoutSeconds
  if ($a.HasExited) { throw "instance A exited early (code $($a.ExitCode))" }
  $results["A started"] = "pid=$($a.Id) title='$($a.MainWindowTitle)'"
  Start-Sleep -Seconds 2
  $before = Get-DataFingerprint $env:DVCC_DATA_DIR

  $b = Start-Process -FilePath $Exe -PassThru
  $bExited = $b.WaitForExit($TimeoutSeconds * 1000)
  $results["B exited by itself"] = "$bExited (pid=$($b.Id), exitCode=$(if ($bExited) { $b.ExitCode } else { 'n/a' }))"
  if (-not $bExited) { Stop-Process -Id $b.Id -Force; throw "instance B did not exit within $TimeoutSeconds s" }

  Start-Sleep -Seconds 1
  $a.Refresh()
  $running = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
  $results["A still running"] = "$(-not $a.HasExited) responding=$($a.Responding)"
  $results["processes remaining"] = "$($running.Count) (pids: $(($running | ForEach-Object Id) -join ','))"
  $after = Get-DataFingerprint $env:DVCC_DATA_DIR
  $results["data folder unchanged by B"] = "$($before -eq $after)"

  $pass = $bExited -and (-not $a.HasExited) -and $a.Responding -and $running.Count -eq 1 -and $running[0].Id -eq $a.Id -and ($before -eq $after)
}
finally {
  if (-not $a.HasExited) {
    [void] $a.CloseMainWindow()
    if (-not $a.WaitForExit(15000)) { Stop-Process -Id $a.Id -Force }
  }
}

$results.GetEnumerator() | ForEach-Object { "{0}: {1}" -f $_.Key, $_.Value }
if ($pass) { "SINGLE INSTANCE: PASS" } else { "SINGLE INSTANCE: FAIL"; exit 1 }
