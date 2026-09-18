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
- id: QD-009
  source_wave: repair round 2 (rev 2)
  type: behaviour_limitation
  description: "E-8: Copy review prompt again in the same round regenerates request-r<N>.md and replaces the previous request text (latest-wins; the request is regenerated from the stored session and is not review history)."
  why_deferred: "Info-level; documented behaviour; request text is reproducible from session data; result history (F-6) is unaffected."
  risk: low
  blocks_final_verify: false
  required_resolution: "Keep previous request text (e.g. request-r<N>-previous-<ms>.md) if request history becomes a requirement."
  evidence: "Independent Verification #2 E-8; docs/data-contract-v1.md Write rules table."
  status: open
- id: QD-010
  source_wave: repair round 2 (rev 2)
  type: environment_limitation
  description: "E-10: debug and release builds share the app identifier and the start-up / plugin mutexes, so a running debug build prevents a release build from starting (and vice versa) although their data folders differ."
  why_deferred: "Info-level; fails safe (no second writer); documented in README and data contract; changing the dev identity is a configuration decision outside the repair."
  risk: low
  blocks_final_verify: false
  required_resolution: "Use a distinct identifier / mutex name for debug builds if parallel dev and release use is needed."
  evidence: "Independent Verification #2 E-10; src-tauri/src/instance.rs STARTUP_MUTEX_NAME; plugin mutex derived from the identifier."
  status: open
- id: QD-011
  source_wave: repair round 2 (rev 2)
  type: behaviour_limitation
  description: "E-5 hardening is conservative: a link whose target is a volume GUID path (verbatim `Volume{GUID}` form, e.g. a folder mount point of another local volume) is refused with FOLDER_REJECTED even though the volume is local."
  why_deferred: "Fails closed (the folder is simply not opened); rare setup; resolving volume GUID paths safely needs extra Windows APIs outside the repair."
  risk: low
  blocks_final_verify: false
  required_resolution: "Map volume GUID targets to their drive type (GetVolumePathNamesForVolumeNameW + GetDriveTypeW) if mounted-volume project folders are needed."
  evidence: "src-tauri/src/launcher.rs classifies_link_targets_without_opening_them."
  status: open
- id: QD-012
  source_wave: repair round 3 (rev 2)
  type: liveness_limitation
  description: "If the running instance's UI thread is hung, a new launch waits: the plugin hand-over uses SendMessageW without a timeout (while holding the start-up lock), and further launches wait 15 s for the start-up lock and then block in the same hand-over; none of them opens the data folder."
  why_deferred: "Fails safe (never a second writer); only when the running instance is already unresponsive; the plugin's hand-over call is outside DVCC code."
  risk: low
  blocks_final_verify: false
  required_resolution: "Hand over with SendMessageTimeoutW (upstream plugin change or own hand-over) if hung-instance launches must return."
  evidence: "tauri-plugin-single-instance 2.4.4 platform_impl/windows.rs (SendMessageW); src-tauri/src/instance.rs STARTUP_WAIT."
  status: open
- id: QD-013
  source_wave: independent verification #3 (rev 2)
  type: contract_scope
  description: "N-2: the load-time check that a stored value equals its canonical form applies to repositoryUrl only; localRoot and chatgptThreadUrl are validated for shape and stored verbatim (they round-trip unchanged, so F-1 is unaffected)."
  why_deferred: "Info-level; no data loss or drift; adding canonicalization for the other fields would change stored values of existing data and needs a contract decision."
  risk: low
  blocks_final_verify: false
  required_resolution: "Decide whether localRoot / chatgptThreadUrl should also be stored canonically; if yes, add normalization plus a migration-safe load rule."
  evidence: "src/domain/schema.ts repositoryUrl equality check vs the localRoot / chatgptThreadUrl rows; Independent Verification #3 finding N-2."
  status: open
```

Open items are all low risk and non-blocking. No high-risk debt. Nothing in the Security, Permission, Data integrity, Irreversible-data safety, F-3 or F-9 categories was deferred: the one such finding from Independent Verification #3 (N-1, an unverified data-integrity guard) was fixed with a test instead.
