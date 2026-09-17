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
| F-9 environment | Developer Mode enabled (symbolic links creatable without elevation); loopback admin share `\\localhost\C$` reachable; free drive letters available for a temporary loopback mapping. The user's existing network drive mappings exist and are **not accessed** (names / addresses intentionally not recorded). | recorded |

### Task Packet revision 2 initialization

- Snapshot: `.agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.rev2.md`, 22799 bytes, 0 CR bytes, `git check-attr text` → unset.
- SHA-256: `624ef4d3716e7490d035e2b5dc599fb3c3d59cacb60d0827f298dbc7a391567b`.
- Revision 1 snapshot retained unchanged (digest match). `.gitattributes` pattern widened to `TASK_PACKET_SNAPSHOT*.md -text`.