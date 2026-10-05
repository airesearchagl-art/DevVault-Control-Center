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

## G4-A — automated real-data audit harness (HD-5A-10, rev 3.3 §19.1)

Scope: harness only. New files (no existing file changed outside `.agent-run/`):

| File | Role |
|---|---|
| `scripts/verify-control-read-real-data-audit.ps1` | driver: preconditions, hidden desktop, open review, Git Refresh, one intercepted copy, tree / page-state / clipboard-sequence measurements, report write |
| `scripts/lib/control-read-audit.mjs` | audit core: read-only sample selection, allowlist oracle, exact comparison, pattern scan, positive assertions, detector liveness, decision, report guard |
| `scripts/lib/control-read-audit-fixture.mjs` | synthetic data folder (sentinels only) for tests and `-SelfTest` |
| `scripts/lib/control-read-audit.test.ts` | tests (33) |
| `scripts/vitest.audit.config.ts` | separate test entry; `vite.config.ts` / `npm test` unchanged |

Product code delta from the READY CANDIDATE head:

```
git diff --stat 133576c944c55b8b50a4bdfec670d8651fdfb11e <G4 harness head> -- \
  src src-tauri contract package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.node.json
-> (empty)   product code delta: 0
```

Raw-data handling: **LOCAL MEMORY ONLY** — the DVCC page (interceptor state, cleared before the app is
stopped), the driver's PowerShell process (one string variable, passed only to the core and then
cleared), the core's node process (stdin). Output channels: one guarded `Write-Host` (fixed words and
codes; an exception is reported only by stage name), one file write (the report returned by the core
after its value-domain guard). The core's stdout to the driver is one JSON line; its stderr is drained
and discarded.

OS clipboard raw write: **BLOCKED BY DESIGN** — DVCC's `plugin:clipboard-manager|write_text` request is
answered inside the page by the shared interceptor and never reaches Windows; the harness never reads or
writes the OS clipboard; it compares the Windows clipboard sequence number before launch and after
the app stopped (changed → `os_clipboard_received_raw_snapshot: UNKNOWN`, INCONCLUSIVE).

Verification (fresh):

```
npx vitest run --config scripts/vitest.audit.config.ts -> 1 file, 33 passed
  oracle parity: vocabularies / ID patterns == contract.ts, states.ts, riskTier.ts, validation.ts
  real readControl output (observed / unobserved / no local root + no repository / truncated
    MAX_REVIEWS + MAX_ROUNDS) -> unknown 0, violations 0
  allowlist negatives, exact comparison (substring / short-equality / path normalization / lawful
    overlap / free text in a lawful position), 14 pattern cases, positive assertions (pass + fixed
    failure codes), selection (non-CLOSED, deterministic, opaque sample_ref, .bak fallback,
    REGISTRY_UNREADABLE, NO_CANDIDATE), core never writes (data folder + repo byte-identical),
    decision matrix (PASS / FAIL / INCONCLUSIVE / BLOCKED, FAIL outranks INCONCLUSIVE),
    report guard, CLI (no echo, empty stderr, BOM-prefixed stdin)
  privacy (static, harness script): ASCII without BOM; exactly one Write-Host; no other output /
    clipboard / file / transcript channel; exactly two WriteAllText lines, both of the core's report;
    the raw snapshot variable appears only in its 5 allowed statements; no `$_` in any catch block;
    real-data guards and the G4-C authorization token present
npm run typecheck -> clean
npm test          -> 47 files, 1210 passed (product suite unchanged)
```

Mutation probes (apply → audit tests → restore → SHA-256 byte-identical):

| Probe | Mutation | Result |
|---|---|---|
| H-01 | exact comparison never hits | KILLED |
| H-02 | allowlist ignores unknown keys | KILLED |
| H-03 | pattern scan never hits | KILLED |
| H-04 | decision ignores a write during copy | KILLED |
| H-05 | decision ignores the clipboard sequence | KILLED |
| H-06 | report value guard disabled | KILLED |
| H-07 | every value treated as lawful | KILLED |
| H-08 | CLOSED review selectable | KILLED (survived the first run; the CLOSED-only test was added, then killed) |
| H-09 | sample branch not collected | KILLED |
| H-10 | HEAD value not compared | KILLED |
| H-11 | CLI echoes the error input | KILLED |
| H-12 | other projects' values not collected | KILLED |
| H-13 | detectors never live | KILLED |
| H-14 | harness prints the raw snapshot | KILLED |
| H-15 | harness logs the exception | KILLED |
| H-16 | harness writes a second file | KILLED |

Synthetic end-to-end self-test (`-SelfTest`; `%TEMP%` data folder seeded by the fixture; real data not
touched; DVCC not running):

- The release executable predated the RF-5A-IR-01 commit (the harness's `STALE_BUILD` guard would
  refuse it) → rebuilt from the current tree (`npx tauri build --no-bundle`, product code == `133576c9…`;
  no tracked file changed).
- Run 1: `INCONCLUSIVE (AUDIT_CORE_UNAVAILABLE)`, no report — .NET's redirected stdin writer (encoding
  utf-8, 3-byte preamble) put a BOM before the request and the core refused to parse it. Fail-closed as
  designed. Fix: the core strips a leading BOM (test added).
- Run 2: `PASS (ALL_CHECKS_PASSED)`, exit 0. Report (synthetic; `harness_head` was the uncommitted
  working tree on `133576c9…`):

```text
reviewed_head: 133576c944c55b8b50a4bdfec670d8651fdfb11e
harness_head: 133576c944c55b8b50a4bdfec670d8651fdfb11e
sample_ref: sha256:5a56cc9bef18feb2
selection: automatic
copy_actions: 1
contract_parse: PASS
allowlist: PASS
unknown_field_count: 0
sensitive_source_categories_present: 11/11
exact_sensitive_value_leaks: 0
absolute_path_leaks: 0
git_branch_leaks: 0
free_text_leaks: 0
thread_pointer_leaks: 0
provider_identifier_leaks: 0
credential_pattern_hits: 0
exact_comparison_overlaps_excluded: 0
expected_machine_facts: PASS
unexpected_state_change: NO
unexpected_persistent_write: NO
raw_snapshot_persisted: NO
raw_values_logged: NO
os_clipboard_received_raw_snapshot: NO
result: PASS
result_reason: ALL_CHECKS_PASSED
```

- Run 3 (after tightening the report condition: no report unless the data folder was resolved):
  `PASS (ALL_CHECKS_PASSED)`, exit 0, same report apart from the per-run `sample_ref`; audit tests
  33 passed.

(`expected_machine_facts: PASS` after a completed refresh of the fixture repository means the
observed path was asserted: head / dirty / detached OBSERVED with one `observed_at`, HEAD and detached
equal to read-only `rev-parse` / `symbolic-ref`.)

Real-data audit (G4-C): **NOT RUN**. `G4_REAL_DATA_AUDIT.md` does not exist.

## G4-B focused repair (rev 3.4; review at `146ff68e…`: FIX_REQUIRED, RF-G4B-01 … 03)

Scope: G4 harness / tests / governance evidence only. Files: `scripts/lib/control-read-audit.mjs`,
`scripts/verify-control-read-real-data-audit.ps1`, `scripts/lib/control-read-audit.test.ts`, new
`scripts/lib/control-read-audit-finalize.ps1`, `.agent-run/…` (rev 3.4 snapshot, D-10, state files).

| Finding | Repair | Fixed by tests / probes |
|---|---|---|
| RF-G4B-01 machine-shaped blanket exemption | legitimacy only from contract vocabulary, the selected source (project id, owner / name, readable non-CLOSED review ids of the project, their rounds' recorded heads and timestamps, DVCC's observed HEAD, EvidenceRefs built from these) and the response's own values inside the run windows; unresolved machine-shaped overlap → INCONCLUSIVE `EXACT_COMPARISON_OVERLAP`; every non-empty body line compared; source-bound positive assertions (foreign review / project id, foreign EvidenceRef, recorded head / timestamp, `generated_at` / `observed_at` windows) | SHA (7-hex) / review-id / ISO / EvidenceRef-shaped free text in the snapshot → unresolved, never PASS; another project's / a CLOSED review's identity → FAIL; short body line compared; H-17, H-18, H-25 |
| RF-G4B-02 harness Git / filesystem beyond the product boundary | core: no `child_process`, no stat / Git of any local root; selection from the data folder only; Git facts only from DVCC's own observation read from the Review detail after Refresh Git (status label / HEAD / branch; labels pinned to `src/i18n`); harness Git only `git.exe -C <DVCC repo>` | static: no process / stat API in the core, no fs call on a `localRoot` line, exactly one `git.exe` in the harness (DVCC repo), none in the finalize library; a missing local root changes nothing; H-21, H-22 |
| RF-G4B-03 finalization outside the sanitized boundary | `control-read-audit-finalize.ps1`: Invoke-Node / Invoke-AuditCore / Write-ReportAtomically catch everything; `Complete-AuditRun` boundary → `AUDIT_FINALIZE_FAILED` / `REPORT_RENDER_FAILED` / `REPORT_WRITE_FAILED`; script trap → `UNHANDLED_EXCEPTION`; temp file + rename (never overwrites); PASS only after the write; references dropped in `finally` | behavioural PowerShell tests: PASS writes atomically; audit core unavailable / report destination unwritable / renderer throws / exception carrying a path / existing report → fixed line only, exit 2, empty stderr, no path, no report, no temp file; H-19, H-20, H-23, H-24 |
| CDP advisory | random high port 49152–65534 by default; listener before launch → BLOCKED `CDP_PORT_IN_USE`; identifiers sent only after Tauri internals + queue DOM + interceptor are confirmed (`DVCC_PAGE_UNCONFIRMED`) | static; H-26 |

Product code delta from the READY CANDIDATE head (fresh):

```
git diff --stat 133576c944c55b8b50a4bdfec670d8651fdfb11e <repair head> -- \
  src src-tauri contract package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.node.json
-> (empty)   product code delta: 0
```

Fresh verification:

```
npx vitest run --config scripts/vitest.audit.config.ts -> 1 file, 48 passed
  (incl. 6 behavioural PowerShell finalization cases, i18n label parity, source-bound tests)
git diff --check -> clean
raw-data static privacy checks (harness + finalize library): ASCII without BOM; one Write-Host (Say);
  no other output / clipboard / transcript channel; no `.Message` / `$_.Exception`; one WriteAllText
  (temp) + one Move; the raw snapshot variables only in their allowed statements (4 + 4); no `$_` in a
  catch block; trap with a fixed line
```

Mutation probes (apply → audit tests → restore → SHA-256 byte-identical), all re-run:

| Probe | Mutation | Result |
|---|---|---|
| H-01 … H-16 | as G4-A (anchors moved to the repaired code) | all KILLED |
| H-17 | generic MACHINE_SHAPED exemption restored | KILLED |
| H-18 | decision ignores unresolved overlaps | KILLED |
| H-19 | finalization catch removed | KILLED |
| H-20 | report write exception rethrown | KILLED |
| H-21 | core imports `child_process` (Git in a local root) | KILLED |
| H-22 | harness runs Git against another folder | KILLED |
| H-23 | PASS printed before the report is written | KILLED |
| H-24 | report written in place (no temporary file) | KILLED (survived the first run; the "never overwrite an existing report" test was added, then killed) |
| H-25 | source-bound identity check removed | KILLED |
| H-26 | CDP port check removed | KILLED |

No probe was killed only by a compile error (all by test failures).

Synthetic end-to-end self-test (release build from the current tree, product code == `133576c9…`;
DVCC not running; real data not touched):

| Run | Output (complete) | Exit |
|---|---|---|
| `-SelfTest` | `sample selected automatically: coverage 10/11 before Git refresh` / `result: PASS (ALL_CHECKS_PASSED)` / `report: G4_SELF_TEST_REPORT.md in the self-test run folder` | 0 |
| `-SelfTestFault AuditCoreUnavailable` | `result: INCONCLUSIVE (AUDIT_FINALIZE_FAILED) - no report written` | 2 |
| `-SelfTestFault ReportUnwritable` | `result: INCONCLUSIVE (REPORT_WRITE_FAILED) - no report written` | 2 |
| `-SelfTestFault RendererThrows` | `result: INCONCLUSIVE (REPORT_RENDER_FAILED) - no report written` | 2 |

stderr was empty in all four; the three fault runs left no report and no temporary file. Self-test
report (synthetic): `sensitive_source_categories_present: 11/11` (the branch came from DVCC's
observation after Refresh Git), every leak count 0, `exact_comparison_overlaps_excluded: 0`,
`expected_machine_facts: PASS`, no state change, no persistent write, OS clipboard untouched,
`result: PASS`.

Evidence reused unchanged (per the G4-B instruction): product READY CANDIDATE review at `133576c9…`,
RF-5A-IR-01 closure, M-5A-01..37, Control Read running-app Case A–D, regression smokes, product
typecheck / tests (product code unchanged; delta 0 re-verified above).

Real-data audit (G4-C): **NOT RUN**. `G4_REAL_DATA_AUDIT.md` does not exist.

## Unverified items

- G4 on real data (rev 3.4 §19.1): `G4_HARNESS_REPAIR_FOCUSED_REVIEW`, G4-C and G4-D pending; the
  real-data audit has not been run.
- `SOURCE_UNAVAILABLE` / `TARGET_UNAVAILABLE` / truncation are fixed by unit / integration tests only;
  the UI cannot reach them through the Copy button in a normal state (rev 3.2 §16).
- The three regression INCONCLUSIVE clipboard checks above.
