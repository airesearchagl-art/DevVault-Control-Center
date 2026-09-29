# Evidence — LR-20260929-DVCC-008 (Phase 4b-2a Human-selected Resume Handoff)

Privacy convention: no real user-home path (`<USER_HOME>`), no real session ID, no real repository
name, no transcript/content, no credentials. All IDs quoted below are synthetic fixtures.

## Fresh Gate

- `git fetch origin`, `git switch main`, `git pull --ff-only`: up to date.
- HEAD = `origin/main` = `8015682c1270a6832ad555df487492228aa67c9e`; working tree clean.
- PR #7: MERGED. Open PRs: none. `feat/session-resume-handoff-v0.4b2a`: absent locally and on
  `origin` before creation; created from that exact `main`.
- Task Packet snapshotted before implementation; SHA-256
  `3d93a9977ec68774ec7ee47f2b1cc8f1bc40a7eea20d4867fec6a673ead16843`.

## Files changed

```
 M README.md
 M scripts/verify-session-discovery-ui.ps1        (Resume-control assertion updated to the new contract)
 M src/app/App.tsx                                  (onCopyResume wiring; click-time stale/project recheck)
 M src/features/reviews/ReviewDetail.tsx            (prop pass-through)
 M src/features/reviews/ReviewIdeSessions.tsx       (inline per-row action, reasons, UI-only notes)
 M src/features/reviews/ReviewIdeSessions.test.ts
 M src/features/reviews/workflowSurface.test.ts     (fixture wiring: new required prop)
 M src/i18n/en.ts / ja.ts / index.ts                (12 keys each + RESUME_REFUSAL_KEYS)
 M src/test/docsContract.test.ts                    (README status facts)
?? scripts/verify-resume-handoff-ui.ps1
?? src/app/copyResumeCommandAction.ts / .test.ts
?? src/domain/resumeIntent.ts / .test.ts
?? .agent-run/LR-20260929-DVCC-008/**
```

Untouched (verified with `git diff --name-only`): `src-tauri/**` (incl. capabilities), `Cargo.toml`,
`Cargo.lock`, `package.json`, `package-lock.json`, `docs/**`.

## Implementation summary

- `resumeIntent.ts`: `ValidatedSessionId` (branded; only `parseSessionId` creates it), `ResumeRefusal`
  (`STALE_DISCOVERY` / `NOT_MATCHED` / `ALREADY_ACTIVE` / `ARCHIVED` / `INVALID_SESSION_ID` /
  `PROVIDER_NOT_SUPPORTED`), `ResumeIntent { provider: "CODEX"; sessionId; projectId }`,
  `evaluateResume(session, selectedProjectId, stale)` (fixed order, see DECISIONS D-4B2A-003),
  `renderResumeCommand(intent)` → exactly `codex resume ${intent.sessionId}`.
- `copyResumeCommandAction.ts`: seam with only `copy` / `notify`; re-evaluates at click time.
- `ReviewIdeSessions.tsx`: `onCopyResume(session)` receives the full `DiscoveredIdeSession`; every row
  has a "Copy Resume Command" / 「再開コマンドをコピー」 control; ineligible rows show it
  disabled with a localized reason; eligible Codex sections show three UI-only notes (copy-only;
  run from the Project workspace; may already be open in Codex). The visible label remains
  `sessionIdLabels` output (presentation only).
- `App.tsx`: at click time recomputes `stale` and the selected Project ID, then calls the seam with the
  existing write-only `copyText`.

## Unit tests

| File | Tests | Covers |
|---|---|---|
| `src/domain/resumeIntent.test.ts` | 52 | eligibility A–L (+ unknown provider, no mutation); 33 validation negatives (`;` `&` `\|` `` ` `` `$()` space/tab/newline/CRLF, quotes, `../`, `C:\`, `.jsonl` path, `--flag`, name, URL, uppercase, mixed case, 35/37 chars, no hyphens, bad variant, versions 0/9, non-hex, ellipsis label, empty, non-string, null) each also proven INVALID_SESSION_ID through `evaluateResume`; exact rendering, one line, three tokens, no quote/path/option/operator/project/URL; intent keys exactly `projectId/provider/sessionId` |
| `src/app/copyResumeCommandAction.test.ts` | 12 | success (exact full-ID text, one info toast, session unchanged); clipboard failure (one error toast, no success); 7 ineligible cases (copy never called, one localized warning, nothing mutated); label-as-ID refused; copied text contains no note; seam arity 6 |
| `src/features/reviews/ReviewIdeSessions.test.ts` | +20 (32 total) | JA/EN: eligible row enabled + 3 notes; notes contain no path and no full UUID is visible; AMBIGUOUS / archived / invalid-ID / Claude LIVE / Claude historical disabled with localized reason and no notes; stale → no action; incomplete scan keeps warning and eligibility; card controls = Refresh + per-row copy only |

## Verification (Task Packet §12)

```
npm.cmd run typecheck   -> clean
npm.cmd test            -> Test Files 38 passed (38) / Tests 1015 passed (1015)   (main: 36 / 931)
cargo check             -> clean (Rust source unchanged)
cargo test --lib        -> 92 passed, 0 failed, 2 ignored                            (unchanged)
git diff --check        -> clean
```

## Mutation campaign (Task Packet §27)

Baseline SHA-256: `resumeIntent.ts` `ae21c2fc55dcd2ee735a1c6ffcfc570f39978c5189b494dd80516d1241096e49`;
`copyResumeCommandAction.ts` `afe4ee364aa5d6bd6ced759240ec3d7941ae7daac808be387717a78ae81643f5`;
`ReviewIdeSessions.tsx` `aa7d891d698112572c876a8d48b279b0d0f9baaadea1a26eee53f09ae13763d8`.
Every revert was a targeted Edit; hashes re-checked after reverts and all three confirmed with
`sha256sum -c` at the end; full suite green afterwards (38 / 1015).

| Probe | Mutation | Killed by | Restored |
|---|---|---|---|
| M-P4B2A-01a | action seam passes the visible (abbreviated) label as the session ID | 3 action tests | yes |
| M-P4B2A-01b | UI click handler passes the visible label as the session ID (release binary rebuilt) | running-app smoke: 8 copy checks (4 rows × JA/EN) FAIL — nothing copied (fails closed) | yes (binary rebuilt clean) |
| M-P4B2A-02 | allow AMBIGUOUS | 6 tests (domain B, action, UI JA/EN ×2) | yes |
| M-P4B2A-03 | ignore stale | 2 tests (domain E, action) | yes |
| M-P4B2A-04 | skip UUID validation | 36 tests | yes |
| M-P4B2A-05 | add `-C <path>` to the command | 6 tests | yes |
| M-P4B2A-06 | generate `cd … && codex resume …` | 6 tests | yes |
| M-P4B2A-07 | allow Claude LIVE | 4 tests | yes |
| M-P4B2A-08 | allow archived Codex | 4 tests | yes |

## Running-app smoke (synthetic fixtures only)

`scripts/verify-resume-handoff-ui.ps1` (new): hidden isolated desktop, CDP, in-page clipboard
interceptor (the Windows clipboard is never written). Synthetic Codex DB: 4 eligible repo-A threads
(UUIDv7-shaped; two share prefix and suffix so their labels widen), 1 archived repo-A thread, 1
shared-repository thread (AMBIGUOUS for Project B); synthetic Claude LIVE session in Project A's
folder.

```
checks: 63 passed, 0 failed, 0 inconclusive
```

JA and EN: exactly the 4 eligible rows enabled; archived row disabled with a localized reason; Claude
LIVE MATCHED → ALREADY_ACTIVE with a localized reason; three notes shown, containing no path; for each
eligible row the visible label is abbreviated and the intercepted clipboard text is exactly
`codex resume <FULL UUID>` (one line, three tokens, no ellipsis/path/quote); pressing a disabled
row's button copies nothing; no shell/terminal/provider process descends from the app; Project B's
AMBIGUOUS row disabled with a localized NOT_MATCHED reason and no notes; refusal texts differ between
JA and EN; no full UUID is visible text; content sentinels absent; DVCC data byte-identical after
discovery and all 8 copies, no `events.jsonl`; after a binding-relevant Project edit the stale card
offers no copy action; both provider fixtures byte-identical; operator clipboard untouched.

Regression: `scripts/verify-session-discovery-ui.ps1` 134/134 (its Resume-control assertion now
checks "Refresh + Copy Resume Command only; nothing that runs").

## Real-data copy-only dogfood (Task Packet §29)

Isolated `DVCC_DATA_DIR` (deleted afterwards); real provider metadata read-only (no
`DVCC_*_HOME_DIR` override); ground truth from a byte copy of the Codex DB queried for approved
columns only (id, origin, archived), deleted immediately (0 copy files left). The copied command was
captured by the in-page interceptor and **never executed**; only booleans/counts were printed.
Driver kept in the session scratchpad, not committed.

- One real Codex Project: 52 rows ELIGIBLE, 4 ARCHIVED (disabled).
- One copy: exactly one intercepted write, exactly `codex resume <uuid>`, one line, three tokens;
  the copied full ID equals exactly one ground-truth thread ID; that thread's normalized origin equals
  the Project's repository and it is not archived; the visible label is abbreviated and is the label
  of exactly that full ID; no path, URL, project name, note or title fragment in the text.
- Real Claude: this repository's Project — 1 LIVE MATCHED row → ALREADY_ACTIVE; 4 historical
  AMBIGUOUS rows → NOT_MATCHED; no Claude row eligible.
- No shell/terminal/provider process descended from DVCC; isolated DVCC data byte-identical; operator
  clipboard untouched; the Codex DB files were unchanged across the copy click itself.
- **Finding DF-06 (pre-existing 4b-1 behavior, not introduced here):** across each discovery refresh
  (3/3 tight windows) the Codex `state_5.sqlite-shm` last-write time changed while its content hash
  (3/3), the database and the WAL did not; idle windows with DVCC running showed no change. See
  QUALITY_DEBT.md / DECISIONS D-4B2A-011. The earlier Phase 4b-1 dogfood evidence recorded
  "unchanged" for the same files at a time when no such touch occurred.
- Driver-side corrections made during the dogfood (not product issues): PowerShell 5.1's
  `ConvertFrom-Json` returns a JSON array as one object and a single `PSCustomObject` has no `.Count`;
  both were fixed in the scratch driver before the final run (13 checks: 12 PASS + DF-06).

## Acceptance Criteria

AC4B2A-01..24, 26, 27: met (see sections above). AC4B2A-25 (real-data copy-only dogfood without
executing): the copy-only behavior passed every check; the dogfood additionally surfaced DF-06 in the
pre-existing discovery path, reported for a Human decision. AC4B2A-28: Security / Privacy / Auth /
Permission / Data integrity PASS; Irreversible-data safety PASS (no provider data or WAL change; the
DF-06 timestamp touch is pre-existing and non-destructive).

## Independent FULL Review

**Pending.** This run's implementer cannot review its own work (Independence Gate).
