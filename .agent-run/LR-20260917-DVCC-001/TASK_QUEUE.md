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
- [~] R0 Task Packet revision 2 snapshot / digest binding (commit + push)
- [ ] R1 F-1 idempotent repository URL normalization; normalization + save / reload / validate round-trip table tests; `.git.git` regression
- [ ] R2 F-2 missing primary + valid backup → recovery; Rust backup protection (`RECOVERY_REQUIRED`), explicit restore; tests incl. restore write failure
- [ ] R3 F-3 `tauri-plugin-single-instance`; unique temp names; serialized storage commands (Rust mutex) + optimistic write preconditions (no silent cross-process overwrite); F-4 serialized application operation queue using latest committed state; race tests
- [ ] R4 F-5 independent Human-approved transition contract oracle (+ mutation probe evidence)
- [ ] R5 F-6 re-capture: explicit overwrite confirmation + previous result archive; F-8 I/O error state distinct from corrupt; F-11 shared round-limit contract
- [ ] R6 F-9 launcher: canonical target / drive type checks; verify direct UNC, junction → local, symlink → UNC, temporary loopback mapped drive
- [ ] R7 Targeted checks → checkpoint (push)
- [ ] R7 Full Convergence: tsc, vitest, build, cargo check, cargo test, no-bundle build, release launch, restart E2E, persistence / recovery smoke, single-instance evidence, launcher boundary smoke, hygiene
- [ ] R8 Independent Verification (new context; focus F-1 / F-2 / F-3 / F-9)
- [ ] R8 Hard Checks → Draft PR only if conditions hold → STOP
