# Quality Debt — LR-20260929-DVCC-007 (Phase 4b-1.1)

## Closed by this run

- DF-01 (Medium) Codex cap made every real scan incomplete — CLOSED (real data: complete at 380 rows).
- DF-02 (Low) case-sensitive Claude historical key hid real AMBIGUOUS candidates — CLOSED.
- DF-03 (Low) first-8 Codex ID labels collided — CLOSED.
- DF-04 (Low) incorrect TS count in LR-20260928-DVCC-006 evidence; stale README — CLOSED (erratum
  appended, README reconciled).

## Carried forward, unaffected

QD-001, QD-002, QD-003, QD-005, QD-006, QD-007 (see `.agent-run/LR-20260921-DVCC-004/QUALITY_DEBT.md`)
remain open; none concern session discovery.

## Observations (not defects; recorded for Phase 4b-2 research)

- Headroom: the real Codex dataset is 380 threads against the new 1000 cap. If it grows past 1000,
  scans correctly report incomplete again; Project-aware filtering was explicitly deferred by the
  Human Decision and can be researched then.
- `~/.claude/projects` also holds ordinary working folders (not Claude-encoded directories), which the
  historical scan lists harmlessly (no UUID-named `.jsonl` at their top level). They count toward
  `MAX_PROJECT_DIRS` (500); real usage is far below it.
- Phase 4b-2 (Human-selected resume) should select sessions by full `sessionId`, never by a display
  label: labels are unique only within the set shown together and may change when that set changes.

## Explicit unverified

- Manual screen-reader behaviour of the IDE Sessions card (pre-existing QD-007 gap).
- Behaviour above 1000 real Codex threads was exercised synthetically (1001-row fixture), not on real
  data.
