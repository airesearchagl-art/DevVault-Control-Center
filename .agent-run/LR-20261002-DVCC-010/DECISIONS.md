# Decisions — LR-20261002-DVCC-010

Implementation-owned decisions made by the Orchestrator inside the approved scope.

- **D-01 Native surface = 3 dedicated commands, 1 of which launches.**
  `validate_codex_executable_path(path)` (configuration surface; runs nothing),
  `preflight_codex_resume(executablePath, sessionId, projectRoot)` (confirmation-time recheck; runs
  nothing; tells the dialog whether to show the workspace warning) and
  `launch_codex_resume(executablePath, sessionId, projectRoot, workspaceWarningAcknowledged)`.
  None accepts a program name, argument list, command string, flag or environment value. The
  launch re-runs every check of the preflight; it refuses (STALE_DISCOVERY) if the workspace
  warning is now required but was not shown/acknowledged.
- **D-02 Shared path boundary.** `launcher::validate_project_folder` was refactored into
  `validate_local_entry(raw, Directory|File)` with identical checks in identical order (form, drive
  type, link targets read without following, metadata, canonicalize, local final target); only the
  final entry-type test differs. All pre-existing launcher tests pass unchanged. The executable uses
  the `File` variant — no second, weaker policy.
- **D-03 Executable trust order.** Configured name first (no FS access): extensionless or
  `.cmd/.bat/.ps1/.com/.js/.vbs/.wsf` → `UNSUPPORTED_CODEX_LAUNCHER`; any other name than
  `codex.exe` (case-insensitive) → `CODEX_EXECUTABLE_UNTRUSTED`. Then the shared local boundary,
  then the canonical target's name must also be `codex.exe`, then the PE optional-header
  `Subsystem` must be 3 (CUI). No process is run to validate; no `--version`.
- **D-04 Native session recheck.** `codex_reader::lookup_thread_for_launch`: same `open_read_only`
  boundary, schema gate on `id`/`cwd`/`archived`, fixed SQL `SELECT id, cwd, archived FROM threads
  WHERE id = ?1 LIMIT 2` with a bound parameter, bounded text, interrupt after `QUERY_TIMEOUT`. A
  missing/unopenable state file is a new code `PROVIDER_UNAVAILABLE` (the taxonomy is "at minimum").
- **D-05 cwd policy (HD-4B2B-07).** Managed mirror (`.codex\project\`) → allowed with warning. A
  verbatim `\\?\X:\` prefix is treated as the same drive path. Otherwise the thread cwd goes through
  `validate_project_folder`: canonical equal (case-insensitive, trailing separators ignored) →
  exact; canonical different → `CWD_MISMATCH` (blocked); cannot be canonicalized safely (missing,
  UNC, device…) → allowed with warning. The thread cwd is never used as the working directory.
- **D-06 Console boundary (§17).** Rust `Command` + `CREATE_NEW_CONSOLE` with default (inherit)
  stdio was confirmed sufficient: with DVCC's std handles null (release GUI), Rust (≥ 1.67) does not
  set `STARTF_USESTDHANDLES`, so the child receives its new console's own handles. No
  `CreateProcessW` / `STARTUPINFO` FFI was added. The only new FFI is `GetStdHandle` (read-only) to
  fail closed with `INTERACTIVE_CONSOLE_UNAVAILABLE` when DVCC holds any usable std handle (e.g. the
  debug console build, or redirected streams).
- **D-07 Test authority (§24).** No new runtime override exists. The executable is the
  Human-configured input itself, so tests use a synthetic console PE named `codex.exe` that passes
  the same validation; the state file uses the pre-existing `DVCC_CODEX_HOME_DIR` override. The
  fixture source (`src-tauri/test-fixtures/codex_launch_fixture.rs`) is not a Cargo target: tests
  and the smoke compile it with `rustc` into a temp folder. Native spawn tests temporarily clear the
  test process's std handles (serialized by a mutex) to reproduce the release GUI state.
- **D-08 Settings.** `schemaVersion` stays 1; `codexExecutablePath` is optional and written only
  when configured (a cleared setting returns the file to the legacy shape). A non-string,
  non-null value makes the file invalid → never overwritten. One write queue and one precondition
  chain serve both the locale and the path; each write carries the other value as last stored.
- **D-09 UI.** "Resume in Codex" appears only on Codex rows (no Claude launcher). The row button
  calls `requestResumeLaunch` (re-evaluate + preflight → dialog data only). The dialog's confirm
  calls `confirmResumeLaunch`, which requires the acknowledgement, re-looks-up the session by full
  ID in the current discovery state, re-evaluates against the current Project/stale/executable, and
  then calls the native launch. The dialog closes after any attempt; outcome is a toast.
  Native error messages are never shown (they may name a path); only the localized code text is.
- **D-10 Tauri per-window restriction (§21) — recorded for review, not done.** Tauri 2 app
  commands are allowed for the app's windows unless the app declares an `AppManifest`; declaring one
  would require explicit permissions for every existing command (an unrelated architectural
  change). DVCC has exactly one window (`main`). Capabilities are unchanged; no plugin permission was
  added.
- **D-11 Copy-only note wording.** `resume.note.copyOnly` now says the *copy action* only copies
  and does not run Codex (true; a separate, confirmed action can now launch).
