# Run State — LR-20260929-DVCC-008 (Phase 4b-2a Resume Handoff)

Updated: 2026-09-29, after implementation, unit tests, mutation campaign, full regression, synthetic
running-app smoke and real-data copy-only dogfood.

## Acceptance Criteria (Task Packet §33)

- [x] AC4B2A-01 fresh branch from exact `main` 8015682c…
- [x] AC4B2A-02 only the full `sessionId` is action identity (`onCopyResume(session)`)
- [x] AC4B2A-03 only parser-created `ValidatedSessionId` reaches the renderer (branded type)
- [x] AC4B2A-04 only MATCHED (to the selected Project) is potentially eligible
- [x] AC4B2A-05 stale discovery always refuses (first check; UI shows no action; click path re-checks)
- [x] AC4B2A-06 Claude LIVE → ALREADY_ACTIVE; no Claude command
- [x] AC4B2A-07 Claude historical → no command
- [x] AC4B2A-08 Codex archived → refused (fails closed on unknown)
- [x] AC4B2A-09 eligible output exactly `codex resume <uuid>`
- [x] AC4B2A-10 no path / `-C` / `cd` / compound command
- [x] AC4B2A-11 no process launch / provider invocation (smoke + dogfood process-tree checks)
- [x] AC4B2A-12 no new Tauri/Rust capability (`src-tauri/**` untouched)
- [x] AC4B2A-13 write-only clipboard only (existing `copyText`)
- [x] AC4B2A-14 no persistence / event / state mutation
- [x] AC4B2A-15 inline Human-triggered action only
- [x] AC4B2A-16 disabled rows show a localized reason
- [x] AC4B2A-17 Codex live-uncertainty caution visible, not copied
- [x] AC4B2A-18 run-from-workspace note visible, no path
- [x] AC4B2A-19 incomplete scan does not invalidate an individually MATCHED row
- [x] AC4B2A-20 copied text = executable + `resume` + full UUID only
- [x] AC4B2A-21 injection-negative suite PASS (33 negatives)
- [x] AC4B2A-22 JA/EN parity (i18n suite + JA/EN UI tests + smoke)
- [x] AC4B2A-23 M-P4B2A-01..08 all killed, restored byte-identical
- [x] AC4B2A-24 synthetic running-app smoke 63/63 (+ discovery smoke 134/134)
- [x] AC4B2A-25 real-data copy-only dogfood: all copy-only checks PASS, command never executed;
      DF-06 (pre-existing discovery `-shm` timestamp touch) surfaced and reported
- [x] AC4B2A-26 Phase 4b-2b remains unimplemented
- [x] AC4B2A-27 DF-05 explicitly carried, not changed
- [x] AC4B2A-28 Security / Privacy / Auth / Permission / Data integrity / Irreversible-data safety PASS
- [ ] Independent FULL Review (separate context)

## Human Gate items raised

- DF-06: accept-and-document vs. research a later 4b-1 reader repair (would touch `src-tauri`).

## Next

Independent FULL Review of the branch head. Draft PR only after READY CANDIDATE with Required Fixes:
none. Ready / merge / release / Production prohibited. Phase 4b-2b not started.
