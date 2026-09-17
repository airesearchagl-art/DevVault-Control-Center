# Quality Debt — LR-20260917-DVCC-001

Mode: LONG_RUN (not ENDURANCE). Only non-required / non-hard items may be recorded here.
Required Check failures are repaired or lead to BLOCKED. Hard Gate real failures are never recorded here.

Hard Gate failures F-1, F-2, F-3 and the security boundary item F-9 are **not** Quality Debt; they
were repaired under Task Packet revision 2 (see EVIDENCE.md "Repair campaign").

## Re-evaluation after the repair campaign (Task Packet revision 2)

```yaml
- id: QD-001
  source_wave: final-convergence (rev 1)
  type: test_validity
  description: "F-5: self-referential transition test; missing schema-invalid primary recovery test."
  risk: medium
  blocks_final_verify: true
  required_resolution: "Independent transition oracle; schema-invalid primary recovery test."
  evidence: "Commit fc08760; mutation probe 12 / 12 killed (EVIDENCE.md R4)."
  status: resolved
- id: QD-002
  source_wave: final-convergence (rev 1)
  type: ui_concurrency
  description: "F-4: stale session closure under near-simultaneous actions."
  risk: low
  blocks_final_verify: false
  required_resolution: "Serialized operations on latest committed state."
  evidence: "Commit 1cfd4e1; reviewHub.test.ts ordering tests (EVIDENCE.md R3)."
  status: resolved
- id: QD-003
  source_wave: final-convergence (rev 1)
  type: evidence_retention
  description: "F-6: re-capture overwrote result-r<N>.md."
  risk: low
  blocks_final_verify: false
  required_resolution: "Human confirmation + previous result archive."
  evidence: "Commit b527fbb (EVIDENCE.md R5)."
  status: resolved
- id: QD-004
  source_wave: final-convergence (rev 1)
  type: recovery_ux
  description: "Former bundle F-7 / F-8 / F-9 / F-10 / F-11 / F-12, split below after re-evaluation (F-8, F-11 resolved; F-9 resolved as security fix)."
  risk: low
  blocks_final_verify: false
  required_resolution: "See QD-005 .. QD-008."
  evidence: "EVIDENCE.md R2, R5, R6."
  status: resolved
- id: QD-005
  source_wave: final-convergence (rev 1)
  type: recovery_ux
  description: "F-7: a hand-edited projects.json / session.json saved with a UTF-8 BOM is treated as corrupt; if a valid .bak exists the older backup is restored automatically (the BOM file is kept as .corrupt-<ms>)."
  why_deferred: "Human-allowed Quality Debt (Task Packet rev 2, R2-D1). No data is lost (the edited file is kept)."
  risk: low
  blocks_final_verify: false
  required_resolution: "Accept / strip a leading BOM on read in a later version, or surface a dedicated notice."
  evidence: "Independent Verification rev 1 F-7."
  status: open
- id: QD-006
  source_wave: final-convergence (rev 1)
  type: test_scope
  description: "F-10: fixtureHygiene.test.ts scans only fixtures/ and docs/; README, src and .agent-run are covered by manual / scripted grep during convergence."
  why_deferred: "Human-allowed Quality Debt (Task Packet rev 2, R2-D1)."
  risk: low
  blocks_final_verify: false
  required_resolution: "Extend the automated scan with an allowlist for intentional test samples."
  evidence: "Independent Verification rev 1 F-10; convergence hygiene scans."
  status: open
- id: QD-007
  source_wave: final-convergence (rev 1)
  type: input_edge_case
  description: "F-12: text containing a lone UTF-16 surrogate cannot be saved (JSON is refused by serde_json with INVALID_CONTENT); the save fails visibly and nothing is lost."
  why_deferred: "Info-level; no data loss; outside the Human-designated repair list."
  risk: low
  blocks_final_verify: false
  required_resolution: "Replace lone surrogates before serialization, or show a specific message."
  evidence: "Independent Verification rev 1 F-12."
  status: open
- id: QD-008
  source_wave: repair (rev 2)
  type: test_scope
  description: "AC-14 verdict dialog behaviour (no preselection, acknowledgement required) is verified by release E2E smoke, not by component unit tests (no DOM test runner in v0.1)."
  why_deferred: "Adding a DOM test stack is new tooling outside the repair scope; behaviour is covered by domain oracle (confirmedByHuman) + E2E."
  risk: low
  blocks_final_verify: false
  required_resolution: "Add component tests if a DOM test runner is introduced."
  evidence: "transitionContract.test.ts verdict prerequisites; E2E phase 1."
  status: open
```

Open items are all low risk and non-blocking. No high-risk debt.
