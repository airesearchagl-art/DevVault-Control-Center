# Run State — LR-20260930-DVCC-009

Status: implementation, verification, smoke and dogfood complete; committed and pushed to
`feat/session-discovery-v0.4b1.2`. **STOPPED for Independent FULL Review.** No Draft PR.

## Ordering note (honest record)

The Task Packet snapshot and its SHA-256 were written after the first `src/domain` edit for DF-05
had already been applied in the working tree (no commit existed yet). The snapshot content is the
verbatim packet and was not changed after its hash was recorded.

## Acceptance criteria

- [x] AC4B12-01 fresh branch from exact `fda753d147d136f961e5c45d51c32f42cbe28bfc`
- [x] AC4B12-02 ordinary ASCII Claude naming rule implemented (`claudeHistoricalProjectKey`)
- [x] AC4B12-03 ASCII non-alphanumerics map to `-`
- [x] AC4B12-04 historical-key comparison case-insensitive (M-P4B12-02 killed)
- [x] AC4B12-05 non-ASCII root explicit unsupported (M-P4B12-04 killed)
- [x] AC4B12-06 >200 encoded key explicit unsupported (M-P4B12-03 killed)
- [x] AC4B12-07 unsupported history never shown as conclusive NO_MATCH (unit I, smoke H, M-P4B12-06)
- [x] AC4B12-08 live Claude exact matching unaffected (unit J, smoke G, dogfood P-live)
- [x] AC4B12-09 history never MATCHED from the directory key (unit K, M-P4B12-05)
- [x] AC4B12-10 DF-06 contract permits `-shm` updates (code comments, README, errata)
- [x] AC4B12-11 README no longer claims all provider files untouched (docsContract)
- [x] AC4B12-12 no SQLite reader runtime change (0 non-comment Rust lines)
- [x] AC4B12-13 no immutable/nolock/readonly_shm
- [x] AC4B12-14 WAL-mode smoke: DB/WAL unchanged
- [x] AC4B12-15 `-shm` difference recorded, not failed (bytes changed in the smoke run)
- [x] AC4B12-16 errata append-only
- [x] AC4B12-17 PR #8 README reconciliation
- [x] AC4B12-18 JA/EN parity (i18n parity test + both locales in UI tests and smoke)
- [x] AC4B12-19 M-P4B12-01..06 killed, restored byte-identical
- [x] AC4B12-20 real-data underscore + space shapes now AMBIGUOUS
- [x] AC4B12-21 no false MATCHED
- [x] AC4B12-22 no new provider content / privacy exposure
- [x] AC4B12-23 Security / Privacy / Auth / Permission / Data integrity / Irreversible-data PASS
- [x] AC4B12-24 Phase 4b-2b unimplemented

## Phase Gate

DF-05 CLOSED_PARTIAL_COMPAT · DF-06 ACCEPTED_AND_DOCUMENTED · Phase 4b-1.2 PASS (pending review) ·
Phase 4b-2b research READY (implementation not started).
