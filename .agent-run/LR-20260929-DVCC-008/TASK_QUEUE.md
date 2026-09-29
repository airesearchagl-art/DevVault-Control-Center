# Task Queue — LR-20260929-DVCC-008 (Phase 4b-2a Resume Handoff)

- [x] Fresh Gate; branch `feat/session-resume-handoff-v0.4b2a` from exact `main`
- [x] Task Packet snapshot + SHA-256
- [x] Pure domain (`resumeIntent.ts`): validator, eligibility, renderer
- [x] Action seam (`copyResumeCommandAction.ts`) + App wiring with click-time recheck
- [x] UI: inline per-row control, localized reasons, UI-only notes; JA/EN strings
- [x] Unit tests (domain 52, action 12, UI +20)
- [x] README + docs contract test
- [x] Mutation campaign M-P4B2A-01..08 (01 at seam and UI levels), byte-identical restore
- [x] Full regression (TS 38/1015, Rust 92, cargo check, diff check)
- [x] Synthetic running-app smoke (63/63) + discovery smoke regression (134/134)
- [x] Real-data copy-only dogfood (never executed); DF-06 reported
- [x] Evidence convergence; commit and push
- [ ] Independent FULL Review (separate context)
- [ ] Draft PR (only after READY CANDIDATE, Required Fixes: none)
- [ ] Human decision on DF-06; DF-05 candidate 4b-1.2 repair
- [ ] Phase 4b-2b (actual launch) — deferred, needs its own Human Gate
- [ ] Ready / merge / release / Production — prohibited until a later Human Gate
