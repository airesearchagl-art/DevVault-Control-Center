# Run State

- Run ID: LR-20260921-DVCC-004
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: RUNNING — Wave 3 complete (the workflow is reachable in both languages)
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/review-workflow-v0.3
- Base SHA: 4c1962b0c47321805554be2218bba996ff5de92f
- Current head: `ef9c3d756b4a697ad75347a5605bf6c7911291c2` (Wave 3c/3d evidence record; last product commit `3175a7c`)
- Current wave: Wave 3 complete (3a domain actions, 3b service layer, 3c protocol UI, 3d duplicates and evidence) → Wave 4
- Last successful checkpoint: Wave 3d checkpoint (`3175a7c`)
- Task Packet ID: LRP-20260921-DVCC-004
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260921-DVCC-004/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 22673c39c5136e0785ed9ca1a5a4367ce154916c1c62f872635c6d303469db92 (verified at this checkpoint: match)

## Objective

Grow the Review Hub that can store a review session into a Review Workflow the Human can walk
without losing the thread: preparation → fresh reviewer context → review request → evidence →
result capture → Required Fix → re-review → final pass. ChatGPT itself is not automated; the review
surface stays Human-operated.

## Canonical contract

Bound to `airesearchagl-art/obsidian-vault` **main @ `77ce41e6ff9e243ac2c8dc37ee29f5d5f4f24157`**
(2026-09-21T04:34:07Z), read read-only with the Human's explicit authorization. The working vault
copy is 2026-09-03 and stale — it lacks the Tier 2 Review Execution Contract, where evidence reuse is
defined; the 2026-09-16 mirror is byte-identical to latest main for both load-bearing files.
`CANONICAL_REVIEW_CONTRACT.md` records every concept with its file, line numbers and canonical lines.

SPEC_GAP gate: **passed at `77ce41e`**. Every trigger is answered by a canonical line, including the
one that looked silent in the stale copy: a second substantive review of the same head is prohibited
**unless a 合理的な失効理由 is stated** (Depth Tiering line 46), which is what Phase 3 implements
(DECISIONS RW-012). No free-form override and no standing permission exist.

## Acceptance Criteria

- [x] RW-01 branch created from fresh merged main `4c1962b`
- [x] RW-02 canonical contract discovered at latest main `77ce41e` and recorded with line-level citations; SPEC_GAP assessed and passed
- [x] RW-03 Fresh Context Turn 1 / Turn 2 — domain, both artifacts, the service path and the surface; the prompt rework is Wave 4
- [x] RW-04 Risk Tier 0 / 1 / 2 — values, subjects, escalation, refusal, persistence and the Human's own selection surface
- [x] RW-05 Risk Tier independent of Review / Resource / Freshness — its module imports none of them, asserted by a test
- [x] RW-06 same-head duplicate detected — pure function over Phase 2's `compareHead`, nine oracle cases, mutation M1
- [x] RW-07 duplicates are shown to the Human; never silently skipped or auto-closed — named, with the canonical rule and the two permission-free paths, and no override button
- [x] RW-08 evidence reuse implemented only as the canonical contract allows — per item, bound to the head, derived Freshness excluded
- [x] RW-09 reused evidence shows source, head and age, with the reason it is offered
- [x] RW-10 FIX_REQUIRED hands off to re-review without losing the round relation — both models, and the card that reads them
- [ ] RW-11 past request / result / checkpoint artifacts are never rewritten automatically
- [x] RW-12 the review timeline reads per round, by grouping the existing events file
- [ ] RW-13 Phase 2 Freshness stays separate from Review State
- [~] RW-14 UNKNOWN is never filled in by guesswork — the domain reports `UNDECIDABLE` and `UNAVAILABLE` instead of guessing, and the Wave 3 surface shows them; the Freshness UNKNOWN surface follows in Wave 4
- [ ] RW-15 JA / EN parity
- [ ] RW-16 new workflow prompts are semantically equal in JA and EN
- [~] RW-17 existing Phase 1 / 2 / Localization runtime data still loads — asserted against the v1 fixture, with a mutation probe; the running app is verified in Wave 5
- [ ] RW-18 no ChatGPT login, send or scrape
- [ ] RW-19 no GitHub API automation
- [ ] RW-20 no IDE bridge brought forward from Phase 4
- [ ] RW-21 a locale switch changes no workflow or domain data
- [ ] RW-22 Security / Privacy / Permission / Data integrity / Irreversible-data safety PASS
- [ ] RW-23 isolated-desktop workflow smoke PASS
- [ ] RW-24 README and data contract reconciled to the fresh product state

## Completed

- Wave 0: fresh preflight; branch from `origin/main`; Task Packet revision 1 snapshot bound by
  digest; canonical review contract discovery — two delegated read-only scans, then this session read
  the load-bearing sources itself, and finally the whole set was re-bound to the repository's latest
  main after the scans showed the working vault copy was stale; SPEC_GAP gate assessed and passed;
  data model and workflow design decided (RW-004..RW-012).

## Current implementation state

The workflow is reachable. A Review workflow card shows where the Human stands in the two-turn
protocol and carries its three operations; a Duplicates and evidence card shows a same-head
duplicate with the canonical rule and its two permission-free paths, and rates the evidence DVCC
holds against the head under review; a Handoff card reads the two domain handoff models; and the
events card reads per round. Every control's enabled state comes from the function that refuses the
action, and the service path refuses the same operations with no interface involved.

The five Phase 3 operations are now `ReviewAction`s, guarded by the same functions the interface
reads, and the two-turn protocol reaches disk: Turn 2 is generated in both languages and saved as
`followup-r<N>.md`, and the Final Judgment is captured into `judgment-r<N>.md` beside the Fresh
Assessment, with its own replacement archive. `ReviewHub` exposes both as `saveFollowup` and
`captureJudgment`.

The Phase 3 domain is in place as pure functions with an independent contract table behind them,
and it is persisted: six optional round fields, two new round artifacts (`followup-r<N>.md`,
`judgment-r<N>.md`) with the allow-list extended on both sides of the boundary, five new
language-neutral event types with a closed typed `detail`, and the two handoff models.

The protocol's order is now closed at both ends: the parser refuses a round that skips a step, a
verdict waits for the Final Judgment once a Turn 2 has gone out, a follow-up cannot be rewritten once
it has been answered, and the Tier 2 subjects survive a restart so the canonical rule keeps applying.

Phase 1, Phase 2 and Localization behave exactly as before, and `schemaVersion` is still 1. What is
not done yet: the prompt rework and the Freshness surface of Wave 4, and every check that needs the
running application (Wave 5).

## Checks

Wave 3d: `npx tsc --noEmit` PASS, `npx vitest run` PASS (27 files, 745 tests), `npx vite build` PASS.
Four mutation probes (M-C1..M-C4), each CAUGHT and restored byte-identical.

Wave 3c: `npx tsc --noEmit` PASS, `npx vitest run` PASS (25 files, 733 tests), `npx vite build` PASS.

Wave 3b: `npx tsc --noEmit` PASS, `npx vitest run` PASS (24 files, 726 tests), `npx vite build` PASS.
Three mutation probes (M-B1..M-B3), each CAUGHT and restored byte-identical. `src-tauri/` untouched.

Wave 3a: `npx tsc --noEmit` PASS, `npx vitest run` PASS (23 files, 709 tests), `npm run build` PASS.

Wave 2.6: `npx tsc --noEmit` PASS, `npx vitest run` PASS (22 files, 687 tests), `npm run build` PASS
— all three run in a temporary worktree at `1c682cb` plus this wave's files, because the session's
working tree also holds changes to `src/domain/transitions.ts` and three files under `src/services/`
written by something outside this session. Those files were not staged, not committed and not
touched.

Wave 2.5: `npx tsc --noEmit` PASS, `npx vitest run` PASS (22 files, 679 tests), `npm run build` PASS.

Wave 2: `npx tsc --noEmit` PASS, `npx vitest run` PASS (22 files, 672 tests), `npm run build` PASS,
`cargo fmt --check` PASS, `cargo clippy --all-targets` PASS (0 warnings), `cargo test` PASS (68
passed, 2 ignored). Two mutation probes, both reverted.

Wave 1: `npx tsc --noEmit` PASS, `npx vitest run` PASS (21 files, 653 tests), `npm run build` PASS.
`src-tauri/` untouched, so the Rust suite was not re-run. Five mutation probes, each reverted: see
EVIDENCE. Toolchain: node v24.15.0, npm 11.12.1, rustc 1.95.0, git 2.53.0.windows.2.

## Quality Debt

Carried forward, out of scope unless Phase 3 makes one worse: QD-001 (reader threads detached after a
timeout), QD-002 (`git status` runs filters configured in the observed repository), and the
localization scanner's AST candidate. See QUALITY_DEBT.md.

## Explicit unverified items

- Wave 3 is complete: the workflow surface, Risk Tier, the duplicate warning, evidence reuse, the
  Required Fix / re-review handoff cards and the per-round timeline are reachable in JA and EN
  (27 files, 745 tests PASS; mutation M-B1..M-B3 and M-C1..M-C4 CAUGHT; no foreign writer since
  Wave 3 began). None of it has been exercised in the running app yet — that is Wave 5.
- RW-14: the surface for UNKNOWN / stale Freshness is Wave 4.
- RW-11, RW-13, RW-15, RW-16, RW-21: Wave 4 work (prompt rework, Freshness surface, parity), then
  Wave 5 running-app verification.
- RW-17: asserted against the v1 fixture; the running app is verified in Wave 5.
- RW-23, RW-24: the isolated-desktop smoke and the documentation reconciliation have not run.
- No GitHub CI exists for this repository; every check is local.

## Known failures

none from this session's work.

The foreign changes recorded below were present during Wave 2.6. They are no longer in the working
tree: at the start of Wave 3 the tree was clean at `1c682cb`, and it has been clean before and after
every Wave 3 commit. This session has been the single writer for Wave 3, as the Human directed, and
wrote its own implementation of those files rather than adopting what it had seen. The Wave 2.6
record is kept as written.

Historical (Wave 2.6): the working tree also held changes written outside this session —
`src/domain/transitions.ts` and `src/services/{persistence,reviewService,reviewHub}.ts` — which do
not compile on their own (they name translation keys that do not exist yet). They are left untouched
and unstaged for their owner, and Wave 3 must not modify those files until the ownership of those
changes is settled.

## Decisions

See DECISIONS.md (RW-001..).

## Files changed

New: `src/domain/{freshContext,riskTier,duplicate,revalidation,evidenceReuse,handoff}.ts`,
`src/domain/{workflowContract,persistenceContract}.test.ts`, `src/test/workflowContract.ts`.
Changed: `src/domain/{review,schema,events,transitions}.ts`, `src/services/{storage,reviewService}.ts`,
`src/test/memoryStorage.ts`, `src/i18n/{index,ja,en}.ts`, `src-tauri/src/storage.rs`,
`src/domain/transitionContract.test.ts`. Plus `.agent-run/LR-20260921-DVCC-004/*`.

## Next action

Wave 4: the prompt rework against the canonical Stage 1 headings, the accessibility pass, the
stale / unknown surface, the Freshness integration that never writes a Review State, and the README
and data-contract updates.

## Remaining tasks

- Wave 4 (prompts, accessibility, Freshness integration, README and
  data-contract updates), Wave 5 (regression, scenarios, isolated-desktop smoke).
- Final Convergence, Independent Verification in a separate context, Draft PR.
- Phase 4 stays blocked until Phase 3 merges.
