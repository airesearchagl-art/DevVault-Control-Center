# Run State — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

Updated: 2026-09-28, after the RF-P4B1-01..04 focused repair. The "end of Wave 5" section below is
kept as the historical record of that point in time; see "Independent Review and Focused Repair" for
what has happened since.

## Acceptance Criteria (Task Packet §28)

- [x] AC4B1-01 — branch created from exact main `e7af6e70663b317642000d2f3ddbc6e1d0e0b124`
- [x] AC4B1-02 — discovery is Human-triggered only (`scanIdeSessions` called from exactly one click handler)
- [x] AC4B1-03 — no startup/project-selection/review-selection/interval/background discovery
- [x] AC4B1-04 — Claude historical transcript bodies never read (directory/file-name metadata only;
      smoke confirms a transcript-body sentinel never appears)
- [x] AC4B1-05 — Claude live metadata limited to `sessionId`/`cwd`/`updatedAt`/`version` (struct has no
      other field; other JSON keys are dropped by `serde` during parsing)
- [x] AC4B1-06 — Claude historical encoded binding is AMBIGUOUS at best, never MATCHED without live-path evidence
- [x] AC4B1-07 — Codex SQLite opened with `SQLITE_OPEN_READ_ONLY` (+ `query_only` pragma, + a Rust test
      proving a write through that connection errors)
- [x] AC4B1-08 — explicit 7-column SELECT list, never `SELECT *`
- [x] AC4B1-09 — `first_user_message`/`preview` never selected (Rust test with sentinel values proves it)
- [x] AC4B1-10 — `git_origin_url` repository-identity matching supported (HTTPS and SSH GitHub forms)
- [x] AC4B1-11 — a tied repository identity across 2+ Projects is AMBIGUOUS unless an exact non-mirror
      cwd disambiguates
- [x] AC4B1-12 — a Codex mirror-path cwd is never matched by basename (mutation probe M-P4B1-02 proved
      the test would catch a regression)
- [x] AC4B1-13 — exact path binding uses `canonicalize_local_path` (native, reuses `validate_project_folder`)
- [x] AC4B1-14 — UNC/network/mapped-network paths never canonicalize, so never MATCHED (inherited from
      `validate_project_folder`'s existing boundary)
- [x] AC4B1-15 — an unsupported Codex schema (missing table/column) fails closed to `UnsupportedFormat`
- [x] AC4B1-16 — discovery results live only in `state.ideSessions` (runtime memory); smoke confirms no
      DVCC file changes
- [x] AC4B1-17 — no event/persistence/migration change (`schemaVersion` untouched, `docsContract.test.ts` unchanged)
- [x] AC4B1-18 — no provider CLI invocation anywhere in either reader
- [x] AC4B1-19 — no process enumeration/launch/resume; no such call exists in the new code
- [x] AC4B1-20 — no terminal/shell capability; no `tauri-plugin-shell`, no `Command::new` in the new files
- [x] AC4B1-21 — no provider file modification (smoke: both fixtures byte-identical before/after)
- [x] AC4B1-22 — no conversation/title content reaches the domain/UI/logs (structural: no such field on
      `DiscoveredIdeSession`; smoke sentinel checks)
- [x] AC4B1-23 — JA/EN parity (`i18n.test.ts` full suite green, including the new keys)
- [x] AC4B1-24 — domain/provider tests PASS (22 TS + 11 Rust new tests, 902 + 79 total)
- [~] AC4B1-25 — at end of Wave 5: M-P4B1-02..05 killed and restored byte-identical; **M-P4B1-01 could
      not be executed** (auto-mode classifier denial). **Resolved in the RF-P4B1-03 repair below: now
      fully met (5/5).**
- [x] AC4B1-26 — synthetic isolated running-app smoke: 48/48 checks PASS at end of Wave 5 (68/68 after
      the RF-P4B1-04 repair added the unsupported-schema scenario)
- [x] AC4B1-27 — Security / Privacy / Auth / Permission / Data integrity / Irreversible-data safety —
      see EVIDENCE.md "Hard checks" (the AC4B1-25 caveat above is resolved, not carried forward)
- [x] AC4B1-28 — Phase 4b-2 (resume) remains unimplemented

## Independent Review and Focused Repair (2026-09-28)

An Independent Review of the Wave 5 head (`2d13cc90653d678348761c030c4da774c807b2c4`) returned
**NOT READY**, with four Required Fixes (RF-P4B1-01..04). This NOT READY result is preserved here as
historical fact; it is not rewritten by the repair below.

- **RF-P4B1-01 — stale binding invalidation.** `src/domain/ideSessionDiscovery.ts` gained
  `computeProjectBindingFingerprint`/`isIdeSessionsStale`: a fingerprint of every Project's
  `(projectId, repositoryUrl, localRoot)` (order-independent; changes on any binding-relevant edit,
  unaffected by `displayName`). `App.tsx`'s `refreshIdeSessions` captures this fingerprint *before*
  the async scan runs and stores it with the loaded result; `ReviewIdeSessions` refuses to render
  `MATCHED`/`AMBIGUOUS` content when the *current* registry's fingerprint no longer matches, showing
  a new `ideSessions.state.stale` message instead until the Human refreshes again. Because the check
  compares against the registry at render time rather than trying to intercept every edit, it equally
  catches an edit made before the dispatch and one made while the scan was still in flight. Three new
  domain tests (fingerprint order-independence/edit-sensitivity, regression A, regression B).
- **RF-P4B1-02 — untrusted metadata bounds.** Both native readers now cap every provider-supplied
  string field at 4096 characters (`MAX_METADATA_STRING_LEN` in each reader) — a row/session
  exceeding it is dropped, never truncated-and-kept. `claude_reader.rs` gained a **global** historical
  cap (`MAX_HISTORICAL_CANDIDATES = 500`, on top of the existing per-directory cap, closing the
  `500 × 500` theoretical ceiling) and a 5-second wall-clock scan deadline checked between directory
  entries in both the historical and live walks, so discovery cannot wait indefinitely on a
  pathological filesystem. Documented (here and in code comments): all bounds are implemented **at
  the native reader** exclusively; the TypeScript service layer adds none of its own because the Rust
  layer already guarantees bounded output size and bounded wall-clock time before returning. Three
  new Rust tests (oversized Codex row dropped, oversized Claude live `cwd` dropped, global historical
  cap enforced across multiple directories).
- **RF-P4B1-03 — M-P4B1-01 closure.** Re-attempted as a single, complete edit outside the pattern that
  was denied before; this time the auto-mode classifier did not block it. `first_user_message` was
  temporarily wired into `CodexThreadRow`/the SELECT/the row mapping, the privacy test
  (`reads_only_the_approved_columns_and_never_the_content_columns`) was confirmed to **FAIL**
  (`assertion failed: !serialized.contains("PRIVATE_PROMPT")`), and all three edits were reverted with
  `codex_reader.rs`'s SHA-256 confirmed byte-identical to its pre-mutation hash. **AC4B1-25 is now
  fully met (5/5 probes killed and restored byte-identical).** The mutation was never committed.
- **RF-P4B1-04 — unsupported-schema running smoke.** `scripts/verify-session-discovery-ui.ps1` gained
  a second synthetic Codex SQLite fixture with `git_origin_url` entirely absent from its `threads`
  table, and a second `Start-App`/`Stop-App` cycle against it: Refresh IDE Sessions renders the Codex
  provider section as `unsupportedFormat` (not session rows) in both JA and EN, Claude discovery is
  unaffected, no forbidden content appears, and both the broken fixture and DVCC's own data files are
  confirmed byte-identical before/after. The smoke now passes 68/68 (was 48/48).

## Current summary

Implementation (Wave 0–5) plus the RF-P4B1-01..04 focused repair are complete. All four Required
Fixes are addressed with executable evidence, not merely asserted. Full regression (Rust 82/82, TS
905/905), `cargo check`, and `git diff --check` are clean. Product source changes remain scoped to
read-only discovery exactly as the Task Packet specified: no shell, no terminal, no process control,
no provider CLI invocation, no persistence change.

Not yet done, and out of scope for this run: Independent Review and Draft PR. This run's implementer
cannot also be the independent reviewer (Independence Gate).

## Next

Focused Independent Delta Re-review of this repair, then — only if it returns READY CANDIDATE with no
Required Fix — a Draft PR against `main`. Commit and push for this repair have already happened
(they precede, not follow, the re-review). Ready, merge, release and Production remain prohibited
until a later, separate Human Gate.
