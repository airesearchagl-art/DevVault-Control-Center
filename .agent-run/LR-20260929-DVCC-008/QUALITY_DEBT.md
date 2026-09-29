# Quality Debt — LR-20260929-DVCC-008 (Phase 4b-2a Resume Handoff)

## Carried, explicitly not changed by this run

- **DF-05 (Low, safe direction)** — Claude historical directory encoder diverges from the provider's
  documented rule (every non-alphanumeric character → `-`, with truncation + hash above 200
  characters); DVCC only maps `:` `\` `.` `/`. Effect: such a Project's history is NO_MATCH (hidden)
  instead of AMBIGUOUS; never a false MATCHED. Claude Resume is entirely disabled in 4b-2a, so it does
  not affect this phase. **Candidate Phase 4b-1.2 repair before any future Claude Resume enablement.**
- QD-001, QD-002, QD-003, QD-005, QD-006, QD-007 (see `.agent-run/LR-20260921-DVCC-004/QUALITY_DEBT.md`)
  remain open and unaffected.

## New from this run

- **DF-06 (Low; pre-existing Phase 4b-1 behavior; needs a Human decision)** — observed in the real-data
  dogfood with Codex running. In 3/3 tight windows each containing one discovery refresh, Codex's
  `state_5.sqlite-shm` (SQLite WAL-index) file's last-write time changed; its SHA-256 content was
  unchanged in 3/3, and `state_5.sqlite` / `state_5.sqlite-wal` were unchanged. In 3/3 idle windows
  of the same length with DVCC running but not refreshing, nothing changed. So the read-only,
  `query_only` Codex reader touches the WAL-index file's timestamp as part of SQLite's normal WAL
  reader protocol. No database or WAL content is modified. This refines the earlier dogfood
  statement "provider files unchanged" (then measured with no such change): the precise fact is
  "provider data (database and WAL) unchanged; the WAL-index `-shm` may have its timestamp updated".
  Not introduced by 4b-2a (the copy click itself was measured to touch no provider file). A repair
  would change `src-tauri/src/codex_reader.rs`, forbidden in this run. Options for a later decision:
  accept and document the precise contract, or research a reader mode that avoids even the timestamp
  touch without weakening consistency against a live writer (`immutable=1` is not safe with Codex
  running).
- Unit tests cannot click (no DOM test environment; no dependency added), so the UI click wiring's
  full-ID guarantee is enforced by the running-app smoke (and by the parser failing closed on labels).

## Explicit unverified

- Behaviour of `codex resume <id>` itself was never executed (by design); cross-process
  double-resume behaviour and CLI/desktop version compatibility remain undocumented provider facts
  (see the research report); DVCC mitigates with the UI-only caution note.
- Manual screen-reader behaviour of the new per-row control (pre-existing QD-007 gap).
