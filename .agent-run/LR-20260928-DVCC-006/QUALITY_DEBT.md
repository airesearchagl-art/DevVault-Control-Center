# Quality Debt — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

## Carried forward, unaffected by this run

QD-001, QD-002, QD-003, QD-005, QD-006, QD-007 (from `.agent-run/LR-20260921-DVCC-004/QUALITY_DEBT.md`)
remain open. None concern session discovery, SQLite access or path canonicalization; nothing in this
delta invalidates or reopens them.

## New from this run

- QD-008 — **M-P4B1-01 (Task Packet §25) could not be executed as a live mutation-and-observe-failure
  cycle.** The auto-mode classifier denied the specific edit (adding `first_user_message` to the
  Codex reader's struct/SELECT) before the row-mapping half of the mutation could be wired in,
  classifying it as "PII Data Handling." The partial edit was reverted immediately and the file's
  hash confirmed unchanged. The underlying privacy guarantee is still evidenced independently (the
  non-mutated Rust test `reads_only_the_approved_columns_and_never_the_content_columns` inserts
  sentinel values into `first_user_message`/`preview` and asserts they never reach the output; the
  running-app smoke asserts the same sentinels never reach the rendered page against a real SQLite
  file), but the specific "if someone added this column back, would the test catch it" demonstration
  that the other four probes provide is missing for this one case. Resolution options for a future
  run or for the Human directly: (a) run this one mutation manually outside this agent session and
  report the result back, (b) adjust the classifier/permission configuration if the Human judges this
  class of test-only, immediately-reverted action should not require a stop, or (c) accept the
  weaker (but still real) evidence already in place and close this as informational.
- No other new quality debt identified. The added surface (two Rust reader modules, one native
  canonicalization command, one domain module, one service, one card) is narrow, fully covered by
  unit tests, a 4/5-complete mutation campaign, and a real running-app smoke against actual
  SQLite/filesystem fixtures.

## Explicit unverified (carried, unaffected)

- Manual screen-reader behaviour of the new "IDE Sessions" card was not tested (consistent with the
  pre-existing QD-007 gap).
- Concurrent-read behavior against a Codex database Codex itself is actively writing at the exact
  moment of a DVCC scan was not empirically tested (the 2-second busy timeout and read-only open mode
  are expected to fail closed to `Unavailable` per SQLite's documented behavior, but this specific
  race was not reproduced in this run).
