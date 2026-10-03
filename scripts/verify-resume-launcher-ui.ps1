# Resume in Codex running-app smoke (Phase 4b-2b, LR-20261002-DVCC-010). SYNTHETIC ONLY.
#
# Runs the release build on a hidden isolated desktop with an isolated DVCC_DATA_DIR, synthetic
# Projects, a synthetic Codex state file (DVCC_CODEX_HOME_DIR) and a synthetic console executable
# named codex.exe, compiled here from src-tauri/test-fixtures/codex_launch_fixture.rs. The real
# Codex is never started. In JA and EN it drives: configure the executable (a .cmd shim is refused)
# -> Refresh IDE Sessions -> Resume in Codex -> confirmation -> acknowledgement -> confirm, and
# checks what the fixture recorded (argv, cwd, console, parent), the three cwd cases, that the
# dialog shows no full ID / path / executable, that nothing but the executable path is persisted,
# that no shell or terminal process appears, and the job / child-survival facts.

param(
  [string] $Exe = "",
  [int] $Port = 9342,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-launch-$runId"
$dataDir = Join-Path $root "data"
$codexHome = Join-Path $root "codex-home"
$claudeHome = Join-Path $root "claude-home"
$projectsRoot = Join-Path $root "projects"
$toolsDir = Join-Path $root "tools"
$desktopName = "dvcc-launch-$runId"

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

$utf8 = [System.Text.UTF8Encoding]::new($false)
$ELL = [string][char]0x2026

Add-Type -Namespace DvccLaunch -Name Job -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
[DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
'@
function Test-InJob([int] $processId) {
  $h = [DvccLaunch.Job]::OpenProcess(0x1000, $false, $processId) # PROCESS_QUERY_LIMITED_INFORMATION
  if ($h -eq [IntPtr]::Zero) { return "unknown" }
  try { $inJob = $false; if (-not [DvccLaunch.Job]::IsProcessInJob($h, [IntPtr]::Zero, [ref]$inJob)) { return "unknown" }; return [string]$inJob } finally { [void][DvccLaunch.Job]::CloseHandle($h) }
}

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

# --- synthetic fixture executable (never Codex) --------------------------------------------------
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
$fixtureExe = Join-Path $toolsDir "codex.exe"
& rustc --edition 2021 -O -o $fixtureExe (Join-Path $repo "src-tauri\test-fixtures\codex_launch_fixture.rs")
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $fixtureExe)) { throw "failed to build the synthetic launch fixture" }
Remove-Item -Path (Join-Path $toolsDir "*.pdb") -ErrorAction SilentlyContinue
$recordFile = Join-Path $toolsDir "launch-record.txt"
$shim = Join-Path $toolsDir "codex.cmd"
Write-Text $shim "@ECHO off`r`nECHO shim must never run`r`n"

# --- synthetic Projects / reviews ---------------------------------------------------------------
$rootA = Join-Path $projectsRoot "launch-a"      # case A: thread cwd == Project root
$rootC = Join-Path $projectsRoot "launch-c"      # case B: thread cwd is another real local folder
$elsewhereC = Join-Path $projectsRoot "elsewhere-c"
$rootM = Join-Path $projectsRoot "launch-m"      # case C: thread cwd is a Codex-managed mirror
foreach ($d in @($rootA, $rootC, $elsewhereC, $rootM)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
$T0 = "2026-10-02T00:00:00.000Z"
function Project([string] $id, [string] $name, $localRoot, $repositoryUrl) {
  return [ordered]@{ projectId = $id; displayName = $name; repositoryUrl = $repositoryUrl; localRoot = $localRoot; developmentIde = $null; nextAction = ""; notes = "Synthetic launch smoke project."; createdAt = $T0; updatedAt = $T0 }
}
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Write-Json (Join-Path $dataDir "projects.json") ([ordered]@{
  schemaVersion = 1
  projects = @(
    (Project "project-a" "Launch A" $rootA "https://github.com/example-org/launch-a"),
    (Project "project-c" "Launch C" $rootC "https://github.com/example-org/launch-c"),
    (Project "project-m" "Launch M" $rootM "https://github.com/example-org/launch-m")
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
Seed-Session "rv-20261002-lnch0a" "project-a"
Seed-Session "rv-20261002-lnch0c" "project-c"
Seed-Session "rv-20261002-lnch0m" "project-m"
# A settings file with only a locale (legacy shape): the executable is not configured yet.
Write-Text (Join-Path $dataDir "settings.json") "{`n  `"schemaVersion`": 1,`n  `"locale`": `"ja`"`n}`n"

# --- synthetic Codex state file (node:sqlite), never written by DVCC ------------------------------
$ID_A = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b"
$ID_C = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3fcccc"
$ID_M = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3fdddd"
$ALL_IDS = @($ID_A, $ID_C, $ID_M)
$PROMPT_SENTINEL = "LAUNCH_SMOKE_FIRST_USER_MESSAGE_MUST_NOT_APPEAR"
$PREVIEW_SENTINEL = "LAUNCH_SMOKE_PREVIEW_MUST_NOT_APPEAR"
New-Item -ItemType Directory -Path (Join-Path $codexHome ".codex") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $claudeHome ".claude") -Force | Out-Null
$esc = { param($p) $p -replace "\\", "\\\\" }
$mirror = "C:\Users\smoketest\.codex\project\Launch M"
$buildDb = @"
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("$(& $esc (Join-Path $codexHome '.codex\state_5.sqlite'))");
db.exec(``CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, git_origin_url TEXT,
  first_user_message TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT '')``);
const ins = db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?)");
ins.run("$ID_A", "$(& $esc $rootA)", 3000, 3000, "0.153.4", 0, "https://github.com/example-org/launch-a.git", "$PROMPT_SENTINEL", "$PREVIEW_SENTINEL");
ins.run("$ID_C", "$(& $esc $elsewhereC)", 2000, 2000, "0.153.4", 0, "https://github.com/example-org/launch-c.git", "$PROMPT_SENTINEL", "$PREVIEW_SENTINEL");
ins.run("$ID_M", "$(& $esc $mirror)", 1000, 1000, "0.153.4", 0, "https://github.com/example-org/launch-m.git", "$PROMPT_SENTINEL", "$PREVIEW_SENTINEL");
db.close();
"@
$buildDbFile = Join-Path $root "build-codex-db.cjs"
Write-Text $buildDbFile $buildDb
& node.exe $buildDbFile
if ($LASTEXITCODE -ne 0) { throw "failed to build the synthetic Codex state DB" }

# --- UI helpers ----------------------------------------------------------------------------------
$switchScript = @'
(() => {
  const select = document.querySelector('[data-testid=language-selector]');
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
  if (-not (Wait-For "document.querySelector('[data-testid=ide-sessions-provider-CODEX]') !== null" 15)) { throw "discovery never finished" }
  Start-Sleep -Milliseconds 300
}
function Set-Input([string] $testId, [string] $value) {
  $js = "(() => { const i = document.querySelector('[data-testid=$testId]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(i, " + (ConvertTo-Json $value -Compress) + "); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()"
  Invoke-Cdp $js | Out-Null
}
function Click([string] $testId) { Invoke-Cdp "(() => { const e = document.querySelector('[data-testid=$testId]'); if (!e) return false; e.click(); return true; })()" }
function Last-Toast { return (Invoke-Cdp "(() => { const all = document.querySelectorAll('[data-testid=toast]'); return all.length ? all[all.length - 1].textContent : ''; })()") }
function Launch-State { return (Invoke-Cdp "document.querySelector('[data-testid=ide-sessions-provider-CODEX] [data-testid=ide-session-launch]')?.dataset.launch ?? null") }
function Get-ForbiddenDescendants([int] $rootPid) {
  $all = @(Get-CimInstance Win32_Process)
  $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($rootPid)
  $changed = $true
  while ($changed) { $changed = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true } } }
  return @($all | Where-Object { $ids.Contains([int]$_.ProcessId) -and $_.ProcessId -ne $rootPid -and $_.Name -match '^(claude|cmd|powershell|pwsh|bash|wsl|windowsterminal|wt|node)(\.exe)?$' } | ForEach-Object { $_.Name })
}
function Read-Record {
  if (-not (Test-Path $recordFile)) { return $null }
  $text = [System.IO.File]::ReadAllText($recordFile)
  if (-not $text.EndsWith("end=1`n")) { return $null }
  $map = @{}; foreach ($line in $text -split "`n") { $kv = $line.Split("=", 2); if ($kv.Count -eq 2) { $map[$kv[0]] = $kv[1] } }
  return $map
}
function Wait-Record([int] $seconds = 15) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) { $r = Read-Record; if ($null -ne $r) { return $r }; Start-Sleep -Milliseconds 100 }
  return $null
}
function Assert-DialogClean([string] $L) {
  $text = Invoke-Cdp "document.querySelector('[data-testid=resume-launch-dialog]')?.textContent ?? ''"
  $leaks = @(@($ALL_IDS + $rootA + $rootC + $rootM + $mirror + $fixtureExe + "codex.exe" + "github.com" + ".codex" + $root) | Where-Object { $text.Contains($_) })
  Check "$L : the confirmation shows no full UUID, local path, executable path, repository or provider path" ($leaks.Count -eq 0) ("leaks=" + $leaks.Count)
  Check "$L : the confirmation shows the abbreviated session label" ($text.Contains($ELL)) "label"
}
# The JA wording is read from the dictionary itself (UTF-8), so this BOM-less script stays ASCII.
$jaSource = [System.IO.File]::ReadAllText((Join-Path $repo "src\i18n\ja.ts"), $utf8)
$jaStarted = [regex]::Match($jaSource, '"resume\.launch\.toast\.started": "([^"]+)"').Groups[1].Value
if ($jaStarted.Length -eq 0) { throw "could not read the JA started wording" }
function Canon([string] $p) { return (Get-Item -LiteralPath $p).FullName.TrimEnd("\").ToLowerInvariant() }

# Drives one full Human flow for the selected review and returns the fixture record (or $null).
function Invoke-LaunchFlow([string] $L, [bool] $expectWorkspaceWarning) {
  Remove-Item -LiteralPath $recordFile -ErrorAction SilentlyContinue
  Check "$L : Resume in Codex is ELIGIBLE" ((Launch-State) -eq "ELIGIBLE") ("state=" + (Launch-State))
  Click "action-launch-resume" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=resume-launch-dialog]') !== null" 10)) { Check "$L : the row button opens the confirmation" $false "no dialog"; return $null }
  Check "$L : the row button only opened the confirmation (no process yet)" (-not (Test-Path $recordFile)) "no record"
  Assert-DialogClean $L
  $workspace = [bool](Invoke-Cdp "document.querySelector('[data-testid=resume-launch-warning-workspace]') !== null")
  Check "$L : the workspace warning is shown exactly when expected ($expectWorkspaceWarning)" ($workspace -eq $expectWorkspaceWarning) "shown=$workspace"
  Check "$L : the already-open warning is shown" ([bool](Invoke-Cdp "document.querySelector('[data-testid=resume-launch-warning-already-open]')?.textContent.length > 0")) "shown"
  $disabled = [bool](Invoke-Cdp "document.querySelector('[data-testid=resume-launch-confirm]').disabled")
  Check "$L : confirm is disabled until the acknowledgement is checked" $disabled "disabled=$disabled"
  Click "resume-launch-confirm" | Out-Null
  Start-Sleep -Milliseconds 800
  Check "$L : pressing the disabled confirm starts nothing" (-not (Test-Path $recordFile)) "no record"
  Click "resume-launch-acknowledge" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=resume-launch-confirm]').disabled === false" 5)) { Check "$L : the acknowledgement enables confirm" $false "still disabled"; return $null }
  Click "resume-launch-confirm" | Out-Null
  $record = Wait-Record
  [void](Wait-For "document.querySelector('[data-testid=resume-launch-dialog]') === null" 5)
  return $record
}

$clipboardAtStart = Get-ClipboardFingerprint
Write-Output ("clipboard at start: " + $clipboardAtStart)
[DvccDesktop]::Create($desktopName)

try {
  $codexBefore = Get-Tree $codexHome
  $env:DVCC_CODEX_HOME_DIR = $codexHome
  $env:DVCC_CLAUDE_HOME_DIR = $claudeHome
  $appPid = Start-App "launch smoke start"
  if (-not (Wait-For "document.querySelector('[data-testid=queue-item]') !== null" 20)) { throw "the queue never rendered" }
  $before = Get-Tree $dataDir
  $inJob = Test-InJob $appPid
  Write-Output "RECORD job : DVCC IsProcessInJob=$inJob"

  # --- not configured -> disabled with reason --------------------------------------------------
  Select-Review "rv-20261002-lnch0a"
  Check "JA : no launch control before the Human's first discovery refresh" (-not [bool](Invoke-Cdp "document.querySelector('[data-testid=action-launch-resume]') !== null")) "none"
  Refresh-AndWait
  Check "JA : with no executable configured the launch is disabled (CODEX_EXECUTABLE_NOT_CONFIGURED)" ((Launch-State) -eq "CODEX_EXECUTABLE_NOT_CONFIGURED") ("state=" + (Launch-State))
  Check "JA : Copy Resume Command remains available independently" ([bool](Invoke-Cdp "document.querySelector('[data-testid=ide-session-resume][data-resume=ELIGIBLE]') !== null")) "copy eligible"

  # --- configuration surface: a .cmd shim is refused, the native exe is saved ---------------------
  Click "btn-codex-executable" | Out-Null
  if (-not (Wait-For "document.querySelector('[data-testid=codex-executable-dialog]') !== null" 10)) { throw "settings dialog did not open" }
  Check "JA settings : starts as Not configured" ((Invoke-Cdp "document.querySelector('[data-testid=codex-executable-status]').dataset.status") -eq "notConfigured") "status"
  $settingsBefore = [System.IO.File]::ReadAllText((Join-Path $dataDir "settings.json"))
  Set-Input "codex-executable-path" $shim
  Click "codex-executable-save" | Out-Null
  [void](Wait-For "document.querySelector('[data-testid=codex-executable-status]').dataset.status === 'invalid'" 10)
  Check "JA settings : a .cmd shim is refused (Invalid) and settings.json is untouched" (((Invoke-Cdp "document.querySelector('[data-testid=codex-executable-status]').dataset.status") -eq "invalid") -and ([System.IO.File]::ReadAllText((Join-Path $dataDir "settings.json")) -eq $settingsBefore)) "refused"
  Set-Input "codex-executable-path" $fixtureExe
  Click "codex-executable-save" | Out-Null
  [void](Wait-For "document.querySelector('[data-testid=codex-executable-status]').dataset.status === 'valid'" 10)
  Check "JA settings : the native console codex.exe is validated and saved (Configured / valid)" ((Invoke-Cdp "document.querySelector('[data-testid=codex-executable-status]').dataset.status") -eq "valid") "valid"
  $settings = [System.IO.File]::ReadAllText((Join-Path $dataDir "settings.json")) | ConvertFrom-Json
  $keys = @($settings.PSObject.Properties.Name | Sort-Object)
  Check "settings.json : exactly schemaVersion, locale (preserved) and codexExecutablePath" ((($keys -join ",") -eq "codexExecutablePath,locale,schemaVersion") -and ($settings.locale -eq "ja") -and ($settings.codexExecutablePath -eq $fixtureExe)) ("keys=" + ($keys -join ","))
  Invoke-Cdp "document.querySelector('[data-testid=codex-executable-dialog] .dialog-actions button').click(); true" | Out-Null
  [void](Wait-For "document.querySelector('[data-testid=codex-executable-dialog]') === null" 5)

  foreach ($locale in @("ja", "en")) {
    if ($locale -eq "en") {
      Invoke-Cdp ($switchScript -replace "__LOCALE__", "en") | Out-Null
      if (-not (Wait-For "document.documentElement.lang === 'en'" 15)) { throw "never switched to English" }
      Start-Sleep -Milliseconds 400
      $afterSwitch = [System.IO.File]::ReadAllText((Join-Path $dataDir "settings.json")) | ConvertFrom-Json
      Check "settings.json : the locale switch preserved codexExecutablePath" (($afterSwitch.locale -eq "en") -and ($afterSwitch.codexExecutablePath -eq $fixtureExe)) "locale=$($afterSwitch.locale)"
    }
    $L = $locale.ToUpperInvariant()

    # --- case A: thread cwd == Project root -> launch, no workspace warning ------------------------
    Select-Review "rv-20261002-lnch0a"
    Refresh-AndWait
    $record = Invoke-LaunchFlow "$L/A" $false
    Check "$L/A : the fixture was started" ($null -ne $record) "record"
    if ($null -ne $record) {
      Check "$L/A : argv is exactly [resume, FULL UUID]" (($record["argc"] -eq "2") -and ($record["arg1"] -ceq "resume") -and ($record["arg2"] -ceq $ID_A)) ("argc=" + $record["argc"])
      Check "$L/A : cwd is the canonical Project root" ($record["cwd"].TrimEnd("\").ToLowerInvariant() -eq (Canon $rootA)) "cwd"
      Check "$L/A : its own new console (stdout is a console, never a pipe into DVCC)" (($record["stdout_type"] -eq "char") -and ($record["console_process_count"] -eq "1")) ("stdout=" + $record["stdout_type"] + " consoleProcs=" + $record["console_process_count"])
      Check "$L/A : created directly by DVCC (no shell / terminal in between)" (($record["parent_pid"] -eq [string]$appPid) -and ($record["parent_image"] -ieq "devvault-control-center.exe")) ("parent=" + $record["parent_image"])
    }
    $toast = Last-Toast
    $startedText = if ($locale -eq "ja") { $jaStarted } else { "Codex process started. Confirm the resume result in Codex." }
    Check "$L/A : the toast says only that the process started" ($toast.Contains($startedText)) "toast"
    $forbidden = @(Get-ForbiddenDescendants $appPid)
    Check "$L : no cmd / PowerShell / pwsh / bash / wt / node process descends from DVCC" ($forbidden.Count -eq 0) ("found=" + ($forbidden -join ","))

    # --- case B: an authoritative, different local workspace -> CWD_MISMATCH, no process -----------
    Select-Review "rv-20261002-lnch0c"
    Refresh-AndWait
    Remove-Item -LiteralPath $recordFile -ErrorAction SilentlyContinue
    Click "action-launch-resume" | Out-Null
    Start-Sleep -Milliseconds 1200
    $noDialog = -not [bool](Invoke-Cdp "document.querySelector('[data-testid=resume-launch-dialog]') !== null")
    Check "$L/B : a clearly different thread workspace is refused before any confirmation (CWD_MISMATCH)" ($noDialog -and -not (Test-Path $recordFile)) ("dialog=" + (-not $noDialog))
    Check "$L/B : the refusal is explained without a path" ((Last-Toast) -notmatch [regex]::Escape($elsewhereC)) "no path"

    # --- case C: Codex-managed mirror -> allowed from the Project root, with the workspace warning --
    Select-Review "rv-20261002-lnch0m"
    Refresh-AndWait
    $recordM = Invoke-LaunchFlow "$L/C" $true
    Check "$L/C : the fixture was started from the Project root (never the mirror)" (($null -ne $recordM) -and ($recordM["cwd"].TrimEnd("\").ToLowerInvariant() -eq (Canon $rootM)) -and ($recordM["arg2"] -ceq $ID_M)) "cwd"
  }

  # --- stale at confirmation: a binding-relevant edit between the two steps refuses ------------------
  Select-Review "rv-20261002-lnch0a"
  Refresh-AndWait
  Remove-Item -LiteralPath $recordFile -ErrorAction SilentlyContinue
  Click "action-launch-resume" | Out-Null
  [void](Wait-For "document.querySelector('[data-testid=resume-launch-dialog]') !== null" 10)
  # The Codex state changes underneath (the thread is archived by "Codex") while the dialog is open.
  $archiveJs = Join-Path $root "archive.cjs"
  Write-Text $archiveJs "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(`"$(& $esc (Join-Path $codexHome '.codex\state_5.sqlite'))`"); db.prepare('UPDATE threads SET archived = 1 WHERE id = ?').run('$ID_A'); db.close();"
  & node.exe $archiveJs
  Click "resume-launch-acknowledge" | Out-Null
  Click "resume-launch-confirm" | Out-Null
  Start-Sleep -Milliseconds 1500
  Check "EN/stale : archived between preview and confirm -> the native recheck refuses (ARCHIVED), no process" (-not (Test-Path $recordFile)) ("toast=" + ((Last-Toast) -replace '\s+', ' '))
  & node.exe -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); db.prepare('UPDATE threads SET archived = 0 WHERE id = ?').run(process.argv[2]); db.close();" (Join-Path $codexHome '.codex\state_5.sqlite') $ID_A
  $codexBefore = Get-Tree $codexHome # the fixture change above was the smoke's own, not DVCC's

  # --- child survival: the child keeps running after DVCC is killed -------------------------------
  Refresh-AndWait
  Write-Text (Join-Path $toolsDir "linger-ms.txt") "3000"
  Remove-Item -LiteralPath (Join-Path $toolsDir "survived.txt") -ErrorAction SilentlyContinue
  $recordS = Invoke-LaunchFlow "EN/survival" $false
  Stop-App $appPid
  $deadline = (Get-Date).AddSeconds(10)
  while (-not (Test-Path (Join-Path $toolsDir "survived.txt")) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
  $survived = Test-Path (Join-Path $toolsDir "survived.txt")
  Write-Output "RECORD survival : child outlived the terminated DVCC = $survived"
  Check "the launched child survives DVCC termination (fire-and-forget; no kill-on-close job)" (($null -ne $recordS) -and $survived) "survived=$survived"
  Remove-Item -LiteralPath (Join-Path $toolsDir "linger-ms.txt") -ErrorAction SilentlyContinue

  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $script:started -contains $_.Id })
  Check "no app process is left running" ($left.Count -eq 0) ("alive=" + $left.Count)
  $after = Get-Tree $dataDir
  Check "DVCC data byte-identical apart from settings.json (no event, no launch history, no Project/Review change)" (Same-Tree $before $after) ("files=" + $after.Count)
  Check "no events.jsonl was written" (@($after.Keys | Where-Object { $_ -like "*events.jsonl" }).Count -eq 0) "none"
  Check "this synthetic Codex fixture is byte-identical apart from the smoke's own archive toggle" (Same-Tree $codexBefore (Get-Tree $codexHome)) "unchanged"
}
finally {
  Remove-Item Env:\DVCC_CLAUDE_HOME_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\DVCC_CODEX_HOME_DIR -ErrorAction SilentlyContinue
  Stop-Started
}

Test-OperatorClipboard $clipboardAtStart
Write-Summary
if ($script:failures -gt 0) { exit 1 }
