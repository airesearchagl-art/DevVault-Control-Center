# Run State

- Run ID: LR-20260920-DVCC-002
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: RUNNING — Wave 2 (TypeScript observation model, HEAD comparison, Freshness derivation) complete
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/evidence-freshness-v0.2
- Base SHA: f557aa6f15222099f54790180e0ff71c5291734a
- Current head: Wave 2 checkpoint commit (parent 3b33d7527f891f44d7a2f175c3ad4abbcee8a2f8, the Wave 1 checkpoint)
- Current wave: Wave 2 → Wave 3 (UI integration)
- Last successful checkpoint: Wave 2 checkpoint
- Task Packet ID: LRP-20260920-DVCC-002
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260920-DVCC-002/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: b9ecd5c0d1a9d8388cc212072c3c08a5a57a45af90035c4f2a2232688a6f9dd8 (verified at this checkpoint: match)

## Objective

Phase 2 — Evidence / Freshness v0.2: observe current **local** Git facts read-only, keep them strictly separate from the Human-recorded `expectedHead` / `reviewedHead`, and present **Freshness** as derived state (ALIGNED / HEAD_CHANGED / REVIEW_STALE / WORKTREE_DIRTY / UNKNOWN) with an explanation, without ever changing Review State. Local Git facts only: no GitHub API, no network Git operation, no persistence of the volatile observation.

## Acceptance Criteria

- [ ] AC2-01 feature branch created from the fresh `origin/main` merge commit — evidence: branch `feat/evidence-freshness-v0.2` created from `origin/main` @ f557aa6 (preflight, EVIDENCE.md)
- [x] AC2-02 current full HEAD of a local Git repository obtained read-only — Rust test `observes_a_clean_repository` (40-char SHA); UI half pending Wave 3
- [x] AC2-03 branch / detached state determined — Rust tests `observes_a_clean_repository`, `a_detached_head_is_reported_without_a_branch`
- [x] AC2-04 clean / dirty working tree determined — Rust tests for clean, modified tracked file and untracked file
- [x] AC2-05 UNC / network localRoot not inspected — `the_local_folder_boundary_refuses_network_and_invalid_paths` (refused before any Git process, Phase 1 validator reused)
- [x] AC2-06 Git unavailable / not-a-repo / timeout fail closed — Rust tests for `GIT_UNAVAILABLE`, `NOT_A_GIT_REPOSITORY`, `TIMEOUT`, `NO_LOCAL_ROOT`; the UNKNOWN mapping itself is Wave 2
- [ ] AC2-07 a refresh never changes expectedHead / reviewedHead
- [x] AC2-08 the five Freshness states derived exactly as contracted — 29-row independent oracle in `src/test/freshnessContract.ts` checked against `deriveFreshness`
- [ ] AC2-09 a Freshness change never changes Review State
- [ ] AC2-10 Refresh Git State works for the selected project
- [~] AC2-11 Refresh All runs sequentially — `observeSequentially` proven single-flight by `src/services/git.test.ts`; UI wiring pending Wave 3
- [ ] AC2-12 Freshness and its reason visible in queue and detail
- [ ] AC2-13 after an app restart the observation is UNKNOWN again
- [x] AC2-14 no unintended mutation of a test repository — `observing_does_not_modify_the_repository` (content hashes of every file incl. `.git`, three observations)
- [x] AC2-15 no network operation — only four read-only local subcommands; `GIT_TERMINAL_PROMPT=0`; no remote-contacting command exists in the module (re-checked in Final Convergence)
- [ ] AC2-16 no regression in Phase 1 persistence / review workflow
- [ ] AC2-17 Windows release build and isolated UI smoke PASS
- [ ] AC2-18 runtime fixtures contain no real user project and no secret

## Completed

- Wave 0: fresh Git preflight (origin/main = f557aa6, clean tree, no pre-existing Phase 2 branch, toolchain verified); working branch created from origin/main; Task Packet revision 1 written, digest bound; route and project documents read read-only from the vault's current main; repository architecture / reuse scan (delegated, read-only).

## Current implementation state

Waves 1-2 complete: `src-tauri/src/git.rs` (read-only observation, bounded timeout, fail-closed statuses, ISO-8601 `observedAt`); `src/domain/git.ts` (fail-closed model), `src/domain/freshness.ts` (comparison + derivation + explanations), `src/services/git.ts` (port, Tauri adapter, sequential Refresh All); `contract/limits.json` + `src/domain/limits.ts` share `gitObservationTimeoutMs`. Nothing is wired into the UI yet and no Phase 1 behaviour is changed.

## Checks

Wave 1: `cargo fmt --check` PASS, `cargo clippy --all-targets` PASS (0 warnings), `cargo test` PASS (61 passed, 1 ignored). Wave 2: `npx tsc --noEmit` PASS, `npx vitest run` PASS (16 files, 485 tests; was 426 at `f557aa6`).

## Quality Debt

None open (see QUALITY_DEBT.md).

## Explicit unverified items

- AC2-09..AC2-13 and AC2-16..AC2-18 (Waves 3-4 not started); the UI halves of AC2-02..AC2-06 and AC2-11; AC2-07 is proven at the derivation level, its UI half is pending.
- No GitHub CI exists for this repository (0 status contexts, no Actions workflow); every check is local.

## Known failures

none

## Decisions

See DECISIONS.md (L2-001..L2-009).

## Files changed

`src-tauri/src/git.rs` (new), `src-tauri/src/lib.rs`, `contract/limits.json`, `src/domain/git.ts` (new), `src/domain/freshness.ts` (new), `src/domain/limits.ts`, `src/services/git.ts` (new), tests `src/domain/git.test.ts`, `src/domain/freshnessContract.test.ts`, `src/services/git.test.ts`, `src/test/freshnessContract.ts`, `src/domain/limits.test.ts`, and `.agent-run/LR-20260920-DVCC-002/*`.

## Remaining tasks

Wave 1 (Rust Git inspection boundary), Wave 2 (TypeScript model + Freshness derivation), Wave 3 (UI integration), Wave 4 (synthetic repositories, release UI smoke, regression, docs), Final Convergence, Independent Verification, Draft PR.

## Next action

Wave 3: UI integration - Git Evidence card and Freshness badge with explanation in the review detail, a Freshness badge on queue rows, Refresh Git State (selected) and Refresh All (sequential), with the observation kept in memory only.

## Stop conditions status

No stop condition triggered. Available memory at preflight: 13.59 GiB (heavy verification gate: 12 GiB). Hard Boundary items (main commit, Ready, merge, release, Production, Notion / vault write, network Git, shell execution) remain prohibited.

## Resume instructions

1. Verify `RUN_MANIFEST.md` binding; recompute SHA-256 of `TASK_PACKET_SNAPSHOT.md` (must equal b9ecd5c0d1a9d8388cc212072c3c08a5a57a45af90035c4f2a2232688a6f9dd8).
2. Verify repository / branch `feat/evidence-freshness-v0.2` / base f557aa6 / head = latest checkpoint commit / clean working tree.
3. `npm ci` (if `node_modules` is absent), `npx vitest run`, `cargo test` (in `src-tauri`) as targeted smoke.
4. Continue from "Next action". Any mismatch → BLOCKED and escalate to the Human.
