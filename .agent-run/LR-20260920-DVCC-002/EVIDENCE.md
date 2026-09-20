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

The vault working tree at `<OBSIDIAN_VAULT>` is a detached checkout from 2026-09-13 whose local `main` is 333 commits behind, and it does not contain the DVCC project folder. All route and project documents were therefore read from the vault's current main (`origin/main` = `4d3b60b`, 2026-09-20) with `git show`, without checkout, reset or any edit; only remote-tracking refs were updated by a read-only `git fetch`. Blob identities are recorded in `RUN_MANIFEST.md`. The five route prompts are byte-identical to the blobs used by run LR-20260917-DVCC-001.

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

## Wave 2 — TypeScript model, HEAD comparison and Freshness derivation (2026-09-20)

- `src/domain/git.ts` mirrors the Rust `GitObservation` / `GitStatus` and accepts a command result **fail closed**: an unknown status, a non-object payload or a wrongly typed field yields an `ERROR` observation with no facts (`MALFORMED_OBSERVATION`) instead of a partially trusted one. Nothing here is persisted.
- `src/domain/freshness.ts` holds the derivation. `compareHead` is the single comparison point: a 40-character recorded value must be equal, a 7–39-character value must be a prefix of the current full SHA, comparison is case-insensitive, and an absent / malformed value or a current HEAD that is not a full SHA is `"unknown"` — never a guessed difference. `deriveFreshness` applies the contracted priority (WORKTREE_DIRTY → REVIEW_STALE → HEAD_CHANGED → ALIGNED → UNKNOWN), returns the Human-recorded values unchanged and always carries a one-sentence explanation naming the reason (including the failure reason for a rejected path, a timeout, a missing Git, a folder that is not a repository, or an observation that has not happened yet).
- `src/services/git.ts` adds the `GitObserver` port plus `tauriGitObserver` (a rejected `invoke` becomes an `ERROR` observation, so a failed call can never surface as an app error) and `observeSequentially`, the Refresh All helper that observes **one project at a time**.
- `contract/limits.json` `gitObservationTimeoutMs` is now read by both sides; `src/domain/limits.ts` exports `GIT_OBSERVATION_TIMEOUT_MS` and the limits contract test asserts that Rust reads the same file and does not repeat the number as a literal.

Independent oracle: `src/test/freshnessContract.ts` states its rows and the vocabulary as literal data and imports nothing from the implementation; `src/domain/freshnessContract.test.ts` runs every row against `deriveFreshness`, asserts the vocabulary matches, that all five states are covered, that the three undecidable rows never produce a "differs" explanation, the exact wording of both difference explanations, and the pass-through of the recorded HEADs (AC2-07 at the derivation level). `src/domain/git.test.ts` covers the fail-closed acceptance; `src/services/git.test.ts` proves Refresh All never runs two observations at once and reports each project in order (AC2-11 at the service level).

Targeted checks at this checkpoint: `npx tsc --noEmit` PASS; `npx vitest run` PASS — 16 files, **485 tests** (was 426 at `f557aa6`).

## Wave 3 — UI integration (2026-09-20)

- **Git evidence card** in the review detail (`data-testid="git-evidence"`): the Freshness badge with its one-sentence explanation, then Observation status, Current branch (or "detached HEAD"), Current HEAD (observed), Working tree, Expected HEAD (recorded), Reviewed HEAD (recorded) and Observed time — the observed facts and the Human-recorded values are shown side by side but stay visibly separate. A "Refresh Git state" button (`action-refresh-git`) observes the selected review's project. A hint states that observed facts are read-only, are not stored, and that refreshing changes neither the recorded HEADs nor the review state.
- **Queue rows** carry a Freshness badge (`queue-freshness`) next to the Review State and Resource State badges, with the explanation as its tooltip. The existing Review State ordering is unchanged.
- **Refresh All** (`btn-refresh-all-git`, status bar) observes every registered project through `observeSequentially` — one Git process at a time.
- **No automatic refresh**: nothing observes at start-up; the app begins with no observation and every Freshness is `UNKNOWN` ("Git state has not been observed.") until the Human refreshes.
- **State separation**: the observation lives in a dedicated `gitObservations` slice keyed by project id, written only by the `gitObserved` action. Reducer tests assert that this action changes nothing else in the state (reviews, projects, artifacts and selection keep their identity), so a refresh cannot move a Review State (AC2-09) or rewrite a recorded HEAD (AC2-07), and that the initial state holds no observation (AC2-13 at state level), while an in-app reload keeps what was observed.
- `FreshnessBadge` follows the existing badge component and CSS conventions (`badge freshness-<state>`, `data-state`), with a dark-mode variant.

Targeted checks at this checkpoint: `npx tsc --noEmit` PASS; `npx vitest run` PASS — 16 files, **487 tests**; `npm run build` PASS.

## Wave 4 (part 1) — documentation and mutation probes (2026-09-20)

Documentation (`5e991a8`): README states the Phase 2 feature, the read-only Git boundary and the new layout entries, and its "out of scope" line is now v0.2 (the GitHub API and every network Git operation stay out). `docs/data-contract-v1.md` gained a "Git evidence and derived Freshness" section (observation fields and status vocabulary, how the facts are obtained, the fixed Freshness priority, the HEAD comparison rules, and the rule that Freshness never changes a review state or a recorded HEAD); the recorded-HEAD row no longer calls freshness a future phase.

Mutation probes (each applied alone to the working tree, suite run, source restored and verified byte-identical):

| Probe | Result |
|---|---|
| T1 the reviewed-HEAD branch only runs when no expected HEAD is recorded (priority swapped) | killed |
| T2 the dirty working tree is ignored | killed |
| T3 a malformed recorded HEAD counts as a difference | killed |
| T4 the prefix comparison is reversed | killed |
| T5 a failed / missing observation is treated as observed | killed |
| R1 `dirty` is always false | killed |
| R2 a folder that is not a repository is treated as one | killed |
| R3 `GIT_OPTIONAL_LOCKS=0` is dropped | **survived at first** → test strengthened (`80fcc21`), then killed |
| R4 the timeout deadline is ignored | killed |

R3 is the one that mattered: the read-only claim rested on an environment variable whose effect no test exercised, because the fixture never put the index in the state where `git status` refreshes it. The no-mutation test now rewrites a tracked file with identical content a second after the commit (stat information no longer matches the index); with the variable the repository stays byte-identical, and without it the test fails with `.git\index changed during a read-only observation`. **9 / 9 probes killed.**

> **Corrected in Wave 5.** The probe harness restored sources with their original timestamps, so Cargo reused the *mutated* test binary for later runs. Two conclusions drawn in Wave 4 from that stale binary were wrong (see "Wave 5"), and the index comparison this paragraph describes was weakened for a flake that did not exist. It is restored, and the probe harness now forces a rebuild.

## Wave 4 (part 2) — release build, UI smoke and two defects found by making the evidence deterministic (2026-09-20)

### Two problems the convergence checks exposed

1. **The observation bound did not hold when Git left children behind (partly fixed here; completed in Wave 5).** The timeout branch killed the Git child and then *joined* the pipe readers; a killed process can leave children of its own holding those pipes, so the join blocked until they exited. Measured: an observation whose stand-in Git never answered returned after **19.4 s** with a 300 ms bound. Fixed in `5ec54a9` by detaching the readers on the timeout path (only the process this call started is ever killed). The same observation now returns at its bound.
2. **Two tests were treated as racy — a diagnosis Wave 5 showed to be wrong.** The failures came from a stale test binary left by the mutation harness (it restored sources with their original timestamps, so Cargo did not rebuild). The zero-bound timeout test was replaced anyway, because a stand-in Git that never answers is a better and genuinely deterministic test; the weakening of the no-mutation test was reverted in Wave 5.

To make the read-only guarantee provable instead of asserted, the four invocations became one named list (`READ_ONLY_INVOCATIONS`) and the command construction was split out, so `every_invocation_runs_read_only_and_offline` checks — without running Git — that every invocation uses a read-only verb, carries no flag that could reach a remote, runs in the observed folder, and sets `GIT_OPTIONAL_LOCKS=0` and `GIT_TERMINAL_PROMPT=0`. Measured separately (scratch diagnostic, operator's real Git configuration): with `GIT_OPTIONAL_LOCKS=0` none of the four commands rewrites `.git/index`; without it, `git status` does.

Mutation probes after the change — deadline ignored, kill skipped, readers joined on timeout, optional locks dropped, `fetch` added to the invocation list, wrong working directory, `dirty` always false, `not-a-repo` ignored, and the five Freshness mutations — **all killed** (the three timeout-related ones by the new stand-in test, the environment one by the structural test).

### Release build and isolated-desktop UI smoke (release exe SHA-256 `40bf09a8e2570cee9567aa851f1e70b782eb1c3848f3eb408fa5d59c4131933e`, built from `5ec54a9`)

All three parts ran on a hidden isolated desktop with a dedicated `DVCC_DATA_DIR`, against synthetic repositories (`repo-alpha` clean, `repo-beta` dirty, `plain-folder` not a repository). No clipboard write, nothing opened externally, no window on the operator's desktop.

| Part | Checks | Result |
|---|---|---|
| Seed (fresh data folder) | three projects and three reviews created; before any refresh every Freshness is `UNKNOWN` with "Git state has not been observed." and no observation status (no automatic refresh); **Refresh Git state** on the selected project → `ALIGNED`, observed HEAD equals the repository HEAD, branch `dvcc-main`, working tree `Clean`, observed time shown, recorded expected HEAD unchanged, Review State unchanged (`NEW`), the other two projects still unobserved; **Refresh Git (all)** → beta `WORKTREE_DIRTY` ("Local working tree has uncommitted changes.", working tree "Uncommitted changes"), gamma `UNKNOWN` with "Not a Git repository" and no guessed HEAD; no error toast | **PASS** (21 assertions) |
| Restart (same data folder, after a new commit in repo-alpha) | three projects and three reviews restored; **every Freshness back to `UNKNOWN`** with "Git state has not been observed." (AC2-13); recorded expected HEAD survived unchanged; refresh → `HEAD_CHANGED` with the explanation naming both short HEADs, observed HEAD is the new commit, recorded expected HEAD still the recorded one, Review State still `NEW`; no error toast | **PASS** (11 assertions) |
| Refresh-only (repository snapshot around a real observation) | 58 files under the three repositories hashed before and after a Refresh All from the app | **byte-identical** (AC2-14 at runtime) |

The operator's real data folder was not touched: `%APPDATA%\DevVault-Control` still shows its pre-run timestamps (17:06:50, from the operator's own instance) and no DVCC or WebView2 process was left behind by any run.

### Convergence checks at the frozen head `5ec54a9`

| Check | Result |
|---|---|
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets` | PASS — 0 warnings |
| `cargo check` | PASS |
| `cargo test` | PASS — 62 passed, 1 ignored (4 consecutive full-suite runs after the fix) |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 16 files, 487 tests |
| `npm run build` | PASS |
| `npm run tauri build -- --no-bundle` | PASS — no bundle directory |
| Windows app launch smoke / persistence round trip (project instruction checks) | PASS — part of the UI smoke above (launch, create, restart, restore) |

Diff versus `main` (`f557aa6`), excluding run artifacts: 21 files, +1 925 / −10. No dependency, capability or `tauri.conf.json` change (`contract/limits.json` gained one field). Nothing outside the authorized Phase 2 scope; product code carries no absolute local path.

## Wave 5 — independent verification and repair (2026-09-20)

An independent context (separate session, read-only, no build or app launch) audited the frozen head `5ec54a9` against the Task Packet. Its findings are recorded here in full because several were correct and two were defects.

| Finding | Verdict after repair |
|---|---|
| **F2 (high)** The bound was still unbounded on the *success* path: the readers were joined without a deadline, so a child that exits while leaving a grandchild holding the pipes kept the observation running (reproduced: 11.1 s against a 300 ms bound). | **Fixed.** Draining is bounded by the same deadline (`join_bounded`); if the pipes are still held, the observation fails closed as `TIMEOUT`. New test: a stand-in Git that exits at once and leaves a lingering child — the observation ends at the bound. |
| **F1 (high)** Excluding `.git/index` from the byte comparison left the read-only guarantee resting only on a static environment assertion; the substitute (`git ls-files --stage`) is provably insensitive to an index refresh. | **Fixed.** The byte comparison covers every file again. The exclusion had been introduced for a flake that did not exist (see F9). |
| **F9 (info, root cause of two wrong Wave-4 conclusions)** The mutation harness restored sources with `shutil.copy2`, preserving their timestamps, so Cargo reused the mutated binary: `cargo test` in the checkout failed against correct sources. | **Fixed.** The harness now rewrites the source content and touches it, and the final suites were re-run from a clean build. |
| **F4 (medium)** The boundary validated the *folder*; a `.git` file, `core.worktree` or an alternates entry can point Git at another location, including a network one. | **Fixed.** After confirming a work tree, the observation resolves `rev-parse --show-toplevel` and `--absolute-git-dir` and puts **both** through the same local-folder boundary before any fact is used. |
| **F6 (medium)** Any `symbolic-ref` failure was reported as `detached: true`, including an unreadable HEAD — a guessed fact. | **Fixed.** Exit code 1 (not a symbolic ref) means detached; anything else leaves `detached` and `branch` unknown. Test with a corrupted `HEAD`. |
| **F7 (low)** The child inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_PARAMETERS` and similar, which would describe a different repository. | **Fixed.** Nine redirecting `GIT_*` variables are removed from every child, asserted by the structural test. |
| **F5 (medium)** A recorded value that cannot be compared on one axis suppressed a decidable difference on the other (`§4.9` says `HEAD_CHANGED`, the code said `UNKNOWN`). | **Fixed.** Both comparisons are evaluated before anything is decided; three contract rows were added for the combinations. |
| **F3 (medium)** `git status` executes a clean filter or file-system monitor configured **in the observed repository** — proved by the verifier with a probe script. | **Mitigated and documented.** Every invocation now runs with `-c core.fsmonitor=false`; the remaining behaviour (a repository's own filters run when Git reads it) is stated in the README and the data contract and recorded as QD-002. |
| **F10 (info)** `FRESHNESS_ATTENTION` was exported and used nowhere. | **Removed**; queue ordering stays exactly as in Phase 1. |
| **F11 (info)** An observation stayed on screen after a project's local root changed. | **Fixed.** The observed root is kept with the observation and it is only shown while it still matches the project's root. |
| **F8 (low)** Reader threads detached on the timeout path can stay blocked until the pipes close. | **Recorded as QD-001** (bounded by the lingering process's own lifetime; a job-object tree kill would be the full fix). |

Overstated claims the verifier found in this file were corrected in place: the behavioural index-rewrite kill (no longer true at `5ec54a9`, true again after the repair), "one deadline for the whole observation" (was only true for the running-child path), the row count of the contract table, and the Wave-1 sentence about hashing every file including `.git`.

Its verdicts on everything else matched the implementer's: no Phase 1 regression, no write path for the observation, no persistence, no caller influence on the Git program or arguments (it probed a planted `git.bat` in the working directory and the real Git still ran), and no leak of paths in error messages.

### Wave 5 verification at the repaired head `161903e`

Clean build (`cargo clean -p devvault-control-center` first, so no stale binary can be served):

| Check | Result |
|---|---|
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets` | PASS — 0 warnings |
| `cargo test` | PASS — **66 passed, 2 ignored** (the mapped-drive launcher test and the new mapped-drive repository test) |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 16 files, **493 tests** |
| `npm run build` | PASS |
| `npm run tauri build -- --no-bundle` | PASS — release exe SHA-256 `e4c086690389c6b069eb86af7b5954e4da6abd175ac4202018197a69b1dde1a7` |
| `a_resolved_repository_on_a_mapped_drive_is_refused` (ignored test, run once with a temporary `net use W: \\localhost\C$` mapping) | PASS — a work tree whose Git directory resolves onto the mapped drive is refused by the boundary with no facts; the mapping and its scratch folder were removed afterwards |

Mutation probes, re-run with a harness that rewrites sources with a fresh timestamp (so Cargo always rebuilds): **15 / 16 killed**, including deadline ignored, kill skipped, **drain unbounded**, optional locks dropped, redirecting `GIT_*` kept, **resolved location unchecked** (killed by the mapped-drive test), detached guessed, dirty always false, and six Freshness / observation mutations. The single survivor — removing the `--is-inside-work-tree` check — is an equivalent mutant: the resolution step that follows refuses exactly the same folders (`NOT_A_GIT_REPOSITORY`).

Isolated-desktop UI smoke re-run on the repaired binary: seed **PASS**, restart **PASS**, refresh-only with a repository snapshot **PASS** (58 files byte-identical before and after a real Refresh All). No DVCC or WebView2 process left behind; the operator's real data folder untouched.

## Wave 6 — focused independent re-review of the repairs, and a Hard Boundary violation it exposed (2026-09-20)

A second independent context (again read-only, no build, no app launch) re-reviewed the Wave 5 repairs at `161903e`, building its own harness from unmodified copies of the source so it could run its own scenarios.

**It confirmed, with its own measurements:** the drain is bounded (its own stand-in child that exits while a grandchild holds the pipes returned at 314 ms against a 300 ms bound, `TIMEOUT`, no facts; 5 s bound → 5.014 s); the restored no-mutation test really does exercise the case where `git status` would rewrite `.git/index` (index hash unchanged with `GIT_OPTIONAL_LOCKS=0`, rewritten without it); `branch_from_symbolic_ref` matches this Git (branch → 0, detached → 1, corrupt HEAD → 128, unborn branch → 0 + name); the Freshness precedence now matches §4.9 over 12 constructed inputs; `observationForRoot` is the only read path; and every check number in `RUN_STATE.md` reproduces on a clean build.

**It also found the following, which this wave repaired:**

| Finding | Repair |
|---|---|
| **Hard Boundary violation (found by the reviewer, not by the implementer): every Phase 2 commit had been made on local `main`.** The working branch ref never moved from `f557aa6`, so the pushes were no-ops and nothing of Phase 2 had reached the remote. Cause: a `git checkout main` ran at 17:02 while two read-only subagents were working; the implementer did not re-check the branch before committing. | Corrected with local ref moves only: `feat/evidence-freshness-v0.2` now points at the work, local `main` is back at `origin/main` (`f557aa6`), and the branch was pushed for real (12 commits). **Nothing was ever pushed to `main`** — `origin/main` is unchanged at `f557aa6` throughout, verified before and after. No history was rewritten and no commit was lost. |
| **R1 (medium):** `161903e` had gone through a CP932 round-trip — `src-tauri/src/git.rs` gained a UTF-8 BOM and ten em dashes / ellipses were mangled. Cause: a PowerShell `Set-Content -Encoding utf8` step in the probe harness. | File restored (no BOM, characters repaired); the probe harness writes through Python with explicit UTF-8 only. |
| **R2 (medium):** `objects/info/alternates` was named in the claim but never checked — the reviewer showed a repository whose alternates pointed at `//localhost/C$/objects` observed as `OK` with full facts. | Every entry of `<git-dir>/objects/info/alternates` (absolute or relative to the object store, comments and quotes handled) now goes through the same local-folder boundary; a network entry fails the observation closed with a reason naming the alternate store. Two tests. |
| **R3 (low):** the configuration family (`GIT_CONFIG_COUNT` / `KEY_n` / `VALUE_n`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM`, `GIT_CEILING_DIRECTORIES`) was not removed, so the data contract's "configuration" wording was false. | The list grew from 9 to 14 variables; the structural test asserts each one is removed, and the data contract names them. |
| **R4 (low):** an observation could survive a project being deleted and recreated under the same (Human-typed) id and root. | The observation now carries the project's `createdAt` as well as its root, and is shown only while both still match. |
| **R5 (low):** `-c core.fsmonitor=false` needs Git ≥ 2.36 (older Git treats it as a hook path), and no minimum version was declared. | README states the requirement. |
| Claim corrections it demanded | The oracle row count (31, not 29), the AC2-14 wording (the index exclusion was reverted), the alternates and configuration sentences, and the mapped-drive test's vacuous pass when `DVCC_TEST_MAPPED_DRIVE_DIR` is unset — all corrected in these artifacts. |

Its remaining open point, recorded rather than repaired: the ignored mapped-drive test passes vacuously when the environment variable is unset (the Phase 1 convention: it prints `SKIPPED`). Evidence for it is only valid when the run states that the variable was set — this run did set it once (`net use W: \\localhost\C$`, removed afterwards).

### Wave 6 verification after the repairs

Clean build again (`cargo clean -p devvault-control-center`): `cargo fmt --check` PASS · `cargo clippy --all-targets` PASS (0 warnings) · `cargo test` **68 passed, 2 ignored** · `npx tsc --noEmit` PASS · `npx vitest run` **16 files, 494 tests** · `npm run build` PASS · `npm run tauri build -- --no-bundle` PASS (release exe SHA-256 `9fd7c6702dc487c922ec4adbfc33241a5aba7eff8e15bd7c734dfcf9bb974537`).

Isolated-desktop UI smoke re-run on that binary: seed **PASS**, restart **PASS**, refresh-only **PASS** with the three synthetic repositories **byte-identical** (58 files) before and after a real Refresh All. No DVCC or WebView2 process left behind; `%APPDATA%\DevVault-Control` still shows its pre-run timestamp (17:06:50, from the operator's own instance).

Git state after the branch correction: `feat/evidence-freshness-v0.2` = the work (12 commits ahead of `main` at that point), local `main` = `origin/main` = `f557aa6f15222099f54790180e0ff71c5291734a`, working tree clean, and the branch pushed to the remote for the first time.
