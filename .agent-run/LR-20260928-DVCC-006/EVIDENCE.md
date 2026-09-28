# Evidence — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

## Fresh Gate

- `git fetch origin` then `git switch main` then `git pull --ff-only`: already up to date.
- HEAD: `e7af6e70663b317642000d2f3ddbc6e1d0e0b124`, equal to `origin/main`. Working tree clean.
- `gh pr view 5`: `state=MERGED`, `mergeCommit.oid=e7af6e70663b317642000d2f3ddbc6e1d0e0b124`.
- `feat/session-discovery-v0.4b1` did not exist locally or on `origin` before creation.
- Branch created from that exact `main`.

## Files changed (this run)

```
 M README.md
 M src-tauri/Cargo.lock
 M src-tauri/Cargo.toml
 M src-tauri/src/launcher.rs
 M src-tauri/src/lib.rs
 M src/app/App.tsx
 M src/app/appState.ts
 M src/features/reviews/ReviewDetail.tsx
 M src/features/reviews/workflowSurface.test.ts   (fixture wiring only: two new required props)
 M src/i18n/en.ts
 M src/i18n/i18n.test.ts                          (one new SHARED_VALUES entry: provider names)
 M src/i18n/index.ts
 M src/i18n/ja.ts
?? scripts/verify-session-discovery-ui.ps1
?? src-tauri/src/claude_reader.rs
?? src-tauri/src/codex_reader.rs
?? src/domain/ideSessionDiscovery.test.ts
?? src/domain/ideSessionDiscovery.ts
?? src/features/reviews/ReviewIdeSessions.tsx
?? src/services/ideSessionDiscovery.ts
?? .agent-run/LR-20260928-DVCC-006/**
```

No `package.json` / `package-lock.json` change (no new frontend dependency). No
`docs/data-contract-v1.md` change (no persisted schema changed — discovery is runtime-only, confirmed
by `docsContract.test.ts` continuing to pass unmodified).

## Wave 0 — dependency gate

See RUN_MANIFEST.md "Dependency Gate". `cargo add rusqlite --features bundled --no-default-features`
then `cargo build --lib`: clean build, `rusqlite v0.40.2` + 4 small transitive crates, all
MIT/Apache-2.0/Public-Domain.

## Wave 1/2 — Rust readers + native canonicalization

- `src-tauri/src/codex_reader.rs` (new): `discover_codex_sessions` Tauri command. Opens
  `<home>/.codex/state_5.sqlite` with `SQLITE_OPEN_READ_ONLY | SQLITE_OPEN_NO_MUTEX`, sets
  `PRAGMA query_only = ON` as a second guard, 2s busy timeout. Schema gate via `sqlite_master` +
  `pragma_table_info('threads')` before any row query; missing table/column → `UnsupportedFormat`
  (never guessed). Fixed `SELECT id, cwd, created_at, updated_at, cli_version, archived,
  git_origin_url FROM threads ORDER BY updated_at DESC LIMIT 200` — no `first_user_message`, no
  `preview`, no `SELECT *`, bounded to 200 rows.
- `src-tauri/src/claude_reader.rs` (new): `discover_claude_sessions` Tauri command. Historical:
  lists `<home>/.claude/projects/*/` directory names and `*.jsonl` file names matching a strict
  36-character UUID shape (never opens file content); reads only file `modified()` metadata.
  Live: reads `<home>/.claude/sessions/*.json` (≤64 KiB each, else skipped) and deserializes into
  `LiveSessionFields { session_id, cwd, updated_at, version }` — a struct with **no field** for
  `name`, `messagingSocketPath`, `bridgeSessionId` or anything else, so those keys are dropped by
  `serde` during parsing itself, not merely unused afterward. Both readers accept
  `DVCC_CLAUDE_HOME_DIR` / `DVCC_CODEX_HOME_DIR` env-var overrides (undocumented, test-only, exactly
  the `DVCC_DATA_DIR` pattern already used for storage) and fall back to `USERPROFILE`.
- `src-tauri/src/launcher.rs`: new `canonicalize_local_path` command, a thin wrapper around the
  existing `validate_project_folder` (UNC/network rejection, symlink/junction resolution via
  `fs::canonicalize`, local-drive-only result) — never calls the opener, nothing is launched.

```
cargo build --lib   -> clean
cargo test --lib    -> 79 passed, 0 failed, 2 ignored (11 new: 6 codex_reader + 5 claude_reader)
```

Rust privacy test (`reads_only_the_approved_columns_and_never_the_content_columns`): inserts a row
with `first_user_message`/`preview` set to distinctive sentinel strings, asserts the returned struct
and its serialized JSON contain neither. `writing_through_the_reader_connection_is_impossible`: an
`INSERT` through the read-only connection is asserted to error.

## Wave 1 — TypeScript domain model

`src/domain/ideSessionDiscovery.ts`: `ProviderKind`, `SessionSourceKind`, `SessionBindingState`,
`DiscoveredIdeSession`, `encodeClaudeWorkspacePath`, `normalizeRepositoryIdentity`,
`isCodexManagedMirrorPath`, `bindClaudeSessions`, `bindCodexSessions` — all pure functions, no
`invoke` call anywhere in this file (verified by inspection: no import of the Tauri API).

`src/domain/ideSessionDiscovery.test.ts`: 22 tests covering Task Packet §23 A–O (test IDs reused where
the packet names them; a few additional tests cover live-cwd-gone → UNAVAILABLE, live/historical
dedup, and `Project.notes` absence as defense in depth).

```
Test Files  1 passed (1)
     Tests  22 passed (22)
```

## Wave 3 — service + UI + runtime state

`src/services/ideSessionDiscovery.ts`: `scanIdeSessions(projects)` — the only place `invoke` is
called for this feature; canonicalizes each distinct candidate path once (`canonicalize_local_path`),
never canonicalizes a Codex-managed mirror path, then calls the pure domain binding functions.
Called from exactly one place: `App.tsx`'s `refreshIdeSessions`, itself called from exactly one
place: the "Refresh IDE Sessions" `ActionButton`'s `onClick`.

`src/app/appState.ts`: new `IdeSessionsState` (`notObserved` / `refreshing` / `loaded` / `error`),
runtime-only field `ideSessions` on `AppState`, three new actions — same shape and same
justification-by-precedent as the existing `gitObservations` runtime state (Phase 2 Freshness).

`src/features/reviews/ReviewIdeSessions.tsx`: new card, sibling of `ReviewIdeHandoff`. Filters the
raw scan to sessions where `matchedProjectId === project.projectId` or (`AMBIGUOUS` and
`candidateProjectIds` includes it) — never a flat dump. No Resume action anywhere in this file.

9 new i18n keys' worth of card/state/field/reason strings added to both `ja.ts` and `en.ts`
(`ideSessions.*`); `ideSessions.provider.claudeCode`/`.codex` added to `i18n.test.ts`'s
`SHARED_VALUES` (provider product names, correctly identical in both languages).

```
npm run typecheck   -> clean
npm test             -> Test Files 34 passed (34) / Tests 902 passed (902)
```

## Wave 4 — mutation campaign

Baseline SHA-256 before the campaign: `src-tauri/src/codex_reader.rs` =
`8eec451f3acb11ade97813bb8aba085f79088747c52b4894860661939393d8ac`;
`src/domain/ideSessionDiscovery.ts` = `382e4ca161b6f7cf6d91275fe0c395950e796b01c143afdc2ce9cf1f6ff8cf20`.

| Probe | Mutation | Expected | Actual | Restored byte-identical |
|---|---|---|---|---|
| M-P4B1-01 | add `first_user_message` to the Codex SELECT/struct | privacy test FAILs | **blocked** — the auto-mode classifier denied the edit ("PII Data Handling") before the mutation could be completed; the partial edit already made was reverted | yes (hash matched baseline) |
| M-P4B1-02 | match a Codex mirror `cwd` by Project displayName basename | binding test J FAILs | test J failed | yes |
| M-P4B1-03 | promote a single Claude historical encoded candidate from AMBIGUOUS to MATCHED | binding test B FAILs | test B failed | yes |
| M-P4B1-04 | pick the first Project on a repository-identity tie instead of AMBIGUOUS | ambiguity test G FAILs | test G failed | yes |
| M-P4B1-05 | skip the Codex required-column check | format-drift test FAILs | `missing_required_column_is_unsupported_format` failed (with a different failure mode — the query itself errors on the now-missing column — but still fails, proving the check matters) | yes |

M-P4B1-01 could not be executed as a live mutation-and-observe-failure cycle; see DECISIONS.md for
what this does and does not mean for the underlying privacy guarantee. All four completed probes were
killed and the affected files re-hashed to confirm byte-for-byte restoration. Full regression re-run
after the campaign: Rust 79/79, TS 902/902.

`git diff --check`: clean. `npm test -- src/test/docsContract.test.ts`: 5 passed.

README.md: Status line and the "IDE Handoff" bullet reconciled to Phase 4a merged (PR #5); a new
"IDE Sessions (Phase 4b-1, under development on `feat/session-discovery-v0.4b1`)" bullet added,
explicitly stating no launch/resume/control and no conversation content is read or shown.

## Wave 5 — running-app smoke

Release binary rebuilt (`npx tauri build --no-bundle --ci`) to exercise current frontend + Rust code.
`scripts/verify-session-discovery-ui.ps1` (new): hidden isolated desktop, CDP-driven, synthetic DVCC
projects/reviews, a synthetic Claude Code fixture tree, and a synthetic Codex `state_5.sqlite` built
by a throwaway `node:sqlite` script (the smoke's own fixture-preparation tool, analogous to the
existing smokes' use of `git.exe` to build synthetic repositories — never the shipped app). Both
`DVCC_CLAUDE_HOME_DIR` and `DVCC_CODEX_HOME_DIR` point at these synthetic homes; the operator's real
`~/.claude` / `~/.codex` are never touched.

```
checks: 48 passed, 0 failed, 0 inconclusive
```

Covered: no discovery before the Human's click (the card's initial text is short/uninformative,
`< 400` chars); Claude live exact `cwd` → MATCHED; Claude historical forward-encoded candidate →
AMBIGUOUS, never MATCHED; Codex unique `git_origin_url` → MATCHED; Codex tied `git_origin_url` across
two registered Projects → AMBIGUOUS, never silently resolved; a Codex mirror-path thread with no
repository identity never appears as MATCHED anywhere; all 7 content sentinels
(`first_user_message` ×3, `preview` ×3, a Claude historical transcript body) absent from the rendered
page across every scenario, in both JA and EN; DVCC's own `projects.json`/`session.json` files are
byte-identical before/after; the Claude fixture tree and the Codex SQLite file (including its absence
of a `-wal` checkpoint side effect) are byte-identical before/after; no spawned process is left
running; the operator's real clipboard fingerprint is unchanged (this feature does not use the
clipboard at all, but the check is run anyway for consistency with every other smoke).

Not separately exercised live in the running app (see DECISIONS.md D-4B1-005/006 for why): the
unsupported-schema case (covered by Rust + domain unit tests instead), and direct OS-level
observation of "no process launch / no shell / no network" (covered by source inspection of the two
reader modules plus the Rust read-only-connection test).

## Hard checks

- Security: PASS — one new, narrowly-scoped native dependency (read-only SQLite), no new Tauri
  capability, no shell, no process spawn beyond the already-existing Git observation path (untouched
  by this run), no new IPC surface beyond three read-only commands.
- Privacy: PASS — domain tests D–G/J/N, Rust reader tests, and the smoke's 7-sentinel × (3 scenarios
  × 2 locales) check-set. The one gap is the M-P4B1-01 mutation-kill demonstration specifically (see
  above); the guarantee itself is otherwise evidenced multiple independent ways.
- Auth / Permission: unaffected (no capability change).
- Data integrity: PASS — no persistence path added; the smoke confirms DVCC's own data files and both
  provider fixtures are byte-identical before/after.
- Irreversible-data safety: PASS — every new capability is a bounded, read-only observation; nothing
  is deleted, overwritten or migrated (Codex's own `_sqlx_migrations` table is only ever read as
  schema metadata, never invoked).

## Independent Review

Not performed by this run (this session both implemented and evidenced the change; per the
Independence Gate pattern established across the earlier P2/P3 and Phase 4a/4b cycles, the
implementer cannot also be the independent reviewer). Status: **pending**.
