# Run State

- Run ID: LR-20260921-DVCC-004
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: RUNNING — Wave 1 complete (pure workflow domain with an independent oracle)
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/review-workflow-v0.3
- Base SHA: 4c1962b0c47321805554be2218bba996ff5de92f
- Current head: Wave 1 checkpoint commit
- Current wave: Wave 1 → Wave 2 (persistence and handoff)
- Last successful checkpoint: Wave 1 checkpoint
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
- [~] RW-03 Fresh Context Turn 1 / Turn 2 — the domain model is in place (Wave 1); the artifacts and the surface follow in Waves 2–4
- [~] RW-04 Risk Tier 0 / 1 / 2 — values, subjects, escalation and refusal implemented (Wave 1); persistence and display follow
- [x] RW-05 Risk Tier independent of Review / Resource / Freshness — its module imports none of them, asserted by a test
- [x] RW-06 same-head duplicate detected — pure function over Phase 2's `compareHead`, nine oracle cases, mutation M1
- [ ] RW-07 duplicates are shown to the Human; never silently skipped or auto-closed
- [ ] RW-08 evidence reuse implemented only as the canonical contract allows
- [ ] RW-09 reused evidence shows source, head and age
- [ ] RW-10 FIX_REQUIRED hands off to re-review without losing the round relation
- [ ] RW-11 past request / result / checkpoint artifacts are never rewritten automatically
- [ ] RW-12 the review timeline reads per round
- [ ] RW-13 Phase 2 Freshness stays separate from Review State
- [~] RW-14 UNKNOWN is never filled in by guesswork — the domain reports `UNDECIDABLE` and `UNAVAILABLE` instead of guessing; the surface follows in Wave 3
- [ ] RW-15 JA / EN parity
- [ ] RW-16 new workflow prompts are semantically equal in JA and EN
- [ ] RW-17 existing Phase 1 / 2 / Localization runtime data still loads
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

The Phase 3 domain exists as pure functions with an independent contract table behind them: the
Fresh Context turns and stages, the Risk Tier rules, same-head duplicate detection over Phase 2's
`compareHead`, revalidation permission by canonical reason code, and per-item evidence reuse.

Nothing is persisted, rendered or emitted yet: no session field, no event type, no artifact, no UI.
Phase 1, Phase 2 and Localization are untouched.

## Checks

Wave 1: `npx tsc --noEmit` PASS, `npx vitest run` PASS (21 files, 653 tests), `npm run build` PASS.
`src-tauri/` untouched, so the Rust suite was not re-run. Five mutation probes, each reverted: see
EVIDENCE. Toolchain: node v24.15.0, npm 11.12.1, rustc 1.95.0, git 2.53.0.windows.2.

## Quality Debt

Carried forward, out of scope unless Phase 3 makes one worse: QD-001 (reader threads detached after a
timeout), QD-002 (`git status` runs filters configured in the observed repository), and the
localization scanner's AST candidate. See QUALITY_DEBT.md.

## Explicit unverified items

- Everything except RW-01 and RW-02: implementation has not started.
- No GitHub CI exists for this repository; every check is local.

## Known failures

none

## Decisions

See DECISIONS.md (RW-001..).

## Files changed

New: `src/domain/{freshContext,riskTier,duplicate,revalidation,evidenceReuse}.ts`,
`src/domain/workflowContract.test.ts`, `src/test/workflowContract.ts`. Plus
`.agent-run/LR-20260921-DVCC-004/*`.

## Next action

Wave 2: persistence and handoff — the two optional round fields, the four event types, the artifact
naming for Turn 2, backward compatibility with existing runtime data, and the Required Fix /
re-review handoff model.

## Remaining tasks

- Waves 1–5.
- Final Convergence, Independent Verification in a separate context, Draft PR.
- Phase 4 stays blocked until Phase 3 merges.
