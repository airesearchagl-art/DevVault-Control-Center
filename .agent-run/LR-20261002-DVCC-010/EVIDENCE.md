# Evidence — LR-20261002-DVCC-010 (Phase 4b-2b, Resume in Codex)

No real path, real session ID, executable absolute path or provider content appears here. Real
Codex was NOT launched in this run (AC4B2B-28).

## Ordering (AC4B2B-01/02)

1. Fresh Gate PASS (HEAD = origin/main = `a54a77e1…`, clean, PR #9 MERGED, no open PR, branch absent).
2. `TASK_PACKET_SNAPSHOT.md` written verbatim and hashed
   (`8508539d22b6a271b75bfdee075ba8cc10804745f16f2e8179d72e86776327c0`) on `main`, with no other
   change in the working tree.
3. Only then: branch `feat/session-resume-launcher-v0.4b2b` created at `a54a77e1…`, artifacts
   skeleton, first implementation edit.

## Verification

```
npm.cmd run typecheck  -> clean
npm.cmd test           -> 40 files, 1093 passed
cargo test --lib       -> 105 passed, 0 failed, 2 ignored (13 new in codex_launcher)
cargo check            -> clean, no warnings
git diff --check       -> clean
release build          -> npm run tauri build -- --no-bundle (exit 0)
```

Authority / dependency delta: `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`,
`capabilities/*`, `tauri.conf.json`, `build.rs`, `docs/data-contract-v1.md`, `src/domain/schema.ts`
— unchanged. No shell plugin, `shell:allow-*`, generic spawn or argument-list command was added
(0 added references). New invoke-handler entries: `validate_codex_executable_path`,
`preflight_codex_resume`, `launch_codex_resume`. New FFI: `GetStdHandle` (read-only) only.

## Native tests (`src-tauri/src/codex_launcher.rs`)

| Test | Proves |
|---|---|
| accepts_only_the_strict_lowercase_uuid_contract | uppercase, padded, newline, v0, bad variant, name, `--last`, `;calc` rejected |
| reads_the_pe_subsystem_and_rejects_non_pe_input | PE32/PE32+ subsystem read; script text, empty, bad magic, far `e_lfanew` → not PE |
| accepts_a_local_console_pe_named_codex_exe_case_insensitively | `Codex.EXE` console PE accepted |
| rejects_shims_scripts_and_extensionless_launchers | `.cmd .ps1 .bat .com`, extensionless, `CODEX.CMD` → UNSUPPORTED_CODEX_LAUNCHER |
| rejects_untrusted_executables | wrong basename, GUI PE, non-PE, directory, missing, UNC, verbatim, device, relative → UNTRUSTED; blank → NOT_CONFIGURED |
| rejects_a_codex_exe_behind_a_link_to_a_network_location | link to UNC rejected without following |
| classifies_the_thread_workspace | exact (case, verbatim), mismatch, mirror, missing, UNC |
| the_plan_is_exactly_resume_and_the_full_id_… | args `["resume", FULL UUID]`, program = canonical exe, cwd = canonical root, `CREATE_NEW_CONSOLE`, root never in args |
| native_rechecks_fail_closed | INVALID_SESSION_ID, SESSION_NOT_FOUND, ARCHIVED, NO_LOCAL_ROOT, UNSAFE_PROJECT_ROOT (UNC/relative/missing), NOT_CONFIGURED, UNSUPPORTED (.cmd), PROVIDER_UNAVAILABLE |
| cwd_policy_blocks_a_clear_mismatch_and_warns_for_a_mirror | CWD_MISMATCH blocked; mirror → warning, cwd = Project root |
| a_warning_launch_without_acknowledgement_or_with_inherited_handles_is_refused_before_spawning | unacknowledged warning refused; inherited std handles → INTERACTIVE_CONSOLE_UNAVAILABLE |
| the_launch_lookup_reads_only_id_cwd_and_archived | fixed bound SQL; no content column, no `SELECT *`, no formatted SQL |
| spawns_the_validated_executable_directly_… | real spawn of the synthetic fixture: argc 2, `resume`, FULL UUID, cwd = canonical root, stdout = console char device, console shared by 1 process, parent = the test process itself (no shell) |

## Frontend tests

- `src/services/settings.test.ts` (+10): legacy locale-only file; locale + path; null/empty =
  not configured; non-string path → invalid and untouched; unreadable untouched; path save keeps
  locale; locale save keeps path; interleaved writes both survive; conflict fails closed and stops
  writes; no Project/review/event file touched. Synthetic paths only.
- `src/app/launchCodexResumeAction.test.ts` (21): eligibility (every 4b-2a condition + root +
  executable); click step never launches; 7 click-time refusals with no native call; preflight
  refusal opens nothing and shows no native message; confirm launches once with exact args;
  started wording; no acknowledgement → no launch; 6 confirm-time re-evaluation refusals;
  vanished/different session refused; every native code → localized text (JA+EN), unknown →
  PROCESS_LAUNCH_FAILED, no path in toasts.
- `src/features/reviews/ResumeLaunch.test.ts` (24): eligible row gets the button and copy stays;
  disabled reasons (archived, invalid ID, no root, not configured) JA+EN; stale renders no control;
  Claude rows have no launch button; 4b-2a card unchanged without wiring; dialog shows provider /
  Project / label / action and no full ID / root / exe / repository / provider path; checkbox
  unchecked + confirm disabled; workspace warning conditional; Task Packet wording; settings dialog.
- `src/test/docsContract.test.ts`: PR #9 + SHA, 4b-2b under development and not merged, only 4b-2b
  is "under development", Resume in Codex boundary sentences present, no "resumed successfully".

## Mutation campaign (§27)

Driver in the session scratchpad (not committed). Each: apply → targeted tests → restore → SHA-256.

| Probe | Mutation | Killed by | Restored |
|---|---|---|---|
| M-P4B2B-01 | native UUID check bypassed | native_rechecks_fail_closed | yes |
| M-P4B2B-02 | `cmd /C "<exe> resume <id>"` | spawns_the_validated_executable_directly_… (parent ≠ DVCC) | yes |
| M-P4B2B-03 | `.cmd` removed from refused list | rejects_shims_…, native_rechecks_fail_closed | yes |
| M-P4B2B-04 | `creation_flags: 0` | the_plan_is_exactly_…, spawns_… (console shared) | yes |
| M-P4B2B-05 | `current_dir` omitted | spawns_… (cwd) | yes |
| M-P4B2B-06 | archived recheck skipped | native_rechecks_fail_closed | yes |
| M-P4B2B-07 | session-exists recheck skipped | native_rechecks_fail_closed | yes |
| M-P4B2B-08 | Project folder revalidation skipped | native_rechecks_fail_closed | yes |
| M-P4B2B-09 | stale ignored at confirmation | 1 TS test | yes |
| M-P4B2B-10 | launch at click (confirmation bypassed) | 1 TS test | yes |
| M-P4B2B-11a | acknowledgement check removed (action) | 1 TS test | yes |
| M-P4B2B-11b | acknowledgement gate removed (dialog) | 2 TS tests | yes |
| M-P4B2B-12 | stdout/stderr piped into DVCC | spawns_… (stdout = pipe) | yes |
| M-P4B2B-13 | authoritative cwd mismatch permitted | classifies_…, cwd_policy_… | yes |

All killed by test failures (none by compile error). Note: M-02's run started the synthetic fixture
through `cmd.exe` once — synthetic only, that was the mutation under test.

## Running-app smoke (§28/§29) — SYNTHETIC ONLY

`scripts/verify-resume-launcher-ui.ps1` against the fresh release build, hidden desktop, isolated
`DVCC_DATA_DIR`, synthetic Projects / Codex DB / settings, fixture `codex.exe` compiled from
`test-fixtures`: **75 passed, 0 failed, 0 inconclusive.**

- Before configuration: launch disabled `CODEX_EXECUTABLE_NOT_CONFIGURED`; Copy stays ELIGIBLE.
- Configuration: starts "Not configured"; a `.cmd` shim → Invalid and `settings.json` untouched;
  the fixture `codex.exe` → Configured / valid; `settings.json` keys exactly
  `codexExecutablePath, locale, schemaVersion`; the EN switch preserved the path.
- JA + EN, case A (thread cwd = root): row button opens only the dialog; dialog has no full UUID /
  path / exe / repository / provider path and shows the abbreviated label; no workspace warning;
  confirm disabled until the checkbox; pressing disabled confirm starts nothing; after
  acknowledgement + confirm the fixture recorded argv `[resume, FULL UUID]`, cwd = canonical root,
  stdout `char`, console process count 1, **parent = devvault-control-center.exe (DVCC pid)**;
  toast = "process started" wording.
- Case B (thread cwd = another real local folder): refused before any dialog (CWD_MISMATCH),
  no process, no path in the toast.
- Case C (managed mirror): dialog shows "Codex may ask which workspace to use."; fixture cwd =
  Project root (never the mirror).
- Process lineage: no `cmd / powershell / pwsh / bash / wsl / wt / WindowsTerminal / node / claude`
  descendant of DVCC at any point.
- Confirm-time native recheck: thread archived between preview and confirm → ARCHIVED toast, no
  process.
- Job / lifetime: **DVCC `IsProcessInJob` = False**; a lingering fixture **survived DVCC
  termination** (fire-and-forget confirmed).
- DVCC data (excluding settings.json) byte-identical; no `events.jsonl`; synthetic Codex DB
  unchanged apart from the smoke's own archive toggle; operator clipboard untouched.

Regression smokes on the same build: session discovery 220/220 (its "no other control" check now
also admits the confirmation-gated `action-launch-resume`), resume handoff 63/63, localization
27/27, IDE handoff 38/38, review workflow 113/113. Not re-run (untouched areas):
`verify-clipboard-interceptor.ps1`, `verify-single-instance.ps1`.

## Hard checks (§34)

Security PASS (no shell, no generic launcher, strict validation both sides, shims refused) ·
Privacy PASS (no provider output captured; only `id`/`cwd`/`archived` read; no path / full ID /
exe in dialog, toast, evidence) · Auth PASS (no credential involved) · Permission PASS (no
capability / plugin change; dedicated commands only) · Data integrity PASS (settings compat + fail
closed; no Project/Review/event write) · Irreversible-data safety PASS (provider DB read-only; no
unarchive; real Codex never launched).

## Unverified items

- Real `codex.exe` was not launched (gate below). Its interactive TUI in a `CREATE_NEW_CONSOLE`
  console, Windows Terminal hand-off behavior, and Codex's own workspace prompt are not observed.
- Mapped network drive rejection for the executable is covered by the shared boundary's existing
  ignored test only (needs a temporary mapping).
- Behavior when Codex Desktop holds the same thread open is unknown (warning + acknowledgement only).

REAL_CODEX_LAUNCH_DOGFOOD_GATE: **PENDING**
