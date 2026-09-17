# Evidence — LR-20260917-DVCC-001

Paths outside the repository are shown as placeholders (`<LOCAL_ROOT>`, `<SCRATCHPAD>`) because the repository is public.

## Preflight — 2026-09-17T13:27Z

| Item | Evidence | Result |
|---|---|---|
| Project root | `git rev-parse --show-toplevel` → `<LOCAL_ROOT>` (matches Human-provided local root) | PASS |
| Repository / origin | `git remote get-url origin` (fetch and push) → `https://github.com/airesearchagl-art/DevVault-Control-Center.git` | PASS |
| Visibility | `gh repo view --json visibility` → `PUBLIC`, default branch `main`, not empty | recorded |
| Base SHA | `git fetch origin`; `git rev-parse origin/main` → `bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d` | PASS |
| Current branch | `git branch --show-current` → `feat/review-hub-v0.1` (upstream origin/main, expected initial state) | PASS |
| Current HEAD | `git rev-parse HEAD` → `bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d`; `git rev-list --count origin/main..HEAD` → `0` | PASS |
| Working tree | `git status --porcelain=v1 --untracked-files=all` → no entries; `git stash list` → empty | PASS (clean) |
| Remote feature branch | `git ls-remote --heads origin feat/review-hub-v0.1` → none (new branch) | recorded |
| Push availability | `git push --dry-run origin feat/review-hub-v0.1` → `* [new branch] feat/review-hub-v0.1 -> feat/review-hub-v0.1`; `gh auth status` → logged in as airesearchagl-art, scopes gist, read:org, repo | PASS |
| Project Instruction | obsidian-vault main `01_Projects/DevVault-Control-Center/05_LLM_IDE_Instructions.md` blob 35aaa20; repository has only `README.md` (no CLAUDE.md / AGENTS.md) | PASS |
| Empty Repository Bootstrap Gate | origin/main has commit bbffea1 | not-applicable |
| Node / npm | `node -v` → v24.15.0; `npm -v` → 11.12.1 | PASS |
| Rust / Cargo | `cargo -V` → 1.95.0; `rustc -V` → 1.95.0; toolchain stable-x86_64-pc-windows-msvc | PASS |
| WebView2 | registry EdgeUpdate client pv → 153.0.4234.32 | PASS |
| Test commands | none pre-existing (repository contains only README.md); defined in Wave 1 | recorded |
| Network boundary | npm registry + crates.io (dependency install), GitHub (push / Draft PR / read-only Vault route files). No other services. | recorded |
| Permission boundary | shell not elevated (`IsInRole(Administrator)` → False); app must run as normal user | PASS |
| Existing failures | none (no code) | recorded |
| Pre-existing changes | none | recorded |
| Real runtime data dirs | `%APPDATA%\DevVault-Control` exists → False; `%APPDATA%\DevVault-Control-dev` exists → False | recorded (must remain untouched by dev / smoke runs) |
| Line endings | system `core.autocrlf=true` → `.gitattributes` added (L-001) | recorded |

## Task Packet initialization — 2026-09-17T13:3xZ

- Snapshot: `.agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md`, 21438 bytes, 0 CR bytes.
- SHA-256: `4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b`.
- Init commit `dd6a82f`; first push `git push -u origin feat/review-hub-v0.1` → new remote branch, upstream `origin/feat/review-hub-v0.1`.

## Wave 1 checkpoint — 2026-09-17

| Check | Command | Result |
|---|---|---|
| npm install | `npm install @tauri-apps/plugin-clipboard-manager@^2`; `npm install -D vitest @types/node` | PASS — 0 vulnerabilities |
| TypeScript | `npx tsc --noEmit` | PASS (first run found 1 type error in `schema.ts` event parsing → fixed) |
| Vitest | `npx vitest run` | PASS — 7 files, 216 tests (first run: 2 failures → `suggestProjectId` combining-mark defect fixed in code; duplicate no-op `setResource` in a test fixed) |
| Vite build | `npm run build` (`tsc --noEmit && vite build`) | PASS |
| cargo check | `cargo check` (src-tauri) | PASS — no warnings |
| cargo test | `cargo test` (src-tauri) | PASS — 22 tests (storage 16, launcher 4 + data-root) |
| Hygiene grep | ripgrep over working tree excluding build dirs for user profile paths, username, tokens, real thread URLs | PASS — only synthetic `example-*` URLs, intentional detector samples in `fixtureHygiene.test.ts`, and the public repository owner name in run artifacts |
| Ignore rules | `git check-ignore -v node_modules dist src-tauri/target src-tauri/gen/schemas` | PASS — all ignored |
| Real data dirs | `Test-Path %APPDATA%\DevVault-Control`, `...-dev` | False / False (untouched) |
| OS data dir source | tauri-2.11.5 `src/path/desktop.rs:74-76` | `data_dir()` → `dirs::data_dir()` → Windows `{FOLDERID_RoamingAppData}` |

Key test evidence:

- `src-tauri/src/storage.rs` tests: atomic write + `.bak`, invalid JSON refused, corrupt primary never overwritten, events append-only with partial-line repair, quarantine preserves content, target confinement (`..`, separators, bad ids / file names), restart round trip from disk.
- `src-tauri/src/launcher.rs` tests: https + host allowlist via URL parsing (rejects `javascript:`, `file:`, `http:`, `https://github.com@evil.example/`, credentials, ports, look-alike hosts); folder validation (rejects UNC, verbatim / device, drive-relative, relative, file, missing).
- `src/domain/transitions.test.ts`: full guard table (14 actions × 8 states), lifecycle, D2 suspend / resume for WARM and COLD, AC-14 confirmations, resource independence across all states.
- `src/services/persistence.test.ts`: restart round trip, AC-09 service-level scenario, per-round artifacts, backup restore, UNREADABLE write refusal, set-aside flow, future version read-only, per-review isolation, INVALID_UTF8 vs I/O error, write failure atomicity, event append warning.

Wave 1 checkpoint commit: `fd733e1` (pushed); Task Packet digest re-verified: match.

## Wave 2 checkpoint — 2026-09-17

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS |
| Vitest | `npx vitest run` | PASS — 8 files, 222 tests (adds `src/app/appState.test.ts`) |
| Vite build | `npm run build` | PASS |
| cargo check | `cargo check` (src-tauri) | PASS — no warnings |
| tauri dev launch | `npm run tauri dev` with `DVCC_DATA_DIR=<SCRATCHPAD>/dvcc-dev-data`, WebView2 debug port 9333 | PASS — process `devvault-control-center` with window title "DevVault Control Center"; CDP launch check: document title, no fatal error, data dir shown with `DVCC_DATA_DIR` + `debug build` tags, empty state rendered (screenshot reviewed) |
| Dev-build UI pre-check (phase 1 flow) | `node <SCRATCHPAD>/smoke/e2e-phase1.mjs 9333 …` against the dev window | PASS — 2 projects, 2 reviews, WARM independent of NEW/READY, copy prompt (clipboard content verified with `Get-Clipboard`), REVIEWING, capture without state change, verdict submit disabled until selection + acknowledgement, FIX_REQUIRED with WARM, reviewed HEAD normalized, next action saved, Suspend WARM + checkpoint; runtime launcher / storage rejections: `javascript:`, `file:`, `http:`, `https://github.com@evil.example/`, non-allowlisted host → URL_REJECTED; UNC / relative → FOLDER_REJECTED; file path → NOT_A_DIRECTORY; `..` review id / traversal file → INVALID_TARGET |
| Persisted files (dev pre-check) | directory listing + `ConvertFrom-Json` | `projects.json` + `.bak`; `reviews/<alpha>/{session.json, session.json.bak, checkpoint.md, request-r1.md, result-r1.md, events.jsonl}`; events: review_created, resource_changed, review_ready, request_saved, review_started, result_captured, verdict_confirmed, next_action_updated, suspended; session SUSPENDED from FIX_REQUIRED, WARM, PR 45, R1 verdict FIX_REQUIRED; no `*.tmp` |
| Real data dirs | `Test-Path %APPDATA%\DevVault-Control[-dev]` | False / False |

Defects found and fixed in Wave 2: grid layout when banners are empty (footer absorbed free space); toast auto-dismiss timers reset on every new toast (moved to per-toast effect); CDP harness DOM serialization (scratch script only).

Wave 2 checkpoint commit: `bec4a7b` (pushed); Task Packet digest re-verified: match.

## Wave 3 checkpoint — 2026-09-17 (release build, Windows smoke, E2E)

All app runs below use the **release** exe `src-tauri/target/release/devvault-control-center.exe` with
`DVCC_DATA_DIR=<SCRATCHPAD>/e2e-release-data` and WebView2 debug port 9334 (smoke only). The app is
closed with `CloseMainWindow()` (graceful) between phases; "restart" = a new process.

| Check | Evidence | Result |
|---|---|---|
| Release no-bundle build | `npm run tauri build -- --no-bundle` → "Built application at: src-tauri/target/release/devvault-control-center.exe" (4,707,840 bytes); `src-tauri/target/release/bundle` absent | PASS |
| Execution level | Embedded manifest contains only the Common-Controls 6.0 dependency; no `trustInfo` / `requestedExecutionLevel` / `requireAdministrator` → default asInvoker | PASS |
| Windows launch smoke | `Start-Process` → process responding with window title "DevVault Control Center"; closes gracefully | PASS (every phase) |
| E2E phase 1 (fresh data) | `e2e-phase1.mjs … --open`: 2 projects (form rejects `http://` repository URL), 2 reviews, WARM independent of NEW / READY, copy prompt, REVIEWING, capture keeps REVIEWING, verdict requires selection + acknowledgement, FIX_REQUIRED + WARM, reviewed HEAD normalized, next action saved, Suspend WARM + checkpoint; runtime rejections (javascript:, file:, http:, userinfo host, non-allowlisted host, UNC, relative, file path, storage traversal) | PASS (first attempt failed on a smoke-script race — clicked while the UI was busy saving; script fixed to wait for the save toast; app unchanged) |
| Real launcher opens | "Open project folder" → Explorer window for the project folder observed via `Shell.Application.Windows()` (then closed); "Open GitHub" on a project whose repository is this public repository → no error; `open_external_url https://chatgpt.com/` → OK | PASS |
| Clipboard write | `Get-Clipboard` after "Copy review prompt" → "# Independent Review Request — Project Alpha / R1 …" | PASS |
| Persisted files after close | `projects.json` + `.bak`; `reviews/<alpha>/{session.json, session.json.bak, checkpoint.md, request-r1.md, result-r1.md, events.jsonl}`; `reviews/<beta>/{session.json, events.jsonl}`; 0 `*.tmp`; session SUSPENDED / suspendedFrom FIX_REQUIRED / WARM / PR 45 / R1 expected = reviewed HEAD / verdict FIX_REQUIRED / thread title + URL / next action; UTF-8 content verified (`result-r1.md` contains 総評) | PASS |
| E2E phase 2 (restart) | `e2e-phase2.mjs`: queue restored (alpha SUSPENDED / WARM, beta NEW / COLD), every metadata field, checkpoint and previous result restored; Resume → FIX_REQUIRED + HOT, suspendedFrom cleared, `resumed` event; Edit Project (ID read-only) saved. On disk after close: FIX_REQUIRED / HOT; events … suspended, resumed | PASS |
| App-level recovery: restored | Corrupt `projects.json` (valid `.bak`) + corrupt beta `session.json` (no `.bak`) → notice "restored from its backup … kept as projects.json.corrupt-<ms>", both projects restored, beta row unreadable (read-only detail), alpha FIX_REQUIRED / HOT unaffected. Disk: `projects.json` == previous `.bak`; corrupt copy byte-identical to the injected content; beta `session.json` unchanged; no beta corrupt copy | PASS |
| App-level: unsupported version | `schemaVersion: 2` → error banner "newer DVCC version … schemaVersion 2", + Project disabled, no set-aside offered. Disk: file and `.bak` unchanged | PASS |
| App-level: unreadable without backup | garbage `projects.json`, `.bak` removed → error banner, + Project disabled, reviews still listed; Human "Set aside and start empty" → confirm dialog → file renamed to `projects.json.corrupt-<ms>` (content preserved), empty list, + Project enabled | PASS |
| App-level: invalid data dir | `DVCC_DATA_DIR=relative\dvcc-data` → fatal screen "DVCC_DATA_DIR must be an absolute path (DATA_DIR_UNAVAILABLE)"; no relative folder created | PASS |
| Scope / boundary grep | tracked `src`, `src-tauri/src`, manifests, capability: no fetch / WebSocket / XHR, no process spawn, no GitHub API client, no OpenAI / Anthropic SDK, no SQLite / REST / MCP, no clipboard read, no opener capability, no admin manifest (hits were rejection-test strings, `chat.openai.com` host, Rust `OpenerExt` import, storage `read_text`) | PASS |
| Repository hygiene | all tracked files: no user profile path / username / token / key / Notion URL / real ChatGPT thread (only intentional detector samples in `fixtureHygiene.test.ts`) | PASS |
| Diff vs base | 83 files, +15,044 / −1 (majority lockfiles); top-level: .agent-run, .gitattributes, .gitignore, README.md, docs, fixtures, index.html, package*.json, src, src-tauri, tsconfig*.json, vite.config.ts | within approved structure |
| Real data dirs | `%APPDATA%\DevVault-Control`, `...-dev` | False / False (untouched) |

Screenshots reviewed (scratchpad, not committed): phase 1 detail, phase 2 before resume, phase 3 restored.

Wave 3 checkpoint commit: `b2c3ae8` (pushed); Task Packet digest re-verified: match.

## Final Convergence — 2026-09-17T14:27Z → HARD_GATE_FAILURE → BLOCKED

### Required checks re-run at frozen code head `b2c3ae892e81178f742ad96423eb3d0a859e5ed6`

| Check | Result |
|---|---|
| `npm ci` | PASS — 0 vulnerabilities |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 8 files / 222 tests |
| `npm run build` | PASS |
| `cargo check` | PASS — no warnings |
| `cargo test` | PASS — 22 tests |
| `npm run tauri build -- --no-bundle` | PASS — release exe rebuilt (1m27s), no bundle dir |
| Release launch smoke (fresh `DVCC_DATA_DIR`) | PASS — window "DevVault Control Center", empty state, data dir initialized, graceful close |

### Independent Verification (separate-context verifier; read-only on repository)

Verifier ran: tsc (PASS), vitest 222 (PASS), cargo test 22 (PASS), Task Packet digest (match), hygiene `git grep` (clean), `cargo tree` (direct deps only serde / serde_json / tauri / opener / clipboard-manager), verbatim-copied Rust validator boundary harness, TS validator boundary checks, release exe manifest (asInvoker), CDP-driven release app runs in its own `verifier/data-1..4` folders, 13 mutation probes against the TS test suite. It did not open real URLs / folders (forbidden by its brief).

Verifier verdicts:

- AC PASS: 01, 02, 03, 04, 05 (implementation; test validity issue F-5), 06, 07 (except F-1 input), 08 (note F-6), 09, 12, 13, 14 (runtime; no UI automated test), 15, 16, 19, 20.
- AC INCONCLUSIVE: 10, 11 (success path not executed by the verifier; implementer evidence shows real opens), 17 (F-1 / F-2 counterexamples).
- AC FAIL: 18 (F-1: an accepted repository URL does not survive restart).
- Hard checks: Security PASS, Privacy PASS, Authentication PASS, Permission PASS, **Data integrity FAIL**, **Irreversible-data safety FAIL**.
- Prohibited scope: no violation found.

### Findings (verifier) and Orchestrator confirmation

| ID | Severity | Summary | Orchestrator confirmation |
|---|---|---|---|
| F-1 | high | `normalizeRepositoryUrl` is not idempotent: `…/x.git.git` is stored as `…/x.git`; on restart `parseProjectsFile` requires `normalize(stored) === stored` → malformed → automatic rollback to `.bak` (latest project write lost from view, kept only in `.corrupt-*`) or UNREADABLE for all projects when both primary and backup contain it. Reproduced by verifier in release app (data-1, data-4). | **CONFIRMED** by code: `src/domain/validation.ts:52` strips one `.git`; `src/domain/schema.ts:121` requires the normalized value to equal the stored value. |
| F-2 | medium (hard: irreversible-data safety) | Missing `projects.json` with a valid `projects.json.bak` is treated as "missing" (writable); the second save copies the new primary over `.bak`, silently destroying the only valid backup. Reachable e.g. when quarantine succeeds and the restore write fails, or after manual deletion. Reproduced by verifier (data-2). | **CONFIRMED** by code: `src/services/persistence.ts:90-91` returns `missing` without checking `.bak`; `src-tauri/src/storage.rs` copies an existing valid primary to `.bak` on the next write. |
| F-3 | medium (hard: data integrity) | No single-instance guard and no write-conflict detection: two instances on the same data folder silently lose updates (Suspend overwritten; contradictory events). Fixed temp names (`<file>.tmp`, `<file>.bak.tmp`) make concurrent writes collide (corruption unconfirmed). Reproduced by verifier (data-3). | **CONFIRMED** by design: no instance lock in `src-tauri/src/lib.rs`; fixed temp names at `src-tauri/src/storage.rs:233` and `:242`. Previously treated as a deferred limitation; the verifier shows real silent state loss. |
| F-4 | low | Two actions in the same tick use a stale session closure → UI / disk divergence (automation-only in practice). | Plausible from `src/app/App.tsx` `runAction` using the captured session; not independently re-run. |
| F-5 | medium (test validity) | Transition guard test is self-referential (expects `ALLOWED_FROM`), so table mutations survive; no recovery test for a schema-invalid but JSON-valid primary; no automated UI test for AC-14. | CONFIRMED by reading `src/domain/transitions.test.ts` guard loop. |
| F-6 | low | Re-capture in the same round (also after a confirmed verdict) overwrites `result-r<N>.md` without a copy; verdict ↔ evidence link lost. | CONFIRMED by design (warning shown, but no retention). |
| F-7 | low / info | UTF-8 BOM JSON (hand-edited) is treated as corrupt and an older `.bak` is restored automatically. | Contract-conformant; recovery UX issue. |
| F-8 | info | "Set aside and start empty" is offered for I/O-error unreadable too (`App.tsx` checks status only). | Plausible, unconfirmed. |
| F-9 | info | Folder UNC rejection is string-based; a local junction to UNC would pass (unconfirmed). | Unconfirmed. |
| F-10 | info | Hygiene test scans only `fixtures/` and `docs/`. | CONFIRMED. |
| F-11 | info | `startNextRound` unbounded while file names allow r1–r999. | CONFIRMED (theoretical). |
| F-12 | info | Lone surrogates → JSON write refused (no data loss). | Info. |

Claims in earlier run artifacts corrected by this verification: "full guard table" test coverage (self-referential), AC-17 / AC-18 marked PASS in RUN_STATE (counterexamples F-1 / F-2), "Quality Debt: none" / "Known failures: none".

### Transition

Per Task Packet revision 1 §7 / §12 and Long-Run Route "Hard-gate failure transition": Data integrity and Irreversible-data safety Hard Checks show real FAIL → `HARD_GATE_FAILURE` → **BLOCKED**. Implementation writes, Repair Waves, independent-task continuation and Draft PR creation are stopped. Only evidence and current state are saved (run artifacts). Human escalation required.

## Repair campaign — Task Packet revision 2

### Repair preflight — 2026-09-17T14:35Z

| Item | Evidence | Result |
|---|---|---|
| Branch / HEAD | `feat/review-hub-v0.1`; HEAD `bf833767c12e9a2e420855ed11fce0083c5dd923` == `origin/feat/review-hub-v0.1` | PASS |
| Base | `origin/main` `bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d`; merge-base == base | PASS |
| Working tree | clean (no untracked) | PASS |
| Code vs frozen head | `git diff --name-only b2c3ae8 HEAD` outside `.agent-run/` → 0 files | PASS |
| Revision 1 digest | `4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b` | match |
| App processes / real data dirs | 0 running; `%APPDATA%\DevVault-Control[-dev]` → False / False | PASS |
| F-9 environment | Symbolic links creatable for test fixtures; loopback admin share `\\localhost\C$` reachable; a free drive letter available for a temporary loopback mapping. No other drive mappings or shares were listed or accessed. | recorded |

### Task Packet revision 2 initialization

- Snapshot: `.agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.rev2.md`, 22799 bytes, 0 CR bytes, `git check-attr text` → unset.
- SHA-256: `624ef4d3716e7490d035e2b5dc599fb3c3d59cacb60d0827f298dbc7a391567b`.
- Revision 1 snapshot retained unchanged (digest match). `.gitattributes` pattern widened to `TASK_PACKET_SNAPSHOT*.md -text`.
### Repair implementation R1–R6 — 2026-09-17 / 18

| Step | Commit | Evidence | Result |
|---|---|---|---|
| R1 F-1 | `29af58c` | `normalizeRepositoryUrl` strips every trailing `.git` (case-insensitive) and self-checks the canonical form; `src/domain/roundTrip.test.ts`: table of 33 repository inputs (`.git`, `.git.git`, `.GIT`, trailing slash, `//`, casing, port 443, userinfo, invalid host incl. trailing dot / api subdomain, invalid scheme, shape), idempotence for every accepted input, `.git.git` regression, create → serialize → parse round-trip for all accepted project inputs and edited projects, review sessions through a full lifecycle | Vitest PASS (283) |
| R2 F-2 / F-8 | `1777996` | Rust `write_atomic` refuses `RECOVERY_REQUIRED` (missing primary + existing `.bak`); `restore_backup` (backup untouched; refuses `PRIMARY_EXISTS` / `NOT_FOUND` / `BACKUP_INVALID`); quarantine of `.bak`. TS recovery table (missing primary + valid / invalid / newer backup), `io_error` distinct from `unreadable`, set-aside only for `unreadable` parts. Tests: restore + later saves keep original data in primary and `.bak`; storage-layer protection; restore write failure keeps backup, blocks writes, next load recovers; two-step recovery after quarantine + failed restore; session restore; set-aside backup / both; newer backup never restored; READ_FAILED / DATA_DIR_UNAVAILABLE / UNKNOWN → `io_error` with no set-aside and no file change | cargo test PASS (24); Vitest PASS (294) |
| R3 F-3 / F-4 | `1cfd4e1` | `tauri-plugin-single-instance` 2.4.4 registered first (focus existing window); unique temp names `<file>.tmp-<pid>-<n>` via `create_new`; all storage commands under one `DataRoot` mutex; write preconditions `absent` / `matches` → `CONFLICT`. TS `TrackedStorage` derives preconditions; `ReviewHub` serial queue using latest committed state + commit snapshots; App uses ReviewHub. Tests: Rust concurrent writes (8 threads × 25 read-compare-write under the lock) consistent, no temp leftovers; preconditions refuse external change without rotating `.bak`; stale temp files never read; TS hub ordering under randomized I/O delays (5 seeds: disk == app state, events `HOT→WARM`, `WARM→COLD`, `COLD→HOT` in call order, snapshots in commit order, fresh reload equal), control test proving the race loses an update without the queue, external `session.json` / `projects.json` change → `CONFLICT` with disk and events untouched, id collision refused, queue continues after conflict; `scripts/verify-single-instance.ps1` | cargo test PASS (27); Vitest PASS (306) |
| R4 F-5 | `fc08760` | `src/test/transitionContract.ts` independent literal contract (no import of the implementation table); `transitionContract.test.ts`: 15 contract rows × 8 states allowed / prohibited + resulting state, `canApply` agreement, non-suspended resume matrix, verdict prerequisites, suspend / resume for every open state × WARM / COLD, resource independence 8 × 6, next round; self-referential guard test removed; schema-invalid-but-JSON-valid primary recovery test. Mutation probe (scratch script, originals restored byte-for-byte, `git diff` empty): 12 / 12 KILLED — M1 confirmVerdict from NEW / CLOSED, M2 startNextRound from REVIEWING, M3 capture from SUSPENDED / CLOSED, M4 markReady from CLOSED, M5 block narrowed, M6 resume HOT guard removed, M7 close from CLOSED, M8 skip quarantine for JSON-valid schema-invalid primary, M9 suspend ignores Human WARM / COLD, M10 resume keeps resource, M11 single `.git` strip, M12 backup-absent branch forced | Vitest PASS (402) |
| R5 F-6 / F-11 | `b527fbb` | Re-capture: `replaceConfirmedByHuman` required when a result is recorded; previous text written first to `result-r<N>-previous-<capture ms>.md` with precondition `absent`, new result written with precondition `matches(previous)`, round `archivedResults` recorded, event note names the archive; orphan result files archived; dialog requires the replace checkbox. `contract/limits.json` `maxReviewRounds: 999` used by domain guard, schema, UI gating, TS tests and Rust `include_str!` file-name validation. Tests: re-capture refused without confirmation (no file change), archives kept across 2 replacements, archive / result conflict refused, orphan archived; oracle re-capture contract; limits consistency (JSON == TS constant, Rust includes the same file, limit boundaries for guard / schema / file names) | cargo test PASS (28); Vitest PASS (413) |
| R6 F-9 | `e01b1ab` | **Reproduced before the fix (measured):** directory symlink `<TEMP>\…\link-to-unc` → `\\localhost\C$\Windows` returned `Ok` from `validate_project_folder`; temporary loopback mapping `W:` → `\\localhost\C$` (`net use … /persistent:no`, removed immediately, `Test-Path W:\` → False) returned `Ok("W:\Windows")`. Junction to UNC: Windows refused creation ("Local volumes are required to complete the operation."). **Fix:** input drive checked with `GetDriveTypeW` (network / unknown rejected), final target resolved with `fs::canonicalize` and accepted only on a local drive (`NETWORK_TARGET` otherwise), resolved local path opened; data folder open uses the same check. **After the fix (measured):** symlink → UNC `Err(NETWORK_TARGET)`; mapped drive `W:\Windows` `Err(NETWORK_TARGET: the folder is on a network drive)` (mapping removed again); junction → local and symlink → local resolved to the local target; classification unit tests for `\\?\UNC`, `\\server\share`, volume GUID, pipe, GLOBALROOT, `\\?\C:` | cargo test PASS (33 + 1 ignored mapped-drive test run explicitly with `--ignored`: PASS) |
| Docs | `561c746` | `docs/data-contract-v1.md` (write / recovery / launcher rules, archived results, limits), README | — |

### Targeted checks after R1–R6 (code head `561c746`)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 13 files, 413 tests |
| `npm run build` | PASS |
| `cargo check` | PASS — no warnings |
| `cargo test` | PASS — 33 passed, 1 ignored (mapped-drive test, executed separately with a temporary mapping: PASS) |
| Task Packet digests | rev 2 `624ef4d3…567b` match; rev 1 `4200048d…124b` match |
| Real data dirs | `%APPDATA%\DevVault-Control[-dev]` → False / False |
### Full Convergence (revision 2) — 2026-09-18

Code frozen at `561c746` (HEAD `8231e58` adds run artifacts only). Release exe rebuilt from this head.
All app runs use the release exe with `DVCC_DATA_DIR=<SCRATCHPAD>/…` and a localhost WebView2 debug port (smoke only); the app is closed with `CloseMainWindow()` between phases.

#### Required checks

| Check | Result |
|---|---|
| `npm ci` | PASS — 0 vulnerabilities |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 13 files, 413 tests |
| `npm run build` | PASS |
| `cargo check` | PASS — no warnings |
| `cargo test` | PASS — 33 passed, 1 ignored (mapped-drive test; executed separately with a temporary loopback mapping: PASS) |
| `npm run tauri build -- --no-bundle` | PASS — release exe built (2m27s); no `bundle` directory |

#### Release E2E / smoke

| Scenario | Evidence | Result |
|---|---|---|
| Launch | process responding, title "DevVault Control Center", graceful close each phase | PASS |
| Phase 1 (fresh data) | 2 projects (http URL rejected in form), 2 reviews, WARM independent of NEW / READY, Copy prompt (clipboard first line "# Independent Review Request — Project Alpha / R1"), REVIEWING, capture keeps REVIEWING, verdict needs selection + acknowledgement, FIX_REQUIRED + WARM, reviewed HEAD normalized, next action, Suspend WARM + checkpoint; Open project folder (Explorer window observed, then closed) and Open GitHub (public repository of this project) without error; runtime rejections for `javascript:`, `file:`, `http:`, userinfo host, non-allowlisted host, UNC, relative, file path, storage traversal | PASS |
| Phase 2 (restart) | queue SUSPENDED / WARM restored, every metadata field, checkpoint, previous result; Resume → FIX_REQUIRED + HOT; Edit Project; disk FIX_REQUIRED / HOT | PASS |
| F-6 re-capture | Replace confirmation shown, Replace disabled until checked; toast names `result-r1-previous-<ms>.md`; state stays FIX_REQUIRED; disk: `archivedResults` = [that file], archive contains the first result, `result-r1.md` contains the replacement | PASS |
| F-4 rapid operations | same-tick resource clicks (first attempt: HOT→WARM, WARM→COLD recorded in order, disk COLD; smoke script then timed out on a busy-disabled save button — script fixed to wait for enabled); retry: resource + next action + resource in quick succession → UI resource HOT == disk HOT, UI next action == disk, resource event chain continuous (every `from` equals previous `to`) and last `to` == disk | PASS |
| F-3 external change | while the app ran, `session.json` next action was edited by another program; clicking a resource in the app → error toast "changed on disk by another program … Nothing was overwritten"; UI kept committed state; disk still held the external edit; `events.jsonl` hash unchanged; Reload showed the external edit | PASS |
| F-3 single instance | `scripts/verify-single-instance.ps1`: A started; B exited by itself (exit code 0); A still running and responding; 1 process remaining (A's PID); data folder fingerprint unchanged by B | PASS |
| F-9 runtime | directory symlink in scratchpad → `\\localhost\C$\Windows` (created with Node, removed afterwards); `open_project_folder(link)` → `NETWORK_TARGET: the folder resolves to a network (UNC) location`; no Explorer window opened | PASS |
| ChatGPT URL | `open_external_url https://chatgpt.com/` → OK | PASS |
| Recovery: corrupt primary + valid backup, corrupt beta session | notice "could not be read and was restored"; both projects restored; beta row unreadable, alpha unaffected; disk: primary == previous `.bak`, corrupt copy kept byte-identical, beta session untouched | PASS |
| Recovery: missing primary (F-2) | `projects.json` deleted with valid `.bak` → notice "was missing and was restored from its backup"; projects restored; disk: primary == backup, backup unchanged | PASS |
| I/O error (F-8) | `projects.json` replaced by a directory → banner "cannot be accessed … access problem … not damaged data" (os error 5, READ_FAILED); no set-aside button; + Project disabled; fingerprint of every file unchanged | PASS |
| Newer schema | banner explains schemaVersion 2 read-only; + Project disabled; no set-aside; file and backup unchanged | PASS |
| Unreadable without backup | banner + set-aside; after confirmation primary renamed to `.corrupt-<ms>` with identical content; empty project list; + Project enabled | PASS |
| Invalid data dir | relative `DVCC_DATA_DIR` → fatal screen `DATA_DIR_UNAVAILABLE`, nothing created | PASS |
| Real data dirs | `%APPDATA%\DevVault-Control[-dev]` → False / False after all runs | PASS |

#### Scope / hygiene at `8231e58`

- Tracked-file scan (97 files, lockfiles / icons excluded): no user profile path, username, token / key, Notion URL, private IP, network share name, real ChatGPT thread URL (only intentional detector samples in `src/test/fixtureHygiene.test.ts`).
- Production source scope grep: no fetch / XHR / WebSocket, no process spawning (`Command::new` only inside `#[cfg(test)]` of `launcher.rs` for `mklink` fixtures), no GitHub API client (`api.github.com` only as a rejected test input), no paid AI SDK, no SQLite / REST / MCP, no clipboard read, no webview opener permission, no admin manifest / perMachine.
- Dependencies: npm `@tauri-apps/api`, `@tauri-apps/plugin-clipboard-manager`, `react`, `react-dom`; Rust `tauri`, `tauri-plugin-opener`, `tauri-plugin-clipboard-manager`, `tauri-plugin-single-instance` (Human-approved), `serde`, `serde_json`. Capability unchanged: `core:default` + `clipboard-manager:allow-write-text`.
- Diff vs base excluding lockfiles: 95 files, +10,968 / −1.

#### Independent Verification (revision 2, separate context) — findings accepted by the Orchestrator

Verifier checks: tsc PASS; vitest 413 PASS; cargo test 33 PASS (F-9 tests executed); vite build PASS (copy); 26 TS mutations (25 killed, C2 survived) and 8 Rust mutations (8 killed) on copies; F-1 fuzz 10,703 accepted inputs idempotent and round-trip; release-app runs in its own data folders (lifecycle / restart, recovery, I/O error, CONFLICT, same-tick operations, single instance incl. spawn races, F-9 symlink / junction / temporary loopback mapping, data folder symlink to UNC, BOM, lone surrogates). No repository edits; temporary mapping removed; `git status` clean.

| Item | Verifier status |
|---|---|
| F-1, F-2, F-4, F-5, F-8, F-9, F-11 | RESOLVED |
| F-6 | RESOLVED (residual E-2) |
| F-3 | **PARTIAL** — see E-1 |
| F-7, F-10 | DEBT (Human-allowed) |
| F-12 | NOT RESOLVED (outside rev 2 list, info) |
| AC-01..AC-20 | PASS (AC-19 note: release rebuild not re-run by the verifier; implementer rebuilt it) |
| Hard checks | Security PASS, Privacy PASS (info E-7), Authentication PASS, Permission PASS, **Data integrity FAIL (R-F3 prevention sub-condition, E-1)**, Irreversible-data safety PASS (low notes E-3 / E-4) |

New findings and Orchestrator decision:

| ID | Severity | Finding | Orchestrator confirmation / decision |
|---|---|---|---|
| E-1 | medium (data integrity, R-F3) | Two DVCC processes started at nearly the same time can both run (reproduced 1/6 different folders, 2/8 same folder). | **Confirmed** in `tauri-plugin-single-instance-2.4.4/src/platform_impl/windows.rs:72-96`: when the mutex already exists but `FindWindowW` finds no window yet, the second process continues as a normal instance. Part of the authorized F-3 repair → repair round 2 (not a new hard-gate category; no Draft PR yet). |
| E-2 | low (F-6 liveness) | After a partial replacement (archive written, session not updated, or session restored from `.bak`), re-capture of that round stays CONFLICT. | Accept → repair round 2 (idempotent archive / free suffix). |
| E-3 | low | Suspend writes `checkpoint.md` before `session.json`; on a session CONFLICT the checkpoint is already replaced and the toast says "Nothing was overwritten". | Accept → pre-check before writing the checkpoint; accurate message. |
| E-4 | low / info | Targets not read by the current process (e.g. `request-r<N>.md` after restart) are written without precondition; docs overstate "writes carry a precondition". | Accept → document exactly which writes are conditional; regenerated artifacts are latest-wins by design. |
| E-5 | info (unconfirmed) | Folder validation follows reparse points (`metadata` / `canonicalize`) before rejecting, so a planted link could trigger an SMB connection before `NETWORK_TARGET`. | Accept as hardening → check link targets without following them first. |
| E-6 | info (test gap) | Mutation C2 (no precondition on the result write) survived. | Accept → add a test for a result changed between read and write. |
| E-7 | info (privacy) | Evidence row mentioned the existence of the user's network drive mappings. | Accept → row reworded (no names / addresses were ever recorded). |
| E-8 | info | Regenerating `request-r<N>.md` in the same round replaces the previous request text. | Record as Quality Debt (documented latest-wins behaviour). |
| E-9 | info | README / data contract "only one process" statement inaccurate given E-1. | Accept → update after the E-1 fix. |
| E-10 | info (unconfirmed) | Debug and release builds share the identifier, so a dev instance blocks a release instance. | Accept as documented limitation (Quality Debt). |

### Repair round 2 (rev 2 scope: F-3 / F-6 / F-9 residuals from Independent Verification #2)

| Item | Implementation | Commit | Test / evidence |
|---|---|---|---|
| E-1 (F-3) | `instance.rs`: named mutex `Local\com.devvault.controlcenter.instance` created first in `run()`; a process that did not create it exits in `setup` (`cleanup_before_exit` + `exit(0)`) before the data root is resolved. `storage.rs`: `.dvcc.lock` opened with `share_mode(0)` for the process lifetime; failure → `DATA_DIR_IN_USE`, every storage command refused. | `a03f67f` | `second_creation_of_the_same_mutex_reports_a_running_instance`; `data_folder_lock_admits_only_one_owner_at_a_time` (second owner refused, no data file created, lock released on drop). Runtime race verification → Full Convergence re-run. |
| E-2 (F-6) | Archive candidates `result-r<N>-previous-<ms>[-<n>].md`; unrecorded candidate with the replaced text reused, with other text recorded, else first free name; action payload `archivedResultFiles`; Rust / MemoryStorage names accept `-<n>` (1..999, no leading zero). | `a03f67f`, `68af11d` | Retry after session write failure, after result write failure, after session restored to an older state; unrecorded foreign archive kept and recorded; oracle rejects `-0`, `-01`, `-1000`, duplicates, non-candidates. |
| E-3 | `TrackedStorage.assertUnchanged(session.json)` before the first write of Suspend / Copy review prompt / Capture result; CONFLICT message reworded ("DVCC did not overwrite that change"). | `68af11d` | Hub tests: external session change → suspend CONFLICT with `checkpoint.md` unchanged; saveRequest / captureResult CONFLICT with every file unchanged. |
| E-4 | Data contract table of conditional writes; `request-r<N>.md` / `checkpoint.md` latest-wins unless read in this run. | `61949ed` | Doc review. |
| E-5 (F-9 hardening) | `reject_network_links`: every link along the path read with `read_link` (not followed) and its target classified before `metadata` / `canonicalize`. | `a03f67f` | `rejects_link_to_unreachable_network_host_without_resolving_it` (EXECUTED; NETWORK_TARGET in 1.27 ms for a non-existent host, incl. sub folder and link chain), `relative_symlink_to_local_directory_is_accepted`, `classifies_link_targets_without_opening_them`; existing F-9 tests still pass. |
| E-6 | Result replaced between read and write → CONFLICT. | `68af11d` | New persistence test. |
| E-8 / E-10 | Quality Debt QD-009 / QD-010; documented. | `61949ed` | — |
| E-9 | README / data contract describe the three layers (mutex, plugin, lock). | `61949ed` | Doc review. |
| Formatting | `cargo fmt` of pre-existing Rust code in a separate formatting-only commit. | `3833d4e` | `cargo fmt --check` PASS. |

Mutation checks of the new tests (source copy restored and byte-compared afterwards):

| Mutation | Killed by |
|---|---|
| M-E3: `ensureSessionUnchanged` does nothing | 2 hub tests (E-3) |
| M-C2: result write without precondition (the mutation that survived in Verification #2) | E-6 test |
| M-E2: no reuse of an archive already holding the replaced text | "retry after the result write failed" test |

Targeted checks after round 2: tsc PASS; vitest 420 PASS (13 files); `npm run build` PASS; `cargo fmt --check` PASS; `cargo check` PASS; `cargo clippy --all-targets` no warnings; `cargo test` 38 passed / 1 ignored (mapped-drive test needs a temporary mapping; run at Full Convergence).

### Full Convergence re-run after repair round 2 — 2026-09-18

All app runs use the release exe with `DVCC_DATA_DIR=<SCRATCHPAD>/...` and a localhost WebView2 debug port (smoke only). Harness scripts stay in the scratchpad (L-012 / L-022) except `scripts/verify-single-instance.ps1`.

#### Required checks at `6610e4c` (round 2)

| Check | Result |
|---|---|
| `npm ci` | PASS — 0 vulnerabilities |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 13 files, 420 tests |
| `npm run build` | PASS |
| `cargo check` | PASS |
| `cargo test` | PASS — 38 passed, 1 ignored |
| `npm run tauri build -- --no-bundle` | PASS — release exe built; no `bundle` directory |

#### E-1 runtime verification of round 2 → FAIL, repaired (strategy 3)

| Run | Build | Result |
|---|---|---|
| `verify-single-instance.ps1 -RaceRounds 20` | round 2 (`6610e4c`) | sequential PASS; data-folder lock held by A = True; race **FAIL 1 / 20** (round 6: both processes still alive after 33 s; state not captured) |
| Diagnostic copy of the script, 30 rounds | round 2 | 30 / 30 PASS (failure not reproduced; diagnostics never triggered) |

Orchestrator analysis (source, not observed state): (1) the own mutex and the plugin mutex (`{identifier}-sim`, created in the plugin set-up during `Builder::build`) can be won by different processes; (2) tauri 2.11.5 `app.rs` `setup()` creates the configured windows before the application setup hook, so a round-2 loser had already started a WebView2 window when it exited in the hook, and a process blocked in the plugin's `SendMessageW` to such a loser waits for it. Both gaps allow a stalled pair. Decision: F-3 repair strategy 3 of 3 (Task Packet §12 `repair_strategies_max: 3`): serialize start-up through the plugin registration (`7ef9c29`), see L-030.

#### Strategy 3 (`7ef9c29`, docs / script `0b884f6`)

| Check | Result |
|---|---|
| `cargo fmt --check`, `cargo clippy --all-targets` | PASS, no warnings |
| `cargo test` | PASS — 39 passed, 1 ignored; new `a_second_starter_waits_until_the_first_releases`, `a_lock_left_by_an_ended_owner_is_taken_over` (repeated 3x) |
| Mapped-drive boundary (temporary `W:` → `\\localhost\C$`, `/persistent:no`, removed afterwards; no other mapping listed or accessed) | `rejects_mapped_network_drive_directory` EXECUTED → `NETWORK_TARGET`; `W:` absent after cleanup |
| `npm run tauri build -- --no-bundle` | PASS |
| Diagnostic race script, 60 rounds (2 processes) | sequential PASS; race **60 / 60 PASS** (survivor first 59, second 1 — the lock serializes either order) |
| `scripts/verify-single-instance.ps1` (`0b884f6`), `-RaceRounds 60 -RaceSize 2`, back-to-back starts | sequential PASS; race **60 / 60 PASS** (survivor #1: 56, #2: 4) |
| Same script + `-DelaysMs` (0, 0, 10, 20, 50, 100, 200, 300, 500, 1000 ms between starts), `-RaceSize 3`, 40 rounds planned | sequential PASS; race **14 / 14 PASS** (every delay covered once, then 0 / 0 / 10 / 20); **run stopped by the system after round 14 because the machine was low on memory** (not a DVCC failure; no DVCC or DVCC WebView2 process left) |
| Control build of round 2 (`6610e4c`, scratch sources, git-ignored target dir) for a staggered-delay comparison | **not completed**: first attempt failed in a dependency build script with a long target path; second attempt stopped by the system (low memory) |

#### Release E2E at `7ef9c29` (scratch orchestrator, fresh data folder) — 0 failures

| Scenario | Evidence | Result |
|---|---|---|
| Phase 1 (`--open`) | projects / reviews / prompt / capture / verdict / suspend; Open project folder (Explorer window then closed) and Open GitHub (public repository of this project) without error; runtime launcher / storage rejections | PASS |
| Phase 2 (restart) | suspended review restored exactly; Resume; Edit Project | PASS |
| F-6 re-capture | disk `archivedResults` = [`result-r1-previous-<ms>.md`]; archive = first result; `result-r1.md` = replacement | PASS |
| F-4 rapid operations | disk resource == UI; disk next action == UI; resource event chain continuous, ends at disk state | PASS |
| F-3 external change | CONFLICT toast; `events.jsonl` hash unchanged; `session.json` keeps the external edit; Reload shows it | PASS |
| E-3 suspend after external change | toast "... DVCC did not overwrite that change ..."; `checkpoint.md` hash unchanged; `session.json` keeps the external edit; state not SUSPENDED | PASS |
| E-2 retry after older session state | `session.json` replaced by its pre-re-capture content, app restarted, capture again → toast names `...-1.md`; disk `archivedResults` = [`<base>.md`, `<base>-1.md`] = first / second result; `result-r1.md` = third | PASS |
| F-9 / E-5 runtime | symlink → `\\localhost\C$\Windows`: `NETWORK_TARGET` (link text) in 3 ms; symlink → unreachable `.invalid` host: `NETWORK_TARGET` in 2 ms; links removed | PASS |
| Recovery: restored / missing primary / I/O error / newer schema / unreadable + set-aside / fatal relative data dir | same assertions and disk checks as the previous convergence | PASS |
| E-1 layer 3 | `.dvcc.lock` held by another process → fatal screen `DATA_DIR_IN_USE`; no data file changed | PASS |
| Real data folders | `%APPDATA%\DevVault-Control[-dev]` absent; no DVCC process left | PASS |

#### Scope / hygiene at `0b884f6`

- Tracked-file scan (lockfiles / icons excluded): no user profile path, username, e-mail, token / key, Notion URL, private IP, real ChatGPT thread URL (only the intentional detector sample in `src/test/fixtureHygiene.test.ts`); UNC-like strings are test hosts (`localhost`, `server`, `example`, `dvcc-unreachable-host.invalid`) or escaped example paths.
- Production scope: no fetch / XHR / WebSocket / clipboard read in `src` (non-test); `std::process::Command` only inside `launcher.rs` `mod tests`.
- Capability unchanged (`core:default`, `clipboard-manager:allow-write-text`); dependencies unchanged (npm: `@tauri-apps/api`, `@tauri-apps/plugin-clipboard-manager`, `react`, `react-dom`; Rust: `tauri`, `tauri-plugin-opener`, `tauri-plugin-clipboard-manager`, `tauri-plugin-single-instance`, `serde`, `serde_json`); no custom manifest.
