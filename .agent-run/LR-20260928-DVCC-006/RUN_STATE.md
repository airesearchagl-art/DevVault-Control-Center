# Run State — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

Updated: 2026-09-28, end of Wave 5.

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
- [~] AC4B1-25 — M-P4B1-02..05 killed and restored byte-identical; **M-P4B1-01 could not be executed**
      (auto-mode classifier denial) — see EVIDENCE.md and DECISIONS.md for what remains evidenced
      about the underlying guarantee regardless
- [x] AC4B1-26 — synthetic isolated running-app smoke: 48/48 checks PASS
- [x] AC4B1-27 — Security / Privacy / Auth / Permission / Data integrity / Irreversible-data safety —
      see EVIDENCE.md "Hard checks" (Privacy carries the same AC4B1-25 caveat)
- [x] AC4B1-28 — Phase 4b-2 (resume) remains unimplemented

## Current summary

Implementation (Wave 0–5) is complete: Rust readers, native canonicalization command, TypeScript
domain/service/UI, localization, mutation campaign (4/5 probes fully executed; the fifth blocked, not
skipped, and reported), full regression, documentation reconciliation and a real running-app smoke
(48/48) are all done. Product source changes are scoped to read-only discovery exactly as the Task
Packet specified: no shell, no terminal, no process control, no provider CLI invocation, no
persistence change.

Not yet done, and out of scope for this run: Independent Review and Draft PR. This run's implementer
cannot also be the independent reviewer (Independence Gate).

## Next

Focused Independent Review of this Task Packet's delta (`e7af6e70663b317642000d2f3ddbc6e1d0e0b124` →
current `feat/session-discovery-v0.4b1` head), including a specific look at the AC4B1-25/M-P4B1-01
gap. Commit and push for this run happen now, before that review — not after. Only if the review
returns READY CANDIDATE with no Required Fix does a Draft PR follow. Ready, merge, release and
Production remain prohibited until a later, separate Human Gate.
