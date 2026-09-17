# Quality Debt — LR-20260917-DVCC-001

Mode: LONG_RUN (not ENDURANCE). Only non-required / non-hard items may be recorded here.
Required Check failures are repaired or lead to BLOCKED. Hard Gate real failures are never recorded here.

**Not Quality Debt (Hard Gate failures → BLOCKED, see RUN_STATE.md / EVIDENCE.md):** F-1, F-2, F-3.

## Items (non-hard, open; from Independent Verification 2026-09-17)

```yaml
- id: QD-001
  source_wave: final-convergence
  type: test_validity
  description: "F-5: transition guard test is self-referential (mutations of ALLOWED_FROM survive); no recovery test for schema-invalid but JSON-valid primary; no automated UI test for AC-14 verdict dialog."
  why_deferred: "Run is BLOCKED on hard-gate failures; no repair authorized yet."
  risk: medium
  blocks_final_verify: true
  required_resolution: "Literal expected transition table test; schema-invalid primary recovery test; (optional) component test for verdict dialog."
  evidence: "EVIDENCE.md Final Convergence F-5; verifier mutation probes M1-M4, M8 survived."
  status: open
- id: QD-002
  source_wave: final-convergence
  type: ui_concurrency
  description: "F-4: two actions in the same tick use a stale session closure (UI / disk divergence)."
  why_deferred: "Run is BLOCKED; low severity."
  risk: low
  blocks_final_verify: false
  required_resolution: "Serialize review writes and use the latest session."
  evidence: "EVIDENCE.md Final Convergence F-4."
  status: open
- id: QD-003
  source_wave: final-convergence
  type: evidence_retention
  description: "F-6: re-capture overwrites result-r<N>.md (also after a confirmed verdict)."
  why_deferred: "Run is BLOCKED; low severity; warning is shown."
  risk: low
  blocks_final_verify: false
  required_resolution: "Restrict capture to REVIEWING or retain the previous result."
  evidence: "EVIDENCE.md Final Convergence F-6."
  status: open
- id: QD-004
  source_wave: final-convergence
  type: recovery_ux
  description: "F-7 BOM JSON treated as corrupt; F-8 set-aside offered for I/O errors; F-9 junction-to-UNC folder (unconfirmed); F-10 hygiene test scope; F-11 round upper bound; F-12 lone surrogates."
  why_deferred: "Run is BLOCKED; low / info."
  risk: low
  blocks_final_verify: false
  required_resolution: "Address within an authorized repair wave or defer explicitly."
  evidence: "EVIDENCE.md Final Convergence F-7..F-12."
  status: open
```
