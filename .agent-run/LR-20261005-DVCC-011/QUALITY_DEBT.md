# Quality Debt — LR-20261005-DVCC-011

- **QD-5A-01 (runtime-only observations)** — Git observations exist only in UI memory; after a restart
  every Git fact is `NOT_OBSERVED` until the Human refreshes. No TTL is defined; currentness is left to
  the consumer via `observed_at` / `generated_at` (by design, rev 3.2 §13).
- **QD-5A-02 (field timestamps)** — repository, resource state, PR number, expected head, risk tier
  and review state report `recorded_at: null` because the persisted model has no field-level time.
  Exact times would need a Data Model change (out of scope).
- **QD-5A-03 (conservative BLOCKED)** — a `BLOCKED` reached by `block` from a non-REVIEWING state is
  `ENTERED` even though `block` requires `confirmedByHuman`, because no durable round record shows it
  (HD-5A-09; event history is not consulted in 5A).
- **QD-5A-04 (no transport)** — Control Read is reachable only through the Human copy action and the
  pure function; machine access is Phase 5C.
- **QD-5A-05 (README status)** — the README Status block is unchanged on this branch; it is updated in
  the post-merge current-state sync.
- **QD-5A-06 (pre-existing doc drift, out of scope)** — `docs/data-contract-v1.md` still calls Phase 3
  "under development" (lines 10 / 375).
- **QD-5A-07 (test fixtures)** — Control Read test files each build their own small synthetic
  fixtures (no shared helper file was added, to keep the change set to rev 3.2 §9).
- **QD-5A-08 (G4 harness approximations)** — the audit core approximates the app's schema to decide
  which files are readable (a mismatch surfaces as INCONCLUSIVE / FAIL, never as a hidden leak); it
  drives the UI through existing `data-testid`s and reads DVCC's Git observation from the Review
  detail's rendered status label / HEAD / branch cells (labels pinned to `src/i18n` ja / en by test; a
  label change makes the observed path fail closed, not pass). Forbidden values equal to a
  source-bound lawful value are excluded and counted; machine-shaped values without a source-bound
  explanation stop the run (rev 3.4).
- **QD-5A-10 (attempt marker reset)** — once `G4_REAL_DATA_ATTEMPT.md` exists, G4-C cannot run again;
  there is deliberately no reset path (rev 3.5). Any retry needs a new Human gate and a separate,
  reviewed procedure for the marker. The harness's behavioural tests need DVCC closed (the
  `DVCC_RUNNING` precondition would otherwise block them).
- **QD-5A-11 (G4-C sample coverage at the minimum)** — the automatically selected real-data sample
  had 3 / 11 sensitive-source categories non-empty (`MIN_COVERAGE = 3`). The run PASSed, but per-sample
  exact-comparison coverage was narrow; G4-D should weigh this. A broader real-data audit would need a
  new Human gate (the one-shot is consumed).
- **QD-5A-09 (audit tests outside `npm test`)** — the harness tests run with
  `npx vitest run --config scripts/vitest.audit.config.ts`, not in the product suite, so that
  `vite.config.ts` is unchanged.
- Earlier QD items (QD-4B2B-*, QD-4B12-*, …) remain as recorded in their runs.
