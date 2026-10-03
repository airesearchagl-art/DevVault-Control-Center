# IDE Session Discovery running-app smoke (Phase 4b-1, LR-20260928-DVCC-006 Wave 5).
#
# Runs the release build on a hidden isolated desktop against synthetic DVCC projects and synthetic
# Claude Code / Codex provider fixtures (never the operator's real ~/.claude or ~/.codex) via the
# DVCC_CLAUDE_HOME_DIR / DVCC_CODEX_HOME_DIR test-only overrides. Drives "Refresh IDE Sessions" in
# both languages and asserts: no discovery before the click, correct MATCHED / AMBIGUOUS / UNAVAILABLE
# outcomes, every content sentinel (first_user_message, preview, transcript body) absent from the
# rendered page, and that these synthetic (non-WAL) provider fixtures and DVCC's own data files are
# byte-identical before and after. That byte-identity is a fact about these fixtures, not a general
# provider invariant: the WAL-mode scenario at the end (DF-06 / HD-4B12-02) checks the actual
# contract, where the database and WAL must be unchanged but SQLite's -shm coordination file may
# legitimately change. Phase 4b-1.2 (DF-05) adds the ordinary ASCII naming rule (underscore/space
# roots) and the unsupported-history warning for non-ASCII roots. Nothing is copied to the clipboard
# by this feature, but the operator's clipboard fingerprint is still checked, for the same reason
# every other smoke checks it.

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
$projectERoot = Join-Path $projectsRoot "Project-E"
# DF-05: an underscore + space root the old narrow encoder (':', '\', '.') would have missed.
$projectFRoot = Join-Path $projectsRoot "project_f name"
# DF-05 / HD-4B12-01: non-ASCII roots have no supported historical key. Built from code points so
# this (BOM-less) script stays ASCII. G has a live exact session; H has none.
$nonAscii = -join [char[]](0x30D7, 0x30ED, 0x30B8, 0x30A7, 0x30AF, 0x30C8)
$projectGRoot = Join-Path $projectsRoot ($nonAscii + "-g")
$projectHRoot = Join-Path $projectsRoot ($nonAscii + "-h")
foreach ($dir in @($projectARoot, $projectCRoot, $projectERoot, $projectFRoot, $projectGRoot, $projectHRoot)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

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
    (Project "project-d" "Smoke D" $null "https://github.com/example-org/shared"),
    (Project "project-e" "Smoke E" $projectERoot $null),
    (Project "project-f" "Smoke F" $projectFRoot $null),
    (Project "project-g" "Smoke G" $projectGRoot $null),
    (Project "project-h" "Smoke H" $projectHRoot $null)
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
Seed-Session "rv-20260929-sesse1" "project-e"
Seed-Session "rv-20260930-sessf1" "project-f"
Seed-Session "rv-20260930-sessg1" "project-g"
Seed-Session "rv-20260930-sessh1" "project-h"

# --- Claude Code fixture (never opened by the reader except for names/metadata) --------------------
# The ordinary provider naming rule (HD-4B12-01): every ASCII character outside [A-Za-z0-9] -> '-'.
function EncodeClaudePath([string] $path) { return $path -creplace "[^A-Za-z0-9]", "-" }
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude\sessions") -Force | Out-Null
$liveSessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
Write-Json (Join-Path $claudeHome ".claude\sessions\12345.json") ([ordered]@{
  pid = 12345; sessionId = $liveSessionId; cwd = $projectARoot; startedAt = 0; version = "2.1.283"
})
$historicalSessionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
$encodedC = EncodeClaudePath $projectCRoot
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude\projects\$encodedC") -Force | Out-Null
Write-Text (Join-Path $claudeHome ".claude\projects\$encodedC\$historicalSessionId.jsonl") "$CLAUDE_TRANSCRIPT_SENTINEL`n"
# DF-02 (LRP-20260929-DVCC-007): Claude recorded this history directory from a lowercase-drive cwd
# (the real VS Code shape: `c:\...`), so its name differs from Project E's encoded root only by case.
$historicalSessionIdE = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
$encodedELower = EncodeClaudePath ($projectERoot.Substring(0, 1).ToLowerInvariant() + $projectERoot.Substring(1))
if ($encodedELower -ceq (EncodeClaudePath $projectERoot)) { throw "fixture error: the lowercase-drive key must differ by case" }
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude\projects\$encodedELower") -Force | Out-Null
Write-Text (Join-Path $claudeHome ".claude\projects\$encodedELower\$historicalSessionIdE.jsonl") "$CLAUDE_TRANSCRIPT_SENTINEL`n"
# DF-05: Project F's history directory under the ordinary rule; the old narrow encoder would have
# kept '_' and ' ' and therefore never found it (NO_MATCH).
$historicalSessionIdF = "ffffffff-ffff-ffff-ffff-ffffffffffff"
$encodedF = EncodeClaudePath $projectFRoot
$oldNarrowF = ($projectFRoot -replace "/", "\") -replace "[:\\.]", "-"
if ($encodedF -eq $oldNarrowF) { throw "fixture error: Project F must differ between the old and new encoders" }
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude\projects\$encodedF") -Force | Out-Null
Write-Text (Join-Path $claudeHome ".claude\projects\$encodedF\$historicalSessionIdF.jsonl") "$CLAUDE_TRANSCRIPT_SENTINEL`n"
# DF-05 / HD-4B12-01: Project G (non-ASCII) has a live exact session; Project H (non-ASCII) has none.
Write-Json (Join-Path $claudeHome ".claude\sessions\12346.json") ([ordered]@{
  pid = 12346; sessionId = "99999999-9999-9999-9999-999999999999"; cwd = $projectGRoot; startedAt = 0; version = "2.1.283"
})

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
// DF-03 (LRP-20260929-DVCC-007): synthetic UUIDv7-shaped ids for repo-a sharing their first 8 hex
// characters (two also share their last 8) - the real collision shape, no real id copied.
for (const id of ["019c1a2b-0001-7aaa-8aaa-000000000001", "019c1a2b-3c4d-7bbb-8bbb-000000000002", "019c1a2b-9f00-7ccc-8ccc-0000cafe0003", "019c1a2b-9f00-7ddd-8ddd-0000cafe0003"]) {
  insert.run(id, "C:\\\\nowhere\\\\uuid7", 4000, 4000, "0.155.0", 0, "https://github.com/example-org/repo-a.git", "$CODEX_PROMPT_SENTINEL_BULK", "$CODEX_PREVIEW_SENTINEL_BULK");
}
// DF-01: pad to the real dogfood volume (379 rows) - above the old cap of 200, below the new 1000.
db.exec("BEGIN");
for (let i = 0; i < 372; i++) {
  insert.run("codex-pad-" + i, "C:\\\\nowhere\\\\bulk", 100 + i, 100 + i, "0.153.4", 0, null, "$CODEX_PROMPT_SENTINEL_BULK", "$CODEX_PREVIEW_SENTINEL_BULK");
}
db.exec("COMMIT");
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
# the reader's session cap (`MAX_SESSIONS` = 1000 since DF-01, src-tauri/src/codex_reader.rs), none of which are
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
db.exec("BEGIN");
for (let i = 0; i < 1001; i++) {
  insert.run("codex-bulk-" + i, "C:\\\\nowhere\\\\bulk", 1000 + i, 1000 + i, "0.153.4", 0, null, "$CODEX_PROMPT_SENTINEL_BULK", "$CODEX_PREVIEW_SENTINEL_BULK");
}
db.exec("COMMIT");
db.close();
"@
$buildIncompleteDbFile = Join-Path $root "build-codex-db-incomplete.cjs"
Write-Text $buildIncompleteDbFile $buildIncompleteDbScript
& node.exe $buildIncompleteDbFile
if ($LASTEXITCODE -ne 0) { throw "failed to build the synthetic over-cap Codex state DB" }

# --- Codex fixture (DF-06 / HD-4B12-02): a live WAL-mode state file, held open by a test-only Node
# helper. Fixture infrastructure only: it writes while building, signals ready, then stays idle
# (no write) until told to stop. Synthetic data only.
$codexHomeWal = Join-Path $root "codex-home-wal"
New-Item -ItemType Directory -Path (Join-Path $codexHomeWal ".codex") -Force | Out-Null
$codexDbWal = Join-Path $codexHomeWal ".codex\state_5.sqlite"
$walReadyFile = Join-Path $root "wal-helper.ready"
$walStopFile = Join-Path $root "wal-helper.stop"
$jsEsc = { param($p) $p -replace "\\", "\\\\" }
$walHelperScript = @"
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const db = new DatabaseSync("$(& $jsEsc $codexDbWal)");
const mode = db.prepare("PRAGMA journal_mode=WAL").get();
if (String(Object.values(mode)[0]).toLowerCase() !== "wal") { console.error("not WAL"); process.exit(2); }
db.exec("PRAGMA wal_autocheckpoint=0");
db.exec(``CREATE TABLE threads (
  id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, git_origin_url TEXT,
  first_user_message TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT ''
)``);
db.prepare("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url, first_user_message, preview) VALUES (?,?,?,?,?,?,?,?,?)")
  .run("codex-wal-1", "C:\\\\nowhere\\\\wal", 5000, 5000, "0.155.0", 0, "https://github.com/example-org/repo-a.git", "$CODEX_PROMPT_SENTINEL_1", "$CODEX_PREVIEW_SENTINEL_1");
fs.writeFileSync("$(& $jsEsc $walReadyFile)", "ready");
// Idle: hold the connection (and so the WAL + -shm) open, never write again.
setInterval(() => { if (fs.existsSync("$(& $jsEsc $walStopFile)")) process.exit(0); }, 100);
"@
$walHelperFile = Join-Path $root "wal-helper.cjs"
Write-Text $walHelperFile $walHelperScript

function Start-WalHelper {
  $proc = Start-Process -FilePath "node.exe" -ArgumentList @("`"$walHelperFile`"") -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(20)
  while (-not (Test-Path -LiteralPath $walReadyFile)) {
    if ($proc.HasExited) { throw "the WAL fixture helper exited early (code $($proc.ExitCode))" }
    if ((Get-Date) -gt $deadline) { throw "the WAL fixture helper never became ready" }
    Start-Sleep -Milliseconds 100
  }
  Start-Sleep -Milliseconds 500 # stabilize
  return $proc
}
function Stop-WalHelper($proc) {
  Write-Text $walStopFile "stop"
  if (-not $proc.WaitForExit(5000)) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
# Hash with FileShare.ReadWrite: the helper still has the files open. A -shm range locked by SQLite
# may be unreadable; that is recorded, not failed on (it is coordination state, not data).
function Get-SharedFileFacts([string] $path) {
  if (-not (Test-Path -LiteralPath $path)) { return [pscustomobject]@{ present = $false; length = 0; mtime = 0; hash = "ABSENT" } }
  $item = Get-Item -LiteralPath $path
  try {
    $fs = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
    try { $hash = [BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($fs)) -replace "-", "" } finally { $fs.Dispose() }
  } catch { $hash = "UNREADABLE:" + $_.Exception.GetType().Name }
  return [pscustomobject]@{ present = $true; length = $item.Length; mtime = $item.LastWriteTimeUtc.Ticks; hash = $hash }
}
function Get-WalFacts {
  return [pscustomobject]@{
    db = Get-SharedFileFacts $codexDbWal
    wal = Get-SharedFileFacts ($codexDbWal + "-wal")
    shm = Get-SharedFileFacts ($codexDbWal + "-shm")
  }
}
function Same-WalApp($a, $b) {
  return ($a.db.hash -eq $b.db.hash) -and ($a.db.length -eq $b.db.length) -and ($a.wal.hash -eq $b.wal.hash) -and ($a.wal.length -eq $b.wal.length)
}
$walHelper = $null

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

function Get-CodexIdLabels {
  $json = Invoke-Cdp "JSON.stringify(Array.from(document.querySelectorAll('[data-testid=ide-sessions-provider-CODEX] [data-testid=ide-session-id]')).map((el) => el.textContent))"
  return @($json | ConvertFrom-Json)
}

# The IDE Sessions card's only controls are Refresh and, since Phase 4b-2a, the per-row copy-only
# "Copy Resume Command" (which copies text and never runs anything): no launch, attach, fork or other
# action exists on it.
function Assert-NoResumeControl([string] $label) {
  # Phase 4b-2b adds "Resume in Codex", which only opens a confirmation (verified by
  # verify-resume-launcher-ui.ps1); nothing on the card itself runs a session.
  $other = Invoke-Cdp "Array.from(document.querySelectorAll('[data-testid=detail-ide-sessions] button, [data-testid=detail-ide-sessions] a, [data-testid=detail-ide-sessions] [role=button]')).filter((el) => el.dataset.testid !== 'action-refresh-ide-sessions' && el.dataset.testid !== 'action-copy-resume' && el.dataset.testid !== 'action-launch-resume').length"
  Check "$label : the IDE Sessions card has no control other than Refresh, Copy Resume Command and Resume in Codex (confirmation-gated)" ($other -eq 0) "other controls=$other"
}

function Get-ClaudeSection {
  $json = Invoke-Cdp "JSON.stringify((() => { const s = document.querySelector('[data-testid=ide-sessions-provider-CLAUDE_CODE]'); return s ? { status: s.dataset.providerStatus, warning: s.querySelector('[data-testid=ide-sessions-history-unsupported]') !== null, text: s.textContent } : null; })())"
  return ($json | ConvertFrom-Json)
}

# DF-05 / HD-4B12-01 (LRP-20260930-DVCC-009): F = ordinary-rule underscore/space history candidate,
# G = non-ASCII root with a live exact session, H = non-ASCII root with no live session.
function Check-Df05([string] $L) {
  Select-Review "rv-20260930-sessf1"
  Refresh-AndWait
  Assert-NoForbiddenContent "$L/project-f"
  $statesF = Get-BindingStates "CLAUDE_CODE"
  Check "$L/project-f : underscore/space Claude history candidate is AMBIGUOUS, never MATCHED (DF-05)" ((@($statesF) -contains "AMBIGUOUS") -and (@($statesF) -notcontains "MATCHED")) ("states=" + ($statesF -join ","))
  Check "$L/project-f : a supported root shows no unsupported-history warning" (-not (Get-ClaudeSection).warning) "warning absent"

  Select-Review "rv-20260930-sessg1"
  Refresh-AndWait
  Assert-NoForbiddenContent "$L/project-g"
  $statesG = Get-BindingStates "CLAUDE_CODE"
  $sectionG = Get-ClaudeSection
  Check "$L/project-g : non-ASCII root keeps its live exact MATCHED row (DF-05 J)" (@($statesG) -contains "MATCHED") ("states=" + ($statesG -join ","))
  Check "$L/project-g : ... and shows the unsupported-history warning" ($sectionG.warning) ("status=" + $sectionG.status)
  Check "$L/project-g : no localRoot / encoded name leaks into the Claude section" ((-not $sectionG.text.Contains($nonAscii)) -and (-not $sectionG.text.Contains("projects-"))) "no path"

  Select-Review "rv-20260930-sessh1"
  Refresh-AndWait
  Assert-NoForbiddenContent "$L/project-h"
  $sectionH = Get-ClaudeSection
  Check "$L/project-h : non-ASCII root with no live session is never an ordinary No match (DF-05 I)" (($sectionH.status -eq "historyUnsupported") -and $sectionH.warning) ("status=" + $sectionH.status)
  Check "$L/project-h : no localRoot leaks into the Claude section" (-not $sectionH.text.Contains($nonAscii)) "no path"
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
  # DF-01: 379 Codex rows (> old cap 200, < new cap 1000) is now a COMPLETE scan.
  $codexStatusA = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  Check "JA/project-a : a 379-row Codex dataset is a complete scan (DF-01)" ($codexStatusA -eq "ok") "status=$codexStatusA"
  # DF-03: UUIDv7-like ids sharing their first 8 characters render as distinct labels.
  $labelsJa = Get-CodexIdLabels
  Check "JA/project-a : duplicate-prefix Codex ids render distinct labels (DF-03)" (($labelsJa.Count -ge 5) -and (@($labelsJa | Sort-Object -Unique).Count -eq $labelsJa.Count)) ("labels=" + ($labelsJa -join " | "))
  Assert-NoResumeControl "JA/project-a"

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

  # --- project-e (DF-02): a lowercase-drive Claude history key is an AMBIGUOUS candidate -----------
  Select-Review "rv-20260929-sesse1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared" }
  Refresh-AndWait
  Assert-NoForbiddenContent "JA/project-e"
  $claudeStatesE = Get-BindingStates "CLAUDE_CODE"
  Check "JA/project-e : case-varied Claude history candidate is AMBIGUOUS, not NO_MATCH/MATCHED (DF-02)" ((@($claudeStatesE) -contains "AMBIGUOUS") -and (@($claudeStatesE) -notcontains "MATCHED")) ("states=" + ($claudeStatesE -join ","))
  Assert-NoResumeControl "JA/project-e"

  Check-Df05 "JA"

  # --- English: the same facts, translated -----------------------------------------------------
  Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
  if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English" }
  Select-Review "rv-20260928-sessb1"
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/project-b"
  $codexStatesBEn = Get-BindingStates "CODEX"
  Check "EN/project-b : tied repository identity is Ambiguous" ((@($codexStatesBEn) -contains "AMBIGUOUS") -and (@($codexStatesBEn) -notcontains "MATCHED")) ("states=" + ($codexStatesBEn -join ","))

  Select-Review "rv-20260928-sessa1"
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/project-a"
  $claudeStatesAEn = Get-BindingStates "CLAUDE_CODE"
  Check "EN/project-a : Claude live session is Matched" ((@($claudeStatesAEn) -contains "MATCHED") -and (@($claudeStatesAEn) -notcontains "AMBIGUOUS")) ("states=" + ($claudeStatesAEn -join ","))
  $codexStatusAEn = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  Check "EN/project-a : a 379-row Codex dataset is a complete scan (DF-01)" ($codexStatusAEn -eq "ok") "status=$codexStatusAEn"
  $labelsEn = Get-CodexIdLabels
  Check "EN/project-a : duplicate-prefix Codex ids render distinct labels (DF-03)" (($labelsEn.Count -ge 5) -and (@($labelsEn | Sort-Object -Unique).Count -eq $labelsEn.Count)) ("labels=" + ($labelsEn -join " | "))
  Check "JA/EN : the language switch does not alter any session id label (DF-03)" (($labelsJa -join "|") -eq ($labelsEn -join "|")) "same=$(($labelsJa -join '|') -eq ($labelsEn -join '|'))"
  Assert-NoResumeControl "EN/project-a"

  Select-Review "rv-20260929-sesse1"
  Refresh-AndWait
  Assert-NoForbiddenContent "EN/project-e"
  $claudeStatesEEn = Get-BindingStates "CLAUDE_CODE"
  Check "EN/project-e : case-varied Claude history candidate is Ambiguous, not No match/Matched (DF-02)" ((@($claudeStatesEEn) -contains "AMBIGUOUS") -and (@($claudeStatesEEn) -notcontains "MATCHED")) ("states=" + ($claudeStatesEEn -join ","))

  Check-Df05 "EN"

  Stop-App $appPid
  Test-Clean "no spawned process is left running"

  $after = Get-Tree $dataDir
  $claudeAfter = Get-Tree $claudeHome
  $codexAfter = Get-Tree $codexHome
  Check "DVCC's own data files are byte-identical (nothing persisted by discovery)" (Same-Tree $before $after) ("files=" + $after.Count)
  Check "this synthetic Claude Code fixture is byte-identical" (Same-Tree $claudeBefore $claudeAfter) ("files=" + $claudeAfter.Count)
  Check "this synthetic (non-WAL) Codex fixture is byte-identical" (Same-Tree $codexBefore $codexAfter) ("files=" + $codexAfter.Count)

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
  Check "this synthetic (non-WAL) broken-schema Codex fixture is byte-identical" (Same-Tree $codexBrokenBefore $codexBrokenAfter) ("files=" + $codexBrokenAfter.Count)
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
  Check "this synthetic (non-WAL) over-cap Codex fixture is byte-identical" (Same-Tree $codexIncompleteBefore $codexIncompleteAfter) ("files=" + $codexIncompleteAfter.Count)
  Check "DVCC's own data files are still byte-identical after the incomplete-scan run" (Same-Tree $before $afterIncomplete) ("files=" + $afterIncomplete.Count)

  # --- DF-06 / HD-4B12-02 (LRP-20260930-DVCC-009): a live WAL-mode Codex fixture -----------------
  # A test-only Node helper creates the DB in WAL mode with auto-checkpoint disabled, so every table
  # and row lives only in the -wal file, then holds its connection open (keeping WAL + -shm present)
  # and performs no write during the measured window. Contract: the database and WAL application
  # data must be unchanged; SQLite's -shm coordination file MAY change (read-mark/lock bytes,
  # metadata) and is only recorded, never failed on, and never required to change.
  $walHelper = Start-WalHelper
  $walBefore = Get-WalFacts
  Check "WAL fixture : the -wal file is present and holds the data (not checkpointed)" ($walBefore.wal.present -and $walBefore.wal.length -gt 0) ("walBytes=" + $walBefore.wal.length)
  Check "WAL fixture : database and WAL are readable for hashing" (($walBefore.db.hash -notlike "UNREADABLE*") -and ($walBefore.wal.hash -notlike "UNREADABLE*")) "readable"
  $afterWalStable = Get-WalFacts
  Check "WAL fixture : stable before the measured window (helper performs no writes)" ((Same-WalApp $walBefore $afterWalStable)) "stable"

  $env:DVCC_CODEX_HOME_DIR = $codexHomeWal
  $appPid4 = Start-App "wal-mode start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered (wal-mode run)" }
  Select-Review "rv-20260928-sessa1"
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared (wal-mode run)" }
  Refresh-AndWait
  Assert-NoForbiddenContent "WAL/project-a"
  $codexStatusWal = Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX]')?.dataset.providerStatus"
  $codexStatesWal = @(Get-BindingStates "CODEX")
  Check "WAL A : the WAL-only Codex row is read (MATCHED for project-a, complete scan)" (($codexStatusWal -eq "ok") -and ($codexStatesWal.Count -eq 1) -and ($codexStatesWal -contains "MATCHED")) ("status=$codexStatusWal states=" + ($codexStatesWal -join ","))
  Stop-App $appPid4
  Test-Clean "WAL G : no spawned process is left running (wal-mode run)"
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue

  $walAfter = Get-WalFacts
  Check "WAL B : the database file is unchanged (hash + length)" (($walBefore.db.hash -eq $walAfter.db.hash) -and ($walBefore.db.length -eq $walAfter.db.length)) ("db " + $walBefore.db.length + " -> " + $walAfter.db.length)
  Check "WAL C : the WAL file is unchanged (hash + length)" (($walBefore.wal.hash -eq $walAfter.wal.hash) -and ($walBefore.wal.length -eq $walAfter.wal.length)) ("wal " + $walBefore.wal.length + " -> " + $walAfter.wal.length)
  Check "WAL D : no checkpoint / truncate / migration (WAL still present, same size, DB same size)" ($walAfter.wal.present -and ($walAfter.wal.length -eq $walBefore.wal.length) -and ($walAfter.db.length -eq $walBefore.db.length)) "no checkpoint"
  $shmBytesChanged = $walBefore.shm.hash -ne $walAfter.shm.hash
  $shmMtimeChanged = $walBefore.shm.mtime -ne $walAfter.shm.mtime
  Write-Output ("RECORD WAL E : -shm present before/after=" + $walBefore.shm.present + "/" + $walAfter.shm.present + " bytesChanged=" + $shmBytesChanged + " mtimeChanged=" + $shmMtimeChanged + " (allowed by the DF-06 contract; not a failure)")
  $afterWal = Get-Tree $dataDir
  Check "WAL F : DVCC's own data files are still byte-identical after the wal-mode run" (Same-Tree $before $afterWal) ("files=" + $afterWal.Count)
  Stop-WalHelper $walHelper
  $walHelper = $null
}
finally {
  Remove-Item Env:\DVCC_CLAUDE_HOME_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue
  Stop-Started
  if ($null -ne $walHelper) { Stop-WalHelper $walHelper }
}

Test-OperatorClipboard $clipboardAtStart
Write-Summary
if ($script:failures -gt 0) { exit 1 }
