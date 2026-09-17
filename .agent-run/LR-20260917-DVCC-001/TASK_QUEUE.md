# Task Queue — LR-20260917-DVCC-001

Legend: [ ] pending · [~] in progress · [x] done · [!] blocked

## Revision 1 (history)

- [x] Wave 0 — preflight / Task Packet rev 1 (`dd6a82f`)
- [x] Wave 1 — Tauri shell + Rust boundary + domain + persistence (`fd733e1`)
- [x] Wave 2 — Review Hub UI (`bec4a7b`)
- [x] Wave 3 — convergence, README, release smoke, E2E (`b2c3ae8`)
- [x] Final Convergence — checks re-run PASS; Independent Verification → Data integrity FAIL / Irreversible-data safety FAIL
- [x] HARD_GATE_FAILURE → BLOCKED evidence checkpoint (`bf83376`); Human escalation

## Revision 2 — Repair campaign (Human authorized)

- [x] R0 Repair preflight
- [x] R0 Task Packet revision 2 snapshot / digest binding (`6eb1f94`, pushed)
- [x] R1 F-1 (`29af58c`)
- [x] R2 F-2 / F-8 (`1777996`)
- [x] R3 F-3 / F-4 (`1cfd4e1`)
- [x] R4 F-5 (`fc08760`, mutation probe 12 / 12 killed)
- [x] R5 F-6 / F-11 (`b527fbb`)
- [x] R6 F-9 reproduced → fixed → verified (`e01b1ab`)
- [x] Docs (`561c746`)
- [~] R7 Targeted checks PASS → checkpoint (push)
- [ ] R7 Full Convergence: tsc, vitest, build, cargo check, cargo test, no-bundle build, release launch, restart E2E, persistence / recovery smoke, single-instance evidence, launcher boundary smoke, hygiene
- [ ] R8 Independent Verification (new context; focus F-1 / F-2 / F-3 / F-9)
- [ ] R8 Hard Checks → Draft PR only if conditions hold → STOP
