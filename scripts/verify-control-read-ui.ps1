# Control Read running-app smoke (Phase 5A, LR-20261005-DVCC-011, Task Packet rev 3.2 section 16).
#
# Runs the release build on a hidden isolated desktop against synthetic data only, in four separate
# cases, each with its own isolated DVCC_DATA_DIR:
#
#   A  read-only invariant  - Copy control snapshot, Refresh Git, copy again: the data folder is
#                              byte-identical (no write of any kind, no event).
#   B  invalidation         - observe Git, edit the Project local root (an authorized test write),
#                              copy: OBSERVATION_INVALIDATED; the only writes are the Project edit's.
#   C  restart              - observe, copy, restart: NOT_OBSERVED (runtime-only observation).
#   D  localization         - copy in JA, switch to EN (an authorized settings write), copy in EN:
#                              the JSON is language-neutral; the only write is the locale's.
#
# Tree comparisons hash every file; only the runtime lock `.dvcc.lock` is excluded (it is not data).
# The copied text is captured by the shared clipboard interceptor: nothing reaches the Windows
# clipboard. Every sentinel planted in the synthetic data must be absent from every copy.

param(
  [string] $Exe = "",
  [int] $Port = 9348,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-control-read-$runId"
$desktopName = "dvcc-control-read-$runId"
$dataDir = $null

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

$utf8 = [System.Text.UTF8Encoding]::new($false)

function Write-Json([string] $path, $value) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  [System.IO.File]::WriteAllText($path, (ConvertTo-Json $value -Depth 12), $utf8)
}
function Write-Text([string] $path, [string] $text) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}
function Get-Tree([string] $dir) {
  $map = [ordered]@{}
  Get-ChildItem -LiteralPath $dir -Recurse -File |
    Where-Object { $_.Name -ne ".dvcc.lock" } |
    Sort-Object FullName |
    ForEach-Object { $map[$_.FullName.Substring($dir.Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  return $map
}
function Same-Tree($a, $b) { return ((ConvertTo-Json $a -Compress) -eq (ConvertTo-Json $b -Compress)) }
function Changed-Paths($a, $b) {
  $paths = @(@($a.Keys) + @($b.Keys) | Sort-Object -Unique)
  return @($paths | Where-Object { $a[$_] -ne $b[$_] })
}
function Click([string] $testId) {
  if (-not (Invoke-Cdp "(() => { const e = document.querySelector('[data-testid=$testId]'); if (!e || e.disabled) return false; e.click(); return true; })()")) {
    throw "$testId is not clickable"
  }
}
function Select-Review([string] $id) {
  $selector = '[data-testid=queue-item][data-review-id="' + $id + '"]'
  if (-not (Invoke-Cdp ("(() => { const e = document.querySelector(" + (ConvertTo-Json $selector -Compress) + "); if (!e) return false; e.click(); return true; })()"))) {
    throw "review $id is not in the queue"
  }
  if (-not (Wait-For ('document.querySelector("[data-testid=detail]")?.dataset.reviewId === ' + (ConvertTo-Json $id -Compress)) 10)) { throw "review $id did not open" }
}
function Refresh-Git {
  Click "action-refresh-git"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-freshness]')?.dataset.state === 'ALIGNED'" 20)) { throw "Git observation did not complete" }
}
# The message only (the toast also holds its dismiss button).
function Last-Toast { return [string](Invoke-Cdp "(() => { const t = [...document.querySelectorAll('[data-testid=toast]')]; return t.length ? (t[t.length - 1].querySelector('span')?.textContent ?? '') : ''; })()") }

# Presses Copy control snapshot and returns the parsed JSON (or $null, INCONCLUSIVE).
function Copy-Snapshot([string] $label) {
  $text = Invoke-InterceptedCopy "action-copy-control-snapshot" $label
  if ($null -eq $text) { return $null }
  $script:lastSnapshotText = $text
  return ($text | ConvertFrom-Json)
}

# --- synthetic Git repository ---------------------------------------------------------------------
function Invoke-Git([string] $dir) {
  $gitArgs = @("-C", $dir, "-c", "user.name=dvcc-smoke", "-c", "user.email=smoke@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main") + $args
  # Git writes progress and hints to stderr; only the exit code decides.
  $ErrorActionPreference = "Continue"
  $out = & git.exe @gitArgs 2>$null
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)" }
  return ($out | Out-String).Trim()
}

# --- sentinels (synthetic; none may appear in any copy) -------------------------------------------
$SENT = [ordered]@{
  rootFolder       = "SENTINELROOT"
  displayName      = "SENTINEL_DISPLAY_NAME"
  notes            = "SENTINEL_NOTES"
  projectNext      = "SENTINEL_PROJECT_NEXT_ACTION"
  ideLabel         = "SENTINEL_IDE_LABEL"
  reviewType       = "SENTINEL_REVIEW_TYPE"
  threadTitle      = "SENTINEL_THREAD_TITLE"
  threadUrlPart    = "example-sentinel-thread"
  reviewNext       = "SENTINEL_REVIEW_NEXT_ACTION"
  verdictNote      = "SENTINEL_VERDICT_NOTE"
  checkpoint       = "SENTINEL_CHECKPOINT_BODY"
  resultBody       = "SENTINEL_RESULT_BODY"
  branch           = "sentinel-branch-name"
}

$T0 = "2026-10-04T00:00:00.000Z"
$RESULT_AT = "2026-10-04T00:10:00.000Z"
$VERDICT_AT = "2026-10-04T00:20:00.000Z"
$REVIEW_ID = "rv-20261004-ctrl01"
$BROKEN_ID = "rv-20261004-broke1"

function Seed-Case([string] $name) {
  $caseRoot = Join-Path $root $name
  $data = Join-Path $caseRoot "data"
  $repoDir = Join-Path $caseRoot ($SENT.rootFolder + "-alpha")
  New-Item -ItemType Directory -Path $repoDir -Force | Out-Null
  Invoke-Git $repoDir init -q | Out-Null
  Write-Text (Join-Path $repoDir "a.txt") "one`n"
  Invoke-Git $repoDir add a.txt | Out-Null
  Invoke-Git $repoDir commit -q -m one | Out-Null
  Invoke-Git $repoDir checkout -q -b $SENT.branch | Out-Null
  $head = [string](Invoke-Git $repoDir rev-parse HEAD)
  $head = $head.Trim()

  Write-Json (Join-Path $data "projects.json") ([ordered]@{
    schemaVersion = 1
    projects = @([ordered]@{
      projectId = "project-alpha"; displayName = $SENT.displayName; repositoryUrl = "https://github.com/example-org/example-app"
      localRoot = $repoDir; developmentIde = $SENT.ideLabel; nextAction = $SENT.projectNext; notes = $SENT.notes
      createdAt = $T0; updatedAt = $T0
    })
  })
  Write-Json (Join-Path $data "reviews\$REVIEW_ID\session.json") ([ordered]@{
    schemaVersion = 1; reviewSessionId = $REVIEW_ID; projectId = "project-alpha"; prNumber = 7; reviewType = $SENT.reviewType
    reviewRound = 1; resourceState = "HOT"; reviewState = "FIX_REQUIRED"; suspendedFrom = $null
    chatgptThreadTitle = $SENT.threadTitle; chatgptThreadUrl = ("https://chatgpt.com/c/" + $SENT.threadUrlPart); nextAction = $SENT.reviewNext
    rounds = @([ordered]@{
      round = 1; expectedHead = $head; reviewedHead = $head; requestSavedAt = $T0; resultCapturedAt = $RESULT_AT
      verdict = "FIX_REQUIRED"; verdictConfirmedAt = $VERDICT_AT; verdictNote = $SENT.verdictNote
    })
    createdAt = $T0; updatedAt = $VERDICT_AT
  })
  Write-Text (Join-Path $data "reviews\$REVIEW_ID\checkpoint.md") ($SENT.checkpoint + "`n")
  Write-Text (Join-Path $data "reviews\$REVIEW_ID\result-r1.md") ($SENT.resultBody + "`n")
  # An unreadable review: it must only be counted, never projected.
  Write-Text (Join-Path $data "reviews\$BROKEN_ID\session.json") "{ not json"
  return [pscustomobject]@{ data = $data; repo = $repoDir; head = $head; root = $caseRoot }
}

function Assert-NoSentinel([string] $label, [string] $text) {
  foreach ($key in $SENT.Keys) {
    Check "$label : $key absent" (-not $text.Contains($SENT[$key])) "sentinel absent"
  }
  Check "$label : no SENTINEL marker" (-not ($text -match "SENTINEL")) "none"
  Check "$label : no local path" (-not ($text -match "[A-Za-z]:\\\\" -or $text.Contains($env:TEMP))) "none"
}

function Assert-Envelope([string] $label, $snap) {
  Check "$label : contract / version / operation" (($snap.contract -eq "dvcc.control-read") -and ($snap.version -eq 1) -and ($snap.operation -eq "get_control_snapshot")) "$($snap.contract) v$($snap.version) $($snap.operation)"
  Check "$label : omitted sections" ((@($snap.omitted_sections) -join ",") -eq "ide_sessions,runs,action_eligibility,queue_order") (@($snap.omitted_sections) -join ",")
  Check "$label : complete, no limits" (($snap.complete -eq $true) -and (@($snap.limits_applied).Count -eq 0)) "complete=$($snap.complete)"
  Check "$label : snapshot_id is an identifier only" ($snap.snapshot_id -match "^snap-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") $snap.snapshot_id
  Check "$label : unreadable review only counted" (($snap.data.unattributable_review_count -eq 1) -and ((@($snap.data.reviews | ForEach-Object { $_.review_session_id }) -join ",") -eq $REVIEW_ID)) "count=$($snap.data.unattributable_review_count)"
  $review = @($snap.data.reviews)[0]
  $round = @($review.rounds)[0]
  Check "$label : HD-5A-09 review_state EXPLICIT from the durable verdict" (($review.review_state.class -eq "HUMAN_CONFIRMED") -and ($review.review_state.confirmation -eq "EXPLICIT") -and ($null -eq $review.review_state.recorded_at)) "$($review.review_state.confirmation)"
  Check "$label : provenance - exact field timestamps or null" (
    ($round.reviewed_head.recorded_at -eq $RESULT_AT) -and ($round.verdict.recorded_at -eq $VERDICT_AT) -and
    ($null -eq $review.resource_state.recorded_at) -and ($null -eq $review.pr_number.recorded_at) -and
    ($null -eq $snap.data.project.repository.recorded_at) -and ($null -eq $round.expected_head.recorded_at)) "reviewed=$($round.reviewed_head.recorded_at) verdict=$($round.verdict.recorded_at)"
  Check "$label : local root withheld, repository as identity" (($snap.data.project.local_root.value -eq $true) -and ($snap.data.project.local_root.path.blocked_reason -eq "WITHHELD_BY_POLICY") -and ($snap.data.project.repository.value.name -eq "example-app")) "ok"
  Check "$label : external gates unknown" ($snap.data.external_gates.unknown_reason -eq "NOT_TRACKED_BY_DVCC") "ok"
}

$clipboardAtStart = Get-ClipboardFingerprint
Write-Output ("clipboard at start: " + $clipboardAtStart)
[DvccDesktop]::Create($desktopName)

try {
  # ============================== Case A - read-only invariant ==============================
  $A = Seed-Case "case-a"
  $dataDir = $A.data
  $appPid = Start-App "A"
  Select-Review $REVIEW_ID
  $treeA0 = Get-Tree $dataDir

  $snap1 = Copy-Snapshot "A/copy-1"
  if ($null -ne $snap1) {
    Assert-Envelope "A/copy-1" $snap1
    Assert-NoSentinel "A/copy-1" $script:lastSnapshotText
    Check "A/copy-1 : Git NOT_OBSERVED before any refresh" (($snap1.data.project.git.head.class -eq "UNKNOWN") -and ($snap1.data.project.git.head.unknown_reason -eq "NOT_OBSERVED")) $snap1.data.project.git.head.unknown_reason
    Check "A/copy-1 : freshness NOT_OBSERVED" (@($snap1.data.reviews)[0].freshness.unknown_reason -eq "NOT_OBSERVED") "ok"
  }
  Refresh-Git
  $snap2 = Copy-Snapshot "A/copy-2"
  if ($null -ne $snap2) {
    Assert-NoSentinel "A/copy-2" $script:lastSnapshotText
    $head = $snap2.data.project.git.head
    Check "A/copy-2 : Git OBSERVED with observed_at" (($head.class -eq "OBSERVED") -and ($head.value -eq $A.head) -and ($head.observed_at -match "^\d{4}-\d{2}-\d{2}T") -and ($head.evidence_ref -like "dvcc:git-observation/project-alpha/*")) "$($head.class) $($head.observed_at)"
    $fresh = @($snap2.data.reviews)[0].freshness
    Check "A/copy-2 : freshness DERIVED from that observation" (($fresh.class -eq "DERIVED") -and ($fresh.value -eq "ALIGNED") -and ($fresh.basis_observed_at -eq $head.observed_at)) "$($fresh.class) $($fresh.value)"
  }
  Check "A : toast confirms the copy" ((Last-Toast) -ne "") (Last-Toast)
  $treeA1 = Get-Tree $dataDir
  Check "A : data folder byte-identical after two copies and a Git refresh" (Same-Tree $treeA0 $treeA1) ("files=" + $treeA1.Count)
  Check "A : no events.jsonl written" (@($treeA1.Keys | Where-Object { $_ -like "*events.jsonl" }).Count -eq 0) "none"
  Stop-App $appPid

  # ============================== Case B - invalidation ==============================
  $B = Seed-Case "case-b"
  $dataDir = $B.data
  $appPid = Start-App "B"
  Select-Review $REVIEW_ID
  Refresh-Git
  $snapB1 = Copy-Snapshot "B/copy-observed"
  if ($null -ne $snapB1) { Check "B : observed before the edit" ($snapB1.data.project.git.head.class -eq "OBSERVED") $snapB1.data.project.git.head.class }
  $treeB0 = Get-Tree $dataDir
  $moved = Join-Path $B.root "moved-root"
  New-Item -ItemType Directory -Path $moved -Force | Out-Null
  Click "action-edit-project"
  if (-not (Wait-For "document.querySelector('[data-testid=project-localRoot]') !== null" 10)) { throw "edit form did not open" }
  Invoke-Cdp ("(() => { const i = document.querySelector('[data-testid=project-localRoot]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(i, " + (ConvertTo-Json $moved -Compress) + "); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()") | Out-Null
  Click "project-submit"
  if (-not (Wait-For "document.querySelector('[data-testid=project-form]') === null" 10)) { throw "edit form did not close" }
  Start-Sleep -Milliseconds 500
  $treeB1 = Get-Tree $dataDir
  $snapB2 = Copy-Snapshot "B/copy-invalidated"
  if ($null -ne $snapB2) {
    Assert-NoSentinel "B/copy-invalidated" $script:lastSnapshotText
    Check "B : Git OBSERVATION_INVALIDATED after the local root edit" (($snapB2.data.project.git.head.class -eq "UNKNOWN") -and ($snapB2.data.project.git.head.unknown_reason -eq "OBSERVATION_INVALIDATED")) $snapB2.data.project.git.head.unknown_reason
    Check "B : freshness OBSERVATION_INVALIDATED" (@($snapB2.data.reviews)[0].freshness.unknown_reason -eq "OBSERVATION_INVALIDATED") "ok"
    Check "B : the new root is not disclosed" (-not $script:lastSnapshotText.Contains("moved-root")) "absent"
  }
  $treeB2 = Get-Tree $dataDir
  $changed = Changed-Paths $treeB0 $treeB1
  $unexpected = @($changed | Where-Object { $_ -ne "\projects.json" -and $_ -ne "\projects.json.bak" })
  Check "B : the Project edit wrote only projects.json (+ .bak)" (($changed.Count -ge 1) -and ($unexpected.Count -eq 0)) ("changed=" + ($changed -join ","))
  Check "B : the Control Read copy wrote nothing" (Same-Tree $treeB1 $treeB2) ("files=" + $treeB2.Count)
  Stop-App $appPid

  # ============================== Case C - restart ==============================
  $C = Seed-Case "case-c"
  $dataDir = $C.data
  $appPid = Start-App "C/first"
  Select-Review $REVIEW_ID
  Refresh-Git
  $snapC1 = Copy-Snapshot "C/before-restart"
  if ($null -ne $snapC1) { Check "C : observed before the restart" ($snapC1.data.project.git.head.class -eq "OBSERVED") $snapC1.data.project.git.head.class }
  Stop-App $appPid
  $treeC0 = Get-Tree $dataDir
  $appPid = Start-App "C/second"
  Select-Review $REVIEW_ID
  $snapC2 = Copy-Snapshot "C/after-restart"
  if ($null -ne $snapC2) {
    Check "C : Git NOT_OBSERVED after restart (not OBSERVATION_INVALIDATED)" (($snapC2.data.project.git.head.class -eq "UNKNOWN") -and ($snapC2.data.project.git.head.unknown_reason -eq "NOT_OBSERVED")) $snapC2.data.project.git.head.unknown_reason
  }
  $treeC1 = Get-Tree $dataDir
  Check "C : data folder byte-identical across the restart and copy" (Same-Tree $treeC0 $treeC1) ("files=" + $treeC1.Count)
  Stop-App $appPid

  # ============================== Case D - localization ==============================
  $D = Seed-Case "case-d"
  $dataDir = $D.data
  $appPid = Start-App "D"
  Select-Review $REVIEW_ID
  $treeD0 = Get-Tree $dataDir
  $jaLabel = [string](Invoke-Cdp "document.querySelector('[data-testid=action-copy-control-snapshot]').textContent")
  $snapJa = Copy-Snapshot "D/ja"
  $jaToast = Last-Toast
  $jaText = $script:lastSnapshotText
  $treeD1 = Get-Tree $dataDir
  Check "D/ja : copy wrote nothing" (Same-Tree $treeD0 $treeD1) ("files=" + $treeD1.Count)
  $result = Invoke-Cdp ("(() => { const s = document.querySelector('[data-testid=language-selector]'); if (!s) return 'no selector'; Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(s, 'en'); s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()")
  if ($result -ne "ok") { throw "language switch failed: $result" }
  if (-not (Wait-For "document.querySelector('[data-testid=action-copy-control-snapshot]')?.textContent === 'Copy control snapshot (JSON)'" 10)) { throw "EN label did not appear" }
  Start-Sleep -Milliseconds 500
  $treeD2 = Get-Tree $dataDir
  $snapEn = Copy-Snapshot "D/en"
  $enToast = Last-Toast
  $treeD3 = Get-Tree $dataDir
  $enLabel = [string](Invoke-Cdp "document.querySelector('[data-testid=action-copy-control-snapshot]').textContent")
  Check "D : JA and EN labels differ, EN label exact" (($jaLabel -ne $enLabel) -and ($enLabel -eq "Copy control snapshot (JSON)") -and ($jaLabel.Contains("JSON"))) "ja/en"
  Check "D : EN toast exact, JA toast differs" (($enToast -eq "Copied the control snapshot (JSON) to the clipboard") -and ($jaToast -ne $enToast) -and ($jaToast -ne "")) "toast"
  if ($null -ne $snapJa -and $null -ne $snapEn) {
    $neutral = { param($text) (($text | ConvertFrom-Json) | Select-Object -Property * -ExcludeProperty snapshot_id, generated_at | ConvertTo-Json -Depth 20 -Compress) }
    Check "D : the JSON is language-neutral (identical apart from snapshot_id / generated_at)" ((& $neutral $jaText) -eq (& $neutral $script:lastSnapshotText)) "same"
  }
  $localeChanged = Changed-Paths $treeD1 $treeD2
  $localeUnexpected = @($localeChanged | Where-Object { $_ -ne "\settings.json" -and $_ -ne "\settings.json.bak" })
  Check "D : the locale switch wrote only settings.json (+ .bak)" (($localeChanged.Count -ge 1) -and ($localeUnexpected.Count -eq 0)) ("changed=" + ($localeChanged -join ","))
  Check "D/en : copy wrote nothing" (Same-Tree $treeD2 $treeD3) ("files=" + $treeD3.Count)
  Stop-App $appPid

  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $script:started -contains $_.Id })
  Check "no spawned process is left running" ($left.Count -eq 0) ("alive=" + $left.Count)
}
finally {
  Stop-Started
}

Test-OperatorClipboard $clipboardAtStart
Write-Summary
if ($script:failures -gt 0) { exit 1 }
