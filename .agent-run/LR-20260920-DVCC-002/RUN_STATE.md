# Run State

- Run ID: LR-20260920-DVCC-002
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: RUNNING — Wave 4 in progress (documentation and mutation probes done; release build and isolated UI smoke waiting for the operator's own DVCC instance to close)
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/evidence-freshness-v0.2
- Base SHA: f557aa6f15222099f54790180e0ff71c5291734a
- Current head: Wave 4 part-1 checkpoint commit (after `edd8868` Wave 3, `5e991a8` docs, `80fcc21` strengthened read-only test)
- Current wave: Wave 4 (docs and mutation probes complete; release build + isolated UI smoke pending an environment condition)
- Last successful checkpoint: Wave 4 part-1 checkpoint
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
- [x] AC2-07 a refresh never changes expectedHead / reviewedHead — derivation returns them unchanged; the observation action touches no review data (reducer test)
- [x] AC2-08 the five Freshness states derived exactly as contracted — 29-row independent oracle in `src/test/freshnessContract.ts` checked against `deriveFreshness`
- [x] AC2-09 a Freshness change never changes Review State — the `gitObserved` action writes only the observation slice; reducer test asserts every other slice keeps its identity
- [~] AC2-10 Refresh Git State works for the selected project — wired (`action-refresh-git`); runtime half in Wave 4
- [~] AC2-11 Refresh All runs sequentially — `observeSequentially` proven single-flight by `src/services/git.test.ts` and wired to `btn-refresh-all-git`; runtime half in Wave 4
- [~] AC2-12 Freshness and its reason visible in queue and detail — badge + explanation in the detail card, badge with tooltip on queue rows; runtime half in Wave 4
- [~] AC2-13 after an app restart the observation is UNKNOWN again — no start-up observation and an empty initial slice (reducer test); runtime half in Wave 4
- [x] AC2-14 no unintended mutation of a test repository — `observing_does_not_modify_the_repository` (content hashes of every file incl. `.git`, three observations)
- [x] AC2-15 no network operation — only four read-only local subcommands; `GIT_TERMINAL_PROMPT=0`; no remote-contacting command exists in the module (re-checked in Final Convergence)
- [ ] AC2-16 no regression in Phase 1 persistence / review workflow
- [ ] AC2-17 Windows release build and isolated UI smoke PASS
- [ ] AC2-18 runtime fixtures contain no real user project and no secret

## Completed

- Wave 0: fresh Git preflight (origin/main = f557aa6, clean tree, no pre-existing Phase 2 branch, toolchain verified); working branch created from origin/main; Task Packet revision 1 written, digest bound; route and project documents read read-only from the vault's current main; repository architecture / reuse scan (delegated, read-only).

## Current implementation state

Waves 1-3 complete: `src-tauri/src/git.rs` (read-only observation, bounded timeout, fail-closed statuses, ISO-8601 `observedAt`); `src/domain/git.ts` (fail-closed model), `src/domain/freshness.ts` (comparison + derivation + explanations), `src/services/git.ts` (port, Tauri adapter, sequential Refresh All); `contract/limits.json` + `src/domain/limits.ts` share `gitObservationTimeoutMs`; the UI shows a Git evidence card, queue badges and the two refresh actions, with the observation held in a memory-only `gitObservations` slice. No Phase 1 behaviour is changed.

## Checks

Wave 1: `cargo fmt --check` PASS, `cargo clippy --all-targets` PASS (0 warnings), `cargo test` PASS (61 passed, 1 ignored). Wave 2: `npx tsc --noEmit` PASS, `npx vitest run` PASS (16 files, 485 tests; was 426 at `f557aa6`). Wave 3: tsc PASS, vitest PASS (487 tests), `npm run build` PASS. Wave 4 so far: `cargo test` PASS (62 passed, 1 ignored) with the strengthened read-only test; mutation probes 9 / 9 killed.

## Quality Debt

None open (see QUALITY_DEBT.md).

## Explicit unverified items

- Runtime halves of AC2-02..AC2-06 and AC2-10..AC2-13 (Wave 4 UI smoke), AC2-16..AC2-18 (Wave 4).
- No GitHub CI exists for this repository (0 status contexts, no Actions workflow); every check is local.

## Known failures

none

## Decisions

See DECISIONS.md (L2-001..L2-009).

## Files changed

Rust: `src-tauri/src/git.rs` (new), `src-tauri/src/lib.rs`. Contract: `contract/limits.json`. Domain / services: `src/domain/git.ts` (new), `src/domain/freshness.ts` (new), `src/domain/limits.ts`, `src/services/git.ts` (new). UI: `src/app/App.tsx`, `src/app/appState.ts`, `src/app/App.css`, `src/components/StateBadge.tsx`, `src/features/reviews/ReviewDetail.tsx`, `src/features/reviews/ReviewQueue.tsx`. Tests: `src/domain/git.test.ts`, `src/domain/freshnessContract.test.ts`, `src/services/git.test.ts`, `src/test/freshnessContract.ts`, `src/domain/limits.test.ts`, `src/app/appState.test.ts`. Plus `.agent-run/LR-20260920-DVCC-002/*`.

## Remaining tasks

Wave 1 (Rust Git inspection boundary), Wave 2 (TypeScript model + Freshness derivation), Wave 3 (UI integration), Wave 4 (synthetic repositories, release UI smoke, regression, docs), Final Convergence, Independent Verification, Draft PR.

## Next action

Run `npm run tauri build -- --no-bundle` and the two-part isolated-desktop UI smoke (seed + restart) as soon as the operator's own DVCC instance is closed; then Final Convergence, Independent Verification and the Draft PR.

## Stop conditions status

No hard stop condition triggered. Environment condition (not a product failure): the operator's own DVCC instance has been running since 17:06 with the real `%APPDATA%\\DevVault-Control` folder locked, which holds the release executable open and — because the single-instance guarantee is session-wide — would make any test launch hand over to that window. The Human was asked and chose to close it; the release build and the UI smoke wait for that. No process of the operator's was terminated. Available memory 12.2–12.7 GiB, above the 12 GiB gate but watched before every heavy step. Hard Boundary items (main commit, Ready, merge, release, Production, Notion / vault write, network Git, shell execution) remain prohibited.

## Resume instructions

1. Verify `RUN_MANIFEST.md` binding; recompute SHA-256 of `TASK_PACKET_SNAPSHOT.md` (must equal b9ecd5c0d1a9d8388cc212072c3c08a5a57a45af90035c4f2a2232688a6f9dd8).
2. Verify repository / branch `feat/evidence-freshness-v0.2` / base f557aa6 / head = latest checkpoint commit / clean working tree.
3. `npm ci` (if `node_modules` is absent), `npx vitest run`, `cargo test` (in `src-tauri`) as targeted smoke.
4. Continue from "Next action". Any mismatch → BLOCKED and escalate to the Human.
