# Decisions — LR-20260930-DVCC-009

Implementation-owned decisions made by the Orchestrator inside the approved scope.

- **D-01 Domain shape.** `claudeHistoricalProjectKey(localRoot): ClaudeHistoricalKeyResult`
  (`supported {key}` / `unsupported {reason: NON_ASCII | LONG_NAME_HASH_UNKNOWN}`) replaces the
  old `encodeClaudeWorkspacePath`. Constant `CLAUDE_HISTORICAL_KEY_MAX_LEN = 200`. The non-ASCII
  check runs before encoding; the length check runs on the ordinary encoded key. Comparison still
  goes through `claudeHistoricalKey()` (`toLowerCase()`) on both the Project-side key and the
  provider directory name. Canonical/live matching (`canonicalKey`) untouched.
- **D-02 Surfacing unsupported history.** `ProviderScanResult`'s `ok` variant gains an optional,
  runtime-only `historicalBindingUnsupportedProjectIds?: string[]`, populated only by
  `bindClaudeSessions`. Optional so existing Codex/other constructors are unchanged. Not persisted;
  no event; no schema change.
- **D-03 UI.** `ReviewIdeSessions` shows `ideSessions.reason.historicalBindingUnsupported` in the
  Claude section when the selected Project is listed. With no relevant row, the section renders
  `data-provider-status="historyUnsupported"` instead of the ordinary `empty` "No match"; with rows
  (e.g. a live MATCHED one) the warning is shown above them. The warning carries no path, encoded
  name or provider directory. Review State / Project state / persistence / events untouched.
- **D-04 Collision reason.** Distinct roots collapsing to one key (e.g. `project_name` vs
  `project name`) reuse the existing `ambiguousEncodingCollision` reason — no new state.
- **D-05 DF-06 Japanese wording.** No user-facing UI string states a provider-file contract (only
  README and code comments do), so no new JA UI string was needed for DF-06. The README is
  English-only; its DF-06 paragraph is the current-facing contract.
- **D-06 WAL smoke helper.** A test-only Node (`node:sqlite`) helper builds the WAL-mode fixture
  with `wal_autocheckpoint=0`, so every table/row exists only in `-wal` (the main DB file is just the
  4096-byte header page). Reading the session therefore proves the WAL was read. The helper holds its
  connection open and writes nothing after signalling ready; it is stopped only after the "after"
  measurement. Files are hashed with `FileShare.ReadWrite` (the helper keeps them open).
- **D-07 Existing smoke labels.** Byte-identity checks for the non-WAL synthetic fixtures stay, but
  are relabelled "this synthetic (non-WAL) … fixture is byte-identical" in both
  `verify-session-discovery-ui.ps1` and `verify-resume-handoff-ui.ps1` (label-only change in the
  latter).
- **D-08 Errata.** Appended (never rewritten) to LR-006 EVIDENCE/RUN_STATE and LR-007 EVIDENCE.
  LR-008 already records DF-06 accurately and was not modified. No prior Task Packet snapshot was
  modified.
