# IDE Handoff running-app smoke (Phase 4a, LR-20260927-DVCC-005 Wave 4).
#
# Runs the release build on a hidden isolated desktop against a temporary data folder seeded with one
# synthetic project/review carrying a distinct sentinel in every field the handoff must not contain,
# and drives "Copy IDE Handoff" in both languages through the same clipboard interceptor as the other
# smokes (lib\dvcc-smoke.ps1, SF-WF-01). Nothing appears on the operator's desktop, nothing outside the
# temporary data folder is written, and the operator's clipboard is only ever read as a fingerprint.
#
# Checks per locale: the copied text carries every recorded fact (project, repository, review type,
# PR, round, review state, expected/reviewed HEAD, the review's own next action, the checkpoint
# reference) and none of the forbidden sentinels (localRoot, Project.nextAction, notes, ChatGPT thread
# title/URL, verdict note, checkpoint body). The whole data folder is byte-identical before and after.

param(
  [string] $Exe = "",
  [int] $Port = 9335,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-ide-$runId"
$dataDir = Join-Path $root "data"
$desktopName = "dvcc-ide-$runId"

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

$utf8 = [System.Text.UTF8Encoding]::new($false)

function Select-Review([string] $id) {
  $selector = '[data-testid=queue-item][data-review-id="' + $id + '"]'
  if (-not (Invoke-Cdp ("(() => { const e = document.querySelector(" + (ConvertTo-Json $selector -Compress) + "); if (!e) return false; e.click(); return true; })()"))) {
    throw "review $id is not in the queue"
  }
  if (-not (Wait-For ('document.querySelector("[data-testid=detail]")?.dataset.reviewId === ' + (ConvertTo-Json $id -Compress)) 10)) { throw "review $id did not open" }
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

function RevFile([string] $id, [string] $name) { return (Join-Path $dataDir "reviews\$id\$name") }
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
    Where-Object { $_.Name -ne ".dvcc.lock" -and $_.Name -ne "settings.json" -and $_.Name -ne "settings.json.bak" } |
    Sort-Object FullName |
    ForEach-Object { $map[$_.FullName.Substring($dir.Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  return $map
}
function Same-Tree($a, $b) { return ((ConvertTo-Json $a -Compress) -eq (ConvertTo-Json $b -Compress)) }
function Test-Clean([string] $label) {
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $script:started -contains $_.Id })
  Check $label ($left.Count -eq 0) ("spawned processes still alive: " + $left.Count)
}

# --- sentinels ----------------------------------------------------------------------------------------
# Every forbidden field gets its own distinct, greppable sentinel so a leak of any one is unambiguous.
$LOCAL_ROOT = "C:\Users\forbidden-smoke-account\project-ide-handoff"
$PROJECT_NEXT_ACTION = "PROJECT_NEXT_ACTION_MUST_NOT_APPEAR"
$NOTES = "PROJECT_NOTES_MUST_NOT_APPEAR"
$THREAD_TITLE = "CHATGPT_THREAD_TITLE_MUST_NOT_APPEAR"
$THREAD_URL = "https://chatgpt.com/c/forbidden-thread-must-not-appear"
$VERDICT_NOTE = "VERDICT_NOTE_MUST_NOT_APPEAR"
$CHECKPOINT_BODY = "CHECKPOINT_BODY_MUST_NOT_APPEAR"
$REVIEW_NEXT_ACTION = "REVIEW_NEXT_ACTION_MUST_APPEAR"
$T0 = "2026-09-27T00:00:00.000Z"
$EXPECTED_HEAD = ("a1" * 20)
$REVIEWED_HEAD = ("b2" * 20)

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Write-Json (Join-Path $dataDir "projects.json") ([ordered]@{
  schemaVersion = 1
  projects = @([ordered]@{
    projectId = "project-ide-handoff"; displayName = "Smoke IDE Handoff Project"
    repositoryUrl = "https://github.com/example-org/project-ide-handoff"; localRoot = $LOCAL_ROOT
    developmentIde = "Claude Code"; nextAction = $PROJECT_NEXT_ACTION; notes = $NOTES
    createdAt = $T0; updatedAt = $T0
  })
})
$round1 = [ordered]@{
  round = 1; expectedHead = $EXPECTED_HEAD; reviewedHead = $REVIEWED_HEAD; requestSavedAt = $T0
  resultCapturedAt = $T0; verdict = "FIX_REQUIRED"; verdictConfirmedAt = $T0; verdictNote = $VERDICT_NOTE
}
Write-Json (RevFile "rv-20260927-ideh01" "session.json") ([ordered]@{
  schemaVersion = 1; reviewSessionId = "rv-20260927-ideh01"; projectId = "project-ide-handoff"; prNumber = 9
  reviewType = "PR review"; reviewRound = 1; resourceState = "HOT"; reviewState = "FIX_REQUIRED"; suspendedFrom = $null
  chatgptThreadTitle = $THREAD_TITLE; chatgptThreadUrl = $THREAD_URL; nextAction = $REVIEW_NEXT_ACTION
  rounds = @($round1); createdAt = $T0; updatedAt = $T0
})
Write-Text (RevFile "rv-20260927-ideh01" "checkpoint.md") "$CHECKPOINT_BODY`n"

$clipboardAtStart = Get-ClipboardFingerprint
Write-Output ("clipboard at start: " + $clipboardAtStart)
[DvccDesktop]::Create($desktopName)

function Assert-Handoff([string] $locale, [string] $text) {
  $facts = [ordered]@{
    "project display name" = "Smoke IDE Handoff Project"
    "project id"            = "project-ide-handoff"
    "repository URL"        = "https://github.com/example-org/project-ide-handoff"
    "PR number"             = "#9"
    "expected HEAD"         = $EXPECTED_HEAD
    "reviewed HEAD"         = $REVIEWED_HEAD
    "review next action"    = $REVIEW_NEXT_ACTION
    "checkpoint reference"  = "checkpoint.md"
  }
  foreach ($name in $facts.Keys) {
    Check "$locale : handoff contains $name" ($text.Contains($facts[$name])) $facts[$name]
  }
  $forbidden = [ordered]@{
    "Project.localRoot"        = $LOCAL_ROOT
    "Project.nextAction"       = $PROJECT_NEXT_ACTION
    "Project.notes"            = $NOTES
    "ChatGPT thread title"     = $THREAD_TITLE
    "ChatGPT thread URL"       = $THREAD_URL
    "verdict note"             = $VERDICT_NOTE
    "checkpoint body"          = $CHECKPOINT_BODY
  }
  foreach ($name in $forbidden.Keys) {
    Check "$locale : handoff omits $name" (-not $text.Contains($forbidden[$name])) "sentinel absent"
  }
}

try {
  $before = Get-Tree $dataDir
  $appPid = Start-App "first start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered" }
  Select-Review "rv-20260927-ideh01"
  if (-not (Wait-For "document.querySelector('[data-testid=action-copy-ide-handoff]') !== null" 15)) {
    throw "the Copy IDE Handoff button never appeared"
  }

  # --- Japanese (default) --------------------------------------------------------------------------
  $lang = Invoke-Cdp "document.documentElement.lang"
  Check "starts in Japanese" ($lang -eq "ja") "lang=$lang"
  $copiedJa = Invoke-InterceptedCopy "action-copy-ide-handoff" "JA: copy IDE handoff"
  if ($null -ne $copiedJa) {
    Check "JA : heading is present" ($copiedJa.StartsWith("# IDE")) ($copiedJa.Split("`n")[0])
    Assert-Handoff "JA" $copiedJa
  }

  # --- English ---------------------------------------------------------------------------------------
  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English" }
  $copiedEn = Invoke-InterceptedCopy "action-copy-ide-handoff" "EN: copy IDE handoff"
  if ($null -ne $copiedEn) {
    Check "EN : heading is present" ($copiedEn.StartsWith("# IDE Handoff")) ($copiedEn.Split("`n")[0])
    Assert-Handoff "EN" $copiedEn
  }
  if ($copiedJa -and $copiedEn) {
    Check "both languages carry the same PR fact" (($copiedJa.Contains("#9")) -and ($copiedEn.Contains("#9"))) "pr=#9"
    Check "JA and EN texts actually differ (real localization, not a fixed string)" ($copiedJa -ne $copiedEn) "different"
  }

  Stop-App $appPid
  Test-Clean "no spawned process is left running"
  $after = Get-Tree $dataDir
  Check "session/projects/events/checkpoint are byte-identical after both copies" (Same-Tree $before $after) ("files=" + $after.Count)
}
finally {
  Stop-Started
}

Test-OperatorClipboard $clipboardAtStart
Write-Summary
if ($script:failures -gt 0) { exit 1 }
