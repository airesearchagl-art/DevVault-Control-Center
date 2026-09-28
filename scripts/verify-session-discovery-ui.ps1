# IDE Session Discovery running-app smoke (Phase 4b-1, LR-20260928-DVCC-006 Wave 5).
#
# Runs the release build on a hidden isolated desktop against synthetic DVCC projects and synthetic
# Claude Code / Codex provider fixtures (never the operator's real ~/.claude or ~/.codex) via the
# DVCC_CLAUDE_HOME_DIR / DVCC_CODEX_HOME_DIR test-only overrides. Drives "Refresh IDE Sessions" in
# both languages and asserts: no discovery before the click, correct MATCHED / AMBIGUOUS / UNAVAILABLE
# outcomes, every content sentinel (first_user_message, preview, transcript body) absent from the
# rendered page, and that both the provider fixtures and DVCC's own data files are byte-identical
# before and after. Nothing is copied to the clipboard by this feature, but the operator's clipboard
# fingerprint is still checked, for the same reason every other smoke checks it.

param(
  [string] $Exe = "",
  [int] $Port = 9336,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-sessions-$runId"
$dataDir = Join-Path $root "data"
$claudeHome = Join-Path $root "claude-home"
$codexHome = Join-Path $root "codex-home"
$projectsRoot = Join-Path $root "projects"
$desktopName = "dvcc-sessions-$runId"

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

# --- sentinels ------------------------------------------------------------------------------------
$CLAUDE_TRANSCRIPT_SENTINEL = "CLAUDE_TRANSCRIPT_BODY_MUST_NOT_APPEAR"
$CODEX_PROMPT_SENTINEL_1 = "CODEX_FIRST_USER_MESSAGE_1_MUST_NOT_APPEAR"
$CODEX_PREVIEW_SENTINEL_1 = "CODEX_PREVIEW_1_MUST_NOT_APPEAR"
$CODEX_PROMPT_SENTINEL_2 = "CODEX_FIRST_USER_MESSAGE_2_MUST_NOT_APPEAR"
$CODEX_PREVIEW_SENTINEL_2 = "CODEX_PREVIEW_2_MUST_NOT_APPEAR"
$CODEX_PROMPT_SENTINEL_3 = "CODEX_FIRST_USER_MESSAGE_3_MUST_NOT_APPEAR"
$CODEX_PREVIEW_SENTINEL_3 = "CODEX_PREVIEW_3_MUST_NOT_APPEAR"
$CODEX_PROMPT_SENTINEL_BULK = "CODEX_BULK_FIRST_USER_MESSAGE_MUST_NOT_APPEAR"
$CODEX_PREVIEW_SENTINEL_BULK = "CODEX_BULK_PREVIEW_MUST_NOT_APPEAR"

# --- synthetic real folders (Claude live cwd + historical candidate must exist to canonicalize) ---
$projectARoot = Join-Path $projectsRoot "project-a"
$projectCRoot = Join-Path $projectsRoot "project-c"
New-Item -ItemType Directory -Path $projectARoot -Force | Out-Null
New-Item -ItemType Directory -Path $projectCRoot -Force | Out-Null

# --- DVCC projects ---------------------------------------------------------------------------------
$T0 = "2026-09-28T00:00:00.000Z"
function Project([string] $id, [string] $name, $localRoot, $repositoryUrl) {
  return [ordered]@{
    projectId = $id; displayName = $name; repositoryUrl = $repositoryUrl; localRoot = $localRoot
    developmentIde = $null; nextAction = ""; notes = "Synthetic smoke project."; createdAt = $T0; updatedAt = $T0
  }
}
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Write-Json (Join-Path $dataDir "projects.json") ([ordered]@{
  schemaVersion = 1
  projects = @(
    (Project "project-a" "Smoke A" $projectARoot "https://github.com/example-org/repo-a"),
    (Project "project-b" "Smoke B" $null "https://github.com/example-org/shared"),
    (Project "project-c" "Smoke C" $projectCRoot $null),
    (Project "project-d" "Smoke D" $null "https://github.com/example-org/shared")
  )
})
function Round1([string] $expected) { return [ordered]@{ round = 1; expectedHead = $expected; reviewedHead = $null; requestSavedAt = $null; resultCapturedAt = $null; verdict = $null; verdictConfirmedAt = $null; verdictNote = $null } }
function Seed-Session([string] $id, [string] $projectId) {
  Write-Json (Join-Path $dataDir "reviews\$id\session.json") ([ordered]@{
    schemaVersion = 1; reviewSessionId = $id; projectId = $projectId; prNumber = 1; reviewType = "PR review"
    reviewRound = 1; resourceState = "HOT"; reviewState = "NEW"; suspendedFrom = $null
    chatgptThreadTitle = $null; chatgptThreadUrl = $null; nextAction = ""; rounds = @((Round1 ("a1" * 20)))
    createdAt = $T0; updatedAt = $T0
  })
}
Seed-Session "rv-20260928-sessa1" "project-a"
Seed-Session "rv-20260928-sessc1" "project-c"
Seed-Session "rv-20260928-sessb1" "project-b"

# --- Claude Code fixture (never opened by the reader except for names/metadata) --------------------
function EncodeClaudePath([string] $path) { return ($path -replace "/", "\") -replace "[:\\.]", "-" }
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude\sessions") -Force | Out-Null
$liveSessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
Write-Json (Join-Path $claudeHome ".claude\sessions\12345.json") ([ordered]@{
  pid = 12345; sessionId = $liveSessionId; cwd = $projectARoot; startedAt = 0; version = "2.1.283"
})
$historicalSessionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
$encodedC = EncodeClaudePath $projectCRoot
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude\projects\$encodedC") -Force | Out-Null
Write-Text (Join-Path $claudeHome ".claude\projects\$encodedC\$historicalSessionId.jsonl") "$CLAUDE_TRANSCRIPT_SENTINEL`n"

# --- Codex fixture: a real SQLite state file, built by Node (node:sqlite), never by DVCC -----------
New-Item -ItemType Directory -Path (Join-Path $codexHome ".codex") -Force | Out-Null
$codexDbPath = (Join-Path $codexHome ".codex\state_5.sqlite") -replace "\\", "\\\\"
$buildDbScript = @"
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("$codexDbPath");
db.exec(``CREATE TABLE threads (
  id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, git_origin_url TEXT,
  first_user_message TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT ''
)``);
const insert = db.prepare("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url, first_user_message, preview) VALUES (?,?,?,?,?,?,?,?,?)");
insert.run("codex-1", "C:\\\\nowhere\\\\unregistered", 1000, 1000, "0.153.4", 0, "https://github.com/example-org/repo-a.git", "$CODEX_PROMPT_SENTINEL_1", "$CODEX_PREVIEW_SENTINEL_1");
insert.run("codex-2", "C:\\\\nowhere\\\\unregistered2", 2000, 2000, "0.153.4", 0, "https://github.com/example-org/shared.git", "$CODEX_PROMPT_SENTINEL_2", "$CODEX_PREVIEW_SENTINEL_2");
insert.run("codex-3", "C:\\\\Users\\\\smoketest\\\\.codex\\\\project\\\\Smoke A", 3000, 3000, "0.153.4", 0, null, "$CODEX_PROMPT_SENTINEL_3", "$CODEX_PREVIEW_SENTINEL_3");
db.close();
"@
$buildDbFile = Join-Path $root "build-codex-db.cjs"
Write-Text $buildDbFile $buildDbScript
& node.exe $buildDbFile
if ($LASTEXITCODE -ne 0) { throw "failed to build the synthetic Codex state DB" }

# --- Codex fixture (RF-P4B1-04): a second, schema-broken state file — missing the required
# git_origin_url column entirely, so the format gate must fail closed to UNSUPPORTED_FORMAT rather
# than guess a shape for it.
$codexHomeBroken = Join-Path $root "codex-home-broken"
New-Item -ItemType Directory -Path (Join-Path $codexHomeBroken ".codex") -Force | Out-Null
$codexDbBrokenPath = (Join-Path $codexHomeBroken ".codex\state_5.sqlite") -replace "\\", "\\\\"
$buildBrokenDbScript = @"
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("$codexDbBrokenPath");
db.exec(``CREATE TABLE threads (
  id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  first_user_message TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT ''
)``);
const insert = db.prepare("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, first_user_message, preview) VALUES (?,?,?,?,?,?,?,?)");
insert.run("codex-broken-1", "C:\\\\nowhere\\\\unregistered", 1000, 1000, "0.99.0", 0, "$CODEX_PROMPT_SENTINEL_1", "$CODEX_PREVIEW_SENTINEL_1");
db.close();
"@
$buildBrokenDbFile = Join-Path $root "build-codex-db-broken.cjs"
Write-Text $buildBrokenDbFile $buildBrokenDbScript
& node.exe $buildBrokenDbFile
if ($LASTEXITCODE -ne 0) { throw "failed to build the synthetic broken-schema Codex state DB" }

# --- Codex fixture (RF-P4B1-02 final closure, §7/§8/§10): a well-formed schema with more rows than
# the reader's session cap (`MAX_SESSIONS` = 200 in src-tauri/src/codex_reader.rs), none of which are
# relevant to any registered Project. This scan must come back marked `complete: false` (the `LIMIT
# MAX+1` pattern proves more rows exist), and — since no relevant session was found either — the UI
# must show "discovery was incomplete", never a normal "No match" (a scan that never finished cannot
# have confirmed an absence).
$codexHomeIncomplete = Join-Path $root "codex-home-incomplete"
New-Item -ItemType Directory -Path (Join-Path $codexHomeIncomplete ".codex") -Force | Out-Null
$codexDbIncompletePath = (Join-Path $codexHomeIncomplete ".codex\state_5.sqlite") -replace "\\", "\\\\"
$buildIncompleteDbScript = @"
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("$codexDbIncompletePath");
db.exec(``CREATE TABLE threads (
  id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, git_origin_url TEXT,
  first_user_message TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT ''
)``);
const insert = db.prepare("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url, first_user_message, preview) VALUES (?,?,?,?,?,?,?,?,?)");
for (let i = 0; i < 201; i++) {
  insert.run("codex-bulk-" + i, "C:\\\\nowhere\\\\bulk-" + i, 1000 + i, 1000 + i, "0.153.4", 0, null, "$CODEX_PROMPT_SENTINEL_BULK", "$CODEX_PREVIEW_SENTINEL_BULK");
}
db.close();
"@
$buildIncompleteDbFile = Join-Path $root "build-codex-db-incomplete.cjs"
Write-Text $buildIncompleteDbFile $buildIncompleteDbScript
& node.exe $buildIncompleteDbFile
if ($LASTEXITCODE -ne 0) { throw "failed to build the synthetic over-cap Codex state DB" }

$clipboardAtStart = Get-ClipboardFingerprint
Write-Output ("clipboard at start: " + $clipboardAtStart)
[DvccDesktop]::Create($desktopName)

function Assert-NoForbiddenContent([string] $label) {
  $body = Invoke-Cdp "document.body.textContent"
  foreach ($sentinel in @($CLAUDE_TRANSCRIPT_SENTINEL, $CODEX_PROMPT_SENTINEL_1, $CODEX_PREVIEW_SENTINEL_1, $CODEX_PROMPT_SENTINEL_2, $CODEX_PREVIEW_SENTINEL_2, $CODEX_PROMPT_SENTINEL_3, $CODEX_PREVIEW_SENTINEL_3, $CODEX_PROMPT_SENTINEL_BULK, $CODEX_PREVIEW_SENTINEL_BULK)) {
    Check "$label : forbidden content absent ($sentinel)" (-not $body.Contains($sentinel)) "sentinel absent"
  }
}

function Get-BindingStates([string] $provider) {
  $json = Invoke-Cdp ("JSON.stringify(Array.from(document.querySelectorAll('[data-testid=ide-sessions-provider-" + $provider + "] [data-testid=ide-session-row]')).map((el) => el.dataset.binding))")
  return ($json | ConvertFrom-Json)
}

function Refresh-AndWait {
  Invoke-Cdp "document.querySelector('[data-testid=action-refresh-ide-sessions]').click(); true" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=ide-sessions-provider-CLAUDE_CODE]') !== null || document.querySelector('[data-testid=ide-sessions-provider-CODEX]') !== null" 15)) {
    throw "IDE session discovery never finished"
  }
  Start-Sleep -Milliseconds 300
}

try {
  $before = Get-Tree $dataDir
  $claudeBefore = Get-Tree $claudeHome
  $codexBefore = Get-Tree $codexHome

  $env:DVCC_CLAUDE_HOME_DIR = $claudeHome
  $env:DVCC_CODEX_HOME_DIR = $codexHome
  $appPid = Start-App "first start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered" }

  # --- project-a: Claude live MATCHED + Codex repository-identity MATCHED, before any click -------
  Select-Review "rv-20260928-sessa1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared" }
  $notObserved = Invoke-Cdp "document.querySelector('[data-testid=detail-ide-sessions]').textContent"
  Check "no discovery before the Human clicks Refresh" ($notObserved.Length -lt 400) ("length=" + $notObserved.Length)

  Refresh-AndWait
  Assert-NoForbiddenContent "JA/project-a"
  $rowsA = Invoke-Cdp "document.querySelectorAll('[data-testid=ide-session-row]').length"
  Check "JA/project-a : at least one relevant session row" ($rowsA -ge 1) "rows=$rowsA"
  $claudeStatesA = Get-BindingStates "CLAUDE_CODE"
  Check "JA/project-a : Claude live session is MATCHED" (@($claudeStatesA) -contains "MATCHED") ("states=" + ($claudeStatesA -join ","))
  $codexStatesA = Get-BindingStates "CODEX"
  Check "JA/project-a : Codex repository-identity session is MATCHED" (@($codexStatesA) -contains "MATCHED") ("states=" + ($codexStatesA -join ","))

  # --- project-c: Claude historical AMBIGUOUS, never MATCHED --------------------------------------
  Select-Review "rv-20260928-sessc1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared" }
  Refresh-AndWait
  Assert-NoForbiddenContent "JA/project-c"
  $claudeStatesC = Get-BindingStates "CLAUDE_CODE"
  Check "JA/project-c : historical Claude candidate is AMBIGUOUS, not MATCHED" ((@($claudeStatesC) -contains "AMBIGUOUS") -and (@($claudeStatesC) -notcontains "MATCHED")) ("states=" + ($claudeStatesC -join ","))

  # --- project-b: Codex repository-identity tie is AMBIGUOUS, never silently resolved -------------
  Select-Review "rv-20260928-sessb1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared" }
  Refresh-AndWait
  Assert-NoForbiddenContent "JA/project-b"
  $codexStatesB = Get-BindingStates "CODEX"
  Check "JA/project-b : tied repository identity is AMBIGUOUS" ((@($codexStatesB) -contains "AMBIGUOUS") -and (@($codexStatesB) -notcontains "MATCHED")) ("states=" + ($codexStatesB -join ","))

  # --- English: the same facts, translated -----------------------------------------------------
  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English" }
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/project-b"
  $codexStatesBEn = Get-BindingStates "CODEX"
  Check "EN/project-b : tied repository identity is Ambiguous" ((@($codexStatesBEn) -contains "AMBIGUOUS") -and (@($codexStatesBEn) -notcontains "MATCHED")) ("states=" + ($codexStatesBEn -join ","))

  Select-Review "rv-20260928-sessa1"
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/project-a"
  $claudeStatesAEn = Get-BindingStates "CLAUDE_CODE"
  Check "EN/project-a : Claude live session is Matched" ((@($claudeStatesAEn) -contains "MATCHED") -and (@($claudeStatesAEn) -notcontains "AMBIGUOUS")) ("states=" + ($claudeStatesAEn -join ","))

  Stop-App $appPid
  Test-Clean "no spawned process is left running"

  $after = Get-Tree $dataDir
  $claudeAfter = Get-Tree $claudeHome
  $codexAfter = Get-Tree $codexHome
  Check "DVCC's own data files are byte-identical (nothing persisted by discovery)" (Same-Tree $before $after) ("files=" + $after.Count)
  Check "the Claude Code fixture is byte-identical (never modified)" (Same-Tree $claudeBefore $claudeAfter) ("files=" + $claudeAfter.Count)
  Check "the Codex fixture is byte-identical (never modified, no WAL checkpoint left behind)" (Same-Tree $codexBefore $codexAfter) ("files=" + $codexAfter.Count)

  # --- RF-P4B1-04: unsupported Codex schema -------------------------------------------------------
  $codexBrokenBefore = Get-Tree $codexHomeBroken
  $env:DVCC_CODEX_HOME_DIR = $codexHomeBroken
  $appPid2 = Start-App "unsupported-schema start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered (unsupported-schema run)" }
  Select-Review "rv-20260928-sessa1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared (unsupported-schema run)" }

  Refresh-AndWait
  Assert-NoForbiddenContent "JA/unsupported-schema"
  $codexStatusJa = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  Check "JA : an unsupported Codex schema renders unsupportedFormat, not session rows" ($codexStatusJa -eq "unsupportedFormat") "status=$codexStatusJa"
  $claudeStatusJa = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CLAUDE_CODE]')?.dataset.providerStatus"
  Check "JA : Claude discovery is unaffected by Codex's broken schema" ($claudeStatusJa -eq "ok") "status=$claudeStatusJa"

  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English (unsupported-schema run)" }
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/unsupported-schema"
  $codexStatusEn = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  Check "EN : an unsupported Codex schema renders unsupportedFormat, not session rows" ($codexStatusEn -eq "unsupportedFormat") "status=$codexStatusEn"

  Stop-App $appPid2
  Test-Clean "no spawned process is left running (unsupported-schema run)"
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue

  $codexBrokenAfter = Get-Tree $codexHomeBroken
  $afterUnsupported = Get-Tree $dataDir
  Check "the broken-schema Codex fixture is byte-identical (never modified)" (Same-Tree $codexBrokenBefore $codexBrokenAfter) ("files=" + $codexBrokenAfter.Count)
  Check "DVCC's own data files are still byte-identical after the unsupported-schema run" (Same-Tree $before $afterUnsupported) ("files=" + $afterUnsupported.Count)

  # --- RF-P4B1-02 final closure: an incomplete Codex scan (cap hit) with no relevant session must
  # never render as a normal "No match" -------------------------------------------------------------
  $codexIncompleteBefore = Get-Tree $codexHomeIncomplete
  $env:DVCC_CODEX_HOME_DIR = $codexHomeIncomplete
  $appPid3 = Start-App "incomplete-scan start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered (incomplete-scan run)" }
  Select-Review "rv-20260928-sessa1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared (incomplete-scan run)" }

  Refresh-AndWait
  Assert-NoForbiddenContent "JA/incomplete-scan"
  $codexStatusIncompleteJa = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  Check "JA : an incomplete Codex scan with no relevant session never renders as No match" ($codexStatusIncompleteJa -eq "incomplete") "status=$codexStatusIncompleteJa"
  $claudeStatusIncompleteJa = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CLAUDE_CODE]')?.dataset.providerStatus"
  Check "JA : Claude discovery is unaffected by Codex's incomplete scan" ($claudeStatusIncompleteJa -eq "ok") "status=$claudeStatusIncompleteJa"

  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English (incomplete-scan run)" }
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/incomplete-scan"
  $codexStatusIncompleteEn = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  Check "EN : an incomplete Codex scan with no relevant session never renders as No match" ($codexStatusIncompleteEn -eq "incomplete") "status=$codexStatusIncompleteEn"

  Stop-App $appPid3
  Test-Clean "no spawned process is left running (incomplete-scan run)"
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue

  $codexIncompleteAfter = Get-Tree $codexHomeIncomplete
  $afterIncomplete = Get-Tree $dataDir
  Check "the over-cap Codex fixture is byte-identical (never modified)" (Same-Tree $codexIncompleteBefore $codexIncompleteAfter) ("files=" + $codexIncompleteAfter.Count)
  Check "DVCC's own data files are still byte-identical after the incomplete-scan run" (Same-Tree $before $afterIncomplete) ("files=" + $afterIncomplete.Count)
}
finally {
  Remove-Item Env:\DVCC_CLAUDE_HOME_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue
  Stop-Started
}

Test-OperatorClipboard $clipboardAtStart
Write-Summary
if ($script:failures -gt 0) { exit 1 }
