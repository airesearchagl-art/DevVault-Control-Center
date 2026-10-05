# Evidence — LR-20261005-DVCC-011 (Phase 5A, Control Read Contract Vertical Slice)

No real path, real session ID, real project name or provider content appears here. All test and
smoke data is synthetic (`example-org`, `project-alpha`, sentinel strings).

Active packet: rev 3.2 (`TASK_PACKET_SNAPSHOT_REV3_2.md`, SHA-256 `1d663c7c…44d2bd02`). Initial
authorized packet rev 3.1 preserved (`TASK_PACKET_SNAPSHOT.md`, SHA-256 `de0d0f8e…3d18da`).

## Ordering (AC5A-01)

1. Fresh Gate PASS at `main` = `origin/main` = `7efdc62c…`, clean, no open PR, helpers present,
   baseline `npm run typecheck` clean / `npm test` 40 files, 1093 tests.
2. rev 3.1 snapshot written and hashed on `main` before the branch existed.
3. Branch `feat/control-read-contract-v1` created at `7efdc62c…`.
4. i18n keys added; STOP on the confirmation-table mismatch (HD-5A-09); rev 3.2 + second snapshot
   created after branch creation, before Control Read product implementation (see `DECISIONS.md`).
5. `PHASE_5A_IMPLEMENTATION_CONTINUATION = YES` → implementation.

## Verification

```
npm run typecheck                -> clean
npm test                         -> 47 files, 1207 passed (baseline 1093 + 114 Control Read)
npm run build                    -> clean (pre-existing >500 kB chunk warning only)
cargo check                      -> clean (no Rust change)
npm run tauri build -- --no-bundle -> release build exit 0
git diff --check                 -> clean
```

## Delta (AC5A-17 / AC5A-21)

Product diff vs `7efdc62c…`: 21 files, all in rev 3.2 §9 — new `src/domain/controlRead/{contract,
evidenceRef, projection, readControl}.ts` + 6 test files, `src/app/{controlReadSource,
copyControlSnapshotAction}.ts` + tests, `docs/control-read-contract-v1.md`,
`scripts/verify-control-read-ui.ps1`; minimal edits to `README.md`, `src/app/App.tsx` (handler wiring),
`src/features/reviews/ReviewDetail.tsx` (one optional prop + one button), `src/i18n/{ja,en}.ts`
(4 keys each), `src/test/docsContract.test.ts` (additive).

`git diff 7efdc62c… -- src-tauri package.json package-lock.json src/app/appState.ts
src/domain/validation.ts src/domain/limits.ts src/domain/transitions.ts src/domain/schema.ts
src/services contract docs/data-contract-v1.md fixtures` → **empty**. Rust / capability / dependency /
schema / appState / validator / transitions delta = 0. New Tauri command = 0. Data Model delta = 0.

## HD-5A-09 confirmation classification (AC5A-27)

Driven through the existing `applyReviewAction` (`transitions.ts` unchanged):

| Case | Expected | Result |
|---|---|---|
| FIX_REQUIRED via confirmVerdict | EXPLICIT | PASS |
| FIX_REQUIRED after suspend / resume | EXPLICIT | PASS |
| REVIEW_PASS via confirmVerdict | EXPLICIT | PASS |
| REVIEW_PASS after suspend / resume | EXPLICIT | PASS |
| BLOCKED from REVIEWING via block | EXPLICIT | PASS |
| BLOCKED after suspend / resume from a confirmed BLOCKED | EXPLICIT | PASS |
| BLOCKED from NEW | ENTERED | PASS |
| BLOCKED from READY_FOR_REVIEW | ENTERED | PASS |
| BLOCKED from FIX_REQUIRED (verdict remains FIX_REQUIRED) | ENTERED | PASS |
| CLOSED | EXPLICIT | PASS |
| NEW / READY_FOR_REVIEW / REVIEWING / SUSPENDED | ENTERED | PASS (4) |
| durable-record: `suspendedFrom` FIX_REQUIRED without a confirmed verdict → resume | ENTERED | PASS |
| verdict state with no round at all | ENTERED | PASS |

## Helper / oracle parity (AC5A-03)

- Freshness: every row of the existing `src/test/freshnessContract.ts` oracle — projection class /
  value agrees with `deriveFreshness().status` (UNKNOWN ↔ class UNKNOWN).
- Target format: `readControl`'s `INVALID_TARGET` decision equals `isValidProjectId` /
  `isValidReviewId` over a table of valid / invalid / boundary IDs.
- Repository: `normalizeRepositoryUrl` ok → `{host, owner, name}` (trailing `.git` removed); error /
  http / other host / one segment → `BLOCKED INVALID_SOURCE_VALUE` (value not echoed).
- Source-shape: `evidenceRef.ts` imports `isIsoTimestamp, isValidProjectId, isValidReviewId` and
  `MAX_REVIEW_ROUNDS`; `readControl.ts` imports `isValidProjectId, isValidReviewId`; `projection.ts`
  imports `normalizeRepositoryUrl`; no ID / HEAD / repository regex in Control Read product files.

## Source semantics (AC5A-08..11)

| `projectsHealth.status` | snapshot / project / review |
|---|---|
| ok, restored_from_backup | proceed (`registry_health` reported) |
| missing | proceed; absent project → `TARGET_NOT_FOUND` |
| unreadable / io_error / unsupported_version | `SOURCE_UNAVAILABLE` / `REGISTRY_UNREADABLE` / `REGISTRY_IO_ERROR` / `REGISTRY_UNSUPPORTED_VERSION` (never `TARGET_NOT_FOUND`) |

`get_review_state`: no LoadedReview → `TARGET_NOT_FOUND`; `session === null` → `TARGET_UNAVAILABLE`
/ `UNREADABLE` | `IO_ERROR` | `UNSUPPORTED_VERSION` | `MISSING`. Snapshot: unreadable reviews only
increment `unattributable_review_count`. Persistence invariant `session !== null` ⇔ status ∈
{ok, restored_from_backup} verified through the real `loadAll` over `MemoryStorage` (ok, corrupt,
future version, missing session file, read failure, corrupt primary + valid backup), and Control
Read over that load left `MemoryStorage.files` unchanged.

## Provenance / presence (AC5A-05 / AC5A-06)

Entity times (`Project.createdAt/updatedAt`, `session.createdAt/updatedAt`, `requestSavedAt`,
`followupSavedAt`) set to unique sentinel times: none appears in the output. `reviewed_head.recorded_at
= resultCapturedAt`, `verdict.recorded_at = verdictConfirmedAt`; repository, resource state, PR number,
expected head, risk tier, review state → `null`. Presence (`result_captured`, `judgment_captured`,
`local_root`) is `DERIVED`; `false` never HUMAN_CONFIRMED; unconfigured local root has no `path`.

## Disclosure (AC5A-15 / AC5A-19)

Sentinels planted in: local root, display name, notes (with a `ghp_` token), project / review next
action (with `sk-` / `AKIA` tokens), IDE label, review type, thread title / URL, verdict note,
revalidation explanation, Git branch, Git error message / code, FileHealth reason / set-aside /
quarantined name / io code, IDE discovery session ID / cwd, checkpoint / result bodies, unknown request
key name / value. Absent from every success and error response and from every evidence reference,
for both an OK and an ERROR observation. All evidence references match exactly one of the seven
approved variants. `controlReadSourceFrom` passes exactly `gitObservations, phase, projects,
projectsHealth, reviews`. `as EvidenceRef` occurs once (inside `evidenceRef.ts`); no `"dvcc:"` literal
elsewhere. Unrecognized-field echo: safe only → `fields`, unsafe only → `unlisted_field_count: 1`,
mixed → `fields` + `unlisted_field_count: 2` (RF-5A-R3-01).

## Mutation campaign (AC5A-23)

Driver in the session scratchpad (not committed). Each: apply → `vitest run` of the 7 Control Read
test files → restore → SHA-256 equal to the committed file. M-5A-17 was split into 17a / 17b.

| Probe | Mutation | Failed tests | Restored |
|---|---|---|---|
| M-5A-01 | local_root discloses the real path | 4 | yes |
| M-5A-02 | display name disclosed | 3 | yes |
| M-5A-03 | Git errorMessage passed into the output | 2 | yes |
| M-5A-04 | unobserved Git fabricated as OBSERVED | 1 | yes |
| M-5A-05 | OBSERVATION_INVALIDATED without a raw observation | 1 | yes |
| M-5A-06 | stale observation used without observationForProject | 2 | yes |
| M-5A-07 | version 2 accepted | 2 | yes |
| M-5A-08 | unknown keys silently ignored | 4 | yes |
| M-5A-09 | unknown-field check before the version check | 1 | yes |
| M-5A-10 | project looked up by display name | 2 | yes |
| M-5A-11 | recorded_at = session.updatedAt | 16 | yes |
| M-5A-12 | absent result as HUMAN_CONFIRMED | 1 | yes |
| M-5A-13 | unconfigured local root reports a withheld path | 1 | yes |
| M-5A-14 | freshness classified as OBSERVED | 20 | yes |
| M-5A-15 | freshness re-implemented (edge differs) | 2 | yes |
| M-5A-16 | get_run_state returns an empty run | 3 | yes |
| M-5A-17a | projection writes into its source | 1 | yes |
| M-5A-17b | copy action writes to the clipboard twice | 1 | yes |
| M-5A-18 | truncated response reports complete: true | 1 | yes |
| M-5A-19 | review order not ID-descending | 2 | yes |
| M-5A-20 | IDE sessions passed into the source | 3 | yes |
| M-5A-21 | FileHealth read through `.kind` | 19 | yes |
| M-5A-22 | unreadable registry → TARGET_NOT_FOUND | 4 | yes |
| M-5A-23 | registry gate dropped for io_error / unsupported_version | 3 | yes |
| M-5A-24 | unreadable review → TARGET_NOT_FOUND | 2 | yes |
| M-5A-25 | unreadable review fabricated into a review state | 8 | yes |
| M-5A-26 | unattributable_review_count always 0 | 3 | yes |
| M-5A-27 | TARGET_UNAVAILABLE carries the health message | 3 | yes |
| M-5A-28 | own looser project ID regex | 1 | yes |
| M-5A-29 | repository split without normalizeRepositoryUrl | 1 | yes |
| M-5A-30 | reference built outside the builders from display name | 6 | yes |
| M-5A-31 | gitObservationRef without the ISO timestamp check | 1 | yes |
| M-5A-32 | out-of-range round accepted | 1 | yes |
| M-5A-33 | every FIX_REQUIRED / REVIEW_PASS / BLOCKED EXPLICIT | 5 | yes |
| M-5A-34 | resumed confirmed verdict state ENTERED | 3 | yes |
| M-5A-35 | BLOCKED from NEW EXPLICIT | 3 | yes |
| M-5A-36 | EXPLICIT inferred from suspendedFrom alone | 2 | yes |

37 probes, all **KILLED by test failures**; compile-error-only kills: 0; survived: 0. Before the run,
two probes (M-5A-10, M-5A-18) were found to lack a killing test; the identity and truncation tests
were added first (commit `527d2c0`).

## Running-app smoke (AC5A-25) — SYNTHETIC ONLY

`scripts/verify-control-read-ui.ps1` against the fresh release build, hidden desktop, four isolated
`DVCC_DATA_DIR`s, synthetic Git repository, clipboard interceptor: **78 passed, 0 failed,
0 inconclusive**. The operator's clipboard was unchanged.

- Case A: copy → Refresh Git → copy. NOT_OBSERVED then OBSERVED (+`observed_at`, git-observation ref)
  and freshness DERIVED/ALIGNED with `basis_observed_at`; HD-5A-09 EXPLICIT from the durable verdict;
  provenance exact / null; unreadable review only counted (1); every sentinel absent; data folder
  **byte-identical**, no `events.jsonl`.
- Case B: observe → Human-intentional local root edit → copy: Git and freshness
  `OBSERVATION_INVALIDATED`; the edit changed only `projects.json` + `projects.json.bak`; the copy
  wrote nothing; the new root not disclosed.
- Case C: observe → copy (OBSERVED) → restart → copy: `NOT_OBSERVED` (not invalidated); data folder
  byte-identical across the restart.
- Case D: JA copy (no write) → locale switch (only `settings.json` written) → EN copy (no write):
  JSON identical apart from `snapshot_id` / `generated_at`; JA / EN labels and toasts localized.

Harness history (no product change between runs): run 1 stopped while seeding Case A (Git CRLF
warning under `$ErrorActionPreference = "Stop"`; no app instance started) → `Invoke-Git` aligned with
the existing smokes; run 2: 77 / 1 (toast read included the dismiss button "×") → read the toast
message span; run 3: 78 / 0 / 0.

## Regression smokes (same release build)

| Smoke | Result |
|---|---|
| session discovery | 220 passed, 0 failed, 0 inconclusive |
| resume handoff | 62 passed, 0 failed, 1 inconclusive |
| resume launcher | 75 passed, 0 failed, 0 inconclusive |
| localization | 26 passed, 0 failed, 1 inconclusive |
| IDE handoff | 38 passed, 0 failed, 0 inconclusive |
| review workflow | 112 passed, 0 failed, 1 inconclusive |

The three INCONCLUSIVE results are the final "operator's clipboard is untouched" check
(EXTERNAL_CLIPBOARD_ACTIVITY): the Windows clipboard sequence changed between smokes (+5 each time,
to texts of different lengths), **never during an intercepted DVCC copy** (no `[note]` line in any
log), while the IDE handoff, resume launcher and Control Read smokes — which copy through DVCC — ended
with the clipboard unchanged. Classified by the harness as external activity; not re-run.
Not re-run (untouched areas): `verify-clipboard-interceptor.ps1`, `verify-single-instance.ps1`.

## RF-5A-IR-01 repair (Independent FULL Review at `41b4ee95…`: FIX_REQUIRED)

Finding: a persisted round verdict was classified `EXPLICIT` whenever `round.verdict` was non-null.
The schema validates `verdict` and `verdictConfirmedAt` independently, so a stored verdict without a
confirmation time is valid and was over-claimed.

Repair (`projection.ts`, round `verdict` only; `schema.ts` / `transitions.ts` untouched):

| Source | Projection |
|---|---|
| `verdict == null` | `UNKNOWN` / `NOTHING_RECORDED` |
| `verdict != null` AND `verdictConfirmedAt != null` | `HUMAN_CONFIRMED` / `EXPLICIT`, `recorded_at = verdictConfirmedAt` |
| `verdict != null` AND `verdictConfirmedAt == null` | `HUMAN_CONFIRMED` / `ENTERED`, `recorded_at = null` |

Fresh verification after the repair:

```
targeted: projection + provenance + docsContract -> 3 files, 82 passed
           (new: schema-valid round {verdict FIX_REQUIRED, verdictConfirmedAt null} parsed by
            parseSessionFile -> verdict HUMAN_CONFIRMED / ENTERED / recorded_at null;
            confirmed verdict stays EXPLICIT with recorded_at = verdictConfirmedAt;
            contract doc states the rule)
M-5A-37 (every non-null round verdict EXPLICIT) -> KILLED (1 test failure), restored byte-identical
npm run typecheck -> clean
npm test          -> 47 files, 1210 passed
git diff --check  -> clean
```

Contract doc updated: "A stored round verdict is not automatically `EXPLICIT` …" (named by docsContract).

Evidence reuse: the repair changes one classification line in `roundState` plus tests / docs; no UI,
copy action, source, request validation, EvidenceRef, review-state (HD-5A-09) or runtime seam changed.
Reused from `41b4ee95…`: M-5A-01..36 (mutated lines unchanged), running-app Case A–D (the smoke
fixture's verdict has `verdictConfirmedAt` set, so its EXPLICIT assertion is unaffected), the six
regression smokes (incl. the three clipboard INCONCLUSIVE results, kept as INCONCLUSIVE), build /
release build / `cargo check` (no Rust change). Not re-run.

## Unverified items

- Human running-app dogfood with real data (rev 3.2 §19 G4) — not performed (next gates).
- `SOURCE_UNAVAILABLE` / `TARGET_UNAVAILABLE` / truncation are fixed by unit / integration tests only;
  the UI cannot reach them through the Copy button in a normal state (rev 3.2 §16).
- The three regression INCONCLUSIVE clipboard checks above.
