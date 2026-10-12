# Decisions — LR-20261011-DVCC-012

## D-01 — Adopted Human decisions

HD-5B-01 … HD-5B-14 ADOPTED as defined in BODY section 18 of the approved packet
(`TASK_PACKET_SNAPSHOT.md`, SHA-256 `6d9ab428…502cd`).

- HD-5B-14 verification profile: **PILOT_FOCUSED** (Human choice in the authorization message).
  Deferred items are recorded in `QUALITY_DEBT.md` (QD-5B-01 … 17).

## D-02 — NH admissibility set taken from the contract constant (implementer self-review)

After mutation session 1 (target `3b9276be…`, 28 / 28 killed), self-review found that `runChecks` enforced
NH admissibility from a duplicated literal set instead of `NEEDS_HUMAN_CAPABLE_CHECKS`, so CAT-05 pinned a
constant that was not the enforced one. Fixed in `413445f3…` (no behavior change; a support test pins the
enforcement). Mutation was re-run in full on `413445f3…` (session 2, authoritative, 28 / 28 killed);
session 1 is kept only as a summary line in `EVIDENCE.md`.

## D-03 — Mutation variants

M-26 ("payload table changed / ACTION_PAYLOAD removed") and M-32 ("action added / executor changed") each
name two alternatives in Annex C2; both alternatives were run as separate probes (M-26a / M-26b,
M-32a / M-32b). The mandatory set is unchanged (26); the probe count is 28.

## D-04 — Interpretations within the packet (no Architecture Decision changed)

- `basis_observed_at`: the freshness fact's `basis_observed_at` when the action evaluated `freshness_aligned`
  (outcome other than `NOT_EVALUATED`) and the fact is `DERIVED`; otherwise `null` (always `null` for
  `review.start_next_round`). Pinned by DT-01, DT-04-03, DT-05, PAR-5A.
- `state_guard` cites the review-state reference for both `PASS` and a domain refusal; `verdict_prerequisites`
  cites the result reference for `RESULT_NOT_CAPTURED`, the judgment reference for
  `FINAL_JUDGMENT_NOT_CAPTURED`, and nothing for `DOMAIN_REFUSED_OTHER`.
- A non-capable check answering `NEEDS_HUMAN` is converted to `FAIL` / `EVIDENCE_INCOMPLETE` (fail closed).
- DISC "no i18n text": verified against the actual EN / JA translations of every domain refusal message for
  the fixture, plus message keys, parameter names, domain action types and review-state names.
- Support tests (`support: …`) are not atomic cases and are not counted in the manifest reconciliation.
- `it.each` truncates `$case_id` beyond 40 characters in test titles; BM-01 uses template titles so that
  every case id appears in full.
