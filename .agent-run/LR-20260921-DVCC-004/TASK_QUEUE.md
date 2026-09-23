# Task Queue — LR-20260921-DVCC-004

## Wave 0 — preflight, canonical discovery, design

- [x] Fresh preflight (origin/main `4c1962b`, PR #3 merged, clean tree, branch created from fresh main)
- [x] Task Packet snapshot written and bound by digest
- [x] Canonical review contract discovery (vault, read-only) — `CANONICAL_REVIEW_CONTRACT.md`
- [x] Reuse scan of other local projects for shared-contract references (delegated, read-only)
- [x] Canonical set re-bound to `airesearchagl-art/obsidian-vault` main @ `77ce41e` (read-only, Human-authorized)
- [x] SPEC_GAP gate — passed at latest main; every trigger answered by a canonical line
- [x] Data model and workflow design (stage model, duplicate key, evidence reuse, artifacts, events)
- [x] Checkpoint

## Wave 1 — pure workflow domain

- [x] Workflow stage model (Turn 1 / Turn 2 as canonical stages) with a literal contract table
- [x] Risk Tier values and the escalation rule; independent oracle
- [x] Same-head duplicate detection as a pure function, reusing Phase 2 `compareHead`
- [x] Revalidation permission as its own function, decided by a reason code
- [x] Evidence eligibility / reuse contract as a pure function, per item
- [x] Independent oracle tests (no shared branching with the implementation)
- [x] Mutation probes M1–M5
- [x] Checkpoint

## Wave 2 — persistence and handoff

- [x] Data Contract Gate resolved before any persistence code (`DATA_CONTRACT_GATE.md`)
- [x] Persistence of the new fields with backward compatibility (old fixtures load unchanged)
- [x] Event additions (language-neutral types) with a closed, typed `detail`
- [x] Review file allow-list extended on both sides of the boundary, with Rust tests
- [x] Required Fix handoff model
- [x] Re-review handoff model (previous round, previous head, previous verdict, reuse, reason)
- [x] Checkpoint

## Wave 2.5 / 2.6 — protocol invariants (Human-requested, before the UI)

- [x] A verdict waits for the Final Judgment once Turn 2 has been sent (domain guard)
- [x] A Final Judgment with no Turn 2 is refused by the parser
- [x] A Turn 2 with no Fresh Assessment is refused by the parser
- [x] Turn 2 cannot be re-sent once the Final Judgment is in
- [x] The Tier 2 subjects are persisted, so the canonical rule survives a restart
- [x] Checkpoint

## Wave 3 — Review Workflow UI (JA and EN together)

- [x] Turn 1 / Turn 2 surface: where the Human is, what to copy, what was handed over, what came back, what is next (3c)
- [x] Duplicate warning with the canonical reason and the allowed paths (3d)
- [x] Evidence reuse UX (source, head, time, reason visible) (3d)
- [x] Required Fix / re-review handoff surface (3d)
- [x] Round-readable timeline (3c)
- [x] Checkpoint (`3175a7c`, recorded in `ef9c3d7`)

## Wave 4 — prompts, formatting, documentation

- [ ] Turn 1 / Turn 2 / re-review request generation in JA and EN with equal semantic strength
- [ ] Accessibility text in both languages
- [ ] Stale / unknown handling in the workflow surface (no invented facts)
- [ ] Phase 2 Freshness integrated without coupling it to Review State
- [ ] README status reconciled to fresh facts; `docs/data-contract-v1.md` updated
- [ ] Checkpoint

## Wave 5 — verification

- [ ] Full regression (frontend and Rust)
- [ ] Synthetic workflow scenarios A–G
- [ ] Isolated-desktop UI smoke (workflow, restart persistence, same-head suppression, re-review round trip)
- [ ] Mutation probes for the contracts that matter
- [ ] Checkpoint

## Final

- [ ] Final Convergence (freeze, full diff review, required checks, hard checks, quality debt, unverified items)
- [ ] Independent Verification (separate context)
- [ ] Draft PR → STOP
