# Control Read real-data disclosure audit (Phase 5A G4, HD-5A-10, Task Packet rev 3.5).
#
# G4-A built this harness; G4-B reviews it; only after the harness review PASSes and G4-C is authorized
# may it run ONCE on real data.
#
#   -SelfTest                                 synthetic data only (scripts/lib/control-read-audit-fixture.mjs)
#                                             in a new %TEMP% folder (or -SelfTestRoot); the sanitized
#                                             report and attempt marker stay there. Self-test only:
#                                             -SelfTestFault injects a failure, -SelfTestNoApp stops
#                                             before the app is started.
#   -RealData -Authorization "HD-5A-10/G4-C"  the one authorized real-data run: the operator's own data
#                                             folder, read-only; writes only the attempt marker
#                                             .agent-run/LR-20261005-DVCC-011/G4_REAL_DATA_ATTEMPT.md and
#                                             the sanitized report .agent-run/LR-20261005-DVCC-011/
#                                             G4_REAL_DATA_AUDIT.md.
#
# One-shot (rev 3.5): after the non-data preconditions, an existing report (ALREADY_RUN) or attempt
# marker (ALREADY_ATTEMPTED) blocks the run; otherwise the attempt marker is created with CreateNew
# (failure: ATTEMPT_MARKER_CREATE_FAILED) and only then is the data folder touched. The marker holds
# fixed metadata only and is never overwritten or deleted by this harness, whatever the outcome
# (PASS, FAIL, INCONCLUSIVE, report failure, crash): a new run needs a new Human gate.
#
# What one run does: pick one sample automatically and read-only (scripts/lib/control-read-audit.mjs;
# the DVCC data folder only), start the release build on a hidden desktop with a random free CDP port,
# confirm the DVCC page, open that review, ask DVCC to Refresh Git and read DVCC's own observation from
# its Review detail, press "Copy control snapshot (JSON)" exactly once with the clipboard interceptor in
# place, stop the app, and hand the captured JSON to the audit core through a stdin pipe
# (scripts/lib/control-read-audit-finalize.ps1). The core returns the verdict and the sanitized report.
#
# Raw-data rules (HD-5A-10, rev 3.4):
# - the raw snapshot and every raw source value exist only in process memory (the app page, this
#   PowerShell process, the audit-core node process); they never reach stdout, stderr, a transcript, a
#   file, Git, a chat or the clipboard;
# - this harness never runs Git in, or otherwise touches, a Project's local root: Git facts come only
#   from DVCC's own validated observation. Git here is only the DVCC repository's own Fresh Gate;
# - DVCC's clipboard write is answered inside the page by the shared interceptor (scripts/lib/
#   dvcc-smoke.ps1): nothing reaches the Windows clipboard. This harness never reads or writes the
#   clipboard; it only compares the Windows clipboard sequence number before and after;
# - every printed line goes through Say (fixed words and codes); an exception is reported by the
#   stage it happened in, never by its message (stage catch, finalization boundary, script trap);
# - fail-closed: anything that cannot be established safely ends INCONCLUSIVE (or BLOCKED before any
#   data is touched), never PASS.

param(
  [switch] $SelfTest,
  [switch] $RealData,
  [string] $Authorization = "",
  [string] $ReviewedHead = "133576c944c55b8b50a4bdfec670d8651fdfb11e",
  [string] $Exe = "",
  [int] $Port = 0,
  [int] $ReadySeconds = 40,
  [ValidateSet("", "AuditCoreUnavailable", "ReportUnwritable", "RendererThrows", "MarkerCreateFails", "AbortAtDataAccess")]
  [string] $SelfTestFault = "",
  [string] $SelfTestRoot = "",
  [switch] $SelfTestNoApp
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$auditCore = Join-Path $PSScriptRoot "lib\control-read-audit.mjs"
$fixtureCore = Join-Path $PSScriptRoot "lib\control-read-audit-fixture.mjs"
$REAL_AUTHORIZATION = "HD-5A-10/G4-C"
$REPORT_RELATIVE = ".agent-run/LR-20261005-DVCC-011/G4_REAL_DATA_AUDIT.md"
$ATTEMPT_RELATIVE = ".agent-run/LR-20261005-DVCC-011/G4_REAL_DATA_ATTEMPT.md"
$MIN_COVERAGE = 3
$PRODUCT_PATHS = @("src", "src-tauri", "contract", "package.json", "package-lock.json", "index.html", "vite.config.ts", "tsconfig.json", "tsconfig.node.json")

. (Join-Path $PSScriptRoot "lib\control-read-audit-finalize.ps1")

# Last boundary: an error nothing else caught ends the run with a fixed line, never its message.
trap {
  Say "[g4] result: INCONCLUSIVE (UNHANDLED_EXCEPTION) - no report written"
  exit 2
}

if ($SelfTest -eq $RealData -or ($RealData -and ($SelfTestFault -ne "" -or $SelfTestRoot -ne "" -or $SelfTestNoApp))) {
  Say "usage: -SelfTest [-SelfTestFault NAME] [-SelfTestRoot DIR] [-SelfTestNoApp], or -RealData -Authorization TOKEN (G4-C only)"
  exit 3
}

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$desktopName = "dvcc-g4-audit-$runId"
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if ($Port -eq 0) { $Port = Get-Random -Minimum 49152 -Maximum 65535 }
$dataDir = $null
$dataDirCandidate = $null
$runRoot = $null
$reportPath = $null
$attemptMarker = $null

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

# Measurements handed to the audit core. Only booleans, counts, fixed codes, epoch-millisecond run
# windows and the opaque sample reference; the sample identifiers (needed to press the button) and
# DVCC's rendered Git observation stay in memory.
$m = [ordered]@{
  op = "finalize"
  selfTest = [bool]$SelfTest
  reviewedHead = $ReviewedHead
  harnessHead = $null
  dataDir = $null
  projectId = $null
  reviewId = $null
  sampleRef = $null
  coverage = $null
  copyActions = 0
  gitRefreshCompleted = $false
  gitUi = $null
  windows = [ordered]@{ refresh = $null; copy = $null }
  stateChange = "UNKNOWN"
  writeDuringCopy = $null
  writeOutsideCopy = $null
  clipboardSequenceChanged = $null
  stopCode = $null
  blockedCode = $null
}
$snapshotText = $null
$stage = "PRECONDITIONS"

# --- helpers ------------------------------------------------------------------------------------

# Git for the DVCC repository's own Fresh Gate only (never a Project's local root).
function Invoke-RepoGit {
  # Git writes hints to stderr; only the exit code and stdout matter, and neither is printed.
  $ErrorActionPreference = "Continue"
  $out = & git.exe -C $script:repo @args 2>$null
  return [pscustomobject]@{ code = $LASTEXITCODE; out = (($out | Out-String).Trim()) }
}

function Get-Tree([string] $dir) {
  $map = [ordered]@{}
  Get-ChildItem -LiteralPath $dir -Recurse -File -Force |
    Where-Object { $_.Name -ne ".dvcc.lock" } |
    Sort-Object FullName |
    ForEach-Object { $map[$_.FullName.Substring($dir.Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  return $map
}
function Same-Tree($a, $b) { return ((ConvertTo-Json $a -Compress) -eq (ConvertTo-Json $b -Compress)) }

function Stop-Run([string] $code) {
  if ($null -eq $script:m.stopCode) { $script:m.stopCode = $code }
}

function Now-Ms { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

function Test-PortListening([int] $port) {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  return (@($listeners | Where-Object { $_.Port -eq $port }).Count -gt 0)
}

# Page state the copy must not change: queue membership and badges, the open review, the language,
# open dialogs or forms. Compared inside the page; only the boolean comes back.
$fingerprintJs = @'
(() => {
  const items = [...document.querySelectorAll('[data-testid=queue-item]')].map((e) => (e.dataset.reviewId || '') + '|' + (e.querySelector('.qi-badges')?.textContent || ''));
  const detail = document.querySelector('[data-testid=detail]');
  const lang = document.querySelector('[data-testid=language-selector]');
  const open = document.querySelectorAll('[role=dialog], [data-testid=project-form], dialog[open]').length;
  return items.join('\n') + '#' + (detail?.dataset.reviewId || '') + '#' + (lang ? lang.value : '') + '#' + open + '#' + document.documentElement.lang;
})()
'@

# DVCC's own Git observation as its Review detail renders it: the status label, the HEAD cell and the
# branch cell (a cell showing the "not observed" placeholder reads as null). Kept in memory only.
$gitUiJs = @'
(() => {
  const cell = (id) => document.querySelector('[data-testid=' + id + ']');
  const value = (id) => { const c = cell(id); if (!c || c.querySelector('.muted')) return null; return (c.textContent || '').trim(); };
  return JSON.stringify({ status: (cell('detail-git-status')?.textContent || '').trim(), head: value('detail-current-head'), branch: value('detail-git-branch') });
})()
'@

function Start-AuditApp {
  if ($script:RealData) { Remove-Item Env:\DVCC_DATA_DIR -ErrorAction SilentlyContinue } else { $env:DVCC_DATA_DIR = $script:dataDir }
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$script:Port"
  $childPid = [DvccDesktop]::Start($script:Exe, $script:desktopName)
  $script:started.Add($childPid)
  if (-not (Connect-Cdp $script:Port $script:ReadySeconds)) { throw "LAUNCH" }
  if (-not (Wait-For "document.querySelector('[data-testid=queue-list]') !== null || document.querySelector('[data-testid=empty-no-projects]') !== null" 30)) { throw "LAUNCH" }
  Install-ClipboardInterceptor "g4"
  return $childPid
}

# --- run ----------------------------------------------------------------------------------------

$clipboardSequenceAtStart = [DvccDesktop]::GetClipboardSequenceNumber()
$appPid = $null

try {
  # ============================== preconditions (BLOCKED, nothing touched) ==============================
  $stage = "PRECONDITIONS"
  $script:node = $null
  try { $script:node = (Get-Command node -ErrorAction Stop).Source } catch { $script:node = $null }
  $head = Invoke-RepoGit rev-parse HEAD
  if ($head.code -eq 0 -and $head.out -match '^[0-9a-f]{40}$') { $m.harnessHead = $head.out }

  if ($RealData -and $Authorization -ne $REAL_AUTHORIZATION) { $m.blockedCode = "NOT_AUTHORIZED" }
  elseif ($null -eq $script:node -or -not (Test-Path -LiteralPath $auditCore) -or -not (Test-Path -LiteralPath $fixtureCore)) { $m.blockedCode = "NO_NODE" }
  elseif ($null -eq $m.harnessHead -or $ReviewedHead -notmatch '^[0-9a-f]{40}$') { $m.blockedCode = "HEAD_UNRESOLVED" }
  # The two one-shot files are reported by their own codes below, not as a dirty work tree.
  elseif ($RealData -and (Invoke-RepoGit status --porcelain -- . ":(exclude)$REPORT_RELATIVE" ":(exclude)$ATTEMPT_RELATIVE").out -ne "") { $m.blockedCode = "DIRTY_WORKTREE" }
  else {
    $delta = Invoke-RepoGit diff --quiet $ReviewedHead HEAD -- @PRODUCT_PATHS
    $productCommit = Invoke-RepoGit log -1 --format=%ct HEAD -- @PRODUCT_PATHS
    if ($delta.code -eq 1) { $m.blockedCode = "PRODUCT_DELTA" }
    elseif ($delta.code -ne 0) { $m.blockedCode = "HEAD_UNRESOLVED" }
    elseif (-not (Test-Path -LiteralPath $Exe)) { $m.blockedCode = "NO_RELEASE_BUILD" }
    elseif ($productCommit.code -ne 0 -or $productCommit.out -notmatch '^\d+$') { $m.blockedCode = "HEAD_UNRESOLVED" }
    elseif ((Get-Item -LiteralPath $Exe).LastWriteTimeUtc -lt [DateTimeOffset]::FromUnixTimeSeconds([long]$productCommit.out).UtcDateTime) { $m.blockedCode = "STALE_BUILD" }
    elseif (@(Get-Process -Name "devvault-control-center" -ErrorAction SilentlyContinue).Count -gt 0) { $m.blockedCode = "DVCC_RUNNING" }
    elseif ($RealData -and -not [string]::IsNullOrEmpty($env:DVCC_DATA_DIR)) { $m.blockedCode = "DATA_DIR_OVERRIDE_PRESENT" }
    elseif (Test-PortListening $Port) { $m.blockedCode = "CDP_PORT_IN_USE" }
  }

  # ============================== one-shot gate (rev 3.5; still no data access) ==============================
  # Paths only: nothing here opens the data folder. Order: report, then attempt marker, then CreateNew.
  if ($null -eq $m.blockedCode) {
    $stage = "ONE_SHOT"
    if ($RealData) {
      $reportPath = Join-Path $repo $REPORT_RELATIVE
      $attemptMarker = Join-Path $repo $ATTEMPT_RELATIVE
      $dataDirCandidate = Join-Path $env:APPDATA "DevVault-Control"
    }
    else {
      if ($SelfTestRoot -ne "") { $runRoot = $SelfTestRoot }
      else {
        $runRoot = Join-Path $env:TEMP "dvcc-g4-selftest-$runId"
        New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
      }
      Say "[g4] self-test run id: $runId"
      $reportPath = Join-Path $runRoot "G4_SELF_TEST_REPORT.md"
      $attemptMarker = Join-Path $runRoot "G4_SELF_TEST_ATTEMPT.md"
      if ($SelfTestFault -eq "MarkerCreateFails") { $attemptMarker = Join-Path $runRoot "missing-folder\G4_SELF_TEST_ATTEMPT.md" }
      $dataDirCandidate = Join-Path $runRoot "data"
    }
    if (-not $RealData -and -not (Test-Path -LiteralPath $runRoot -PathType Container)) { $m.blockedCode = "SELF_TEST_ROOT_MISSING" }
    elseif (Test-Path -LiteralPath $reportPath) { $m.blockedCode = "ALREADY_RUN" }
    elseif (Test-Path -LiteralPath $attemptMarker) { $m.blockedCode = "ALREADY_ATTEMPTED" }
    elseif (-not (New-AttemptMarker $attemptMarker $ReviewedHead $m.harnessHead)) { $m.blockedCode = "ATTEMPT_MARKER_CREATE_FAILED" }
  }

  if ($null -ne $m.blockedCode) { Say ("[g4] BLOCKED " + $m.blockedCode) }
  else {
    # ============================== data phase: the attempt marker exists ==============================
    # Nothing above this point opened the data folder.
    $stage = "DATA_ACCESS"
    if ($SelfTest -and $SelfTestFault -eq "AbortAtDataAccess") { [Environment]::Exit(9) }
    $dataDir = $dataDirCandidate
    $m.dataDir = $dataDir
    if ($RealData) {
      if (-not (Test-Path -LiteralPath (Join-Path $dataDir "projects.json"))) { Stop-Run "NO_DATA_DIR" }
    }
    else {
      $stage = "SEED"
      $seeded = Invoke-Node $fixtureCore (' "' + $runRoot + '"') ""
      if ($null -eq $seeded -or $seeded.status -ne "SEEDED") { throw "SEED" }
    }

    if ($null -eq $m.stopCode) {
      # ============================== selection (read-only, data folder only) ==============================
      $stage = "TREE_BEFORE"
      $tree0 = Get-Tree $dataDir

      $stage = "SELECT"
      $selection = Invoke-AuditCore ([ordered]@{ op = "select"; dataDir = $dataDir })
      if ($null -eq $selection) { Stop-Run "SELECT_FAILED" }
      elseif ($selection.status -ne "SELECTED") { Stop-Run ([string]$selection.status) }
      else {
        $m.projectId = [string]$selection.projectId
        $m.reviewId = [string]$selection.reviewId
        $m.sampleRef = [string]$selection.sampleRef
        $m.coverage = [int]$selection.coverage
        Say ("[g4] sample selected automatically: coverage " + [int]$selection.coverage + "/" + [int]$selection.coverageTotal + " before Git refresh")
        if ([int]$selection.coverage -lt $MIN_COVERAGE) { Stop-Run "LOW_COVERAGE" }
        elseif ($SelfTest -and $SelfTestNoApp) { Stop-Run "SELF_TEST_NO_APP" }
      }
    }

    if ($null -eq $m.stopCode) {
      # ============================== app ==============================
      $stage = "LAUNCH"
      [DvccDesktop]::Create($desktopName)
      $appPid = Start-AuditApp

      # No identifier is sent to the page before it is confirmed to be DVCC's own page.
      $stage = "OPEN_REVIEW"
      if (-not (Invoke-Cdp "typeof window.__TAURI_INTERNALS__ === 'object' && document.querySelector('[data-testid=queue-list]') !== null && !!window.__dvccClipboard")) { Stop-Run "DVCC_PAGE_UNCONFIRMED" }
      else {
        $selector = '[data-testid=queue-item][data-review-id="' + $m.reviewId + '"]'
        if (-not (Invoke-Cdp ("(() => { const e = document.querySelector(" + (ConvertTo-Json $selector -Compress) + "); if (!e) return false; e.click(); return true; })()"))) { Stop-Run "REVIEW_NOT_IN_QUEUE" }
        elseif (-not (Wait-For ('document.querySelector("[data-testid=detail]")?.dataset.reviewId === ' + (ConvertTo-Json $m.reviewId -Compress)) 10)) { Stop-Run "REVIEW_DID_NOT_OPEN" }
        elseif (-not (Invoke-Cdp "(() => { const b = document.querySelector('[data-testid=action-copy-control-snapshot]'); return !!b && !b.disabled; })()")) { Stop-Run "BUTTON_UNREACHABLE" }
      }
    }

    if ($null -eq $m.stopCode -and [bool]$selection.hasLocalRoot) {
      $stage = "GIT_REFRESH"
      if (-not (Invoke-Cdp 'window.__dvccAuditObservedBefore = document.querySelector("[data-testid=detail-observed-at]")?.textContent ?? null; window.__dvccAuditObservedBefore !== null')) { Stop-Run "GIT_PANEL_MISSING" }
      elseif (-not (Wait-For "(() => { const b = document.querySelector('[data-testid=action-refresh-git]'); return !!b && !b.disabled; })()" 10)) { Stop-Run "GIT_REFRESH_UNAVAILABLE" }
      else {
        $refreshFrom = Now-Ms
        Invoke-Cdp "document.querySelector('[data-testid=action-refresh-git]').click(); true" | Out-Null
        $refreshed = Wait-For '(() => { const t = document.querySelector("[data-testid=detail-observed-at]")?.textContent ?? null; const b = document.querySelector("[data-testid=action-refresh-git]"); return t !== null && t !== window.__dvccAuditObservedBefore && !!b && !b.disabled; })()' 30
        $refreshTo = Now-Ms
        Invoke-Cdp 'delete window.__dvccAuditObservedBefore; true' | Out-Null
        if (-not $refreshed) { Stop-Run "GIT_REFRESH_INCOMPLETE" }
        else {
          $m.gitRefreshCompleted = $true
          $m.windows.refresh = @($refreshFrom, $refreshTo)
          $m.gitUi = ([string](Invoke-Cdp $gitUiJs)) | ConvertFrom-Json
        }
      }
    }

    if ($null -eq $m.stopCode) {
      # ============================== the one copy ==============================
      $stage = "TREE_BEFORE_COPY"
      $tree1 = Get-Tree $dataDir

      $stage = "COPY"
      Invoke-Cdp ("window.__dvccAuditFingerprint = " + $fingerprintJs + "; true") | Out-Null
      if (-not (Test-ClipboardInterceptor)) { Stop-Run "INTERCEPTION_UNCONFIRMED" }
      else {
        $count = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
        $copyFrom = Now-Ms
        Invoke-Cdp "document.querySelector('[data-testid=action-copy-control-snapshot]').click(); true" | Out-Null
        $m.copyActions = 1
        $seen = Wait-For "window.__dvccClipboard.writes.length > $count" 8
        $m.windows.copy = @($copyFrom, (Now-Ms))
        Start-Sleep -Milliseconds 1000
        $writes = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
        if (-not $seen) { Stop-Run "NO_INTERCEPTED_WRITE" }
        elseif ($writes -ne $count + 1) { Stop-Run "UNEXPECTED_WRITE_COUNT" }
        elseif (-not (Test-ClipboardInterceptor)) { Stop-Run "INTERCEPTION_UNCONFIRMED" }
        elseif (-not (Invoke-Cdp "typeof window.__dvccClipboard.writes[$count] === 'string'")) { Stop-Run "NON_TEXT_WRITE" }
        else { $snapshotText = [string](Invoke-Cdp "window.__dvccClipboard.writes[$count]") }
      }

      $stage = "STATE_AFTER"
      $same = Invoke-Cdp ("(() => { const now = " + $fingerprintJs + "; const same = now === window.__dvccAuditFingerprint; delete window.__dvccAuditFingerprint; return same; })()")
      $m.stateChange = if ($same -eq $true) { "NO" } elseif ($same -eq $false) { "YES" } else { "UNKNOWN" }

      $stage = "TREE_AFTER_COPY"
      $tree2 = Get-Tree $dataDir
      $m.writeDuringCopy = -not (Same-Tree $tree1 $tree2)
    }

    # ============================== cleanup ==============================
    if ($null -ne $appPid) {
      $stage = "PAGE_CLEANUP"
      try { Invoke-Cdp '(() => { const s = window.__dvccClipboard; if (s) s.writes.length = 0; return true; })()' | Out-Null } catch { }
      Remove-ClipboardInterceptor | Out-Null

      $stage = "STOP_APP"
      Stop-App $appPid
      $appPid = $null

      $stage = "TREE_AFTER"
      $tree3 = Get-Tree $dataDir
      if ($null -ne $tree1 -and $null -ne $tree2) { $m.writeOutsideCopy = (-not (Same-Tree $tree0 $tree1)) -or (-not (Same-Tree $tree2 $tree3)) }
      else { $m.writeOutsideCopy = -not (Same-Tree $tree0 $tree3) }
      $m.clipboardSequenceChanged = ([DvccDesktop]::GetClipboardSequenceNumber() -ne $clipboardSequenceAtStart)
    }
  }
}
catch {
  # The exception text may carry page or file content: only the stage is kept.
  Stop-Run ($stage + "_EXCEPTION")
}
finally {
  try { Stop-Started } catch { }
}

# ============================== audit, decision, report (sanitized boundary) ==============================
# The attempt marker is not touched here: it stays whatever the outcome.
$reportLabel = $REPORT_RELATIVE
$finalReportPath = $reportPath
if (-not $RealData) { $reportLabel = "G4_SELF_TEST_REPORT.md in the self-test run folder" }

if ($SelfTest -and $null -ne $runRoot) {
  if ($SelfTestFault -eq "AuditCoreUnavailable") { $script:node = Join-Path $runRoot "missing-node.exe" }
  elseif ($SelfTestFault -eq "ReportUnwritable") { $finalReportPath = Join-Path $runRoot "missing-folder\G4_SELF_TEST_REPORT.md" }
  elseif ($SelfTestFault -eq "RendererThrows") { $m["selfTestFault"] = "RENDER" }
}

$exitCode = 2
try {
  $exitCode = Complete-AuditRun $m $snapshotText $finalReportPath $reportLabel
}
finally {
  $snapshotText = $null
  [GC]::Collect()
}
exit $exitCode
