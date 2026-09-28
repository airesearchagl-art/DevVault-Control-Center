# Decisions — LR-20260929-DVCC-007 (Phase 4b-1.1)

- D-4B11-001 — DF-01 changes exactly one constant (`MAX_SESSIONS`, `codex_reader.rs`). The query
  keeps `LIMIT MAX_SESSIONS + 1`; `hit_cap`, `complete`, the `InterruptHandle` query deadline, the
  borrowed-value length checks and the approved seven-column projection are untouched. The existing
  one-by-one-insert cap test was moved onto a transactional fixture helper so 1000+ row tests stay
  fast; its assertions are unchanged.
- D-4B11-002 — DF-02 is implemented only in the TypeScript binding layer
  (`claudeHistoricalKey` in `src/domain/ideSessionDiscovery.ts`), because the comparison lives there;
  the Rust Claude reader only lists names and needs no change. The key is
  `encodeClaudeWorkspacePath(localRoot).toLowerCase()` on the Project side and
  `encodedDirName.toLowerCase()` on the provider side. JavaScript `toLowerCase` is deterministic.
  The single-candidate branch still yields AMBIGUOUS, and a casing collision yields the existing
  "encoding collision" AMBIGUOUS reason.
- D-4B11-003 — DF-03 is a pure function (`src/domain/sessionIdLabels.ts`), computed per provider
  section over the IDs actually rendered there. Every ID in a colliding label group widens by 4
  characters on each side per round; an ID whose label would be no shorter than itself is shown in
  full. Termination and uniqueness: a collision group always contains at least one ID that can still
  widen (two distinct full IDs are distinct strings, so they cannot share a label), and widening is
  bounded by ID length. Labels depend only on the set of IDs, not on order, locale or any other field.
  React row keys still use the full `sessionId`; only the rendered text changed.
- D-4B11-004 — the README contract test (`src/test/docsContract.test.ts`) asserted the pre-merge
  status wording ("under development", "no pull request has been opened"). Reconciling the README
  (DF-04) necessarily updates that test to the current facts: Phase 4a merged via PR #5, Phase 4b-1
  merged via PR #6 with the post-merge `main` SHA, Phase 4b-2 not implemented / deferred, not
  released. It now also asserts the stale phrases are absent.
- D-4B11-005 — README boundary wording: "No … provider-owned absolute path is read or shown" was
  inaccurate (a session's workspace path *is* read, internally, to decide the binding). Now: the
  workspace path is read internally only for binding and is never displayed or persisted, and neither
  is any provider storage path.
- D-4B11-006 — the erratum for LR-20260928-DVCC-006 is appended as a clearly labelled addendum to
  that run's `EVIDENCE.md` and `RUN_STATE.md`. The original (incorrect) lines are deliberately left in
  place, not rewritten; `TASK_PACKET_SNAPSHOT.md` of that run is not touched.
- D-4B11-007 — mutation probes: M-P4B1-01 and M-P4B1-03 re-run as required; three new probes
  (M-P4B11-01..03), one per behavioral finding, prove the new tests actually guard DF-01..03.
  M-P4B1-02 / -04 / -05 were not re-run: their target lines (`bindCodexSessions` branches and the
  Codex required-column gate) are byte-for-byte unchanged by this run.
- D-4B11-008 — the synthetic smoke's main Codex fixture was padded to 379 rows (the real dogfood
  volume) and the over-cap fixture raised from 201 to 1001 rows, so the smoke now proves both sides of
  the new cap. Bulk rows share one `cwd` so the service's per-distinct-path canonicalization stays
  cheap; they are never relevant to any Project.
