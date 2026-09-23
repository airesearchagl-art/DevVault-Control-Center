# Review Workflow running-app smoke (Phase 3, LR-20260921-DVCC-004 Wave 5).
#
# Runs the release build on a hidden isolated desktop against a temporary data folder seeded with
# synthetic projects and reviews, plus two throw-away Git repositories created under %TEMP% for the
# Freshness and exact-HEAD checks. The safety rules (hidden desktop, spawned-PID-only cleanup, the
# clipboard guard) live in lib\dvcc-smoke.ps1 and are shared with the localization smoke.
#
# Scenarios: A direct pass, B Required Fix and R2, C the two-turn path, D same-HEAD duplicate,
# E evidence reuse, F Freshness separation, G locale and restart, exact-HEAD readiness, the v1
# fixture, artifact immutability, runtime accessibility and the negative paths.

param(
  [string] $Exe = "",
  [int] $Port = 9334,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-wf-$runId"
$dataDir = Join-Path $root "data"
$mainDataDir = $dataDir
$oldDataDir = Join-Path $root "v1-data"
$repoE = Join-Path $root "repo-e"
$repoF = Join-Path $root "repo-f"
$desktopName = "dvcc-wf-$runId"

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

$utf8 = [System.Text.UTF8Encoding]::new($false)

# --- page helpers ---------------------------------------------------------------------------------

$helpersJs = @'
window.__d = {
  q(tid) { return document.querySelector('[data-testid="' + tid + '"]'); },
  click(tid) { const e = this.q(tid); if (!e) return false; e.click(); return true; },
  set(tid, v) {
    const e = this.q(tid); if (!e) return false;
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  },
  text(tid) { const e = this.q(tid); return e ? e.textContent.trim() : null; },
  state(tid) {
    const e = this.q(tid); if (!e) return null;
    if (e.dataset.state) return e.dataset.state;
    const c = e.querySelector("[data-state]"); return c ? c.dataset.state : null;
  },
  reason(tid) {
    const e = this.q(tid); if (!e) return null;
    const id = e.getAttribute("aria-describedby");
    const r = id ? document.getElementById(id) : null;
    return { ariaDisabled: e.getAttribute("aria-disabled"), disabled: e.disabled, text: r ? r.textContent.trim() : null, tabIndex: e.tabIndex };
  },
  exists(tid) { return this.q(tid) !== null; },
};
true
'@

function Install-Helpers { Invoke-Cdp $helpersJs | Out-Null }
function JsStr([string] $value) { return (ConvertTo-Json $value -Compress) }
function Click([string] $tid) {
  # A control is briefly disabled while the app is busy (e.g. loading a review just selected); wait for
  # that to pass. A refused control is aria-disabled, not disabled, so it is still clicked as asked.
  Wait-For ("(() => { const e = window.__d.q(" + (JsStr $tid) + "); return !!e && !e.disabled; })()") 5 | Out-Null
  if (-not (Invoke-Cdp ("window.__d.click(" + (JsStr $tid) + ")"))) { throw "no control $tid" }
}
function SetVal([string] $tid, [string] $value) {
  if (-not (Invoke-Cdp ("window.__d.set(" + (JsStr $tid) + ", " + (JsStr $value) + ")"))) { throw "no field $tid" }
}
function State([string] $tid) { return Invoke-Cdp ("window.__d.state(" + (JsStr $tid) + ")") }
function Text([string] $tid) { return Invoke-Cdp ("window.__d.text(" + (JsStr $tid) + ")") }
function Exists([string] $tid) { return [bool](Invoke-Cdp ("window.__d.exists(" + (JsStr $tid) + ")")) }
function Reason([string] $tid) { return Invoke-Cdp ("window.__d.reason(" + (JsStr $tid) + ")") }
function Wait-State([string] $tid, [string] $value, [int] $seconds = 15) {
  return Wait-For ("window.__d.state(" + (JsStr $tid) + ") === " + (JsStr $value)) $seconds
}
function Wait-Exists([string] $tid, [int] $seconds = 10) { return Wait-For ("window.__d.exists(" + (JsStr $tid) + ")") $seconds }
function Wait-NoDialog {
  $closed = Wait-For '!document.querySelector("[role=dialog]")' 10
  Start-Sleep -Milliseconds 300   # the save that closed it has been written by now
  return $closed
}
function Close-Dialog { Invoke-Cdp 'document.querySelector("[role=dialog] .icon-button").click(); true' | Out-Null; Wait-NoDialog | Out-Null }

function Select-Review([string] $id) {
  $selector = '[data-testid=queue-item][data-review-id="' + $id + '"]'
  if (-not (Invoke-Cdp ("(() => { const e = document.querySelector(" + (JsStr $selector) + "); if (!e) return false; e.click(); return true; })()"))) {
    throw "review $id is not in the queue"
  }
  if (-not (Wait-For ('document.querySelector("[data-testid=detail]")?.dataset.reviewId === ' + (JsStr $id)) 10)) { throw "review $id did not open" }
}

# The invariant part of the page that Freshness must never move.
function Get-Invariants {
  return Invoke-Cdp @'
JSON.stringify({
  review: window.__d.state("detail-review-state"),
  resource: window.__d.state("detail-resource-state"),
  tier: window.__d.text("workflow-risk-tier"),
  progress: window.__d.state("workflow-fresh-state"),
  expected: window.__d.text("detail-expected-head"),
  reviewed: window.__d.text("detail-reviewed-head"),
  turn1: window.__d.text("workflow-turn1"),
  turn2: window.__d.text("workflow-turn2"),
})
'@
}

function Get-EvidenceRows {
  return Invoke-Cdp @'
JSON.stringify(Array.from(document.querySelectorAll("[data-testid=evidence-items] li")).map((li) => ({
  status: li.dataset.evidenceStatus,
  label: li.querySelector("strong")?.textContent.trim() ?? "",
  text: li.textContent.trim(),
})))
'@
}

# --- files ------------------------------------------------------------------------------------------

function RevFile([string] $id, [string] $name) { return (Join-Path $dataDir "reviews\$id\$name") }
function Read-Session([string] $id) { return (Get-Content -LiteralPath (RevFile $id "session.json") -Raw -Encoding UTF8 | ConvertFrom-Json) }
function Hash([string] $path) { if (Test-Path -LiteralPath $path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash } return $null }
function Read-Events([string] $id) {
  $path = RevFile $id "events.jsonl"
  if (-not (Test-Path -LiteralPath $path)) { return @() }
  return @(Get-Content -LiteralPath $path -Encoding UTF8 | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_ | ConvertFrom-Json })
}
function Get-Tree([string] $dir, [switch] $withoutSettings) {
  $map = [ordered]@{}
  Get-ChildItem -LiteralPath $dir -Recurse -File |
    Where-Object { $_.Name -ne ".dvcc.lock" -and (-not $withoutSettings -or ($_.Name -ne "settings.json" -and $_.Name -ne "settings.json.bak")) } |
    Sort-Object FullName |
    ForEach-Object { $map[$_.FullName.Substring($dir.Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  return $map
}
function Same-Tree($a, $b) { return ((ConvertTo-Json $a -Compress) -eq (ConvertTo-Json $b -Compress)) }
function Write-Json([string] $path, $value) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  [System.IO.File]::WriteAllText($path, (ConvertTo-Json $value -Depth 12), $utf8)
}
function Write-Text([string] $path, [string] $text) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}

# --- synthetic Git repositories ----------------------------------------------------------------------

function Invoke-Git([string] $dir) {
  $gitArgs = @("-C", $dir, "-c", "user.name=dvcc-smoke", "-c", "user.email=smoke@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main") + $args
  # Git writes progress and hints to stderr; only the exit code decides.
  $ErrorActionPreference = "Continue"
  $out = & git.exe @gitArgs 2>$null
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)" }
  return ($out | Out-String).Trim()
}
function New-Repo([string] $dir) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  Invoke-Git $dir init -q | Out-Null
  Write-Text (Join-Path $dir "a.txt") "one`n"
  Invoke-Git $dir add a.txt | Out-Null
  Invoke-Git $dir commit -q -m one | Out-Null
  Write-Text (Join-Path $dir "a.txt") "two`n"
  Invoke-Git $dir commit -q -am two | Out-Null
  return (Invoke-Git $dir rev-parse HEAD)
}

# --- seed ---------------------------------------------------------------------------------------------

$T0 = "2026-09-20T10:00:00.000Z"
function Head([string] $pair) { return ($pair * 20) }
$HA = Head "a1"; $HB = Head "b1"; $HB2 = Head "b2"; $HC = Head "c1"; $HD = Head "d1"; $HX = Head "e1"

function Project([string] $id, [string] $name, $localRoot) {
  return [ordered]@{
    projectId = $id; displayName = $name; repositoryUrl = "https://github.com/example-org/$id"; localRoot = $localRoot
    developmentIde = "Claude Code"; nextAction = ""; notes = "Synthetic smoke project."; createdAt = $T0; updatedAt = $T0
  }
}
function Round([int] $n, $expected, $reviewed = $null, $captured = $null, $verdict = $null) {
  return [ordered]@{
    round = $n; expectedHead = $expected; reviewedHead = $reviewed; requestSavedAt = $null; resultCapturedAt = $captured
    verdict = $verdict; verdictConfirmedAt = $(if ($verdict) { $captured } else { $null }); verdictNote = $null
  }
}
function Seed-Session([string] $id, [string] $projectId, [string] $state, [object[]] $rounds) {
  $session = [ordered]@{
    schemaVersion = 1; reviewSessionId = $id; projectId = $projectId; prNumber = 7; reviewType = "PR review"
    reviewRound = $rounds.Count; resourceState = "HOT"; reviewState = $state; suspendedFrom = $null
    chatgptThreadTitle = $null; chatgptThreadUrl = $null; nextAction = ""; rounds = $rounds; createdAt = $T0; updatedAt = $T0
  }
  Write-Json (Join-Path $dataDir "reviews\$id\session.json") $session
  foreach ($r in $rounds) {
    if ($r.resultCapturedAt) { Write-Text (Join-Path $dataDir "reviews\$id\result-r$($r.round).md") "Synthetic seeded result for R$($r.round).`n" }
  }
}

function Test-Clean([string] $label) {
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $script:started -contains $_.Id })
  Check $label ($left.Count -eq 0) ("spawned processes still alive: " + $left.Count)
}

# --- run ------------------------------------------------------------------------------------------------

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$HE = New-Repo $repoE
$HF2 = New-Repo $repoF
$HEshort = $HE.Substring(0, 7)

Write-Json (Join-Path $dataDir "projects.json") ([ordered]@{
  schemaVersion = 1
  projects = @(
    (Project "project-a" "Smoke A" $null), (Project "project-b" "Smoke B" $null), (Project "project-c" "Smoke C" $null),
    (Project "project-d" "Smoke D" $null), (Project "project-e1" "Smoke E1" $repoE), (Project "project-e2" "Smoke E2" $repoE),
    (Project "project-f" "Smoke F" $repoF), (Project "project-x" "Smoke X" $repoE), (Project "project-m" "Smoke M" $null)
  )
})
Seed-Session "rv-20260923-scna01" "project-a" "NEW" @((Round 1 $HA))
Seed-Session "rv-20260923-scnb01" "project-b" "REVIEWING" @((Round 1 $HB))
Write-Text (RevFile "rv-20260923-scnb01" "checkpoint.md") "Synthetic seeded checkpoint.`n"
Seed-Session "rv-20260923-scnc01" "project-c" "REVIEWING" @((Round 1 $HC))
Seed-Session "rv-20260923-scnd01" "project-d" "REVIEW_PASS" @((Round 1 $HD $HD $T0 "REVIEW_PASS"))
Seed-Session "rv-20260923-scnd02" "project-d" "NEW" @((Round 1 $HD))
Seed-Session "rv-20260923-scnd03" "project-d" "NEW" @((Round 1 $null))
Seed-Session "rv-20260923-scne01" "project-e1" "READY_FOR_REVIEW" @((Round 1 $null $null $T0 "FIX_REQUIRED"), (Round 2 $HX $HX $T0 "FIX_REQUIRED"), (Round 3 $HX))
Seed-Session "rv-20260923-scne02" "project-e2" "READY_FOR_REVIEW" @((Round 1 $HE $HE $T0 "FIX_REQUIRED"), (Round 2 $HE))
$f1 = Round 1 $HF2; $f1["requestSavedAt"] = $T0; $f1["riskTier"] = "TIER_1"; $f1["riskTierSubjects"] = @()
Seed-Session "rv-20260923-scnf01" "project-f" "REVIEWING" @($f1)
Seed-Session "rv-20260923-scnf02" "project-f" "REVIEWING" @((Round 1 $HF2 $HF2 $T0))
Seed-Session "rv-20260923-scnx01" "project-x" "NEW" @((Round 1 $HEshort))
Seed-Session "rv-20260923-scnx02" "project-x" "NEW" @((Round 1 $null))
# A round that claims a Turn 2 without a Fresh Assessment: the parser must refuse it and leave it alone.
$bad = Round 1 $null; $bad["followupSavedAt"] = $T0
Seed-Session "rv-20260923-scnm01" "project-m" "REVIEWING" @($bad)
$malformedHash = Hash (RevFile "rv-20260923-scnm01" "session.json")

Write-Output ("clipboard at start: " + (Get-ClipboardKind))
[DvccDesktop]::Create($desktopName)

$frozen = [ordered]@{}   # past artifacts that nothing after this point may change
function Freeze([string] $id, [string[]] $names) {
  foreach ($name in $names) { $script:frozen["$id/$name"] = Hash (RevFile $id $name) }
}

try {
  $appPid = Start-App "main start"
  Install-Helpers
  Check "fresh start is Japanese" ((Invoke-Cdp "document.documentElement.lang") -eq "ja") "lang"

  # --- malformed Phase 3 ordering ---------------------------------------------------------------------
  $unreadable = Invoke-Cdp 'document.querySelector("[data-testid=queue-item][data-review-id=rv-20260923-scnm01]")?.classList.contains("unreadable") ?? false'
  Check "a round with a Turn 2 but no Fresh Assessment is shown unreadable" ([bool]$unreadable) "queue row"

  # --- Scenario A — direct pass ---------------------------------------------------------------------------
  try {
    $id = "rv-20260923-scna01"
    Select-Review $id
    Check "A: exact-head readiness EXACT for a 40-char HEAD" ((State "workflow-head-binding") -eq "EXACT") (State "workflow-head-binding")
    Check "A: protocol state starts at Turn 1 not sent" ((State "workflow-fresh-state") -eq "TURN_1_NOT_SENT") (State "workflow-fresh-state")

    Click "action-set-risk-tier"; Wait-Exists "risk-tier-TIER_1" | Out-Null
    Click "risk-tier-TIER_1"; Click "risk-tier-ack"; Click "risk-tier-submit"
    Check "A: Risk Tier set by the Human" ((Wait-NoDialog) -and ((Read-Session $id).rounds[0].riskTier -eq "TIER_1")) (Text "workflow-risk-tier")

    Click "action-mark-ready"; Wait-State "detail-review-state" "READY_FOR_REVIEW" | Out-Null
    Click "action-start-review"
    Check "A: REVIEWING" (Wait-State "detail-review-state" "REVIEWING") (State "detail-review-state")

    if (Invoke-GuardedCopy "action-copy-prompt" "A: Turn 1 copy") {
      $ok = Wait-For ("window.__d.state('workflow-fresh-state') === 'AWAITING_ASSESSMENT'") 10
      $request = Get-Content -LiteralPath (RevFile $id "request-r1.md") -Raw -Encoding UTF8
      Check "A: request-r1.md is the canonical Turn 1, bound to the exact HEAD" ($ok -and $request.Contains("## Stage 1 — Review Target") -and $request.Contains("- HEAD binding: EXACT") -and $request.Contains($HA)) "request-r1.md"
    }

    Click "action-capture"; Wait-Exists "capture-text" | Out-Null
    SetVal "capture-text" "Synthetic Fresh Assessment A: no required fixes."
    SetVal "capture-reviewed-head" $HA
    Click "capture-submit"
    Check "A: Fresh Assessment captured" (Wait-State "workflow-fresh-state" "ASSESSMENT_RECEIVED") (State "workflow-fresh-state")
    # Phase 1 flow: saving a result while REVIEWING opens the verdict dialog; nothing is decided by it.
    Check "A: the verdict dialog is offered, not submitted" ((Wait-Exists "verdict-dialog" 5) -and $null -eq (Read-Session $id).rounds[0].verdict) "verdict-dialog"

    if (-not (Exists "verdict-dialog")) { Click "action-verdict" }
    Wait-Exists "verdict-REVIEW_PASS" | Out-Null
    Click "verdict-REVIEW_PASS"; Click "verdict-ack"; Click "verdict-submit"
    $passed = Wait-State "detail-review-state" "REVIEW_PASS"
    Wait-NoDialog | Out-Null
    $s = Read-Session $id
    Check "A: REVIEW_PASS confirmed by the Human, no Turn 2" ($passed -and $s.rounds[0].verdict -eq "REVIEW_PASS" -and $null -ne $s.rounds[0].verdictConfirmedAt -and $null -eq $s.rounds[0].followupSavedAt) $s.rounds[0].verdict
    Check "A: result-r1.md present, no follow-up and no judgment" ((Test-Path (RevFile $id "result-r1.md")) -and -not (Test-Path (RevFile $id "followup-r1.md")) -and -not (Test-Path (RevFile $id "judgment-r1.md"))) "files"
    $types = (Read-Events $id | ForEach-Object { $_.type }) -join ","
    Check "A: event history" ($types -match "risk_tier_set" -and $types -match "review_started" -and $types -match "result_captured" -and $types -match "verdict_confirmed") $types
    $timeline = Invoke-Cdp 'Array.from(document.querySelectorAll("[data-testid=detail-events-r1] li")).map((li) => li.dataset.eventType).join(",")'
    Check "A: the timeline reads per round" ($timeline -match "verdict_confirmed" -and $timeline -match "risk_tier_set") $timeline
    Freeze $id @("request-r1.md", "result-r1.md")
  }
  catch { Check "A: scenario completed" $false "$_" }

  # --- Scenario B — Required Fix and R2 -------------------------------------------------------------------
  try {
    $id = "rv-20260923-scnb01"
    Select-Review $id
    $copiedB = Invoke-GuardedCopy "action-copy-prompt" "B: R1 Turn 1 copy"
    Click "action-capture"; Wait-Exists "capture-text" | Out-Null
    SetVal "capture-text" "Synthetic Fresh Assessment B: two required fixes."
    SetVal "capture-reviewed-head" $HB
    Click "capture-submit"; Wait-NoDialog | Out-Null
    Click "action-verdict"; Wait-Exists "verdict-FIX_REQUIRED" | Out-Null
    Click "verdict-FIX_REQUIRED"; SetVal "verdict-note" "R1-NOTE-SENTINEL two fixes"; Click "verdict-ack"; Click "verdict-submit"
    Check "B: FIX_REQUIRED confirmed" (Wait-State "detail-review-state" "FIX_REQUIRED") (State "detail-review-state")
    Check "B: Required Fix handoff shows verdict and note" ((Text "handoff-verdict") -ne $null -and (Text "handoff-verdict-note") -match "R1-NOTE-SENTINEL" -and (Text "handoff-reviewed-head") -eq $HB) (Text "handoff-verdict-note")

    SetVal "detail-next-action" "Fix the two findings, then R2"
    Click "next-action-save"
    Check "B: next action saved" (Wait-For 'document.querySelector("[data-testid=next-action-save]").disabled' 5) (Read-Session $id).nextAction
    $r1 = @("result-r1.md", "checkpoint.md"); if ($copiedB) { $r1 += "request-r1.md" }
    Freeze $id $r1
    $r1Hashes = @{}; foreach ($n in $r1) { $r1Hashes[$n] = Hash (RevFile $id $n) }

    Click "action-next-round"; Wait-Exists "next-round-head" | Out-Null
    SetVal "next-round-head" $HB2; Click "next-round-submit"
    Check "B: R2 started, READY_FOR_REVIEW" ((Wait-NoDialog) -and (Wait-State "detail-review-state" "READY_FOR_REVIEW") -and (Read-Session $id).reviewRound -eq 2) "round"
    Check "B: R2 shows its relation to R1" ((Text "handoff-previous-round") -match "R1" -and (Text "handoff-previous-head") -eq $HB -and (Text "handoff-previous-response") -match "result-r1.md" -and (Text "handoff-current-head") -eq $HB2) ((Text "handoff-previous-round") + " / " + (Text "handoff-previous-response"))
    $s = Read-Session $id
    Check "B: R1 verdict and note intact" ($s.rounds[0].verdict -eq "FIX_REQUIRED" -and $s.rounds[0].verdictNote -match "R1-NOTE-SENTINEL" -and $s.rounds[0].reviewedHead -eq $HB) $s.rounds[0].verdictNote

    Click "action-start-review"; Wait-State "detail-review-state" "REVIEWING" | Out-Null
    if (Invoke-GuardedCopy "action-copy-prompt" "B: R2 Turn 1 copy") {
      Start-Sleep -Milliseconds 500
      $r2 = Get-Content -LiteralPath (RevFile $id "request-r2.md") -Raw -Encoding UTF8
      Check "B: R2 request carries R1 facts, not the Human's note" ($r2.Contains("R1") -and $r2.Contains("FIX_REQUIRED") -and $r2.Contains("result-r1.md") -and $r2.Contains($HB) -and -not $r2.Contains("R1-NOTE-SENTINEL") -and -not $r2.Contains("Fix the two findings")) "request-r2.md"
    }
    $same = $true; foreach ($n in $r1) { if ((Hash (RevFile $id $n)) -ne $r1Hashes[$n]) { $same = $false } }
    Check "B: R1 artifacts byte-identical after R2 started and its request was written" $same ($r1 -join ",")

    Click "action-capture"; Wait-Exists "capture-text" | Out-Null
    SetVal "capture-text" "Synthetic Fresh Assessment B R2: fixed."; SetVal "capture-reviewed-head" $HB2; Click "capture-submit"; Wait-NoDialog | Out-Null
    Click "action-verdict"; Wait-Exists "verdict-REVIEW_PASS" | Out-Null
    Click "verdict-REVIEW_PASS"; Click "verdict-ack"; Click "verdict-submit"
    Check "B: R2 can be reviewed to a pass" (Wait-State "detail-review-state" "REVIEW_PASS") (State "detail-review-state")
  }
  catch { Check "B: scenario completed" $false "$_" }

  # --- Scenario C — the two-turn path ---------------------------------------------------------------------
  try {
    $id = "rv-20260923-scnc01"
    Select-Review $id
    $r = Reason "action-copy-followup"
    Check "C: Turn 2 before the assessment is refused with a reason" ($r.ariaDisabled -eq "true" -and $r.text) $r.text
    $r = Reason "action-capture-judgment"
    Check "C: judgment before Turn 2 is refused with a reason" ($r.ariaDisabled -eq "true" -and $r.text) $r.text

    Invoke-GuardedCopy "action-copy-prompt" "C: Turn 1 copy" | Out-Null
    Click "action-capture"; Wait-Exists "capture-text" | Out-Null
    SetVal "capture-text" "Synthetic Fresh Assessment C: one finding needs intent."; SetVal "capture-reviewed-head" $HC; Click "capture-submit"
    # The verdict dialog opens after the assessment; the Human declines it because a finding needs Turn 2.
    $offered = Wait-Exists "verdict-dialog" 5
    Close-Dialog
    Check "C: the Human can decline the offered verdict and go on to Turn 2" ($offered -and -not (Exists "verdict-dialog") -and $null -eq (Read-Session $id).rounds[0].verdict) "verdict dialog declined"
    $resultHash = Hash (RevFile $id "result-r1.md")
    $r = Reason "action-capture-judgment"
    Check "C: judgment still refused until Turn 2 has gone out" ($r.ariaDisabled -eq "true" -and $r.text) $r.text

    if (Invoke-GuardedCopy "action-copy-followup" "C: Turn 2 copy") {
      Check "C: Turn 2 sent" (Wait-State "workflow-fresh-state" "TURN_2_SENT") (State "workflow-fresh-state")
      $followup = Get-Content -LiteralPath (RevFile $id "followup-r1.md") -Raw -Encoding UTF8
      Check "C: followup-r1.md is Stage 3 + Stage 4" ($followup.Contains("## Stage 3 — Resolution Context") -and $followup.Contains("## Stage 4 — Final Judgment")) "followup-r1.md"
      Check "C (Turn 2 narrative): items 7/8 are left for the Human to fill in the copied text" ($followup.Contains("- 背景・目的: <!-- Humanが記入 -->") -and $followup.Contains("- すでに決まっている方針・実装経緯: <!-- Humanが記入 -->")) "placeholders"

      $r = Reason "action-verdict"
      Check "C: verdict refused with a reason while the judgment is awaited" ($r.ariaDisabled -eq "true" -and $r.text) $r.text
      Click "action-verdict"; Start-Sleep -Milliseconds 400
      Check "C: pressing the refused verdict opens nothing" (-not (Exists "verdict-dialog")) "no dialog"
      $focused = Invoke-Cdp '(() => { const e = window.__d.q("action-verdict"); e.focus(); return document.activeElement === e; })()'
      Check "C: the refused control is focusable" ([bool]$focused) "focus"
      $a11y = Invoke-Cdp @'
(() => {
  const b = window.__d.q("action-verdict");
  const r = document.getElementById(b.getAttribute("aria-describedby"));
  return !!r && r.textContent.trim().length > 0 && b.getAttribute("aria-disabled") === "true" && !b.disabled;
})()
'@
      Check "C: aria-describedby resolves to the visible reason" ([bool]$a11y) "describedby"

      Click "action-capture-judgment"; Wait-Exists "judgment-text" | Out-Null
      SetVal "judgment-text" "Synthetic Final Judgment C v1."; Click "judgment-submit"
      Check "C: Final Judgment captured" ((Wait-NoDialog) -and (Wait-State "workflow-fresh-state" "JUDGMENT_RECEIVED")) (State "workflow-fresh-state")
      Check "C: the Fresh Assessment is not overwritten by the judgment" ((Hash (RevFile $id "result-r1.md")) -eq $resultHash) "result-r1.md"
      $r = Reason "action-copy-followup"
      Check "C: Turn 2 cannot be re-sent once judged" ($r.ariaDisabled -eq "true" -and $r.text) $r.text

      $firstJudgment = Get-Content -LiteralPath (RevFile $id "judgment-r1.md") -Raw -Encoding UTF8
      Click "action-capture-judgment"; Wait-Exists "judgment-text" | Out-Null
      SetVal "judgment-text" "Synthetic Final Judgment C v2."
      $blocked = Invoke-Cdp 'window.__d.q("judgment-submit").disabled'
      Check "C: replacing the judgment needs Human confirmation" ([bool]$blocked) "submit disabled"
      Click "judgment-replace-confirm"; Click "judgment-submit"; Wait-NoDialog | Out-Null
      Start-Sleep -Milliseconds 400
      $s = Read-Session $id
      $archive = @($s.rounds[0].archivedJudgments)
      $archivedText = if ($archive.Count -eq 1) { Get-Content -LiteralPath (RevFile $id $archive[0]) -Raw -Encoding UTF8 } else { "" }
      Check "C: the replaced judgment is archived" ($archive.Count -eq 1 -and $archivedText -eq $firstJudgment) ($archive -join ",")

      Click "action-verdict"; Wait-Exists "verdict-REVIEW_PASS" | Out-Null
      Click "verdict-REVIEW_PASS"; Click "verdict-ack"; Click "verdict-submit"
      Check "C: verdict confirmed after the judgment" (Wait-State "detail-review-state" "REVIEW_PASS") (State "detail-review-state")
      $all = @("request-r1.md", "result-r1.md", "followup-r1.md", "judgment-r1.md") | Where-Object { -not (Test-Path (RevFile $id $_)) }
      Check "C: request, result, follow-up and judgment all exist" ($all.Count -eq 0) ("missing: " + ($all -join ","))
      Freeze $id (@("request-r1.md", "result-r1.md", "followup-r1.md", "judgment-r1.md") + $archive)
    }
  }
  catch { Check "C: scenario completed" $false "$_" }

  # --- Scenario D — same-HEAD duplicate -------------------------------------------------------------------
  try {
    $prior = Hash (RevFile "rv-20260923-scnd01" "session.json")
    $id = "rv-20260923-scnd02"
    Select-Review $id
    Check "D: SAME_HEAD duplicate shown and blocked" ((State "duplicate-warning") -eq "DUPLICATE_BLOCKED" -and (Text "duplicate-detected") -match "R1") (Text "duplicate-detected")
    Check "D: nothing skipped or closed" ((State "detail-review-state") -eq "NEW" -and (Hash (RevFile "rv-20260923-scnd01" "session.json")) -eq $prior) (State "detail-review-state")
    $overrides = Invoke-Cdp 'Array.from(document.querySelectorAll("[data-testid=detail-evidence] button")).map((b) => b.dataset.testid).join(",")'
    Check "D: no free override control" ($overrides -eq "action-record-revalidation,action-record-evidence") $overrides

    Click "action-record-revalidation"; Wait-Exists "revalidation-explanation" | Out-Null
    SetVal "revalidation-explanation" "EXPLANATION-ONLY-SENTINEL"
    Check "D: an explanation alone grants nothing" ([bool](Invoke-Cdp 'window.__d.q("revalidation-submit").disabled')) "submit disabled"
    $offered = Invoke-Cdp 'Array.from(document.querySelectorAll("[data-testid^=revalidation-] input, input[data-testid^=revalidation-]")).map((i) => i.dataset.testid).join(",")'
    Check "D: only the four same-head reasons are offered" ($offered -notmatch "HEAD_CHANGED" -and $offered -match "BASE_CHANGED" -and $offered -match "TARGET_BLOB_CHANGED" -and $offered -match "RELEVANT_CONTRACT_CHANGED" -and $offered -match "EXECUTION_ENVIRONMENT_CHANGED") $offered
    Click "revalidation-BASE_CHANGED"; Click "revalidation-submit"; Wait-NoDialog | Out-Null
    Start-Sleep -Milliseconds 400
    $s = Read-Session $id
    $event = @(Read-Events $id | Where-Object { $_.type -eq "duplicate_continued" }) | Select-Object -Last 1
    Check "D: canonical reason recorded on the round and in the event detail" ($s.rounds[0].revalidation.reason -eq "BASE_CHANGED" -and $s.rounds[0].revalidation.explanation -eq "EXPLANATION-ONLY-SENTINEL" -and $event.detail.invalidationReason -eq "BASE_CHANGED" -and $event.detail.priorReviews[0].reviewId -eq "rv-20260923-scnd01") ($s.rounds[0].revalidation | ConvertTo-Json -Compress)
    Check "D: the recorded reason is shown" (Exists "duplicate-recorded") (Text "duplicate-recorded")

    # Negative: a Risk Tier below the declared Tier 2 subject.
    Click "action-set-risk-tier"; Wait-Exists "risk-tier-TIER_0" | Out-Null
    $dialogA11y = Invoke-Cdp @'
(() => {
  const d = document.querySelector("[role=dialog]");
  const t = document.getElementById(d.getAttribute("aria-labelledby"));
  const legends = Array.from(d.querySelectorAll("fieldset > legend")).filter((l) => l.textContent.trim()).length;
  return !!t && t.tagName === "H2" && t.textContent.trim().length > 0 && d.querySelectorAll("fieldset").length === 2 && legends === 2;
})()
'@
    Check "accessibility: dialog labelled by its title, fieldsets with legends" ([bool]$dialogA11y) "risk tier dialog"
    $submitReason = Invoke-Cdp '(() => { const b = window.__d.q("risk-tier-submit"); const r = document.getElementById(b.getAttribute("aria-describedby")); return b.disabled && !!r && r.textContent.trim().length > 0; })()'
    Check "accessibility: the disabled save says why" ([bool]$submitReason) "risk tier submit"
    Click "risk-tier-TIER_0"; Click "risk-subject-SECURITY"
    Check "D: a tier below the declared subject is refused before saving" (Wait-Exists "risk-tier-refusal-preview" 5) (Text "risk-tier-refusal-preview")
    Click "risk-tier-ack"; Click "risk-tier-submit"
    Check "D: and refused on save, nothing stored" ((Wait-Exists "form-error" 5) -and $null -eq (Read-Session $id).rounds[0].riskTier) (Text "form-error")
    Close-Dialog

    Select-Review "rv-20260923-scnd03"
    $r = Reason "action-record-revalidation"
    Check "D: UNDECIDABLE duplicate gives no permission, and says why" ((Exists "duplicate-undecidable") -and $r.ariaDisabled -eq "true" -and $r.text) $r.text
  }
  catch { Check "D: scenario completed" $false "$_" }

  # --- Scenario E — evidence reuse ---------------------------------------------------------------------
  try {
    $id = "rv-20260923-scne01"
    Select-Review $id
    Click "action-refresh-git"; Wait-For 'window.__d.state("workflow-freshness") !== "UNKNOWN"' 15 | Out-Null
    Click "action-record-revalidation"; Wait-Exists "revalidation-RELEVANT_CONTRACT_CHANGED" | Out-Null
    Click "revalidation-RELEVANT_CONTRACT_CHANGED"; Click "revalidation-submit"; Wait-NoDialog | Out-Null
    Start-Sleep -Milliseconds 400
    $rows = Get-EvidenceRows | ConvertFrom-Json
    $statuses = ($rows | ForEach-Object { $_.status }) -join ","
    Check "E1: same-head reusable, contract recheck, missing binding unavailable, another-head recheck" ($statuses -eq "UNAVAILABLE,RECHECK_REQUIRED,REUSABLE,RECHECK_REQUIRED") $statuses
    $shown = @($rows | Where-Object { $_.label -and $_.text.Length -gt $_.label.Length + 10 }).Count
    Check "E1: every row shows its status in words with source, head, time and reason" ($shown -eq $rows.Count) ($rows | ForEach-Object { $_.text } | Out-String)
    Check "E1: bound heads are shown" (@($rows | Where-Object { $_.text.Contains($HX) }).Count -eq 2 -and @($rows | Where-Object { $_.text.Contains($HE) }).Count -eq 1) "heads"

    # Freshness moves, the decisions do not.
    $freshBefore = State "workflow-freshness"
    Write-Text (Join-Path $repoE "untracked.txt") "dirty`n"
    Click "action-workflow-refresh-git"; Wait-State "workflow-freshness" "WORKTREE_DIRTY" | Out-Null
    $statusesDirty = ((Get-EvidenceRows | ConvertFrom-Json) | ForEach-Object { $_.status }) -join ","
    Remove-Item -LiteralPath (Join-Path $repoE "untracked.txt")
    Click "action-workflow-refresh-git"; Wait-State "workflow-freshness" $freshBefore | Out-Null
    Check "E1: Freshness alone does not change the evidence decisions" ($statusesDirty -eq $statuses) "$freshBefore -> WORKTREE_DIRTY: $statusesDirty"

    Click "action-record-evidence"; Start-Sleep -Milliseconds 600
    $s = Read-Session $id
    $event = @(Read-Events $id | Where-Object { $_.type -eq "evidence_reused" }) | Select-Object -Last 1
    $stored = ($s.rounds[2].evidenceDecisions | ForEach-Object { $_.status + ":" + $_.reason }) -join ","
    $logged = ($event.detail.items | ForEach-Object { $_.status + ":" + $_.reason }) -join ","
    Check "E1: round.evidenceDecisions and the event detail agree with the screen" ($stored -eq $logged -and (($s.rounds[2].evidenceDecisions | ForEach-Object { $_.status }) -join ",") -eq $statuses) $stored

    $id = "rv-20260923-scne02"
    Select-Review $id
    Click "action-refresh-git"; Wait-For 'window.__d.state("workflow-freshness") !== "UNKNOWN"' 15 | Out-Null
    Click "action-record-revalidation"; Wait-Exists "revalidation-EXECUTION_ENVIRONMENT_CHANGED" | Out-Null
    Click "revalidation-EXECUTION_ENVIRONMENT_CHANGED"; Click "revalidation-submit"; Wait-NoDialog | Out-Null
    Start-Sleep -Milliseconds 400
    $rows2 = Get-EvidenceRows | ConvertFrom-Json
    $statuses2 = ($rows2 | ForEach-Object { $_.status }) -join ","
    $env = @($rows2 | Where-Object { $_.status -eq "RECHECK_REQUIRED" }).Count
    Check "E2: environment-bound evidence needs re-checking, the rest is reusable" ($statuses2 -eq "REUSABLE,REUSABLE,RECHECK_REQUIRED" -and $env -eq 1) $statuses2
    Click "action-record-evidence"; Start-Sleep -Milliseconds 600
    $s = Read-Session $id
    Check "E2: recorded" (@($s.rounds[1].evidenceDecisions | Where-Object { $_.reason -eq "EXECUTION_ENVIRONMENT_CHANGED" }).Count -eq 1) "EXECUTION_ENVIRONMENT_CHANGED"
    $list = Invoke-Cdp 'window.__d.q("evidence-items").getAttribute("aria-label")'
    Check "accessibility: the evidence list is labelled" ([bool]$list) $list
  }
  catch { Check "E: scenario completed" $false "$_" }

  # --- exact-HEAD readiness ----------------------------------------------------------------------------
  try {
    $id = "rv-20260923-scnx01"
    $before = Hash (RevFile $id "session.json")
    Select-Review $id
    Check "exact-HEAD B: a short HEAD is NOT EXACT, with the next step" ((State "workflow-head-binding") -eq "SHORT" -and (Exists "workflow-head-next") -and (Exists "action-edit-head")) (Text "workflow-head-binding")
    Click "action-refresh-git"; Wait-State "workflow-head-observed" "MATCHES" | Out-Null
    Check "exact-HEAD D: the observed full HEAD is shown as a candidate only" ((State "workflow-head-observed") -eq "MATCHES" -and (Text "workflow-head-observed").Contains($HE) -and (Hash (RevFile $id "session.json")) -eq $before) (Text "workflow-head-observed")
    if (Invoke-GuardedCopy "action-copy-prompt" "exact-HEAD B: request text") {
      Start-Sleep -Milliseconds 500
      $text = Get-Content -LiteralPath (RevFile $id "request-r1.md") -Raw -Encoding UTF8
      Check "exact-HEAD B: the request says NOT EXACT and never completes the HEAD" ($text.Contains("- HEAD binding: NOT EXACT") -and -not $text.Contains($HE)) "request-r1.md"
    }
    Check "exact-HEAD D: nothing written into the recorded HEAD" ((Read-Session $id).rounds[0].expectedHead -eq $HEshort) (Read-Session $id).rounds[0].expectedHead
    Select-Review "rv-20260923-scnx02"
    Check "exact-HEAD C: a missing HEAD is NOT EXACT" ((State "workflow-head-binding") -eq "MISSING") (Text "workflow-head-binding")
  }
  catch { Check "exact-HEAD: completed" $false "$_" }

  # --- Scenario F — Freshness separation ----------------------------------------------------------------
  try {
    $f1 = "rv-20260923-scnf01"; $f2 = "rv-20260923-scnf02"
    $sessions = @{ $f1 = (Hash (RevFile $f1 "session.json")); $f2 = (Hash (RevFile $f2 "session.json")) }
    Select-Review $f1
    Start-Sleep -Seconds 3
    $inv = Get-Invariants
    Check "F: UNKNOWN before any refresh (no automatic refresh)" ((State "workflow-freshness") -eq "UNKNOWN" -and (Invoke-Cdp 'document.querySelector("[data-testid=workflow-freshness-cause] [data-cause]")?.dataset.cause') -eq "NOT_OBSERVED" -and (Exists "workflow-freshness-next")) (Text "workflow-freshness-reason")
    Check "F: UNKNOWN never reads as ALIGNED" ((Invoke-Cdp 'window.__d.q("workflow-freshness").querySelector(".badge").dataset.state') -eq "UNKNOWN") "badge"

    $seen = @{}
    Click "action-workflow-refresh-git"
    $seen["ALIGNED"] = (Wait-State "workflow-freshness" "ALIGNED") -and (Text "workflow-freshness-current") -eq $HF2 -and (Text "workflow-freshness-reason") -and (Text "workflow-freshness-observed-at") -and ((Get-Invariants) -eq $inv)
    Check "F: ALIGNED with reason, heads and observedAt; nothing else moves" $seen["ALIGNED"] (Text "workflow-freshness-reason")

    Write-Text (Join-Path $repoF "untracked.txt") "dirty`n"
    Click "action-workflow-refresh-git"
    $seen["WORKTREE_DIRTY"] = (Wait-State "workflow-freshness" "WORKTREE_DIRTY") -and (Text "workflow-freshness-reason") -and ((Get-Invariants) -eq $inv)
    Check "F: WORKTREE_DIRTY; nothing else moves" $seen["WORKTREE_DIRTY"] (Text "workflow-freshness-reason")
    Remove-Item -LiteralPath (Join-Path $repoF "untracked.txt")

    Write-Text (Join-Path $repoF "a.txt") "three`n"
    Invoke-Git $repoF commit -q -am three | Out-Null
    $HF3 = Invoke-Git $repoF rev-parse HEAD
    Click "action-workflow-refresh-git"
    $seen["HEAD_CHANGED"] = (Wait-State "workflow-freshness" "HEAD_CHANGED") -and (Text "workflow-freshness-expected") -eq $HF2 -and (Text "workflow-freshness-current") -eq $HF3 -and ((Get-Invariants) -eq $inv)
    Check "F: HEAD_CHANGED shows the recorded and observed HEADs; no new round, nothing else moves" $seen["HEAD_CHANGED"] (Text "workflow-freshness-reason")
    Check "exact-HEAD E: an observed HEAD that differs is not adopted" ((State "workflow-head-observed") -eq "DIFFERS" -and (Text "detail-expected-head") -eq $HF2) (Text "workflow-head-observed")

    Select-Review $f2
    $inv2 = Get-Invariants
    Click "action-workflow-refresh-git"
    $seen["REVIEW_STALE"] = (Wait-State "workflow-freshness" "REVIEW_STALE") -and (Text "workflow-freshness-reviewed") -eq $HF2 -and (Text "workflow-freshness-current") -eq $HF3 -and ((Get-Invariants) -eq $inv2) -and (State "detail-review-state") -eq "REVIEWING"
    Check "F: REVIEW_STALE does not make the review FIX_REQUIRED" $seen["REVIEW_STALE"] (Text "workflow-freshness-reason")

    Select-Review "rv-20260923-scna01"
    Click "action-workflow-refresh-git"
    Wait-For 'document.querySelector("[data-testid=workflow-freshness-cause] [data-cause]")?.dataset.cause !== "NOT_OBSERVED"' 10 | Out-Null
    $cause = Invoke-Cdp 'document.querySelector("[data-testid=workflow-freshness-cause] [data-cause]")?.dataset.cause'
    Check "F: UNKNOWN for a project without a local root says so" ((State "workflow-freshness") -eq "UNKNOWN" -and $cause -eq "NO_LOCAL_ROOT") $cause

    $unchanged = ((Hash (RevFile $f1 "session.json")) -eq $sessions[$f1]) -and ((Hash (RevFile $f2 "session.json")) -eq $sessions[$f2])
    Check "F: Refresh Git wrote nothing (session files byte-identical)" $unchanged "sessions"
  }
  catch { Check "F: scenario completed" $false "$_" }

  # --- keyboard -------------------------------------------------------------------------------------
  try {
    Select-Review "rv-20260923-scnf01"
    Invoke-Cdp 'document.activeElement && document.activeElement.blur(); true' | Out-Null
    $reached = @{}
    for ($i = 0; $i -lt 120; $i++) {
      Invoke-CdpMethod "Input.dispatchKeyEvent" @{ type = "keyDown"; key = "Tab"; code = "Tab"; windowsVirtualKeyCode = 9 } | Out-Null
      Invoke-CdpMethod "Input.dispatchKeyEvent" @{ type = "keyUp"; key = "Tab"; code = "Tab"; windowsVirtualKeyCode = 9 } | Out-Null
      $tid = Invoke-Cdp 'document.activeElement ? (document.activeElement.dataset.testid ?? "") : ""'
      if ($tid) { $reached[$tid] = $true }
    }
    if ($reached.Count -eq 0) { Skip "keyboard: Tab reaches the workflow controls" "no element took focus from synthetic Tab on the hidden desktop" }
    else {
      $wanted = @("action-copy-followup", "action-capture-judgment", "action-set-risk-tier", "action-workflow-refresh-git", "action-record-evidence")
      $missing = @($wanted | Where-Object { -not $reached.ContainsKey($_) })
      Check "keyboard: Tab reaches the workflow controls, refused ones included" ($missing.Count -eq 0) ("missing: " + ($missing -join ","))
    }
    $roles = Invoke-Cdp 'document.querySelectorAll("[data-testid=detail-workflow] [role=status], [data-testid=workflow-freshness] [role=status]").length'
    Check "accessibility: status regions in the workflow and Freshness cards" ($roles -ge 2) "count=$roles"
  }
  catch { Check "keyboard: completed" $false "$_" }

  # --- negative: an external change is never overwritten -----------------------------------------------
  try {
    $id = "rv-20260923-scnd03"
    Select-Review $id
    $path = RevFile $id "session.json"
    $external = (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json | ConvertTo-Json -Depth 12 -Compress)
    [System.IO.File]::WriteAllText($path, $external, $utf8)
    $externalHash = Hash $path
    Click "resource-WARM"
    $toast = Wait-For 'document.querySelectorAll("[data-testid=toast]").length > 0' 8
    Check "negative: a session changed outside DVCC is not overwritten" ($toast -and (Hash $path) -eq $externalHash) "conflict toast"
    Click "btn-reload"; Start-Sleep -Seconds 2; Install-Helpers
  }
  catch { Check "negative: conflict check completed" $false "$_" }

  # --- Scenario G — locale, restart -----------------------------------------------------------------
  try {
    $tree = Get-Tree $dataDir -withoutSettings
    $switch = @'
(() => {
  const select = document.querySelector('[data-testid=language-selector]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(select, "__L__");
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()
'@
    Invoke-Cdp ($switch -replace "__L__", "en") | Out-Null
    Wait-For 'document.documentElement.lang === "en"' 10 | Out-Null
    Select-Review "rv-20260923-scnc01"
    Wait-For '!!document.querySelector("[data-testid=detail-events-r1] li")' 10 | Out-Null
    $en = Invoke-Cdp 'JSON.stringify({ lang: document.documentElement.lang, workflow: document.querySelector("[data-testid=detail-workflow] h3").textContent, tier: window.__d.text("workflow-risk-tier"), fresh: window.__d.text("workflow-freshness-reason"), timeline: !!document.querySelector("[data-testid=detail-events-r1] li") })' | ConvertFrom-Json
    Select-Review "rv-20260923-scnd03"
    $reasonEn = (Reason "action-record-revalidation").text
    Check "G: English workflow, tier, Freshness, timeline and refusal reason" ($en.lang -eq "en" -and $en.workflow -eq "Review workflow" -and $en.tier -eq "not set" -and [bool]$en.fresh -and $en.timeline -and $reasonEn -match "Next:") (($en | ConvertTo-Json -Compress) + " / " + $reasonEn)
    Select-Review "rv-20260923-scnd02"
    $dupEn = Text "duplicate-recorded"
    Select-Review "rv-20260923-scne01"
    $evEn = (Get-EvidenceRows | ConvertFrom-Json)[0].label
    Check "G: duplicate and evidence read in English" ($dupEn -match "Recorded invalidation reason" -and $evEn -eq "Unavailable") "$dupEn / $evEn"
    Check "G: the switch wrote nothing but settings.json" (Same-Tree $tree (Get-Tree $dataDir -withoutSettings)) "hashes"

    $watched = @("rv-20260923-scna01", "rv-20260923-scnb01", "rv-20260923-scnc01", "rv-20260923-scnd02", "rv-20260923-scne01", "rv-20260923-scnf01")
    $beforeRestart = @{}
    foreach ($w in $watched) { Select-Review $w; $beforeRestart[$w] = (State "detail-review-state") + "/" + (State "workflow-fresh-state") + "/" + (Text "workflow-risk-tier") }
    Stop-App $appPid
    $appPid = Start-App "restart"
    Install-Helpers
    Check "G: English survives the restart" ((Invoke-Cdp "document.documentElement.lang") -eq "en") "lang"
    $persist = @()
    foreach ($w in $watched) {
      Select-Review $w
      $now = (State "detail-review-state") + "/" + (State "workflow-fresh-state") + "/" + (Text "workflow-risk-tier")
      if ($now -ne $beforeRestart[$w]) { $persist += "$w $($beforeRestart[$w]) -> $now" }
    }
    Check "G/A: review state, protocol progress and Risk Tier are the same after a restart" ($persist.Count -eq 0) ((($beforeRestart.GetEnumerator() | Sort-Object Name | ForEach-Object { $_.Value }) -join ", ") + " " + ($persist -join ","))
    Check "G: after a restart Freshness is unobserved again, not guessed" ((State "workflow-freshness") -eq "UNKNOWN") (State "workflow-freshness")
    Check "G: the restart wrote nothing" (Same-Tree $tree (Get-Tree $dataDir -withoutSettings)) "hashes"

    Invoke-Cdp ($switch -replace "__L__", "ja") | Out-Null
    Check "G: back to Japanese" (Wait-For 'document.documentElement.lang === "ja"' 10) "lang"
    Select-Review "rv-20260923-scnd02"
    Check "G: duplicate and workflow read in Japanese" ((Text "duplicate-recorded") -match "記録済みの失効理由" -and (Invoke-Cdp 'document.querySelector("[data-testid=detail-workflow] h3").textContent') -eq "レビューワークフロー") (Text "duplicate-recorded")
    Check "G: JA -> EN -> restart -> JA changed no workflow or domain file" (Same-Tree $tree (Get-Tree $dataDir -withoutSettings)) "hashes"
    $settings = Get-Content -LiteralPath (Join-Path $dataDir "settings.json") -Raw | ConvertFrom-Json
    Check "G: only settings.json records the language" ($settings.locale -eq "ja") ($settings | ConvertTo-Json -Compress)
  }
  catch { Check "G: scenario completed" $false "$_" }

  # --- artifact immutability ---------------------------------------------------------------------------
  $changed = @($frozen.Keys | Where-Object {
      $parts = $_ -split "/"; (Hash (RevFile $parts[0] $parts[1])) -ne $frozen[$_]
    })
  Check "past artifacts byte-identical after new rounds, locale switches, refreshes, evidence and tier operations" ($changed.Count -eq 0 -and $frozen.Count -ge 2) ("frozen=" + $frozen.Count + " changed=" + ($changed -join ","))
  Check "the malformed session was left untouched" ((Hash (RevFile "rv-20260923-scnm01" "session.json")) -eq $malformedHash) "hash"
  Stop-App $appPid

  # --- v1 runtime data --------------------------------------------------------------------------------
  try {
    $dataDir = $oldDataDir
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Copy-Item -Path (Join-Path $repo "fixtures\v1\valid\*") -Destination $dataDir -Recurse -Force
    $v1 = Get-Tree $dataDir
    $appPid = Start-App "v1 start"
    Install-Helpers
    $rows = Invoke-Cdp 'document.querySelectorAll("[data-testid=queue-item]").length'
    $unreadableV1 = Invoke-Cdp 'document.querySelectorAll(".queue-item.unreadable").length'
    Select-Review "rv-20260102-beta01"
    $emptyTier = Text "workflow-risk-tier"; $turn2 = Text "workflow-turn2"
    Check "v1: loads with no migration and no unreadable row" ($rows -eq 2 -and $unreadableV1 -eq 0 -and -not (Exists "detail-unreadable")) "rows=$rows"
    Check "v1: Phase 3 fields read as empty" ($emptyTier -eq "未設定" -and $turn2 -eq "未送信" -and (State "workflow-fresh-state") -eq "TURN_1_NOT_SENT") "$emptyTier / $turn2"
    Select-Review "rv-20260101-alpha1"
    Check "v1: a suspended review still shows its workflow" (Exists "detail-workflow") "alpha1"
    Stop-App $appPid
    Check "v1: loading rewrote nothing" (Same-Tree $v1 (Get-Tree $dataDir)) "hashes"
    $appPid = Start-App "v1 restart"
    Install-Helpers
    Select-Review "rv-20260102-beta01"
    Click "action-set-risk-tier"; Wait-Exists "risk-tier-TIER_1" | Out-Null
    Click "risk-tier-TIER_1"; Click "risk-tier-ack"; Click "risk-tier-submit"; Wait-NoDialog | Out-Null
    Start-Sleep -Milliseconds 500
    $beta = Get-Content -LiteralPath (RevFile "rv-20260102-beta01" "session.json") -Raw | ConvertFrom-Json
    Check "v1: an old review can be worked with the new workflow" ($beta.rounds[0].riskTier -eq "TIER_1" -and $beta.schemaVersion -eq 1) "riskTier=$($beta.rounds[0].riskTier)"
    Stop-App $appPid
    $appPid = Start-App "v1 second restart"
    Install-Helpers
    Select-Review "rv-20260102-beta01"
    Check "v1: and it survives a restart" ((Text "workflow-risk-tier") -eq "Tier 1") (Text "workflow-risk-tier")
    Stop-App $appPid
    $dataDir = $mainDataDir
  }
  catch { $dataDir = $mainDataDir; Check "v1: completed" $false "$_" }
}
finally {
  Stop-Started
}

Test-Clean "every process this run started has stopped"
$script:results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root "results.json") -Encoding UTF8
Write-Summary
Write-Output ("results: {0}" -f (Join-Path $root "results.json"))
if ($script:failures -gt 0) { exit 1 }
