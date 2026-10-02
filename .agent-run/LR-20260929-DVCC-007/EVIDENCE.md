# Evidence — LR-20260929-DVCC-007 (Phase 4b-1.1 Post-Merge Dogfood Findings Repair)

Privacy convention: no real user-home path (`<USER_HOME>`), no real session ID, no real repository
name, no transcript/content, no credentials. Real-data projects are referred to as P1–P6.

## Fresh Gate

- `git fetch origin`, `git switch main`, `git pull --ff-only`: already up to date.
- HEAD = `origin/main` = `93a703e6a7eba5ec1c66a5eaf43f0c0edbf2f69d`; working tree clean.
- `gh pr view 6`: `MERGED`.
- `feat/session-discovery-v0.4b1.1`: absent locally and on `origin` before creation; created from
  that exact `main`.
- Task Packet snapshotted before implementation; SHA-256
  `2c7b363b9215f4ef5e259456c6caf3295ca5efc9614ed6799b3eb2f51131af7b`.

## Files changed

```
 M .agent-run/LR-20260928-DVCC-006/EVIDENCE.md     (post-merge erratum appended; nothing rewritten)
 M .agent-run/LR-20260928-DVCC-006/RUN_STATE.md    (post-merge erratum appended; nothing rewritten)
 M README.md
 M scripts/verify-session-discovery-ui.ps1
 M src-tauri/src/codex_reader.rs
 M src/domain/ideSessionDiscovery.test.ts
 M src/domain/ideSessionDiscovery.ts
 M src/features/reviews/ReviewIdeSessions.test.ts
 M src/features/reviews/ReviewIdeSessions.tsx
 M src/test/docsContract.test.ts
?? src/domain/sessionIdLabels.ts
?? src/domain/sessionIdLabels.test.ts
?? .agent-run/LR-20260929-DVCC-007/**
```

Not changed: `.agent-run/LR-20260928-DVCC-006/TASK_PACKET_SNAPSHOT.md`, `Cargo.toml`, `Cargo.lock`,
`package.json`, `package-lock.json`, `claude_reader.rs`, `launcher.rs`, the service layer, app state,
i18n dictionaries, Tauri capabilities.

## DF-01 — Codex capacity

`MAX_SESSIONS` 200 → 1000 in `src-tauri/src/codex_reader.rs`. Unchanged: `LIMIT MAX_SESSIONS + 1`,
`hit_cap`/`complete`, `QUERY_TIMEOUT` + `InterruptHandle`, `checked_text` pre-allocation bounds, the
fixed seven-column projection, `SQLITE_OPEN_READ_ONLY`, `query_only`.

| Packet test | Rust test |
|---|---|
| A. 379 ordinary rows → complete | `a_real_sized_379_row_dataset_is_complete` |
| B. exactly 1000 rows complete when no more exist | `exactly_the_cap_is_complete_when_no_more_rows_exist` |
| C. 1001 rows → ≤1000 returned, incomplete | `one_row_over_the_cap_is_truncated_and_incomplete` (+ `row_count_is_bounded`, 1010 rows) |
| D. query timeout still fails closed to incomplete | `a_deadline_already_in_the_past_fails_closed_to_incomplete_without_querying`, `a_slow_query_never_makes_the_scan_wait_far_beyond_its_timeout` (unchanged, passing) |
| E. privacy SELECT contract unchanged | `reads_only_the_approved_columns_and_never_the_content_columns` (unchanged, passing; M-P4B1-01 re-killed) |
| F. pre-allocation bounds unchanged | `every_approved_text_column_is_bounds_checked_before_allocation`, `a_row_with_an_oversized_metadata_string_is_dropped_not_truncated_and_kept` (unchanged, passing) |

Plus `the_cap_is_the_human_decided_1000`.

## DF-02 — Claude historical case handling

`claudeHistoricalKey(encoded) = encoded.toLowerCase()` applied to both the Project-side forward
encoding and the provider directory name before lookup. Tests (`ideSessionDiscovery.test.ts`, describe
"Claude historical key case handling (DF-02 …)"):

- A: provider key from `c:\work\StockPilot` vs Project `C:\work\StockPilot` → candidate, AMBIGUOUS.
- B: path-component casing differences compare equivalently → AMBIGUOUS.
- C: two Project roots differing only by case share a key → AMBIGUOUS, both candidates listed.
- D: four case variants, with a canonical path available, never produce MATCHED.
- Plus: a key differing by more than case stays NO_MATCH.

## DF-03 — session ID presentation

`src/domain/sessionIdLabels.ts` (pure): default `<first 8>…<last 8>`; every ID in a colliding group
keeps 4 more characters per side per round; full ID when no abbreviation can separate them.
`ReviewIdeSessions.tsx` computes labels per provider section over the rendered IDs; the row carries
`data-testid="ide-session-id"`. Underlying `sessionId` values, React keys, persistence (none) unchanged.

Tests — `sessionIdLabels.test.ts` (9): default form; short ID readable; UUIDv7-shaped IDs sharing
their first 8 characters distinct; prefix+suffix collision widens deterministically; full-ID
fallback; unaffected ID keeps the short label; determinism / order-independence / duplicate inputs;
seeded bulk check over 25 time-clustered sets with adversarial neighbours; **real-shape regression
fixture** (379 synthetic time-ordered IDs with 8-character prefix groups — the dogfood pattern, no
real ID copied). `ReviewIdeSessions.test.ts` (+4): rendered labels distinct; deterministic across
renders and identical in JA and EN; short ID readable; labels derived from (never altering) the ID.

## DF-04 — documentation

- README status block: Phase 4a merged via PR #5; Phase 4b-1 merged via PR #6; `main` after PR #6
  `93a703e6a7eba5ec1c66a5eaf43f0c0edbf2f69d`; Phase 4b-2 not implemented / deferred; not released, no
  installer. IDE Sessions bullet: "merged via PR #6". Boundary wording corrected (workspace path read
  internally for binding only; never displayed or persisted; no provider storage path either).
- `docsContract.test.ts` README-status test updated to those facts (see DECISIONS D-4B11-004).
- Erratum appended to `.agent-run/LR-20260928-DVCC-006/EVIDENCE.md` and `RUN_STATE.md`: the reported
  "36 files / 921 tests" was wrong; the actual final pre-merge TS verification was **35 files / 913
  tests**; the checks themselves passed; the correction was established during the post-merge
  dogfood. Original lines left in place; both prior NOT READY reviews untouched;
  `TASK_PACKET_SNAPSHOT.md` of that run untouched.

## Verification (Task Packet §12)

```
npm.cmd run typecheck   -> clean
npm.cmd test            -> Test Files 36 passed (36) / Tests 931 passed (931)
                           (was 35 / 913 on main: +1 file, +18 tests = 5 DF-02 + 9 labels + 4 UI)
cargo check             -> clean
cargo test --lib        -> 92 passed, 0 failed, 2 ignored   (was 88: +4 DF-01)
git diff --check        -> clean
```

## Mutation probes

Baseline SHA-256 before the campaign: `codex_reader.rs` `16d865e4b398dfb6eb44ca64c993471cfe9698423a5d647209c83c32da31bc71`;
`ideSessionDiscovery.ts` `6456c5468378ff80ea0b90a4b46c92161eb4afc5b5583d7dd12691dd87bb982f`;
`sessionIdLabels.ts` `63f74c8b43e8da88a92eeb688dd3225ade6833da9ecdbcbb332f3c82a50cbad5`.
Every revert was a targeted Edit (never `git checkout`); hashes re-checked after each revert and all
three re-confirmed with `sha256sum -c` at the end; full suites re-run green afterwards.

| Probe | Mutation | Killed by | Restored |
|---|---|---|---|
| M-P4B1-01 | `first_user_message` wired into SELECT / struct / row mapping | `reads_only_the_approved_columns_and_never_the_content_columns` (`!serialized.contains("PRIVATE_PROMPT")`) | yes |
| M-P4B11-01 (DF-01) | `LIMIT MAX_SESSIONS + 1` → `LIMIT MAX_SESSIONS` | `one_row_over_the_cap_is_truncated_and_incomplete`, `row_count_is_bounded` | yes |
| M-P4B1-03 | single historical candidate AMBIGUOUS → MATCHED | original test B + DF-02 tests A, B, D (4) | yes |
| M-P4B11-02 (DF-02) | `claudeHistoricalKey` made case-sensitive again | DF-02 tests A, B, C, D (4) | yes |
| M-P4B11-03 (DF-03) | collision widening disabled (fixed first-8…last-8) | 5 `sessionIdLabels` tests + 1 UI test (6) | yes |

Not re-run (target lines unchanged): M-P4B1-02, M-P4B1-04, M-P4B1-05.

## Synthetic running-app smoke

Release binary rebuilt (`npx tauri build --no-bundle --ci`). `scripts/verify-session-discovery-ui.ps1`
additions: main Codex fixture padded to 379 rows (→ must be complete); over-cap fixture 201 → 1001
rows (→ must stay incomplete); four synthetic UUIDv7-shaped Codex IDs for Project A sharing their
first 8 characters (two also sharing their last 8); Project E whose Claude history directory is
encoded from a lowercase-drive root; a "no control other than Refresh" (no Resume) check. All fixtures
synthetic; no real provider data.

```
checks: 134 passed, 0 failed, 0 inconclusive   (was 106/106)
```

Key new assertions, JA and EN: 379-row Codex dataset `data-provider-status="ok"` (complete);
duplicate-prefix IDs render as 5 distinct labels, identical across the JA/EN switch; Project E's
case-varied history candidate is AMBIGUOUS (not NO_MATCH / MATCHED); the card's only control is
Refresh; 1001-row dataset renders `incomplete`; every content sentinel absent; all four provider
fixtures and DVCC's own files byte-identical before/after; no spawned process left; operator
clipboard untouched.

## Real-data re-dogfood

Same safety rules as the post-merge dogfood: isolated `DVCC_DATA_DIR` under `%TEMP%` (deleted
afterwards); no `DVCC_*_HOME_DIR` override, so the real local provider sources were read, read-only;
ground truth for verification came from a byte copy of the Codex DB queried for approved columns
only and deleted immediately, and from approved Claude live fields; nothing printed or committed
contains a real path, real session ID or repository name; no screenshots. Driver kept in the session
scratchpad, not committed.

Projects (synthetic DVCC records pointing at real identities): P1 this repository (localRoot +
repositoryUrl); P2 a VS Code-launched workspace (localRoot only; its Claude live cwd uses a lowercase
drive letter); P3 / P4 / P5 three repositories with Codex sessions (repositoryUrl only; P4's Codex
origin is SSH while the Project URL is HTTPS; P5's sessions all lay beyond the old 200 cap); P6 an
empty control folder.

```
checks: 46 passed, 0 failed, 0 inconclusive
```

| Observation | Before (post-merge dogfood) | Now |
|---|---|---|
| Codex scan | 379 threads, `complete=false` every time | 380 threads, `complete=true` |
| P5 (sessions only beyond old cap) | Codex `incomplete`, 0 rows | Codex `ok`, 34 MATCHED (repository identity) |
| P4 | 22 MATCHED + incomplete note | 31 MATCHED, complete |
| P3 | 56 MATCHED + incomplete note | 56 MATCHED, complete |
| P2 Claude | MATCHED ×2 (live) | MATCHED ×2 (live, unchanged) + **AMBIGUOUS ×5** (lowercase-drive history) |
| P1 Claude | MATCHED ×1 + AMBIGUOUS ×4 | unchanged |
| Projects with no session | Codex `incomplete` (absence unconfirmed) | Codex `empty` (normal No match — scan complete) |
| Codex ID labels | duplicated first-8 labels (P3: 4 duplicated labels) | unique in every section; P3 8 rows and P4 4 rows share an 8-char prefix yet render distinctly |

- Binding sanity: every MATCHED row resolved to exactly one ground-truth ID and independently
  re-derived (Claude: Live + "Matched by exact workspace" + cwd equals the Project root; Codex:
  "Matched by repository identity" + normalized origin equals the Project repository). **No false
  MATCHED.**
- Privacy: IPC payload keys exactly the approved shape (Claude historical `encodedDirName/sessionId/
  updatedAtMs`, live `sessionId/cwd/updatedAtMs/version`; Codex `id/cwd/createdAt/updatedAt/
  cliVersion/archived/gitOriginUrl`); the IDE Sessions card never contains a drive path, UNC prefix,
  `.claude`/`.codex`, `state_5`, URL or full UUID; no provider-only path fragment anywhere on the page
  (12 renders, JA+EN). **No privacy leak.**
- Stale: P3 edited to another real repository → STALE shown, no previous row presented;
  after Refresh 62 new MATCHED rows, all verified against the new repository, 0 overlap with the 56
  old ones (compared by resolved ID, since labels depend on the displayed set). **PASS.**
- DVCC persistence: discovery-only phase byte-identical (7 files); post-edit discovery byte-identical
  (8 files); only the Human edit wrote `projects.json` (+ `.bak`); no `events.jsonl`.
- Provider sources: Codex was running throughout; its DB, WAL and SHM were byte-identical before and
  after (SHA-256) and unchanged in three tight windows around discovery calls. Of ~99k Claude
  metadata entries exactly one changed: this Claude Code session's own transcript (DVCC never opens
  `.jsonl` content). **No provider modification.**
- Performance (coarse): Claude IPC 5–7 ms (79 historical + 8 live, complete); Codex IPC 8–10 ms (380
  rows, complete); UI refresh ≈ 306–325 ms including the driver's 300 ms polling granularity —
  comfortably responsive.

## Re-dogfood gate (Task Packet §15)

- DF-01: CLOSED — DF-02: CLOSED — DF-03: CLOSED — DF-04: CLOSED
- False MATCHED: none — Privacy leak: none — Provider modification: none
- No new Medium+ finding.
- Phase 4b-1.1: PASS
- Phase 4b-2 Entry: READY_FOR_RESEARCH (every §15 condition met). Implementation of Phase 4b-2 is
  still not started and remains out of scope.

## Hard checks

- Security: PASS — no dependency, feature or capability change; one constant raised within a hard,
  still-detected bound.
- Privacy: PASS — approved projections unchanged (M-P4B1-01 re-killed); labels use only the ID itself.
- Auth / Permission: unaffected.
- Data integrity: PASS — no persistence path; smoke and re-dogfood byte-identity checks.
- Irreversible-data safety: PASS — read-only everywhere; no migration.

## Independent Review

**Pending.** This run's implementer cannot review its own work (Independence Gate).

---

## Errata — appended by LR-20260930-DVCC-009 (Phase 4b-1.2, DF-06 / HD-4B12-02)

Append-only clarification. "Provider modification: none" and "its DB, WAL and SHM were
byte-identical before and after" above remain the historical observation of that run's bounded
windows. They are not the general contract: LR-20260929-DVCC-008 later observed the Codex
`state_5.sqlite-shm` last-write time change during discovery while the database and WAL did not.
The general contract is now DF-06 / HD-4B12-02: DVCC does not modify provider application data (the
database and WAL application data); SQLite may update the live WAL database's `-shm` coordination
file (read-mark / lock bytes, filesystem metadata), which holds no database content. See
`.agent-run/LR-20260930-DVCC-009/`.
