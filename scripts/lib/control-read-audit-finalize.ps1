# Output, audit-core calls and finalization for the G4 real-data audit harness (HD-5A-10, rev 3.4).
# Dot-sourced by scripts/verify-control-read-real-data-audit.ps1 (and by its tests).
#
# Error boundary: nothing in here lets an exception, its message or a path reach the console. Every
# function catches its own failures and turns them into a fixed code; Complete-AuditRun is the last
# boundary of a run and reports only "[g4] result: <RESULT> (<CODE>)" lines through Say.
#
# The caller defines $script:node (node executable) and $script:auditCore (control-read-audit.mjs).

# The only output channel. Anything that is not plain fixed text (or that looks like a path) is withheld.
function Say([string] $text) {
  if ($text -notmatch '^[A-Za-z0-9 _=./(),:\[\]-]*$' -or $text -match '[A-Za-z]:[\\/]') {
    $text = "[g4] (line withheld)"
  }
  Write-Host $text
}

# Runs a node script with one UTF-8 request on stdin; returns the parsed JSON line, or $null on any
# failure (no exception and no message leaves this function). stderr is drained and discarded.
function Invoke-Node([string] $file, [string] $arguments, [string] $stdinText) {
  $proc = $null
  try {
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $script:node
    $psi.Arguments = '"' + $file + '"' + $arguments
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $proc = [System.Diagnostics.Process]::Start($psi)
    $errTask = $proc.StandardError.ReadToEndAsync()
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($stdinText)
    $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $proc.StandardInput.Close()
    $bytes = $null
    $out = $proc.StandardOutput.ReadToEnd()
    if (-not $proc.WaitForExit(180000)) { return $null }
    [void]$errTask.Wait(5000)
    if ($proc.ExitCode -ne 0) { return $null }
    return ($out | ConvertFrom-Json)
  }
  catch {
    return $null
  }
  finally {
    if ($null -ne $proc) {
      try { if (-not $proc.HasExited) { $proc.Kill() } } catch { }
      try { $proc.Dispose() } catch { }
    }
  }
}

function Invoke-AuditCore($request) {
  try { $json = ($request | ConvertTo-Json -Depth 6 -Compress) } catch { return $null }
  try { return Invoke-Node $script:auditCore "" $json } finally { $json = $null }
}

# Writes the sanitized report to a temporary file next to its destination and renames it into place,
# so a half-written file is never the report. Returns $false on any failure (the temporary file is
# removed); never throws, never prints.
function Write-ReportAtomically([string] $path, [string] $text) {
  $temp = $null
  try {
    $temp = $path + ".tmp-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
    [System.IO.File]::WriteAllText($temp, ($text -replace "`r?`n", "`n"), [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::Move($temp, $path)
    $temp = $null
    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($null -ne $temp) {
      try { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } } catch { }
    }
  }
}

# Audit, decision and report of one run. Returns the exit code (0 PASS, 1 FAIL, 2 otherwise). A run
# is PASS only when the audit core said PASS AND the report was written. The raw snapshot and the
# request that carries it are released in `finally`.
function Complete-AuditRun($Measurements, [AllowNull()] [string] $SnapshotText, [AllowNull()] [string] $ReportPath, [string] $ReportLabel) {
  $request = $null
  $final = $null
  try {
    if ($null -eq $Measurements.blockedCode -and -not [string]::IsNullOrEmpty($SnapshotText)) {
      $request = [ordered]@{}
      foreach ($key in $Measurements.Keys) { $request[$key] = $Measurements[$key] }
      $request["snapshotText"] = $SnapshotText
      $final = Invoke-AuditCore $request
      $request = $null
      if ($null -eq $final -or $final.status -ne "FINALIZED") {
        if ($null -eq $Measurements.stopCode) { $Measurements.stopCode = "AUDIT_EXCEPTION" }
        $final = $null
      }
    }
    if ($null -eq $final) { $final = Invoke-AuditCore $Measurements }
    if ($null -eq $final -or $final.status -ne "FINALIZED") {
      Say "[g4] result: INCONCLUSIVE (AUDIT_FINALIZE_FAILED) - no report written"
      return 2
    }
    if ($null -ne $Measurements.blockedCode) {
      Say ("[g4] result: BLOCKED (" + [string]$Measurements.blockedCode + ") - no report written")
      return 2
    }
    if ($null -eq $final.reportText) {
      Say ("[g4] result: INCONCLUSIVE (" + [string]$final.reason + ") - no report written")
      return 2
    }
    # A run that never resolved its data folder touched nothing and does not consume the one real run.
    if ($null -eq $Measurements.dataDir -or [string]::IsNullOrEmpty($ReportPath)) {
      Say ("[g4] result: " + [string]$final.result + " (" + [string]$final.reason + ") - no report written")
      return 2
    }
    if (-not (Write-ReportAtomically $ReportPath ([string]$final.reportText))) {
      Say "[g4] result: INCONCLUSIVE (REPORT_WRITE_FAILED) - no report written"
      return 2
    }
    Say ("[g4] result: " + [string]$final.result + " (" + [string]$final.reason + ")")
    Say ("[g4] report: " + $ReportLabel)
    if ($final.result -eq "PASS") { return 0 }
    if ($final.result -eq "FAIL") { return 1 }
    return 2
  }
  catch {
    Say "[g4] result: INCONCLUSIVE (AUDIT_FINALIZE_FAILED) - no report written"
    return 2
  }
  finally {
    $request = $null
    $SnapshotText = $null
  }
}
