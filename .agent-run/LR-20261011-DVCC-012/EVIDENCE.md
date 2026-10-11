# Evidence — LR-20261011-DVCC-012

Local verification only unless stated otherwise. Local results are never reported as CI PASS.
No real data was read; every fixture is synthetic. No running-app smoke (Option A: no production caller).

## 1. P0 – P3

See `RUN_MANIFEST.md` (P0 field table, P1-1 … P1-9 incl. P1-5 a–e, P2).

P3 verification (run-folder commit `3d47c5e12cd1e2d89284def7f09dd434f4dc6a5d`):

| Check | Result |
|---|---|
| `git rev-parse HEAD^` | `3b5ec51b4447f2d143a570dc14b5e6ae807bb390` (= base) |
| `git show --stat --format= HEAD` | only `.agent-run/LR-20261011-DVCC-012/` (7 files) |
| `TASK_PACKET_SNAPSHOT.md` SHA-256 after commit | `6d9ab428c67f8eb4b4446a6490a8a453aeb9c636c3508d6a8eae8fc487b502cd` (equal); `git ls-files --eol`: `i/lf w/lf attr/-text` |

## 2. Commits

| Commit | Content |
|---|---|
| `3d47c5e12cd1e2d89284def7f09dd434f4dc6a5d` | P3 run folder + packet snapshot |
| `3b9276bef8006d4c39a564cfc6a81ecfc8a202a2` | product, tests, fixtures, docs, docsContract additions |
| `413445f337bac406df200f883da0466b525f8e13` | NH admissibility set taken from `NEEDS_HUMAN_CAPABLE_CHECKS` (see `DECISIONS.md` D-02) — **final product head** |
| (this commit) | evidence only (`.agent-run/LR-20261011-DVCC-012/**`) |

## 3. Local verification (product head `413445f3…`)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — 54 files / 1698 tests passed (baseline 47 / 1211; +7 test files, +487 tests = 483 atomic + 3 support + 1 fixture-hygiene scan of the new doc) |
| `npm run build` | exit 0 (Vite chunk-size warning only, unrelated to this change) |
| Manifest reconciliation (`vitest --reporter=json` vs Annex D) | **OK** — 483 / 483 profile-M atomic cases executed and passed, 80 groups, 483 unique case ids, 0 profile-F cases executed |

## 4. Manifest reconciliation (Annex D, PILOT_FOCUSED)

Machine check: every executed test whose title starts with a case id matched exactly one Annex D row; per-row
executed count equals the row count for profile M and 0 for profile F; every test is in the manifest's file.
Support tests (titles `support: …`, not counted): BM-01 table size, ID-13 unmodified baseline, NH admissibility
enforcement in `runChecks`.

| group | manifest (M) | deferred (F) | executed | passed |
|---|---|---|---|---|
| REQ-01 | 8 | 0 | 8 | 8 |
| REQ-02 | 4 | 0 | 4 | 4 |
| REQ-03 | 6 | 0 | 6 | 6 |
| REQ-04 | 4 | 0 | 4 | 4 |
| REQ-05 | 10 | 0 | 10 | 10 |
| REQ-06 | 4 | 0 | 4 | 4 |
| REQ-07 | 8 | 0 | 8 | 8 |
| DEL-01 | 3 | 0 | 3 | 3 |
| DEL-02 | 2 | 0 | 2 | 2 |
| DEL-03 | 3 | 0 | 3 | 3 |
| DEL-04 | 1 | 0 | 1 | 1 |
| DEL-05 | 4 | 0 | 4 | 4 |
| BM-01 | 120 | 0 | 120 | 120 |
| BM-02 | 10 | 0 | 10 | 10 |
| BM-03 | 2 | 0 | 2 | 2 |
| BM-04 | 4 | 0 | 4 | 4 |
| ENV-01 | 1 | 0 | 1 | 1 |
| ENV-02 | 1 | 0 | 1 | 1 |
| ENV-03 | 1 | 0 | 1 | 1 |
| ENV-04 | 1 | 0 | 1 | 1 |
| ENV-05 | 1 | 0 | 1 | 1 |
| ID-01 | 1 | 0 | 1 | 1 |
| ID-02 | 1 | 0 | 1 | 1 |
| ID-03 | 2 | 0 | 2 | 2 |
| ID-04 | 1 | 0 | 1 | 1 |
| ID-05 | 2 | 0 | 2 | 2 |
| ID-06 | 1 | 0 | 1 | 1 |
| ID-07 | 1 | 0 | 1 | 1 |
| ID-08 | 2 | 0 | 2 | 2 |
| ID-10 | 1 | 0 | 1 | 1 |
| ID-11 | 1 | 0 | 1 | 1 |
| ID-12 | 1 | 0 | 1 | 1 |
| ID-13 | 6 | 0 | 6 | 6 |
| ID-14 | 1 | 0 | 1 | 1 |
| ID-15 | 2 | 0 | 2 | 2 |
| ID-INV | 1 | 0 | 1 | 1 |
| PERM-READY | 12 | 0 | 12 | 12 |
| PERM-REV | 12 | 0 | 12 | 12 |
| PERM-FIX | 12 | 0 | 12 | 12 |
| DT-01 | 1 | 0 | 1 | 1 |
| DT-02 | 1 | 0 | 1 | 1 |
| DT-03 | 2 | 0 | 2 | 2 |
| DT-04 | 3 | 0 | 3 | 3 |
| DT-05 | 3 | 0 | 3 | 3 |
| DT-06 | 3 | 0 | 3 | 3 |
| DT-07 | 2 | 0 | 2 | 2 |
| DT-08 | 6 | 0 | 6 | 6 |
| DT-09 | 1 | 0 | 1 | 1 |
| DT-10 | 3 | 0 | 3 | 3 |
| DT-12 | 1 | 0 | 1 | 1 |
| DT-14 | 2 | 0 | 2 | 2 |
| DT-16 | 1 | 0 | 1 | 1 |
| S-01 | 1 | 0 | 1 | 1 |
| S-02 | 1 | 0 | 1 | 1 |
| S-03 | 1 | 0 | 1 | 1 |
| S-04 | 1 | 0 | 1 | 1 |
| S-05 | 1 | 0 | 1 | 1 |
| S-06 | 2 | 0 | 2 | 2 |
| S-07 | 2 | 0 | 2 | 2 |
| S-08 | 52 | 0 | 52 | 52 |
| P-01 | 3 | 0 | 3 | 3 |
| P-02 | 11 | 0 | 11 | 11 |
| P-03 | 0 | 10 | 0 | 0 |
| PAR-TC | 24 | 0 | 24 | 24 |
| PAR-VG | 5 | 0 | 5 | 5 |
| PAR-FR | 31 | 0 | 31 | 31 |
| PAR-5A | 3 | 0 | 3 | 3 |
| PAR-PR | 0 | 2 | 0 | 0 |
| PAR-UI | 0 | 24 | 0 | 0 |
| CHK-VPX | 2 | 0 | 2 | 2 |
| CHK-PREC | 5 | 0 | 5 | 5 |
| CHK-SHAPE | 12 | 0 | 12 | 12 |
| CHK-ORD | 1 | 0 | 1 | 1 |
| CHK-CITE | 1 | 0 | 1 | 1 |
| CAT | 7 | 0 | 7 | 7 |
| DISC | 6 | 0 | 6 | 6 |
| SIDE | 4 | 0 | 4 | 4 |
| DET | 4 | 0 | 4 | 4 |
| SRC | 6 | 0 | 6 | 6 |
| DOC | 10 | 0 | 10 | 10 |
| **TOTAL** | **483** | **36** | **483** | **483** |

## 5. Parity

| Oracle / reference | Cases | Result |
|---|---|---|
| `TRANSITION_CONTRACT` (8 states × 3 actions) | PAR-TC 24 | 24 / 24 |
| `VERDICT_GATE_TABLE` rows 1–5 | PAR-VG 5 | 5 / 5 |
| `FRESHNESS_CONTRACT` rows 1–31 via `readControl` | PAR-FR 31 | 31 / 31 |
| Control Read `get_review_state` refs / fact reasons / `basis_observed_at` | PAR-5A 3 | 3 / 3 |
| probe independence (`applyReviewAction` both verdicts = probe = oracle) | P-02 11 | 11 / 11 |
| `get_project_state` / UI `canApply` / `actionRefusal` | PAR-PR 2, PAR-UI 24 | DEFERRED (QD-5B-16, QD-5B-17) |

## 6. Reason code coverage (17)

Each reason code is asserted by at least one test (grep of the test files, plus the expectations below).

| Reason | Cases |
|---|---|
| `REVIEW_STATE_NOT_ALLOWED` | DT-01 (CV, SNR), DT-08-01, PAR-TC, CHK-ORD-CV |
| `ROUND_LIMIT_REACHED` | S-06-01 |
| `RESULT_NOT_CAPTURED` | DT-08-02, PAR-VG-01 |
| `FINAL_JUDGMENT_NOT_CAPTURED` | DT-08-03, PAR-VG-03 |
| `DOMAIN_REFUSED_OTHER` | S-07-01, S-07-02, CHK-SHAPE |
| `PROJECT_NOT_REGISTERED` | DT-07-01, DT-07-02, S-08-PR |
| `EXPECTED_HEAD_NOT_RECORDED` | S-02, S-08-EH-NOTHING_RECORDED |
| `EXPECTED_HEAD_NOT_EXACT` | S-01 |
| `REVIEWED_HEAD_NOT_RECORDED` | S-03, S-08-RH-NOTHING_RECORDED |
| `REVIEWED_HEAD_NOT_EXACT` | S-04 |
| `HEAD_CHANGED` | DT-03-01, DT-03-02, PAR-FR |
| `REVIEW_STALE` | S-05, PAR-FR |
| `WORKTREE_DIRTY` | DT-04-01, DT-04-02, PAR-FR |
| `FRESHNESS_UNKNOWN` | DT-05, DT-06, ID-14, S-08-FR, PAR-FR |
| `EVIDENCE_INCOMPLETE` | DT-14, S-08 (C-01 and BLOCKED rows), CHK-VPX |
| `HUMAN_DECISION_REQUIRED` | DT-02, DT-04-02 (not evaluated), DT-08-04..06 |
| `VERDICT_CONFIRMATION_NOT_RECORDED` | DT-10-01..03 |

## 7. Basis error rebuild coverage

- BM-01: all 8 codes × (no reason + 14 Control Read reasons) = 120 pairs → 10 passed through unchanged, 110
  rebuilt as `SOURCE_UNAVAILABLE` / `BASIS_CONTRACT_VIOLATION`. 120 / 120.
- BM-02: each pass-through pair with an extra internal key → violation, output keys ⊆ {code, reason}. 10 / 10.
- BM-03: pass-through pair in another contract / version → violation. 2 / 2.
- BM-04: malformed success envelope (contract, version, operation, data absent) → violation. 4 / 4.
- Delegated precedence end to end: DEL 13 / 13, REQ-07-05 … 08.

## 8. Mutation (Annex C1 / C2, profile PILOT_FOCUSED)

Protocol: every mutation ran only in a scratch clone outside the canonical repository; no patch was applied to
the shared worktree.

| C1 item | Result |
|---|---|
| Clone | `git clone --no-local --no-hardlinks <canonical> <scratch>`; `checkout --detach` at the target SHA; `git rev-parse HEAD` equal |
| Push | `git remote set-url --push origin DISABLED` (verified by the driver before every session) |
| Dependencies | `npm ci` inside the clone |
| Session 1 | target `3b9276be…`; 28 / 28 KILLED (superseded by session 2, see `DECISIONS.md` D-02) |
| Session 2 (authoritative) | target **`413445f337bac406df200f883da0466b525f8e13`** (final product head); 28 / 28 KILLED |
| Shared baseline (both sessions) | canonical `HEAD`, `status --porcelain --untracked-files=all` SHA-256, `stash list` count, `diff --stat -- src docs` SHA-256 recorded before and after: **equal** (session 1: `3b9276be…` / empty status / 0 / empty diff; session 2: `413445f3…` / empty status / 0 / empty diff) |
| Remote | `ls-remote --heads origin feat/action-eligibility-contract-v1`: absent before and after both sessions |
| Typecheck gate | `npx tsc --noEmit` must exit 0 or the probe is INVALID; sanity probe (an injected type error) → exit 2, restored by hash |
| Killers | `npx vitest run <killer files> -t "<case ids>"`; KILLED only when exit ≠ 0, ≥ 1 failed test title starts with a declared killer case id, and no load / transform / syntax error |
| Restore | `git apply -R`; target file SHA-256 equal to pre; `git status --porcelain` empty — all 28 |
| Raw logs | outside the clone, in the session scratch area; only the JSON-report SHA-256 prefix is recorded below |

Mandatory set (PILOT_FOCUSED, 26): M-01, 02, 04, 05, 09, 11, 12, 13, 19, 20, 24, 25, 26, 27, 28, 29, 30, 31, 32,
33, 34, 36, 37, 38, 39, 40 — **26 / 26 killed**. M-26 and M-32 were run as two variants each (a / b), so 28 probes.
Deferred (14): M-03, 06, 07, 08, 10, 14, 15, 16, 17, 18, 21, 22, 23, 35 → `QUALITY_DEBT.md` QD-5B-01 … 14.

| Mutation | Change | tsc | vitest | run | failed | killer failures | restored | report SHA-256 | verdict |
|---|---|---|---|---|---|---|---|---|---|
| M-01 | freshness_aligned: UNKNOWN -> PASS | 0 | 1 | 33 | 15 | DT-05-01, DT-06-01, PAR-FR-17, PAR-FR-18 (+11) | yes | 8e4cceebc329 | KILLED |
| M-02 | human_decision -> PASS | 0 | 1 | 3 | 2 | DT-02, DT-09 | yes | d82ad797b909 | KILLED |
| M-04 | state_guard from a local state list (startReview allowed in NEW) | 0 | 1 | 1 | 1 | PAR-TC-NEW-startReview | yes | e3faf01df895 | KILLED |
| M-05 | verdict_prerequisites always PASS | 0 | 1 | 4 | 4 | DT-08-02, DT-08-03, PAR-VG-01, PAR-VG-03 | yes | f8fdf4cef35e | KILLED |
| M-09 | SHORT expected head accepted | 0 | 1 | 1 | 1 | S-01 | yes | 2455dcb707fe | KILLED |
| M-11 | ENTERED treated as EXPLICIT | 0 | 1 | 3 | 3 | DT-10-01, DT-10-02, DT-10-03 | yes | 148cad636b25 | KILLED |
| M-12 | version 2 / "1" accepted | 0 | 1 | 2 | 2 | REQ-03-01, REQ-03-02 | yes | 8cc2488254bd | KILLED |
| M-13 | unknown fields ignored | 0 | 1 | 10 | 10 | REQ-05-01, REQ-05-02, REQ-05-03, REQ-05-04 (+6) | yes | 5ca1ef6c889c | KILLED |
| M-19 | internal step 1-6 codes passed through | 0 | 1 | 121 | 7 | BM-01-INVALID_REQUEST-NOT_AN_OBJECT, BM-01-INVALID_REQUEST-UNRECOGNIZED_FIELD, BM-01-INVALID_REQUEST-MISSING_FIELD, BM-01-INVALID_REQUEST-INVALID_FIELD_TYPE (+3) | yes | afc01b8ddc2e | KILLED |
| M-20 | internal error spread (extra keys pass) | 0 | 1 | 10 | 10 | BM-02-01, BM-02-02, BM-02-03, BM-02-04 (+6) | yes | 0be30a6cc700 | KILLED |
| M-24 | I1 (duplicate outer id) removed | 0 | 1 | 4 | 4 | ID-04, ID-05-01, ID-05-02, ID-06 | yes | 086ea8116c31 | KILLED |
| M-25 | B6 (round identity) removed | 0 | 1 | 5 | 5 | ID-11, ID-12, ID-13-B6a, ID-13-B6b (+1) | yes | 8733593dde58 | KILLED |
| M-26a | payload table changed (confirm_verdict NOT_APPLICABLE) | 0 | 1 | 4 | 1 | P-01-02 | yes | 31a971407cd4 | KILLED |
| M-26b | ACTION_PAYLOAD removed from not_evaluated | 0 | 1 | 4 | 1 | ENV-05 | yes | 074c83c7c0c4 | KILLED |
| M-27 | unmapped refusal -> PASS | 0 | 1 | 2 | 2 | S-07-01, S-07-02 | yes | 19f194f8beda | KILLED |
| M-28 | Message params in output | 0 | 1 | 3 | 3 | DISC-01, DISC-02, DISC-03 | yes | a44bafff04ba | KILLED |
| M-29 | internal snapshot id used as assessment id | 0 | 1 | 2 | 2 | ENV-01, ENV-04 | yes | 853070e0dc6a | KILLED |
| M-30 | authority changed | 0 | 1 | 1 | 1 | ENV-05 | yes | e5fae76eb818 | KILLED |
| M-31 | source written in place | 0 | 1 | 3 | 3 | SIDE-01, SIDE-02, SIDE-03 | yes | 2c966c1a9e37 | KILLED |
| M-32a | executor changed | 0 | 1 | 2 | 1 | CAT-02 | yes | 001b6d7f1c78 | KILLED |
| M-32b | catalog action added | 0 | 1 | 2 | 1 | CAT-01 | yes | 1f8c2e301f79 | KILLED |
| M-33 | PROJECT_NOT_REGISTERED ignored | 0 | 1 | 2 | 2 | DT-07-01, DT-07-02 | yes | e7b35190392b | KILLED |
| M-34 | BLOCKED fact -> PASS (freshness) | 0 | 1 | 14 | 4 | S-08-FR-WITHHELD_BY_POLICY, S-08-FR-INVALID_SOURCE_VALUE, DT-14-01, DT-14-02 | yes | 2eb87cffa42b | KILLED |
| M-36 | I2 (inner claim) ignored | 0 | 1 | 5 | 5 | ID-02, ID-03-01, ID-03-02, ID-15-01 (+1) | yes | aa395cdb35c8 | KILLED |
| M-37 | I4 (duplicate project) removed | 0 | 1 | 3 | 3 | ID-07, ID-08-01, ID-08-02 | yes | 9ce1e84c1c50 | KILLED |
| M-38 | pre-scan after delegated TARGET_UNAVAILABLE | 0 | 1 | 2 | 2 | ID-05-01, ID-06 | yes | 2b22542cedda | KILLED |
| M-39 | I3 (outer/inner mismatch) removed | 0 | 1 | 1 | 1 | ID-01 | yes | 4c261031c3a4 | KILLED |
| M-40 | freshness_aligned: DERIVED non-ALIGNED -> PASS | 0 | 1 | 34 | 16 | DT-03-01, DT-04-01, S-05, PAR-FR-01 (+12) | yes | 1a3810a192d1 | KILLED |

Patches (`mutation/`, generated against `413445f3…`), SHA-256:

```text
d87891cb13d89e42fb7fe6f48eb175d163300472af395d042d1e6d13a43be285  M-5B-01.patch
3a3d0b68a7c61063f80c20ffc37bded0b37f377ae87c078f532b3d185492c34d  M-5B-02.patch
5c497217e8bc0a58e92dfade38a470e42d886f20d6d8fd86cce1c75c546771f1  M-5B-04.patch
1a010867c40fead21c39f3e7a4f3ec48f4283d5795644ddc1f1e361f2023369e  M-5B-05.patch
4f3bc2acba7e5619aa75c6db136d92caed8d3f53c6b210385c1d0140be91e2a4  M-5B-09.patch
35b9c8262275badd3a23c7c32407dbce8ccbd78f415c4e23e77f1009c2f2da43  M-5B-11.patch
67d641b85f2abeecedace7b6d7e81a8f91d9a07cf9fd96c857c400e68e049592  M-5B-12.patch
4c28ed65bdf25904e6199298bf797b31e278155c3e634e39a44636e932ae071b  M-5B-13.patch
0128167830f7fbdab77c8fa74f6aaa0008229a1da3a42bd893ee1a84f1c0dfb3  M-5B-19.patch
3aae33bd2f93b02df6d674320d553f9782362f731c34cf6e1e3944c08174c4ca  M-5B-20.patch
ab917c9d047dac7e2a5089c5bdf9c8440142675dba85c9ad126795a699d6bcc8  M-5B-24.patch
98616c693b241c8b1e0976da4da6287b67a8334ed9c07a003ce6636cc64a0da9  M-5B-25.patch
d23a160adc7811ce725c20efaa60fa1a746df2b0b94b342ce402f2c0b22fa326  M-5B-26a.patch
8257b4317f757b7a1e5f1f5bc84de436a968ce912ab9b0b5049f3b35d1afaaa6  M-5B-26b.patch
2495ba1ee50957f2a7dfb4135890b7d123a57a7558ed9599802fc6b10340fc94  M-5B-27.patch
27901473f6481927d8840757a4207e2d6efcb4ac8891da2a69436ac1f4abed16  M-5B-28.patch
91efb51fc0c183986917c775ae2c7ff44da2f7a904be52fb09ef7efe69e9ca87  M-5B-29.patch
80c57298a79f9ad39dd575933f84461b4dafb8fe88f65561eddb813b64a21e8f  M-5B-30.patch
28fc22d0a86e90769d0c68b3f6c3d1cd28668fa27fe91e5465583e8cc3a2fcfd  M-5B-31.patch
7d8da2d074ea16432669db261178e4ff5affff5774eeba25ff448e9d6a15bd24  M-5B-32a.patch
1233152b7044d3d7132cf8a74a799fd06db1edebeea9aa5888b9a75230211de4  M-5B-32b.patch
f0781a3badfb212b66c1613402dd637af92f31d6ccdf466b801484cf1496810d  M-5B-33.patch
df290afec4667384a013b756e66fc5cfbb136d167bd69d12c655363e7a834b44  M-5B-34.patch
6c09308013b11602c1839be51bbc4cf375af83c37c759da6699956909dbea846  M-5B-36.patch
e5c5fa6cd68a42cd5699678b71e918e16e4ecc3dfada2abd4567667d6443f973  M-5B-37.patch
366fd5ca7691bbf4c0ac5c817b94e3d629b4e15e49a5daf20a77c9e4a86b2461  M-5B-38.patch
722f087c3547b98c138436ee9d3380c7a83fee971a74f6401338487e3f60cb75  M-5B-39.patch
29646a391c1786d97250ed39ba10c5ddfd8384df79fca3037193fef79374ef9c  M-5B-40.patch
```

Reviewer reproduction (Annex C1, either profile): clone from GitHub, `git fetch origin pull/<PR>/head`,
`checkout --detach` at the PR head (equal to `git ls-remote origin refs/pull/<PR>/head`), disable push, `npm ci`,
then for each sampled patch: `git apply --check` → `git apply` → `npx tsc --noEmit` (exit 0) →
`npx vitest run <killer file> -t "<case id>"` (exit ≠ 0, killer named) → `git apply -R` → hash equal.
Minimum sample: M-02, M-11, M-24, M-36, M-40.

## 9. Delta

| Path | Change |
|---|---|
| `src/domain/actionEligibility/{contract,catalog,basis,checks,assessEligibility}.ts` | new (product, 5 files) |
| `src/domain/actionEligibility/{request,basis,catalog,checks,decisionTable,parity,disclosure}.test.ts` | new (tests, 7 files) |
| `src/test/actionEligibilityFixtures.ts` | new (synthetic fixtures) |
| `docs/action-eligibility-contract-v1.md` | new |
| `src/test/docsContract.test.ts` | additions only (removed lines: 0) |
| `.agent-run/LR-20261011-DVCC-012/**` | run folder, packet snapshot, mutation patches |

- Prohibited files (packet §9: Control Read, existing domain, oracles, app / features / components / i18n /
  services / src-tauri, package / lock / config, contract / fixtures / scripts / .github, README, the 5A run
  folder): **0 changed** (`git diff --name-only <base> HEAD -- <prohibited paths>` empty).
- Not changed: UI, i18n, Tauri / IPC / MCP, persistence, Control Read v1, existing tests (all pass unchanged).
- Product size: 5 files / about 830 lines including comments.

## 10. Deferred quality debt

`QUALITY_DEBT.md`: QD-5B-01 … 17 (14 mutations, P-03, PAR-PR, PAR-UI) and the carry-over observation QD-5B-C1.
