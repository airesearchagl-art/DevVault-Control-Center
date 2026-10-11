# Quality Debt — LR-20261011-DVCC-012

Verification profile: **PILOT_FOCUSED** (HD-5B-14). The items below are deferred per packet
Annex C4. Target: after the Phase 5D Pilot PASS, before the Phase 5E Task is issued
(target 2026-11-06). Tests themselves are not removed; only the mutation-based proof of detection
power (QD-01 … 14) and the profile-F test groups (QD-15 … 17) are deferred.

| QD | Item | Risk | Deferral reason | Status |
|---|---|---|---|---|
| QD-5B-01 | M-03 (state_guard always PASS) | Low: dominated by M-04 | killer PAR-TC detects a superset diff of M-04 | DEFERRED |
| QD-5B-02 | M-06 (judgmentRequired → RESULT_NOT_CAPTURED) | Low: reason mix-up (both BLOCKED) | disposition unchanged | DEFERRED |
| QD-5B-03 | M-07 (verdict_prerequisites before state_guard) | Low: reason order | disposition unchanged | DEFERRED |
| QD-5B-04 | M-08 (drop fact cross-check) | Low: unreachable-contradiction defense | domain guard is primary | DEFERRED |
| QD-5B-05 | M-10 (VERDICT_CONFIRMATION_NOT_RECORDED → NEEDS_HUMAN) | Medium-low: BLOCKED vs NEEDS_HUMAN (never ELIGIBLE_NOW) | read-only Pilot has no execution authority; mandatory before 5E | DEFERRED |
| QD-5B-06 | M-14 (unknown-field before version) | Low: error-code precedence | rejected either way | DEFERRED |
| QD-5B-07 | M-15 (NEEDS_HUMAN over BLOCKED) | Low: unreachable under first-FAIL stop | disposition unchanged | DEFERRED |
| QD-5B-08 | M-16 (no first-FAIL stop) | Low: more checks evaluated | disposition unchanged | DEFERRED |
| QD-5B-09 | M-17 (freshness check added to SNR) | Low: stricter | fail-safe | DEFERRED |
| QD-5B-10 | M-18 (INVALIDATED → NOT_OBSERVED) | Low: diagnostic reason precision | disposition unchanged | DEFERRED |
| QD-5B-11 | M-21 (caller now in internal env) | Low: env consumption count | value discarded | DEFERRED |
| QD-5B-12 | M-22 (env consumed on error path) | Low: env consumption count | output unchanged | DEFERRED |
| QD-5B-13 | M-23 (all identity removed) | Low: dominated by 6 individual identity mutations | proven by individual kills | DEFERRED |
| QD-5B-14 | M-35 (state_guard ref from wrong builder) | Low-medium: evidence field mix-up | DT-01 exact-ref test remains | DEFERRED |
| QD-5B-15 | P-03 (10 cases) / AC5B-12b | Low: documentation claim unverified | domain guard order (transitions.ts) is the basis | DEFERRED |
| QD-5B-16 | PAR-PR (2 cases) / AC5B-22b | Low: overlaps DT-07 | DT-07-01..02 remain | DEFERRED |
| QD-5B-17 | PAR-UI (24 cases) / AC5B-22b | Low: UI unchanged | domain parity (TC / VG) remains | DEFERRED |

Carry-over observation (not a 5B change): QD-5B-C1 — 5A projection uses bracket access on
`gitObservations[projectId]`; a projectId equal to an `Object.prototype` property name yields
`OBSERVATION_INVALIDATED` (fail-closed). Pinned by ID-14; 5A unchanged.
