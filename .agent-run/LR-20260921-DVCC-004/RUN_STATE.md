# Run State

- Run ID: LR-20260921-DVCC-004
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: RUNNING — Wave 4 complete (canonical prompts, exact-head readiness, Freshness surface, refusal reasons, docs)
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/review-workflow-v0.3
- Base SHA: 4c1962b0c47321805554be2218bba996ff5de92f
- Current head: the Wave 4 evidence record on top of `cc36a825d2ee6deb79f8dc485e5ef16259ae4b72` (Wave 4 product commit); see `git log`
- Current wave: Wave 4 complete → Wave 5 (verification)
- Last successful checkpoint: Wave 4 checkpoint (`cc36a82`)
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
- [~] RW-11 past request / result / checkpoint artifacts are never rewritten automatically — saved requests are never regenerated, handoffs name earlier files without touching them; running-app check in Wave 5
- [x] RW-12 the review timeline reads per round, by grouping the existing events file
- [~] RW-13 Phase 2 Freshness stays separate from Review State — own card, no callback but the Human's refresh, asserted by render tests and M-D4; running-app check in Wave 5
- [~] RW-14 UNKNOWN is never filled in by guesswork — the domain reports `UNDECIDABLE` and `UNAVAILABLE` instead of guessing, and the surface shows them; Freshness UNKNOWN shows its reason and its kind (M-D3); running-app check in Wave 5
- [~] RW-15 JA / EN parity — dictionaries, accessible structure and prompts checked in both languages; running-app check in Wave 5
- [x] RW-16 new workflow prompts are semantically equal in JA and EN — line-by-line parity of kind, recorded values, placeholders and imperative strength (M-D2)
- [~] RW-17 existing Phase 1 / 2 / Localization runtime data still loads — asserted against the v1 fixture, with a mutation probe; the running app is verified in Wave 5
- [ ] RW-18 no ChatGPT login, send or scrape
- [ ] RW-19 no GitHub API automation
- [ ] RW-20 no IDE bridge brought forward from Phase 4
- [~] RW-21 a locale switch changes no workflow or domain data — asserted on rendered state and a frozen session; running-app check in Wave 5
- [ ] RW-22 Security / Privacy / Permission / Data integrity / Irreversible-data safety PASS
- [ ] RW-23 isolated-desktop workflow smoke PASS
- [x] RW-24 README and data contract reconciled to the fresh product state — with a static check that the contract names every round field, event type and stored code

## Completed

- Wave 0: fresh preflight; branch from `origin/main`; Task Packet revision 1 snapshot bound by
  digest; canonical review contract discovery — two delegated read-only scans, then this session read
  the load-bearing sources itself, and finally the whole set was re-bound to the repository's latest
  main after the scans showed the working vault copy was stale; SPEC_GAP gate assessed and passed;
  data model and workflow design decided (RW-004..RW-012).

## Current implementation state

Wave 4: Turn 1 now follows the canonical Stage 1 / Stage 2 headings and Turn 2 the Stage 3 / Stage 4
ones, with the anchoring boundary tested in both languages; a request says whether it is bound to an
exact 40-character HEAD; Freshness is shown in the workflow with its reason and the kind of UNKNOWN,
and changes nothing else; every refused workflow control shows the domain's refusal and the next step;
README and the data contract describe Phase 3 as it is.

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

Phase 1, Phase 2 and Localization behave exactly as before, and `schemaVersion` is still 1. Wave 4 is
complete; what is not done yet is every check that needs the running application (Wave 5).

## Checks

Wave 4: `npx tsc --noEmit` PASS, `npx vitest run` PASS (31 files, 852 tests), `npm run build` PASS,
`git diff --check` clean. Five mutation probes (M-D1..M-D5), each CAUGHT and restored byte-identical.
`src-tauri/` untouched, so the Rust suite was not re-run.

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

- Wave 5 running-app verification: nothing from Wave 3 or Wave 4 has been exercised in the running
  application yet. The Wave 4 surface is verified by rendering the components to markup in both
  languages (no browser, no WebView2, no screen reader).
- RW-11, RW-13, RW-14, RW-15, RW-17, RW-21: asserted in tests; the running app is Wave 5.
- The Turn 2 narrative parameter exists in the domain; the interface does not yet offer a field for
  it, so Turn 2 still asks the Human to fill items 7/8 in the copied text.
- RW-23: the isolated-desktop running-app smoke has not run yet (Wave 5).
- RW-24: complete (Wave 4, `cc36a82`).
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

Wave 4: new `src/domain/{headBinding,actionRefusal,freshnessCause}.ts`,
`src/features/reviews/ReviewFreshness.tsx`, tests `src/domain/{promptContract,headBinding}.test.ts`,
`src/features/reviews/workflowSurface.test.ts`, `src/test/docsContract.test.ts`; changed
`src/domain/prompt{,.test}.ts`, `src/features/reviews/{ReviewDetail,ReviewDialogs,ReviewEvidence,ReviewWorkflow}.tsx`,
`src/components/{ActionButton,Dialog}.tsx`, `src/app/App.css`, `src/i18n/{ja,en,index}.ts`,
`README.md`, `docs/data-contract-v1.md`.

## Next action

Wave 5: full regression (frontend and Rust), synthetic workflow scenarios, the isolated-desktop UI
smoke of the workflow in both languages, restart persistence, same-head suppression and the
re-review round trip.

## Remaining tasks

- Wave 5 (regression, scenarios, isolated-desktop smoke).
- Final Convergence, Independent Verification in a separate context, Draft PR.
- Phase 4 stays blocked until Phase 3 merges.
