# Evidence — LR-20260920-DVCC-002

## Wave 0 — preflight (2026-09-20)

| Item | Evidence |
|---|---|
| Repository | `airesearchagl-art/DevVault-Control-Center`, remote `https://github.com/airesearchagl-art/DevVault-Control-Center.git` |
| Base SHA | `origin/main` = `f557aa6f15222099f54790180e0ff71c5291734a` — matches the Human-stated expected main; subject "Merge pull request #1 from airesearchagl-art/feat/review-hub-v0.1" (Phase 1 merged) |
| Current branch before | `feat/review-hub-v0.1` (Phase 1 branch, already merged) |
| Working tree | clean — 0 tracked changes, 0 untracked files (no baseline dirt to preserve) |
| Existing Phase 2 branch | none locally, none on the remote (`git ls-remote --heads origin feat/evidence-freshness-v0.2` empty) |
| Working branch created | `feat/evidence-freshness-v0.2` from `origin/main` @ `f557aa6` (AC2-01) |
| Remote / push availability | `gh` 2.96.0 authenticated for this repository (Phase 1 pushes and PR edits succeeded from this machine) |
| Tool surface | node v24.15.0, npm 11.12.1, rustc 1.95.0, cargo 1.95.0, git 2.53.0.windows.2, gh 2.96.0 |
| Test commands | `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `cargo fmt --check`, `cargo clippy --all-targets`, `cargo check`, `cargo test`, `npm run tauri build -- --no-bundle` |
| Network boundary | the product performs no network operation; Phase 2 adds none (local Git only). Session-side network use is limited to GitHub for the repository itself and a read-only vault `git fetch` |
| Permission boundary | no capability change planned; `src-tauri/capabilities/default.json` stays `core:default` + `clipboard-manager:allow-write-text` |
| Existing failures | none known at `f557aa6` (Phase 1 closed with all required checks PASS; PR #1 merged) |
| Available memory | 13.59 GiB at preflight (heavy-verification gate: 12 GiB) |
| GitHub CI | none — 0 status contexts, no Actions workflow; all checks are local and no GitHub CI result may be reported as PASS |

## Task Packet binding

- Snapshot: `.agent-run/LR-20260920-DVCC-002/TASK_PACKET_SNAPSHOT.md`, 17 432 bytes.
- SHA-256: `b9ecd5c0d1a9d8388cc212072c3c08a5a57a45af90035c4f2a2232688a6f9dd8` (recorded in `RUN_MANIFEST.md`, `RUN_STATE.md`, this file and `DECISIONS.md` by reference).
- Revision 1; no previous revision for this run. The previous campaign's artifacts (`.agent-run/LR-20260917-DVCC-001/`) are untouched.

## Route reading (read-only)

The vault working tree at `C:\Users\shuns\obsidian-vault` is a detached checkout from 2026-09-13 whose local `main` is 333 commits behind, and it does not contain the DVCC project folder. All route and project documents were therefore read from the vault's current main (`origin/main` = `4d3b60b`, 2026-09-20) with `git show`, without checkout, reset or any edit; only remote-tracking refs were updated by a read-only `git fetch`. Blob identities are recorded in `RUN_MANIFEST.md`. The five route prompts are byte-identical to the blobs used by run LR-20260917-DVCC-001.

Route constraints adopted for this run: run-artifact file set and `RUN_STATE.md` field/section contract; Task Packet snapshot + digest binding and re-hash at every checkpoint; campaign state vocabulary (`INITIALIZED / RUNNING / DEGRADED / CHECKPOINTED / SUSPENDED / BLOCKED / COMPLETE_PENDING_FULL_VERIFY / COMPLETE_VERIFIED`); Hard Gate failures never converted into Quality Debt; LONG_RUN loop limits (same-hypothesis retry 2, repair strategies 3, no-progress waves 2); Draft PR body contract; Documentation Sync handoff report shape (the dev IDE never writes Notion or the vault).

## Architecture / reuse scan (delegated, read-only)

Findings that shape Wave 1–3 (all verified against the Phase 1 code at `f557aa6`):

- `launcher::validate_project_folder(&str) -> Result<PathBuf, CommandError>` performs the whole F-9 local-path boundary (rejects UNC / relative / non-disk prefixes, checks the drive type, reads every link / junction target without following it, canonicalizes and re-checks the final target) and is synchronous and free-standing; its helpers are private to the module. The Phase 2 command reuses it and works from the returned canonical path.
- Commands are `#[tauri::command] pub async fn … -> Result<T, CommandError>` with `#[serde(rename_all = "camelCase")]` payloads, registered in `tauri::generate_handler![…]` in `lib.rs`; error `code` values are plain string literals mirrored by hand on the TypeScript side.
- The crate has **no** ISO-8601 helper, no `chrono` / `time` dependency, and no child-process or timeout helper: Phase 1 spawns no processes (`std::process::Command` appears only in launcher tests). Both are new, small, dependency-free additions in Wave 1.
- Human-recorded HEAD values live in `RoundRecord.expectedHead` / `reviewedHead` (`src/domain/review.ts`), validated by `HEAD_PATTERN = /^[0-9a-f]{7,40}$/` with `normalizeHead` lower-casing on input — so comparison works on lowercase hex, 40 = exact, 7–39 = prefix.
- Frontend seams: `invokeCommand` (`src/services/storage.ts`) and the `Launcher` port (`src/services/launcher.ts`) give the shape for a new observation port; `appState.ts` (`useReducer`) is where a `Record<projectId, GitObservation>` slice belongs; `buildQueue` (`src/domain/queue.ts`) and `ReviewQueue.tsx` / `ReviewDetail.tsx` are the display attach points (`data-testid` convention `detail-*` / `action-*` / `queue-*`, badges via `src/components/StateBadge.tsx`).
- Vitest runs in the `node` environment and only matches `src/**/*.test.ts` (no jsdom): Phase 2 logic must live in `.ts` modules to be testable, and UI behaviour is verified by the scratch CDP smoke instead.
- `contract/limits.json` is the established one-source place for values shared by Rust and TypeScript (`include_str!` on the Rust side, direct JSON import on the TypeScript side) — the Git timeout goes there.
- `docs/data-contract-v1.md` currently states that `expectedHead` / `reviewedHead` are Human-recorded values and that "Git / GitHub freshness is Phase 2", and `README.md` lists Git freshness as out of scope for v0.1; both need a Phase 2 update in Wave 4.

## Project-document constraints (vault origin/main 4d3b60b, read-only)

- `01_Projects/DevVault-Control-Center/01_Roadmap.md` §"Phase 2 — Evidence / Freshness" scopes exactly what this run implements: local Git status / branch / HEAD; separation of expected / reviewed / current HEAD; the derived vocabulary `ALIGNED / HEAD_CHANGED / REVIEW_STALE / WORKTREE_DIRTY / UNKNOWN`; fail-closed / unresolved handling; separation of Project / Review state from Git facts. Its "Reuse" line names the Development Dashboard Data Contract and its "GitHub Live Facts / Vault Confirmed State / Derived Freshness" model.
- Decision D-009 (Evidence separation, ADOPTED 2026-09-17) requires separating "GitHub / **local** facts", the review verdict, Human-confirmed state and derived freshness, and forbids filling `UNKNOWN` / `UNRESOLVED` with guessed values — local Git observation is explicitly inside the facts layer.
- Decision D-006 keeps Resource State and Review State as separate axes (`WARM + FIX_REQUIRED` is legal); Freshness is a third axis and must not be folded into either.
- Decision D-007 makes local JSON / Markdown the canonical persisted state (`projects.json`, `reviews/<id>/…`); it says nothing about caching *observed* Git state, which is what this Phase keeps in memory only.
- `05_LLM_IDE_Instructions.md` adds project-required checks beyond the Task Packet list: frontend build, TypeScript check, Rust / Tauri compile check, unit tests for pure state / persistence helpers, **Windows app launch smoke** and **persistence round-trip smoke**. Both smokes are run in Wave 4 on an isolated desktop. It also requires a Reuse Scan and an explicit Adoption Decision, forbids committing user-specific runtime data or absolute local session paths, and forbids vault / Notion edits from the implementation session.
- No Phase 2 acceptance criteria are recorded in the vault (the Phase 2 section has no Exit / Acceptance block), so the Human-specified AC2-01..AC2-18 in the Task Packet are the acceptance contract for this run.
- The vault's own phase bookkeeping is stale: `05_LLM_IDE_Instructions.md` still records `Current Phase: Phase 0` and the roadmap still shows Phase 1 as `PLANNED / NEXT`, although Phase 1 is merged in the repository at `f557aa6`. Per that same file's canonical source order (Human instruction → fresh repository state → … → vault), the fresh repository state and the Human's Phase 2 authorization take precedence; the stale vault text is reported back for the Documentation Sync handoff instead of being treated as canonical (and is not edited by this session).

## Wave 1 — Rust Git inspection boundary (2026-09-20)

Implemented in `src-tauri/src/git.rs` (new, registered as `git::inspect_git_repository` in `lib.rs`), plus `gitObservationTimeoutMs: 5000` in `contract/limits.json`.

Read-only guarantee, as built:

| Property | How it is enforced |
|---|---|
| Git commands used | `rev-parse --is-inside-work-tree`, `rev-parse --verify --quiet HEAD`, `symbolic-ref --quiet --short HEAD`, `status --porcelain=v1` — four read-only subcommands, nothing else |
| No shell | `std::process::Command::new("git")` with `args(&[…])`; no `cmd.exe`, no PowerShell, no string concatenation, no generic executor |
| No caller text on a command line | the observed folder is passed as the child's working directory (`current_dir`), never as an argument; the path itself comes from `launcher::validate_project_folder` (the Phase 1 F-9 boundary) |
| No network | none of the four subcommands contacts a remote; `GIT_TERMINAL_PROMPT=0` guarantees that nothing can block on credentials either |
| No index / config writes | `GIT_OPTIONAL_LOCKS=0` on every invocation (Git then never takes `index.lock`, so `status` cannot write a refreshed index) |
| stdin | `Stdio::null()` |
| Operator disturbance | on Windows the child is created with `CREATE_NO_WINDOW`, so no console flashes on the operator's desktop |
| Timeout | one deadline for the whole observation (5 s from the shared limits contract); the parent polls `try_wait` while both pipes are drained by their own threads (a full pipe would otherwise block the child); on expiry only *this* child handle is killed — never a kill by process name |
| Fail closed | `NO_LOCAL_ROOT`, `NOT_A_GIT_REPOSITORY`, `GIT_UNAVAILABLE`, `TIMEOUT`, `ERROR` all leave `head` / `branch` / `detached` / `dirty` as `null`; nothing is guessed |
| Path boundary | UNC (`\\…`, `//…`), relative paths, non-disk prefixes, network drives and links whose target leaves the local drive are refused by the reused Phase 1 validator before any Git process exists; the refusal code (e.g. `FOLDER_REJECTED`, `NETWORK_TARGET`) is carried through as `errorCode` |

`observedAt` is produced in Rust as ISO-8601 UTC with millisecond precision by a dependency-free formatter (no new crate); the wire shape (`status` SCREAMING_SNAKE_CASE, camelCase fields) is pinned by serialization tests.

Rust tests added (14, all passing): clean repository (status OK, 40-char HEAD, branch, `detached=false`, `dirty=false`); modified tracked file → dirty; untracked file → dirty; detached HEAD (no branch, same HEAD); folder that is not a repository; missing / empty local root (no Git process started); local-folder boundary refusals (`\\server\share`, `//server/share`, relative) → `ERROR` + code, no facts; missing Git executable → `GIT_UNAVAILABLE`; expired bound → `TIMEOUT`; **observation does not modify the repository** (content hashes of every file under the repository, including `.git`, identical before and after three observations); ISO-8601 formatter against five known epochs incl. a leap day; timeout read from the shared limits contract; status vocabulary and observation field names.

Fixtures are synthetic temporary repositories created per test (`git init --initial-branch=dvcc-test-main`, one commit) with `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` pointed at non-existent files and author / committer identity supplied per process, so the operator's global Git configuration is neither read nor written. No real user project is used.

Targeted checks at this checkpoint: `cargo fmt --check` PASS, `cargo clippy --all-targets` PASS (0 warnings), `cargo test` PASS — **61 passed, 1 ignored** (was 47 / 1 at `f557aa6`).
