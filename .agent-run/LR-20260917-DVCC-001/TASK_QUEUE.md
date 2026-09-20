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
- [x] R9 Full Convergence re-run (incl. spawn-race verification): required checks PASS; round-2 race FAIL 1 / 20 → strategy 3 (`7ef9c29`, `0b884f6`); strategy 3: unit tests, mapped-drive test, release E2E (0 failures), hygiene PASS; races 60 + 60 (0 ms, 2 processes) and 14 (staggered, 3 processes) PASS
  - [x] SUSPENDED #1 resolved: Human resume authorization (memory-aware); resume contract verified
  - [x] Isolated-desktop race harness built and calibrated (5 / 5 PASS); round-2 comparison NOT REQUIRED (L-032)
  - [x] SUSPENDED #2 resolved: Human resume (batched race verification); memory gate 15.71 GiB
  - [x] Suite A (2 processes, staggered, 8 batches) 40 / 40 PASS; Suite B (3 processes, staggered, 8 batches) 40 / 40 PASS; 0 product failures, 0 timeouts
  - [x] Race checkpoint
- [x] R10 Independent Verification #3 → all focus items PASS, all six Hard Checks PASS; N-1 fixed with a test, N-2 → QD-013, N-3 → README
- [x] R11 Implementation freeze → full diff review → Required Checks PASS → Hard Checks PASS → Quality Debt and unverified items review → final checkpoint
- [x] R12 Draft PR created (base main, head feat/review-hub-v0.1) → STOP

## Focused Repair P1-1 (Independent FULL Review at `3f99eab`)

- [x] R13.0 Fresh gate PASS → BLOCKED transition checkpoint (RUN_STATE stale entries corrected)
- [x] R13.1 Fail-closed start-up gate (`instance.rs`, `lib.rs`) + structural contract tests; mutation 7 / 7 (`948de00`)
- [x] R13.2 Deterministic `NotOwned` verification against the release binary (timeout, `CreateMutexW` failure) PASS; negative control (3f99eab gate) FAIL as expected
- [x] R13.3 Focused race regression 25 / 25 (2-process zero / staggered, 3-process staggered); abandoned owner 3 / 3
- [x] R13.4 P3 URL contract cleanup (`:443` canonical default; non-default port rejected) (`948de00`)
- [x] R13.5 Targeted checks PASS → Hard Checks re-evaluated → evidence checkpoint → PR body → COMPLETE_PENDING_FULL_VERIFY
- [x] R14 Focused Independent Re-review (independent context) — PASS at `8c24bf9`, P1-1 CLOSED, Required Fixes none, Hard Boundaries PASS
- [x] R15 Independent UI-driven verification (AC-02 / 03 / 06 / 07 / 12 / 13, interactive halves of AC-09 / 14) — all 8 PASS at `8c24bf9`; READY CONDITION SATISFIED FOR UI
- [x] R16 Evidence-only finalization (run artifacts + PR body; no product file changed)
- [ ] R17 Human Ready transition (Human Gate only), subject to a Final Evidence Re-review of the evidence-only head
