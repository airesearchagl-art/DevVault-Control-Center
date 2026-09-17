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
- [x] R7 Targeted checks PASS → checkpoint (`8231e58`, pushed)
- [x] R7 Full Convergence: all required checks + release E2E / recovery / conflict / single-instance script / F-9 runtime PASS
- [x] R8 Independent Verification #2 → F-3 PARTIAL (E-1 spawn race), Data integrity FAIL; E-2..E-10 (`f8408c7`)
- [x] R9 Repair round 2 (within rev 2 F-3 / F-6 / F-9 scope): E-1 own named mutex + data-folder lock; E-2 idempotent archive; E-3 suspend pre-check + accurate message; E-5 link targets checked without following; E-6 test; docs E-4 / E-9 / E-10 (`3833d4e`, `a03f67f`, `68af11d`, `61949ed`)
- [x] R9 Targeted checks PASS → checkpoint
- [~] R9 Full Convergence re-run (incl. spawn-race verification): required checks PASS; round-2 race FAIL 1 / 20 → strategy 3 (`7ef9c29`, `0b884f6`); strategy 3: unit tests, mapped-drive test, release E2E (0 failures), hygiene PASS; races 60 + 60 (0 ms, 2 processes) and 14 (staggered, 3 processes) PASS
  - [!] SUSPENDED: background race run and round-2 control build stopped by the system (low memory); resume only on Human instruction
  - [ ] Remaining: staggered-delay races (2 and 3 processes) on strategy 3; optional round-2 control comparison; checkpoint
- [ ] R10 Independent Verification #3 → Hard Checks → Draft PR only if conditions hold → STOP
