# Resume Handoff running-app smoke (Phase 4b-2a, LR-20260929-DVCC-008).
#
# Runs the release build on a hidden isolated desktop against synthetic DVCC projects and synthetic
# Claude Code / Codex provider fixtures (never the operator's real ~/.claude or ~/.codex). In both
# languages it checks that "Copy Resume Command" is enabled only on eligible Codex rows, that each
# click hands the clipboard (intercepted inside the page, never the Windows clipboard) exactly
# `codex resume <FULL UUID>` while the visible label stays abbreviated, that every other row is
# disabled with a localized reason, that a stale discovery offers no action, that nothing is ever
# executed (no shell / provider child process), and that DVCC data and provider fixtures are unchanged.

param(
  [string] $Exe = "",
  [int] $Port = 9338,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-resume-$runId"
$dataDir = Join-Path $root "data"
$claudeHome = Join-Path $root "claude-home"
$codexHome = Join-Path $root "codex-home"
$projectsRoot = Join-Path $root "projects"
$desktopName = "dvcc-resume-$runId"

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

$utf8 = [System.Text.UTF8Encoding]::new($false)
$ELL = [string][char]0x2026

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

# --- synthetic identifiers (no real session ID) ------------------------------------------------------
$ELIGIBLE_IDS = @(
  "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b",
  "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f9999",
  "019c1a2b-9f00-7ccc-8ccc-0000cafe0003",
  "019c1a2b-9f00-7ddd-8ddd-0000cafe0003"
)
$ARCHIVED_ID = "019c1a2c-0000-7aaa-8aaa-00000000a0a0"
$AMBIGUOUS_ID = "019c1a2d-0000-7bbb-8bbb-00000000b0b0"
$CLAUDE_LIVE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
$PROMPT_SENTINEL = "RESUME_SMOKE_FIRST_USER_MESSAGE_MUST_NOT_APPEAR"
$PREVIEW_SENTINEL = "RESUME_SMOKE_PREVIEW_MUST_NOT_APPEAR"

# --- DVCC projects / reviews --------------------------------------------------------------------------
$projectARoot = Join-Path $projectsRoot "resume-a"
New-Item -ItemType Directory -Path $projectARoot -Force | Out-Null
$T0 = "2026-09-29T00:00:00.000Z"
function Project([string] $id, [string] $name, $localRoot, $repositoryUrl) {
  return [ordered]@{
    projectId = $id; displayName = $name; repositoryUrl = $repositoryUrl; localRoot = $localRoot
    developmentIde = $null; nextAction = ""; notes = "Synthetic resume smoke project."; createdAt = $T0; updatedAt = $T0
  }
}
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Write-Json (Join-Path $dataDir "projects.json") ([ordered]@{
  schemaVersion = 1
  projects = @(
    (Project "project-a" "Resume A" $projectARoot "https://github.com/example-org/repo-a"),
    (Project "project-b" "Resume B" $null "https://github.com/example-org/shared"),
    (Project "project-d" "Resume D" $null "https://github.com/example-org/shared")
  )
})
function Seed-Session([string] $id, [string] $projectId) {
  Write-Json (Join-Path $dataDir "reviews\$id\session.json") ([ordered]@{
    schemaVersion = 1; reviewSessionId = $id; projectId = $projectId; prNumber = 1; reviewType = "PR review"
    reviewRound = 1; resourceState = "HOT"; reviewState = "NEW"; suspendedFrom = $null
    chatgptThreadTitle = $null; chatgptThreadUrl = $null; nextAction = ""
    rounds = @([ordered]@{ round = 1; expectedHead = ("a1" * 20); reviewedHead = $null; requestSavedAt = $null; resultCapturedAt = $null; verdict = $null; verdictConfirmedAt = $null; verdictNote = $null })
    createdAt = $T0; updatedAt = $T0
  })
}
Seed-Session "rv-20260929-resa01" "project-a"
Seed-Session "rv-20260929-resb01" "project-b"

# --- Claude fixture: one LIVE session in Project A's folder (MATCHED, must be ALREADY_ACTIVE) -----------
Write-Json (Join-Path $claudeHome ".claude\sessions\24680.json") ([ordered]@{
  pid = 24680; sessionId = $CLAUDE_LIVE_ID; cwd = $projectARoot; startedAt = 0; version = "2.1.284"
})

# --- Codex fixture: a real SQLite file built by Node (node:sqlite), never by DVCC ---------------------
New-Item -ItemType Directory -Path (Join-Path $codexHome ".codex") -Force | Out-Null
$codexDbPath = (Join-Path $codexHome ".codex\state_5.sqlite") -replace "\\", "\\\\"
$rows = @()
$u = 9000
foreach ($id in $ELIGIBLE_IDS) { $rows += "[`"$id`", 0, `"https://github.com/example-org/repo-a.git`", $u]"; $u -= 100 }
$rows += "[`"$ARCHIVED_ID`", 1, `"https://github.com/example-org/repo-a.git`", 5000]"
$rows += "[`"$AMBIGUOUS_ID`", 0, `"git@github.com:example-org/shared.git`", 4000]"
$buildDbScript = @"
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("$codexDbPath");
db.exec(``CREATE TABLE threads (
  id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, git_origin_url TEXT,
  first_user_message TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT ''
)``);
const insert = db.prepare("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url, first_user_message, preview) VALUES (?,?,?,?,?,?,?,?,?)");
for (const [id, archived, origin, updated] of [$($rows -join ", ")]) {
  insert.run(id, "C:\\\\nowhere\\\\mirror", updated, updated, "0.153.4", archived, origin, "$PROMPT_SENTINEL", "$PREVIEW_SENTINEL");
}
db.close();
"@
$buildDbFile = Join-Path $root "build-codex-db.cjs"
Write-Text $buildDbFile $buildDbScript
& node.exe $buildDbFile
if ($LASTEXITCODE -ne 0) { throw "failed to build the synthetic Codex state DB" }

# --- UI helpers ----------------------------------------------------------------------------------------
$switchScript = @'
(() => {
  const select = document.querySelector('[data-testid=language-selector]');
  if (!select) return "no selector";
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(select, "__LOCALE__");
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
})()
'@
function Select-Review([string] $id) {
  $selector = '[data-testid=queue-item][data-review-id="' + $id + '"]'
  if (-not (Invoke-Cdp ("(() => { const e = document.querySelector(" + (ConvertTo-Json $selector -Compress) + "); if (!e) return false; e.click(); return true; })()"))) { throw "review $id is not in the queue" }
  if (-not (Wait-For ('document.querySelector("[data-testid=detail]")?.dataset.reviewId === ' + (ConvertTo-Json $id -Compress)) 10)) { throw "review $id did not open" }
  if (-not (Wait-For "document.querySelector('[data-testid=detail-ide-sessions]') !== null" 15)) { throw "the IDE Sessions card never appeared" }
}
function Refresh-AndWait {
  Invoke-Cdp "document.querySelector('[data-testid=action-refresh-ide-sessions]').click(); true" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=ide-sessions-provider-CLAUDE_CODE]') !== null && document.querySelector('[data-testid=ide-sessions-provider-CODEX]') !== null" 15)) {
    throw "IDE session discovery never finished"
  }
  Start-Sleep -Milliseconds 300
}
# Resume state per row of one provider section: [{ state, label, reason }].
function Get-ResumeRows([string] $provider) {
  $js = @'
JSON.stringify(Array.from(document.querySelectorAll('[data-testid=ide-sessions-provider-__P__] [data-testid=ide-session-row]')).map((row) => ({
  state: row.querySelector('[data-testid=ide-session-resume]')?.dataset.resume ?? null,
  label: row.querySelector('[data-testid=ide-session-id]')?.textContent ?? null,
  reason: row.querySelector('[data-testid=action-copy-resume-reason]')?.textContent ?? "",
  ariaDisabled: row.querySelector('[data-testid=action-copy-resume]')?.getAttribute('aria-disabled') ?? null,
  disabled: row.querySelector('[data-testid=action-copy-resume]')?.disabled ?? null
})))
'@
  return @((Invoke-Cdp ($js -replace "__P__", $provider)) | ConvertFrom-Json)
}
function Resolve-Label([string] $label) {
  $l = $label.Trim()
  if (-not $l.Contains($ELL)) { return @($ELIGIBLE_IDS | Where-Object { $_ -eq $l }) }
  $parts = $l.Split([char]0x2026)
  return @($ELIGIBLE_IDS | Where-Object { $_.StartsWith($parts[0]) -and $_.EndsWith($parts[1]) })
}
# Clicks one specific row's button and returns the single intercepted clipboard write, or $null.
function Invoke-RowCopy([string] $selector, [int] $index) {
  $count = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
  $sequence = [DvccDesktop]::GetClipboardSequenceNumber()
  Invoke-Cdp ("document.querySelectorAll(" + (ConvertTo-Json $selector -Compress) + ")[$index].click(); true") | Out-Null
  $seen = Wait-For "window.__dvccClipboard.writes.length > $count" 5
  if ([DvccDesktop]::GetClipboardSequenceNumber() -ne $sequence) { $script:externalClipboardActivity = $true }
  if (-not $seen) { return $null }
  if ([int](Invoke-Cdp 'window.__dvccClipboard.writes.length') -ne $count + 1) { return "<more than one write>" }
  return (Invoke-Cdp "window.__dvccClipboard.writes[$count]")
}
# No shell, terminal or provider process may ever descend from the app (WebView2 helpers are expected).
function Get-ForbiddenDescendants([int] $rootPid) {
  $all = @(Get-CimInstance Win32_Process)
  $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($rootPid)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true } }
  }
  return @($all | Where-Object { $ids.Contains([int]$_.ProcessId) -and $_.ProcessId -ne $rootPid -and $_.Name -match '^(codex|claude|cmd|powershell|pwsh|bash|wsl|conhost|windowsterminal|wt|node)(\.exe)?$' } | ForEach-Object { $_.Name })
}
function Assert-NoForbiddenContent([string] $label) {
  $body = Invoke-Cdp "document.body.textContent"
  foreach ($s in @($PROMPT_SENTINEL, $PREVIEW_SENTINEL)) { Check "$label : forbidden content absent ($s)" (-not $body.Contains($s)) "absent" }
  $fullIdVisible = @($ELIGIBLE_IDS + $ARCHIVED_ID + $AMBIGUOUS_ID | Where-Object { $body.Contains($_) })
  Check "$label : no full session UUID is visible text (labels are presentation only)" ($fullIdVisible.Count -eq 0) ("visible=" + $fullIdVisible.Count)
}

$clipboardAtStart = Get-ClipboardFingerprint
Write-Output ("clipboard at start: " + $clipboardAtStart)
[DvccDesktop]::Create($desktopName)
$reasonsByLocale = @{}

try {
  $claudeBefore = Get-Tree $claudeHome
  $codexBefore = Get-Tree $codexHome
  $env:DVCC_CLAUDE_HOME_DIR = $claudeHome
  $env:DVCC_CODEX_HOME_DIR = $codexHome
  $appPid = Start-App "resume smoke start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered" }
  $before = Get-Tree $dataDir

  foreach ($locale in @("ja", "en")) {
    if ($locale -eq "en") {
      Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
      if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "the interface never switched to English" }
    }
    $L = $locale.ToUpperInvariant()

    # --- Project A: 4 eligible Codex rows, 1 archived, 1 Claude LIVE -----------------------------------
    Select-Review "rv-20260929-resa01"
    if ($locale -eq "ja") {
      # Discovery is app-wide runtime state: only before the very first Refresh is there no result at all.
      Check "$L/project-a : no copy action before the Human's first discovery refresh" (-not [bool](Invoke-Cdp "document.querySelector('[data-testid=action-copy-resume]') !== null")) "before first refresh"
    }
    Refresh-AndWait
    Assert-NoForbiddenContent "$L/project-a"
    $codexRows = Get-ResumeRows "CODEX"
    $claudeRows = Get-ResumeRows "CLAUDE_CODE"
    $eligible = @($codexRows | Where-Object { $_.state -eq "ELIGIBLE" })
    $archived = @($codexRows | Where-Object { $_.state -eq "ARCHIVED" })
    Check "$L/project-a : exactly the 4 non-archived MATCHED Codex rows are ELIGIBLE, with enabled buttons" (($eligible.Count -eq 4) -and (@($eligible | Where-Object { $_.ariaDisabled -eq "true" -or $_.disabled }).Count -eq 0)) ("states=" + (($codexRows | ForEach-Object { $_.state }) -join ","))
    Check "$L/project-a : the archived Codex row is disabled with a localized reason" (($archived.Count -eq 1) -and ($archived[0].ariaDisabled -eq "true") -and ($archived[0].reason.Length -gt 0)) ("archived=" + $archived.Count)
    Check "$L/project-a : the Claude LIVE MATCHED row is disabled as ALREADY_ACTIVE with a localized reason" ((@($claudeRows).Count -eq 1) -and ($claudeRows[0].state -eq "ALREADY_ACTIVE") -and ($claudeRows[0].ariaDisabled -eq "true") -and ($claudeRows[0].reason.Length -gt 0)) ("claude=" + (($claudeRows | ForEach-Object { $_.state }) -join ","))
    $notes = [int](Invoke-Cdp "['resume-note-copy-only','resume-note-run-from-workspace','resume-note-codex-may-be-open'].filter((id) => { const e = document.querySelector('[data-testid=ide-sessions-provider-CODEX] [data-testid=' + id + ']'); return e && e.textContent.trim().length > 0; }).length")
    Check "$L/project-a : the three UI-only notes are shown in the Codex section" ($notes -eq 3) "notes=$notes"
    $noteText = Invoke-Cdp "document.querySelector('[data-testid=resume-notes]')?.textContent ?? ''"
    Check "$L/project-a : the notes contain no path" (-not ($noteText -match '[A-Za-z]:\\|\\\\|\.codex|\.claude')) "len=$($noteText.Length)"
    $reasonsByLocale[$locale] = @($archived[0].reason, $claudeRows[0].reason)

    # Each eligible row copies exactly `codex resume <its FULL UUID>` although its label is abbreviated.
    $selector = '[data-testid=ide-sessions-provider-CODEX] [data-resume=ELIGIBLE] [data-testid=action-copy-resume]'
    for ($i = 0; $i -lt $eligible.Count; $i++) {
      $label = $eligible[$i].label
      $full = @(Resolve-Label $label)
      Check "$L/project-a row $i : the visible label is abbreviated (not the full UUID)" (($full.Count -eq 1) -and ($label -ne $full[0]) -and $label.Contains($ELL)) "label=$label"
      $copied = Invoke-RowCopy $selector $i
      $expected = if ($full.Count -eq 1) { "codex resume " + $full[0] } else { "<unresolvable label>" }
      Check "$L/project-a row $i : the intercepted clipboard text is exactly 'codex resume <FULL UUID>'" ($copied -ceq $expected) "copied=$copied"
      Check "$L/project-a row $i : one line, three tokens, no ellipsis/path/quote" (($null -ne $copied) -and ($copied -notmatch "[`r`n""'\\/:$ELL]") -and (@($copied -split ' ').Count -eq 3)) "ok"
    }

    # Pressing a disabled (archived) row's button copies nothing.
    $disabledSelector = '[data-testid=ide-sessions-provider-CODEX] [data-resume=ARCHIVED] [data-testid=action-copy-resume]'
    $count = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
    Invoke-Cdp ("document.querySelectorAll(" + (ConvertTo-Json $disabledSelector -Compress) + ")[0].click(); true") | Out-Null
    Start-Sleep -Milliseconds 800
    Check "$L/project-a : pressing a disabled row's button copies nothing" ([int](Invoke-Cdp 'window.__dvccClipboard.writes.length') -eq $count) "writes unchanged"

    $forbidden = @(Get-ForbiddenDescendants $appPid)
    Check "$L : no shell, terminal or provider process was spawned (nothing auto-runs)" ($forbidden.Count -eq 0) ("found=" + ($forbidden -join ","))

    # --- Project B: its Codex session is AMBIGUOUS (repository shared with Project D) ----------------------
    Select-Review "rv-20260929-resb01"
    Refresh-AndWait
    Assert-NoForbiddenContent "$L/project-b"
    $bRows = Get-ResumeRows "CODEX"
    Check "$L/project-b : the AMBIGUOUS Codex row is disabled with a localized NOT_MATCHED reason" ((@($bRows).Count -eq 1) -and ($bRows[0].state -eq "NOT_MATCHED") -and ($bRows[0].ariaDisabled -eq "true") -and ($bRows[0].reason.Length -gt 0)) ("states=" + (($bRows | ForEach-Object { $_.state }) -join ","))
    Check "$L/project-b : no eligible row, so no notes and no enabled copy action" (-not [bool](Invoke-Cdp "document.querySelector('[data-testid=resume-notes]') !== null || document.querySelector('[data-resume=ELIGIBLE]') !== null")) "none"
  }

  Check "JA/EN : refusal reasons are localized (JA text differs from EN)" (($reasonsByLocale["ja"][0] -ne $reasonsByLocale["en"][0]) -and ($reasonsByLocale["ja"][1] -ne $reasonsByLocale["en"][1])) "differs"

  $afterCopies = Get-Tree $dataDir
  Check "DVCC data files byte-identical after discovery and every copy (no persistence, no event)" (Same-Tree $before $afterCopies) ("files=" + $afterCopies.Count)
  Check "no events.jsonl was written" (@($afterCopies.Keys | Where-Object { $_ -like "*events.jsonl" }).Count -eq 0) "none"

  # --- Stale discovery: a binding-relevant Project edit leaves no copy action at all ---------------------
  Select-Review "rv-20260929-resa01"
  Refresh-AndWait
  Invoke-Cdp "document.querySelector('[data-testid=action-edit-project]').click(); true" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=project-repositoryUrl]') !== null" 10)) { throw "edit form did not open" }
  Invoke-Cdp "(() => { const i = document.querySelector('[data-testid=project-repositoryUrl]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(i, 'https://github.com/example-org/repo-renamed'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()" | Out-Null
  Invoke-Cdp "document.querySelector('[data-testid=project-submit]').click(); true" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=project-form]') === null" 10)) { throw "edit form did not close" }
  Start-Sleep -Milliseconds 400
  $staleShown = [bool](Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-stale]') !== null")
  $anyAction = [bool](Invoke-Cdp "document.querySelector('[data-testid=action-copy-resume]') !== null")
  Check "EN/stale : the stale discovery offers no Resume copy action" ($staleShown -and -not $anyAction) "stale=$staleShown action=$anyAction"

  Stop-App $appPid
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $script:started -contains $_.Id })
  Check "no spawned process is left running" ($left.Count -eq 0) ("alive=" + $left.Count)
  Check "the Claude Code fixture is byte-identical" (Same-Tree $claudeBefore (Get-Tree $claudeHome)) "unchanged"
  Check "the Codex fixture is byte-identical" (Same-Tree $codexBefore (Get-Tree $codexHome)) "unchanged"
}
finally {
  Remove-Item Env:\DVCC_CLAUDE_HOME_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue
  Stop-Started
}

Test-OperatorClipboard $clipboardAtStart
Write-Summary
if ($script:failures -gt 0) { exit 1 }
