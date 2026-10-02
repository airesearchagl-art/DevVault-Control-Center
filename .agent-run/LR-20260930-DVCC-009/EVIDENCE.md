# Evidence — LR-20260930-DVCC-009 (Phase 4b-1.2)

No real path, session ID, repository name, transcript or provider content appears in this file.

## Verification (§20)

```
npm.cmd run typecheck   -> clean
npm.cmd test            -> 38 files, 1034 passed, 0 failed
cargo test --lib        -> 92 passed, 0 failed, 2 ignored
cargo check             -> clean
git diff --check        -> clean
executable Rust delta   -> NONE (0 non-comment changed lines in src-tauri; codex_reader.rs comments only)
immutable/nolock/readonly_shm added -> 0 occurrences
Cargo / Tauri capability / npm dependency / schema / data-contract change -> none
release build           -> npm run tauri build -- --no-bundle (exit 0)
```

## DF-05 unit tests (§8)

`src/domain/ideSessionDiscovery.test.ts` — expected provider directory names are literals, never
derived from the function under test:

| Case | Test | Result |
|---|---|---|
| A underscore | `A: an underscore root finds its provider directory as a candidate -> AMBIGUOUS, not MATCHED` | PASS |
| B space | `B: a space root … -> AMBIGUOUS` | PASS |
| C `:` `\` `/` `.` | `C: ':', '\', '/' and '.' each map to '-'` + existing B/C/K binding tests | PASS |
| (all ASCII punctuation) | `every ASCII character outside [A-Za-z0-9] maps to '-' …` | PASS |
| D/E casing | `D/E: drive-letter and component casing differences stay case-insensitive` + DF-02 suite | PASS |
| F collision | `F: two distinct roots collapsing to one key (underscore vs space) are AMBIGUOUS …` | PASS |
| G non-ASCII | `G: a non-ASCII path is unsupported, with no guessed key` | PASS |
| H >200 | `H: an ordinary encoded key longer than the limit is unsupported …` (200 supported, 201 unsupported) | PASS |
| G/H binding | `G/H: unsupported roots never become candidates and are reported Project-level …` | PASS |
| J | `J: an unsupported-history Project still gets its live exact MATCHED row` | PASS |
| K | `K: a historical session is never MATCHED from the directory key alone …` | PASS |

`src/features/reviews/ReviewIdeSessions.test.ts` (JA + EN each):
I — unsupported history + no live session → `historyUnsupported` + warning, never `empty`/"No
match", no root or encoded name rendered; J — live MATCHED row + warning; supported root → no
warning. PASS.

`src/test/docsContract.test.ts`: PR #8 / new SHA / 4b-2b deferred / copy-only does-not-run / no
"under development" anywhere; DF-06 boundary paragraph present and never "all provider files
unchanged". PASS.

## Mutation campaign (§19)

Driver kept in the session scratchpad (not committed). Each: apply → targeted vitest (domain + UI
tests) → restore → SHA-256 compare.

| Probe | Mutation | Failing tests | Result | Restored byte-identical |
|---|---|---|---|---|
| M-P4B12-01 | old narrow encoder (`:` `\` `.` `/` only) | 5 | KILLED | yes |
| M-P4B12-02 | `claudeHistoricalKey` case-sensitive | 5 | KILLED | yes |
| M-P4B12-03 | >200 key truncated to 200 and treated as supported | 2 | KILLED | yes |
| M-P4B12-04 | non-ASCII check removed (non-ASCII encoded) | 7 | KILLED | yes |
| M-P4B12-05 | single historical candidate promoted to MATCHED | 8 | KILLED | yes |
| M-P4B12-06 | unsupported-history warning suppressed (ordinary No match) | 4 | KILLED | yes |

Post-campaign `git status`: only the intended working changes. No SQLite runtime flag was mutated.

## Synthetic running-app smoke (§15/§16)

`scripts/verify-session-discovery-ui.ps1` against the fresh release build: **220 passed, 0 failed,
0 inconclusive.**

- DF-05 (JA + EN): Project F (underscore + space root) history → AMBIGUOUS, never MATCHED, no
  warning; Project G (non-ASCII root, live session) → live MATCHED row + unsupported-history
  warning, no path in the section; Project H (non-ASCII, no live) → `historyUnsupported` + warning,
  never ordinary No match. Fixture asserts the old narrow encoder would have produced a different
  directory name for F.
- Existing non-WAL fixture checks relabelled "this synthetic (non-WAL) … fixture is byte-identical"
  (PASS).
- WAL-mode scenario (DF-06):

| Check | Result |
|---|---|
| fixture: `-wal` present, holds the data (not checkpointed) | PASS (WAL 20632 B; DB 4096 B header only) |
| fixture stable before measured window (helper idle) | PASS |
| A: WAL-only row read (Codex MATCHED for project-a, complete) | PASS |
| B: database hash + length unchanged | PASS (4096 → 4096) |
| C: WAL hash + length unchanged | PASS (20632 → 20632) |
| D: no checkpoint / truncate / migration | PASS |
| E: `-shm` recorded, never failed on | **RECORD: present before/after; bytes changed = True; mtime changed = False** |
| F: DVCC data byte-identical | PASS |
| G: no spawned process left running; no new process/shell/network path in code | PASS |

E is exactly the DF-06 contract: SQLite updated the `-shm` read-mark/lock bytes during DVCC's
read-only read, while database and WAL application data were unchanged.

`scripts/verify-resume-handoff-ui.ps1` (label-only change): **63 passed, 0 failed.**

## Real-data dogfood — DF-05 (§17)

Isolated `DVCC_DATA_DIR` under `%TEMP%` (deleted afterwards); no `DVCC_*_HOME_DIR` override, so real
providers were read by DVCC read-only. Only directory NAMES were inspected structurally; no
transcript or file content was read. Driver and its local root list are scratchpad-only.

Structural scan (directory names only): 41 Claude project directories; among local folders, 9 roots
resolve under both encoders and **18 roots resolve only under the ordinary rule**; the previously
missed character kinds were `_` and space.

Running app (synthetic DVCC records pointing at real roots: P-live = a root with a live Claude
session; P-us = an underscore-shaped root; P-sp = a space-shaped root):

| Project | Claude result | Old narrow encoder dir exists? |
|---|---|---|
| P-live | status ok; MATCHED 1 (live, "matched by exact workspace"); AMBIGUOUS 5; warning no | — |
| P-us | status ok; AMBIGUOUS 1; MATCHED 0; warning no | no → before the fix: NO_MATCH (hidden) |
| P-sp | status ok; AMBIGUOUS 4; MATCHED 0; warning no | no → before the fix: NO_MATCH (hidden) |

- Previously-missed ASCII naming case now AMBIGUOUS: **yes** (both shapes).
- False MATCHED: **none** (every MATCHED row is live exact-workspace). Note: a first run reported
  `matchedNonLive=1` because the driver's Japanese reason regex was mis-decoded by Windows
  PowerShell 5.1 (BOM-less script); after rewriting it with `\u` escapes the same data gave 0. This
  was a driver artifact, not a product result.
- Claude live exact MATCHED behavior unchanged (1 live MATCHED, as in LR-007's P1).
- Path leak in the Claude section: none (3/3). DVCC isolated data unchanged.

## Real-data observation — DF-06 (§18)

Codex was running naturally. One bounded window around the dogfood discovery: DB hash/length same;
WAL present, hash/length same; `-shm` bytes changed = False, mtime changed = False (this window).
No provider content read; no `immutable`/`nolock`/`readonly_shm`. **No DB/WAL change attributable
to DVCC.**

## Historical errata (§14)

Appended (diff shows 0 removed lines): `.agent-run/LR-20260928-DVCC-006/EVIDENCE.md`,
`.agent-run/LR-20260928-DVCC-006/RUN_STATE.md`, `.agent-run/LR-20260929-DVCC-007/EVIDENCE.md`.
LR-008 and every prior Task Packet snapshot untouched.

## Security / Privacy / Data integrity (§22/§23)

- Security / Auth / Permission: PASS — no capability, command, process, shell or network change.
- Privacy: PASS — no new provider field read; warning text has no path; no real path/ID in artifacts.
- Data integrity: PASS — SQLITE_OPEN_READONLY, query timeout, MAX+1, metadata bounds, schema gate and
  fixed column projection unchanged (comment-only Rust diff).
- Irreversible-data safety: PASS — DB/WAL unchanged (synthetic WAL smoke + real observation); DVCC
  data unchanged.

## Phase Gate (§26)

- DF-05: **CLOSED_PARTIAL_COMPAT**
- DF-06: **ACCEPTED_AND_DOCUMENTED**
- Phase 4b-1.2: **PASS** (pending Independent FULL Review)
- Phase 4b-2b research: **READY** — DF-05 boundary explicit and tested; DF-06 reconciled; no false
  MATCHED; no DB/WAL modification attributable to DVCC; no new privacy/security regression.
  Phase 4b-2b implementation not started.
