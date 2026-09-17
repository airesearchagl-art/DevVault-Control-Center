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
