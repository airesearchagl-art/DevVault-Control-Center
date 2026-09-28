# Decisions — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

## Orchestrator decisions (this run, not dictated by the Task Packet)

- D-4B1-001 — `candidateProjectIds` was added to `DiscoveredIdeSession` (not explicitly listed in
  Task Packet §7's candidate shape) so the UI can implement §21's "For selected Project show: MATCHED
  sessions and relevant AMBIGUOUS candidates" without re-deriving the tie set. It is empty except
  when `binding === "AMBIGUOUS"`.
- D-4B1-002 — `canonicalize_local_path` (new Tauri command, `launcher.rs`) is a thin wrapper around
  the existing `validate_project_folder`, not a new implementation, per Task Packet §15's explicit
  "reuse existing launcher security logic rather than duplicating weaker path logic." It never calls
  the opener; only `open_project_folder`/`open_data_dir` do.
- D-4B1-003 — Codex's `threads.project_id` was found to be `0/370` populated on the real installation
  examined during the prior research spike (a column that exists in the schema but is not used in
  practice). This run's binding logic does not rely on it at all; `git_origin_url` and `cwd` are the
  two signals actually used, matching Task Packet §11's explicit priority order.
- D-4B1-004 — `createdAt`/`updatedAt` are surfaced as ISO strings computed from Codex's Unix-seconds
  columns (`created_at`/`updated_at` — verified as seconds, not milliseconds, against real data in
  the prior research spike) and from Claude's live `updatedAt` (milliseconds) / file mtime
  (milliseconds) respectively. Claude's `createdAt` is always `null`: no approved field supplies it
  (Task Packet §14 only approves `sessionId`/`cwd`/`updatedAt`/`version` for live metadata, and
  historical discovery is directory/file-name-only).
- D-4B1-005 — The running-app smoke's "unsupported-schema case" (Task Packet §26) was **not**
  exercised as a fourth live-app scenario: it is already thoroughly covered by Rust unit tests
  (`missing_table_is_unsupported_format`, `missing_required_column_is_unsupported_format`) and by the
  TS binding test M, and a live-app scenario would need a second Codex DB file / second app run for
  comparatively little additional assurance. Recorded here transparently rather than silently
  narrowing the smoke's scope.
- D-4B1-006 — the smoke likewise does not attempt to directly observe "no OS process launch / no
  shell / no network" via OS-level tracing (e.g. ETW): these are structural guarantees verified by
  reading the reader modules (no `std::process::Command` in `claude_reader.rs`/`codex_reader.rs`,
  `rusqlite` opened with `SQLITE_OPEN_READ_ONLY`, no HTTP client anywhere in either reader) and by the
  Rust unit test that a read-only connection refuses a write. See EVIDENCE.md.

## Blocked action (reported, not worked around)

- The auto-mode classifier denied the specific Edit that would have wired `threads.first_user_message`
  into `CodexThreadRow`/the SELECT list for mutation probe **M-P4B1-01** ("PII Data Handling"). The
  partial edit already made (struct field + SELECT column, before the row-mapping edit was denied)
  was reverted immediately; `codex_reader.rs` was confirmed byte-identical to its pre-mutation hash
  afterward. M-P4B1-02 through M-P4B1-05 were completed normally (mutated, confirmed FAIL, reverted,
  confirmed byte-identical). See EVIDENCE.md and the final report for what this means for AC4B1-25
  and the privacy guarantee itself (which remains evidenced by the passing, non-mutated
  `reads_only_the_approved_columns_and_never_the_content_columns` Rust test and the smoke's sentinel
  checks — the missing piece is specifically the mutation-kill demonstration for this one probe, not
  the underlying guarantee).
