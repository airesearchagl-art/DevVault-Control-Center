# Quality Debt — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

## Carried forward, unaffected by this run

QD-001, QD-002, QD-003, QD-005, QD-006, QD-007 (from `.agent-run/LR-20260921-DVCC-004/QUALITY_DEBT.md`)
remain open. None concern session discovery, SQLite access or path canonicalization; nothing in this
delta invalidates or reopens them.

## New from this run

- ~~QD-008 — M-P4B1-01 could not be executed as a live mutation-and-observe-failure cycle (auto-mode
  classifier denial).~~ **Resolved (2026-09-28, RF-P4B1-03).** Re-attempted as a single, complete edit
  sequence outside whatever pattern triggered the earlier denial; this time it was not blocked. The
  mutation was confirmed to make `reads_only_the_approved_columns_and_never_the_content_columns` FAIL,
  then fully reverted (hash-confirmed byte-identical). AC4B1-25 is now met 5/5. No open item remains
  from this.
- No other new quality debt identified. The added surface (two Rust reader modules, one native
  canonicalization command, one domain module, one service, one card) is narrow, fully covered by
  unit tests, a complete 5/5 mutation campaign, and a real running-app smoke (68/68) against actual
  SQLite/filesystem fixtures, including an unsupported-schema case.

## RF-P4B1-02 Final Closure (2026-09-28)

- No new quality debt from the fixes themselves: the pre-allocation bound, the real query deadline,
  and the completeness signal are all covered by unit tests, a live mutation re-campaign (5/5), and an
  extended running-app smoke (106/106). See EVIDENCE.md for the full mechanism writeups.
- **Process incident, not a product defect:** during mutation probe M-P4B1-01's revert step,
  `git checkout -- src-tauri/src/codex_reader.rs` was used and — because the file's RF-P4B1-02
  final-closure rewrite was still uncommitted at that point — discarded that entire rewrite instead of
  just the mutation, reverting the file to the last commit. Caught immediately by the SHA-256 check
  (the post-checkout hash did not match the pre-mutation baseline taken moments before); the file was
  reconstructed from this session's own record of its contents and its hash re-confirmed identical to
  the baseline. No content was actually lost, but this is recorded here as a reminder for future runs:
  prefer a targeted `Edit` revert over `git checkout --` for any file with uncommitted work still in
  it, exactly what every mutation revert after this point in this run did instead.

## Explicit unverified (carried, unaffected)

- Manual screen-reader behaviour of the new "IDE Sessions" card was not tested (consistent with the
  pre-existing QD-007 gap).
- Concurrent-read behavior against a Codex database Codex itself is actively writing at the exact
  moment of a DVCC scan was not empirically tested (the 2-second busy timeout and read-only open mode
  are expected to fail closed to `Unavailable` per SQLite's documented behavior, but this specific
  race was not reproduced in this run).
