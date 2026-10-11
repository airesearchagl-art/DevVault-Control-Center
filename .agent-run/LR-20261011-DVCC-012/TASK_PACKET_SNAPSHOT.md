<!-- DVCC-TASK-PACKET BEGIN id=DVCC-P5B-TASK-PACKET rev=3-mvp -->
# Task Packet — DVCC Phase 5B: Action Eligibility Contract Vertical Slice (rev 3 MVP candidate)

```text
PHASE_5B_IMPLEMENTATION_AUTHORIZED = NO
```

- Packet ID / Revision: `DVCC-P5B-TASK-PACKET` / `rev 3 MVP candidate`（rev 2 candidate を置換）
- Status: CANDIDATE（`PHASE_5B_MVP_FINAL_PACKET_HUMAN_GATE` 待ち）。本 packet は authorization ではない
- Repository: `airesearchagl-art/DevVault-Control-Center`
- Required base: `3b5ec51b4447f2d143a570dc14b5e6ae807bb390`
- Branch: `feat/action-eligibility-contract-v1`
- Run ID: `LR-<YYYYMMDD>-DVCC-012`（YYYYMMDD は承認メッセージで確定。番号は P1-5 で検証）
- Data Model Gate: NONE / EXISTING
- Transport: none / UI: none（Option A, Domain-only）
- Contract: `dvcc.action-eligibility` v1（`dvcc.control-read` v1 は不変）
- Verification profile: `FULL`（既定）/ `PILOT_FOCUSED`（承認メッセージで Human が選択した場合のみ。Annex C）

## Canonical artifact rule（RF-5B-AR2-05）
1. 本 packet は単一ファイル `DVCC_PHASE5B_TASK_PACKET_REV3_MVP.md` である。文字コードは UTF-8（BOM なし）、改行は LF のみ（CR を含まない）。
2. 境界 marker は「行全体が marker 文字列と完全一致する行」であり、次の12行が各1回、この順序で現れる。1行目は PACKET BEGIN、最終行は PACKET END。
   - `<!-- DVCC-TASK-PACKET BEGIN id=DVCC-P5B-TASK-PACKET rev=3-mvp -->`
   - `<!-- DVCC-SECTION BEGIN BODY -->` / `<!-- DVCC-SECTION END BODY -->`
   - `<!-- DVCC-SECTION BEGIN ANNEX-A -->` / `<!-- DVCC-SECTION END ANNEX-A -->`
   - `<!-- DVCC-SECTION BEGIN ANNEX-B -->` / `<!-- DVCC-SECTION END ANNEX-B -->`
   - `<!-- DVCC-SECTION BEGIN ANNEX-C -->` / `<!-- DVCC-SECTION END ANNEX-C -->`
   - `<!-- DVCC-SECTION BEGIN ANNEX-D -->` / `<!-- DVCC-SECTION END ANNEX-D -->`
   - `<!-- DVCC-TASK-PACKET END -->`
3. 1行目から BODY BEGIN の直前までを Header とする。結合順は Header → BODY → ANNEX-A → ANNEX-B → ANNEX-C → ANNEX-D で固定。各 section の END 行の次の行は、次 section の BEGIN 行である。
4. ファイルは最終行（PACKET END）の直後の LF 1つで終わる。末尾に空行を置かない。
5. 承認対象は本ファイル全 bytes の SHA-256。hash 値は本ファイルに書かない（自己参照しない）。旧 revision の hash を流用しない。
6. 写し（会話への貼り付けなど）から再計算した hash が一致しない場合、写しは無効でありファイルが正本である。

<!-- DVCC-SECTION BEGIN BODY -->
## 0. Revision history
- rev 1 candidate: 初版。
- rev 2 candidate: RF-5B-AR-01〜07 を反映。
- rev 3 MVP candidate: RF-5B-AR2-01〜05 を反映。それ以外の Architecture Decision は rev 2 から変えない。付随する変更は次の3点だけで、いずれも RF-AR2 の修正から必然的に生じたもの。
  - C-01: head 系 fact の UNKNOWN（NOTHING_RECORDED 以外）を FAIL `EVIDENCE_INCOMPLETE` に割り当てる。rev 2 では未定義だった入力を fail-closed で補完したもので、atomic な期待値を確定するために必要（RF-AR2-01）。
  - M-36〜M-40: RF-AR2-02 で追加した check と、stale / dirty を PASS 扱いにする mutation が抜けていた点を補う。rev 2 の M-01〜35 の意味は変えない。
  - Verification profile: 既定は FULL（rev 2 の必須集合に追加分を加えたもの）。PILOT_FOCUSED は Human が選ぶ場合の選択肢として定義する。

| RF | rev 3 の変更 | 場所 |
|---|---|---|
| RF-5B-AR2-01 | rev 2 の「36」は case group 数と定義する。atomic case は Annex D に machine-readable な形で列挙し、実数を宣言する | Annex B, D |
| RF-5B-AR2-02 | identity pre-scan I1〜I4、判定の優先順位、配列順序に依存しないこと | Annex A3, A4; D（ID, PERM） |
| RF-5B-AR2-03 | run ID の再帰 tree listing 検査（最大番号、番号の重複、全 ref での未使用）。base / branch の一致を P0 / P2 / P3 で照合する | §1 |
| RF-5B-AR2-04 | mutation は scratch clone の中だけで実行する（Reviewer は必須、実装者も同じ手順）。共有 worktree が変化しないことを確認する | Annex C1 |
| RF-5B-AR2-05 | 単一ファイル artifact、境界 marker、結合順、改行規則、ファイルを読み直しての hash 計算 | Header, §1 P1-8 |

## 1. 実施手順（この順序を変えない）
- P(-1) 準備側: fresh state を read-only で確認する。本ファイルを読み直して SHA-256 を計算し、提示する。
- G0 Human が承認メッセージ（§19）を発行する。
- P0 承認受領（実装 session。この段階では tool を使わない）:
  - 必須 field: `PHASE_5B_IMPLEMENTATION_AUTHORIZED = YES`、`packet_file`、`packet_sha256`（64 桁 hex）、`base`、`branch`、`run`、`verification_profile`（欠落時は FULL）、`adopted`。
  - `base` / `branch` が Header と一致し、`run` が `^LR-[0-9]{8}-DVCC-012$` に一致すること。不一致または欠落なら STOP。
- P1 read-only preflight。repository への書き込みはゼロとする。許すのは remote-tracking ref の更新、repository 外の scratch、ignore 対象の cache だけ。
  - P1-1 `git fetch origin --prune`
  - P1-2 `git rev-parse origin/main` が `base` と一致し、`git cat-file -e <base>^{commit}` が成功する
  - P1-3 `git status --porcelain --untracked-files=all` が空
  - P1-4 branch が存在しない: `git rev-parse --verify --quiet refs/heads/<branch>` が失敗し、`git ls-remote --heads origin <branch>` が空
  - P1-5 run ID の検査（RF-AR2-03）:
    - a `run` の日付部が実在する暦日である
    - b `git ls-tree -r --name-only <base> -- .agent-run` の全行が `^\.agent-run/LR-[0-9]{8}-DVCC-[0-9]{3}/` に一致する。一致しない行があれば STOP
    - c b から run ID の集合 U と番号の集合 N を抽出する。1つの番号に複数の run ID があれば STOP
    - d `run` の番号が max(N) + 1 に等しい（準備時点の実測: U は 001〜011 の 11件で重複なし、max = 011）
    - e `run` の番号を持つ run ID が、次のどこにも存在しない: U、worktree の `.agent-run/` 直下（untracked を含む）、`git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin` の各 ref に対する `git ls-tree -r --name-only <ref> -- .agent-run`
  - P1-6 `gh pr list --state open` が 0 件。0 件でない場合、各 PR の変更ファイルが §8 / §9 と重ならないこと（重なれば STOP）
  - P1-7 base に helper が存在する（`git grep -n <symbol> <base> -- <path>`）: `readControl`, `readableReview`, `ECHOABLE_FIELD_NAME`, `guardAction`, `actionRefusal`（`ProbedAction` に `confirmVerdict` を含む）, `headBinding`, `reviewStateConfirmation`, `TRANSITION_CONTRACT`, `VERDICT_GATE_TABLE`, `FRESHNESS_CONTRACT`（31 行）, `contract/limits.json` の `maxReviewRounds`
  - P1-8 packet: 受け取ったファイルを repository 外の scratch に置き、Header の canonical rule を機械的に検査する（BOM なし、CR が 0、marker 行の完全一致・回数・順序、末尾の LF が1つ）。そのうえでファイルを読み直して SHA-256 を計算し、`packet_sha256` と一致すること。貼り付けられた写ししかなく、それが一致しない場合は、原本ファイルを要求して STOP
  - P1-9 baseline: `npm run typecheck` と `npm test`（件数を記録する）。その後 P1-3 を再実行して空であること
  - どれか1つでも失敗したら STOP し、報告する（repository への書き込みはゼロのまま）。
- P2 `git switch -c <branch> <base>` を実行する。検証: `git rev-parse HEAD` が base、`git symbolic-ref --short HEAD` が branch、status が空。local main の更新、reset、stash、clean はしない。
- P3 run folder を作る。P1-8 で検証した bytes をそのまま `.agent-run/<run>/TASK_PACKET_SNAPSHOT.md` にコピーし（打ち直さない）、SHA-256 を再計算して一致させる。
  - あわせて次を書く: RUN_MANIFEST（承認メッセージの field の引用、P1 の結果、verification_profile）、RUN_STATE、TASK_QUEUE、DECISIONS、EVIDENCE（P1 の節）、QUALITY_DEBT（PILOT_FOCUSED のときは Annex C4 の QD）。
  - `.agent-run/<run>/` だけを commit する。検証: `git rev-parse HEAD^` が base、`git show --stat --format= HEAD` に run folder だけが出る。不一致なら STOP（commit しない、clean しない）。
- P4 実装（§10）。
- P5 検証 → evidence → push → Draft PR → STOP。

## 2. Objective
1 review の現在の facts に対して、閉じた3つの action（`review.start_review` / `review.confirm_verdict` / `review.start_next_round`）を action level（payload は未評価）で判定する。disposition、reason code、evidence ref を deterministic かつ read-only で返す pure contract を追加する。結果は authority を持たない（`authority: "NONE"`）。

## 3. Scope
- `src/domain/actionEligibility/`: contract、catalog、basis（内部 request、内部 env、`mapBasisError`、`scanIdentity`、`bindIdentity`、`resolveBasis`）、checks（`runChecks` を含む）、entry point の `assessActionEligibility`。
- docs と docsContract への追加。
- test と test fixture。

## 4. Non-goals
- UI、i18n、App への配線、assessment ID 生成の adapter
- MCP / IPC / Tauri（5C）、DOT（5D）、Operation / Approval / Lease / Worker（5E〜5F）、Events / Jev（5H）
- catalog 外の action、payload の評価、データの修復
- 既存の domain、5A、oracle の変更。README の変更
- real-data G4 と running-app smoke

## 5. Source of Truth
1. Human の現在の指示と、承認された packet artifact（packet_sha256）
2. fresh な repository の状態（base `3b5ec51b…`）
3. 5A: `docs/control-read-contract-v1.md`、`src/domain/controlRead/**`（変更しない）
4. domain: `transitions.ts`、`actionRefusal.ts`、`freshness*.ts`、`headBinding.ts`、`schema.ts`、`review.ts`（変更しない）
5. 独立 oracle: `src/test/transitionContract.ts`、`src/test/workflowContract.ts`（`VERDICT_GATE_TABLE`）、`src/test/freshnessContract.ts`、`contract/limits.json`（変更しない）
6. Vault の Roadmap / Decisions（D-015〜D-017、D-019）

## 6. Contract → Annex A（A1〜A9 が規範）
## 7. Validation と identity → Annex A3〜A4

## 8. Planned files
- New（product）: `src/domain/actionEligibility/{contract,catalog,basis,checks,assessEligibility}.ts`
- New（test）: `src/domain/actionEligibility/{request,basis,catalog,checks,decisionTable,parity,disclosure}.test.ts`、`src/test/actionEligibilityFixtures.ts`
- New（docs / run）: `docs/action-eligibility-contract-v1.md`、`.agent-run/<run>/{TASK_PACKET_SNAPSHOT,RUN_MANIFEST,RUN_STATE,TASK_QUEUE,DECISIONS,EVIDENCE,QUALITY_DEBT}.md`、`.agent-run/<run>/mutation/M-5B-<NN>.patch`（profile の必須集合の分）
- Modified（追加のみ）: `src/test/docsContract.test.ts`
- 新規ファイルはいずれも準備時点で存在しないことを確認済み。test は `vite.config.ts` の include `src/**/*.test.ts` に含まれる。

## 9. Prohibited files
`src/domain/controlRead/**`, `docs/control-read-contract-v1.md`,
`src/domain/{transitions,actionRefusal,freshness,freshnessCause,headBinding,git,validation,review,states,schema,message,limits}.ts`,
`src/test/transitionContract.ts`, `src/test/workflowContract.ts`, `src/test/freshnessContract.ts`,
`src/app/**`, `src/features/**`, `src/components/**`, `src/i18n/**`, `src/services/**`, `src-tauri/**`,
`package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `contract/**`, `fixtures/**`, `scripts/**`, `.github/**`,
`README.md`, `.agent-run/LR-20261005-DVCC-011/**`

## 10. Implementation order（P4）
1. contract.ts
2. catalog.ts
3. basis.ts（mapBasisError → scanIdentity → bindIdentity → resolveBasis）
4. checks.ts
5. assessEligibility.ts
6. test（Annex D の順: REQ, DEL, BM, ENV, ID, PERM, CAT, P, CHK, S, DT, PAR, DISC, SIDE, DET, SRC, DOC）
7. docs と docsContract
8. product と test を commit
9. mutation（Annex C1。scratch clone で、8 の commit SHA を対象に）
10. evidence を commit
11. 検証 → push → Draft PR → STOP

## 11. Test plan
- Annex D の atomic case manifest が規範である。
- test 名には case_id を含める（`it.each` の名前に `$case_id` を入れる）。
- parameterized な group は1つの `it.each` table で実装し、test code を重複させない。
- 選択した profile の全 case を実装し、PASS させる。PILOT_FOCUSED では、profile F の case を Annex C4 の QD とする。
- あわせて local で typecheck、`npm test` 全件、`npm run build` を実行する。

## 12. Mutation protocol → Annex C1〜C2
## 13. Running-app: 不要（Option A。production から到達する caller がない）
## 14. Acceptance criteria → Annex C3

## 15. Evidence requirements
run folder 一式を残す。EVIDENCE.md に記録するもの:
- P0〜P3 の証跡（P1-5 の a〜e の結果を含む）
- 検証出力の要約
- manifest の照合表（group ごとに、manifest の件数・実行件数・PASS 件数）
- parity 表、reason code の網羅表、error 作り直し表の網羅結果
- mutation 表（C1 の各項目と、共有 worktree が変化しなかった記録）
- delta 表

含めてはいけないもの: 実在の path / session ID / project 名、provider の内容、生の test log。local verification を CI PASS と書かない。

## 16. STOP conditions
- P0〜P3 の検査が1つでも失敗した（承認 field、run ID、hash、base / branch の不一致）
- 5A、既存 domain、oracle、validator の変更、または private helper の export が必要になった
- Control Read v1 にない fact、または新しい basis が必要になった
- durable data（assessment、cache、log、grant、lease）が必要になった → Data Model Gate
- Tauri / IPC / MCP / UI が必要になった
- `NEEDS_HUMAN_CAPABLE_CHECKS` を広げる必要が出た、または Human の決定を要する action を ELIGIBLE_NOW にする必要が出た
- oracle との parity（TC / VG / FR / 5A）が一致しない
- production の経路で identity が曖昧になる入力（重複・不一致）が起こりうると判明した
- 型として有効な mutation を作れない、kill できない、scratch clone で実行できない、または共有 worktree が変化した
- Annex D で宣言した件数と、実装した件数が一致しない
- disclosure sentinel を満たせない経路がある
- base が drift した、知らない worktree の変更がある、open PR と競合する
- 外部の fact（PR / CI / merge）を判定に使う必要が出た

## 17. Review handoff
Draft PR を作ったら STOP する。PR body に書くもの: base、exact head SHA、packet_sha256、verification_profile、scope、local verification の表、manifest の照合表、delta 表、変更していないもの、mutation の再現手順（Annex C1 の Reviewer 手順と patch の path）。
その後の流れ: Independent FULL Review（新しい独立 session、TIER_2。省略しない）→ Ready（別の Gate）→ exact Ready head での C2 → Formal Review の attestation → Human による merge の Gate → merge 後の current-state sync。

## 18. Human Decisions（最終候補。承認メッセージの `adopted` が参照する定義）
| ID | 決定内容 | 状態 |
|---|---|---|
| HD-5B-01 | Vertical slice は V1（3つの review action） | rev 1 から不変 |
| HD-5B-02 | Human UI は Option A（Domain-only） | 不変 |
| HD-5B-03 | contract は `dvcc.action-eligibility` v1、doc は `docs/action-eligibility-contract-v1.md` | 不変 |
| HD-5B-04 | 5B が UI より厳しく判定するのは2点: SR / CV は EXACT head かつ ALIGNED が必須、SNR は確認記録が欠落していれば BLOCKED。UI は変えない（downgrade-only） | rev 2 で修正、rev 3 では不変 |
| HD-5B-05 | NH admissibility rule。`NEEDS_HUMAN_CAPABLE_CHECKS = [human_decision]` | rev 2 で修正、rev 3 では不変 |
| HD-5B-06 | 最初の FAIL で止め、残りは NOT_EVALUATED | 不変 |
| HD-5B-07 | check ごとの閉じた refusal mapping、`FINAL_JUDGMENT_NOT_CAPTURED`、fact との cross-check。rev 3 で C-01 を追加 | rev 3 で C-01 を追加 |
| HD-5B-08 | exact base SHA から直接 branch を作る。run ID は承認メッセージで確定。P0〜P3。rev 3 で symbolic-ref と HEAD^ の照合を追加 | rev 3 で補強 |
| HD-5B-09 | real-data G4 を新しく実施しない | 不変 |
| HD-5B-10 | 実装 PR の Risk Tier は TIER_2（FULL review） | 不変 |
| HD-5B-11 | `scope: ACTION_LEVEL`、payload の表、`ACTION_PAYLOAD` | rev 2 で新設、rev 3 では不変 |
| HD-5B-12 | error reason `BASIS_CONTRACT_VIOLATION` / `IDENTITY_MISMATCH` と閉じた作り直し表。rev 3: identity pre-scan I1〜I4、Annex A3 の優先順位、配列順序に依存しないこと。project が 0 件の場合は error ではなく BLOCKED `PROJECT_NOT_REGISTERED`（rev 2 の DT-07a を維持） | rev 3 で修正 |
| HD-5B-13 | 開始手順と canonical hash。rev 3: 単一ファイルと marker の規則、run ID の再帰検査（P1-5） | rev 3 で修正 |
| HD-5B-14 | mutation evidence の基準。rev 3: 実行は scratch clone の中だけ。verification profile を選ぶ（FULL = 既定 / PILOT_FOCUSED） | rev 3 で修正（profile は Human が選ぶ） |

## 19. Human Gates と承認メッセージの template
| Gate | 内容 |
|---|---|
| G-H1 | rev 3 の Human Gate review（Orchestration LLM による重点検証の結果を含む） |
| G-DS | Task 発行前の Documentation Sync（別途承認。Vault / Notion） |
| G0 | 承認メッセージ（下記の template） |
| P0〜P3 → P4 → P5 | 実装 session（STOP しない限り、追加の Gate はない） |
| G3 | Draft PR を作って STOP → Independent FULL Review（scratch clone での抜き取りを含む） |
| G5a / G5b | Ready → C2 → merge（それぞれ Human） |
| G-DS2 | merge 後の sync（別途承認） |
| — | release / Production / Phase 5C 以降は対象外 |

```text
PHASE_5B_IMPLEMENTATION_AUTHORIZED = YES
packet_file: DVCC_PHASE5B_TASK_PACKET_REV3_MVP.md
packet_revision: rev 3 MVP candidate
packet_sha256: <64 hex>
base: 3b5ec51b4447f2d143a570dc14b5e6ae807bb390
branch: feat/action-eligibility-contract-v1
run: LR-<YYYYMMDD>-DVCC-012
verification_profile: FULL | PILOT_FOCUSED
adopted: HD-5B-01..14 as defined in BODY section 18 of this packet
not authorized: Ready, merge, release, Production, Vault/Notion writes, Phase 5C+
```

## 20. Documentation Sync Trigger
- packet の準備: no
- Task の発行（G0）の前: yes（G-DS。別途承認）
- merge 時: yes（G-DS2。別途承認）

## 21. Rollback
変更は追加だけ。merge 前なら branch を破棄し、merge 後なら単一の revert で戻せる。保存されたデータは変わらない。

## 22. Proposed authorization identifier
`PHASE_5B_IMPLEMENTATION_AUTHORIZED = YES`（§19 の template。packet_sha256、base、branch、run、verification_profile、adopted を bind する）
<!-- DVCC-SECTION END BODY -->
<!-- DVCC-SECTION BEGIN ANNEX-A -->
# Annex A — Architecture（規範。rev 3 で変更したのは A3 と A4、A5 の C-01、A8 の sentinel だけ）

## A1. 意味の範囲
`assess_review_actions` は、1 review の現在の facts に対して、閉じた catalog の action type を payload なし（action level）で評価する。

| disposition | action level での定義 |
|---|---|
| `BLOCKED` | 評価した check に FAIL が1つ以上ある。domain が拒否したか 5B の policy が拒否したかを問わず、payload に依存しない。どの payload を与えても結論は変わらない |
| `NEEDS_HUMAN` | FAIL がなく、評価対象の action 自身の Human path が実行時に与える Human の決定だけが残っている（A6） |
| `ELIGIBLE_NOW` | すべての check が PASS。payload に依存しない拒否は見つからなかった。payload に依存する拒否（`payload.fields`）は評価していないので、実際の payload は実行時に拒否されうる |

3つとも authorization、予約、lock、成功の保証のいずれでもない。

## A2. Contract の型
```ts
export const ACTION_ELIGIBILITY_CONTRACT = "dvcc.action-eligibility" as const;
export const ACTION_ELIGIBILITY_VERSION = 1 as const;
export const ACTION_ELIGIBILITY_OPERATIONS = ["assess_review_actions"] as const;
export const ACTION_ELIGIBILITY_REQUEST_KEYS = ["contract", "version", "operation", "review_session_id"] as const;
export const ASSESSMENT_SCOPE = "ACTION_LEVEL" as const;
export const DISPOSITIONS = ["ELIGIBLE_NOW", "BLOCKED", "NEEDS_HUMAN"] as const;
export const ACTION_IDS = ["review.start_review", "review.confirm_verdict", "review.start_next_round"] as const;
export const EXECUTORS = ["HUMAN_UI"] as const;
export const ELIGIBILITY_RULE_IDS = [
  "eligibility.review.start-review@1", "eligibility.review.confirm-verdict@1", "eligibility.review.start-next-round@1",
] as const;
export const CHECK_IDS = [
  "state_guard", "verdict_prerequisites", "project_registered", "expected_head_exact",
  "reviewed_head_exact", "freshness_aligned", "verdict_confirmation_recorded", "human_decision",
] as const;
export const CHECK_OUTCOMES = ["PASS", "FAIL", "NEEDS_HUMAN", "NOT_EVALUATED"] as const;
export const NEEDS_HUMAN_CAPABLE_CHECKS = ["human_decision"] as const;
export const PAYLOAD_EVALUATIONS = ["NOT_APPLICABLE", "NOT_EVALUATED"] as const;
export const PAYLOAD_FIELDS = ["verdict", "verdict_note", "human_confirmation", "expected_head"] as const;
export const NOT_EVALUATED_SCOPES = ["ACTION_PAYLOAD", "AGENT_PERMISSION", "EXTERNAL_GATES", "EXECUTION_OUTCOME"] as const;
export const REASON_CODES = [/* A9 の17種 */] as const;
export const ACTION_ELIGIBILITY_ERROR_REASONS = [/* A9 の15種 */] as const;

export interface CheckResultV1 {
  check: CheckId; outcome: CheckOutcome;
  reason?: ReasonCode;                          // FAIL / NEEDS_HUMAN のときだけ
  fact_reason?: UnknownReason | BlockedReason;  // 5A の UNKNOWN / BLOCKED fact が原因のときだけ
  evidence_refs: EvidenceRef[];                 // A8 の citability 規則に従う
}
export interface PayloadScopeV1 { evaluation: PayloadEvaluation; fields: PayloadField[] }
export interface ActionAssessmentV1 {
  action_id: ActionId; executor: "HUMAN_UI"; rule: EligibilityRuleId;
  disposition: Disposition; reasons: ReasonCode[]; checks: CheckResultV1[];
  payload: PayloadScopeV1; basis_observed_at: string | null;
}
export interface ActionEligibilityEnvelopeV1 {
  contract: "dvcc.action-eligibility"; version: 1; operation: "assess_review_actions";
  assessment_id: string; generated_at: string;
  authority: "NONE"; scope: "ACTION_LEVEL"; revalidation: "REQUIRED_BEFORE_EXECUTION";
  basis: { contract: "dvcc.control-read"; version: 1; operation: "get_review_state" };
  not_evaluated: ["ACTION_PAYLOAD", "AGENT_PERMISSION", "EXTERNAL_GATES", "EXECUTION_OUTCOME"];
  data: { review_session_id: string; project_id: string; current_round: number; assessments: ActionAssessmentV1[] };
}
export interface ActionEligibilityError {
  contract: "dvcc.action-eligibility"; version: 1;
  error: { code: ControlReadErrorCode; reason?: ActionEligibilityErrorReason;
           fields?: string[]; unlisted_field_count?: number; supported_versions?: [1] }; // fields 以下は 5B 自身の段階3/5/6 だけ
}
export interface ActionEligibilityEnv { now: () => string; newAssessmentId: () => string }
export function assessActionEligibility(request: unknown, source: ControlReadSource, env: ActionEligibilityEnv):
  ActionEligibilityEnvelopeV1 | ActionEligibilityError;
```

## A3. Validation、basis read、優先順位（rev 3 で段階10を細分化）
| 段階 | 条件 | 結果 |
|---|---|---|
| 1 | plain object でない | `INVALID_REQUEST / NOT_AN_OBJECT` |
| 2 | `contract !== "dvcc.action-eligibility"` | `UNSUPPORTED_CONTRACT` |
| 3 | `version !== 1` | `UNSUPPORTED_CONTRACT_VERSION / REQUESTED_VERSION_NOT_SUPPORTED`、`supported_versions:[1]` |
| 4 | `operation !== "assess_review_actions"` | `UNSUPPORTED_OPERATION`（reason なし） |
| 5 | 未知の key がある | `INVALID_REQUEST / UNRECOGNIZED_FIELD`（5A の `ECHOABLE_FIELD_NAME` を使い、echo 規則も 5A と同じ） |
| 6 | `review_session_id` がない / string でない | `MISSING_FIELD` / `INVALID_FIELD_TYPE`、`fields:["review_session_id"]` |
| 7〜9 | 内部 readControl の結果が `INVALID_TARGET` / `SOURCE_UNAVAILABLE` | 作り直し表で返す |
| 10a | `scanIdentity` が review 側の矛盾（I1〜I3）を検出 | `TARGET_UNAVAILABLE / IDENTITY_MISMATCH` |
| 10b | 内部 readControl の結果が `TARGET_NOT_FOUND` | `TARGET_NOT_FOUND` |
| 10c | 内部 readControl の結果が `TARGET_UNAVAILABLE / <reason>` | 同じ code / reason |
| 10d | 対象 project の重複（I4） | `TARGET_UNAVAILABLE / IDENTITY_MISMATCH` |
| 11 | 成功 envelope の形の不正 → `SOURCE_UNAVAILABLE / BASIS_CONTRACT_VIOLATION`。B2 / B4〜B7 の不一致 → `IDENTITY_MISMATCH` | |
| 12 | check の評価（A5）。error にならない | — |
| 13 | envelope: `env.newAssessmentId()` を1回 → `env.now()` を1回 | — |

```text
resolveBasis(id, source, basisEnv = BASIS_ENV):
  r = readControl(BASIS_REQUEST(id), source, basisEnv)
  if r is error and r.error.code in {INVALID_TARGET, SOURCE_UNAVAILABLE}: return mapBasisError(r)     # 7-9
  s = scanIdentity(id, source)                                                                       # 配列順序に依存しない
  if s.kind == REVIEW_CONFLICT: return IDENTITY_MISMATCH                                             # 10a
  if r is error: return mapBasisError(r)                                                             # 10b / 10c、想定外は違反
  if s.kind != UNIQUE_READABLE: return BASIS_CONTRACT_VIOLATION                                      # 成功なのに scan と矛盾
  if s.projectCount >= 2: return IDENTITY_MISMATCH                                                   # 10d
  if not validSuccessShape(r): return BASIS_CONTRACT_VIOLATION                                       # 11
  return bindIdentity(id, s.raw, r.data)                                                             # 11（B2, B4-B7）
```

- request の各 property は1回だけ読み、局所変数に取り込む。内部 request はその string だけで新しく組み立てる。
- `BASIS_REQUEST(id) = {contract:"dvcc.control-read", version:1, operation:"get_review_state", review_session_id:id}`
- `BASIS_ENV = Object.freeze({ now: () => "1970-01-01T00:00:00.000Z", newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" })`
- 5A は成功時に `newSnapshotId` と `now` を各1回呼び、error 時には呼ばない。5B は成功 envelope の `contract` / `version` / `operation`（形の検証）と `data` だけを読み、それ以外は捨てる。`readBasis` / `resolveBasis` の第3引数は test でだけ渡す（SRC-04 で固定）。
- 呼び出し側 env の消費: 成功時は `newAssessmentId` 1回 → `now` 1回。error の経路ではどちらも 0 回。
- 作り直し表（新しい object を組み立てる。spread やコピーはしない）。そのまま通すのは次の10組（PASS10）だけ: `INVALID_TARGET`（reason なし）、`SOURCE_UNAVAILABLE` + {`APP_NOT_READY`, `REGISTRY_UNREADABLE`, `REGISTRY_IO_ERROR`, `REGISTRY_UNSUPPORTED_VERSION`}、`TARGET_NOT_FOUND`（reason なし）、`TARGET_UNAVAILABLE` + {`UNREADABLE`, `IO_ERROR`, `UNSUPPORTED_VERSION`, `MISSING`}。
- 次の場合はすべて `SOURCE_UNAVAILABLE / BASIS_CONTRACT_VIOLATION` にする: 上記以外の組、`error` に code / reason 以外の key がある、contract / version が違う、成功 envelope の形が違う。

## A4. Identity（rev 3、RF-5B-AR2-02）
`scanIdentity(id, source)` は配列の要素の集合だけを数える関数で、順序は使わない。

- `C_outer = source.reviews.filter(e => e.reviewId === id)`
- `C_inner = source.reviews.filter(e => e.reviewId !== id && e.session !== null && e.session.reviewSessionId === id)`（health を問わない）

| # | 条件（いずれかを満たせば矛盾） | 段階 | 意味 |
|---|---|---|---|
| I1 | `C_outer.length >= 2` | 10a | 外側 reviewId の重複（readable か unreadable かを問わない） |
| I2 | `C_inner.length >= 1` | 10a | 別の entry の内側 session が同じ id を名乗っている（内側だけの主張、または競合する主張） |
| I3 | `C_outer.length === 1 && C_outer[0].session !== null && C_outer[0].session.reviewSessionId !== id` | 10a | 外側 reviewId と内側 reviewSessionId が一致しない |
| I4 | `C_outer.length === 1 && readableReview(C_outer[0]) !== null` のとき、`source.projects.filter(p => p.projectId === C_outer[0].session.projectId).length >= 2` | 10d | 対象 projectId の重複 |

- scan の結果: REVIEW_CONFLICT（I1〜I3）/ NONE（`C_outer` も `C_inner` も 0）/ UNIQUE_UNREADABLE / UNIQUE_READABLE（raw = その session、projectCount）。
- project が 0 件の場合は identity error にしない。BLOCKED `PROJECT_NOT_REGISTERED` で fail-closed とする（HD-5B-12）。
- post-binding（段階11）: B2 は raw が readable であること。B4 は `basis.data.review_session_id === id`。B5 は `basis.data.project_id === raw.projectId`。B6 は `raw.rounds.length >= 1`、かつ最後の round の `round === raw.reviewRound === raw.rounds.length === basis.data.current_round === basis.data.rounds[0].round`。B7 は `basis.data.review_state` が HUMAN_CONFIRMED なら、その値が `raw.reviewState` と一致すること。
- 順序に依存しない理由:
  1. 段階7〜9 は id、phase、projectsHealth だけで決まる。
  2. scanIdentity は集合の件数だけで決まる。
  3. REVIEW_CONFLICT でなければ `C_outer` は 1 件以下なので、5A の最初の一致 lookup（readControl.ts:141）は順序にかかわらず同じ entry を選ぶ。projectCount が 1 以下なら、5A の `projects.find` も同じ project を選ぶ。`gitObservations` は key で引く Record である。
  4. よって出力は `source.reviews` / `source.projects` を並べ替えても変わらない（PERM と、両方の順序を試す ID case で固定する）。
- 曖昧な入力（I1〜I4、B2〜B7 の不一致）は常に error になり、`data` も assessment も返さない（ID-INV）。
- production の loader は `parseSessionFile(text, reviewId)` で folder と id の一致をすでに強制している（persistence.ts:205、schema.ts:306-308）。5B の scan は、pure な入力に対する多層防御として働く。
- 記録（5A は変更しない）: 5A の projection は `gitObservations[projectId]` を bracket access で引く（projection.ts:146）。そのため projectId が Object.prototype の小文字 property 名（`constructor`）のとき、OBSERVATION_INVALIDATED を返す。これは fail-closed であり、5B はこの fact をそのまま使う。ID-14 で、この場合に ELIGIBLE_NOW にならないことを固定する。5A 側の reason の精度は QD の候補（QD-5B-C1）。

## A5. Catalog と check
| action_id | domain の type | check の順序 | payload | 上限 |
|---|---|---|---|---|
| `review.start_review` | `startReview` | state_guard → project_registered → expected_head_exact → freshness_aligned | `NOT_APPLICABLE` / `[]` | ELIGIBLE_NOW |
| `review.confirm_verdict` | `confirmVerdict` | state_guard → verdict_prerequisites → project_registered → reviewed_head_exact → freshness_aligned → human_decision | `NOT_EVALUATED` / `["verdict","verdict_note","human_confirmation"]` | NEEDS_HUMAN |
| `review.start_next_round` | `startNextRound` | state_guard → project_registered → verdict_confirmation_recorded | `NOT_EVALUATED` / `["expected_head"]` | ELIGIBLE_NOW |

| check | 判定の出典 | PASS | PASS 以外 | 独立 oracle / parity |
|---|---|---|---|---|
| state_guard | `guardAction(raw, type)` だけ | null | `action.notAllowed` → `REVIEW_STATE_NOT_ALLOWED`、`action.roundLimit` → `ROUND_LIMIT_REACHED`、その他 → `DOMAIN_REFUSED_OTHER`。review_state が BLOCKED なら → `EVIDENCE_INCOMPLETE`（citability first） | TRANSITION_CONTRACT、contract/limits.json |
| verdict_prerequisites | state_guard が PASS した後だけ `actionRefusal(raw,"confirmVerdict")` | null、かつ `rounds[0].result_captured.value === true`、かつ derived_from が空でない | `action.verdict.resultRequired` → `RESULT_NOT_CAPTURED`、`action.verdict.judgmentRequired` → `FINAL_JUDGMENT_NOT_CAPTURED`、その他 → `DOMAIN_REFUSED_OTHER`。fact と矛盾 → `EVIDENCE_INCOMPLETE` | VERDICT_GATE_TABLE |
| project_registered | 5A の freshness fact | `UNKNOWN/PROJECT_NOT_REGISTERED` 以外。projectRef を示す | `PROJECT_NOT_REGISTERED`（fact_reason 付き）。projectRef が null → `EVIDENCE_INCOMPLETE` | get_project_state |
| expected_head_exact | `rounds[0].expected_head` | HUMAN_CONFIRMED かつ binding が EXACT | `UNKNOWN NOTHING_RECORDED` → `EXPECTED_HEAD_NOT_RECORDED`。SHORT → `EXPECTED_HEAD_NOT_EXACT`。BLOCKED → `EVIDENCE_INCOMPLETE`。その他の UNKNOWN → `EVIDENCE_INCOMPLETE`（C-01） | 5A の fact |
| reviewed_head_exact | `rounds[0].reviewed_head` と `headBinding(value)` | HUMAN_CONFIRMED かつ EXACT | 同じ規則で `REVIEWED_HEAD_NOT_RECORDED` / `REVIEWED_HEAD_NOT_EXACT` / `EVIDENCE_INCOMPLETE`（C-01 を含む） | 5A の fact |
| freshness_aligned | 5A の freshness fact | `DERIVED ALIGNED` | `HEAD_CHANGED` / `REVIEW_STALE` / `WORKTREE_DIRTY`。UNKNOWN → `FRESHNESS_UNKNOWN`。BLOCKED → `EVIDENCE_INCOMPLETE` | FRESHNESS_CONTRACT |
| verdict_confirmation_recorded | review_state の confirmation | EXPLICIT | ENTERED → FAIL `VERDICT_CONFIRMATION_NOT_RECORDED`。BLOCKED → `EVIDENCE_INCOMPLETE` | reviewStateConfirmation |
| human_decision | 固定 | なし | 常に NEEDS_HUMAN `HUMAN_DECISION_REQUIRED` | CAT-05 |

- UI との parity（profile F）:
  - SR / SNR の state_guard ⇔ `canApply`（ReviewDetail.tsx:150, 204, 224）
  - CV は (state_guard ∧ verdict_prerequisites) ⇔ `actionRefusal === null`（ReviewDetail.tsx:159, 212）
- probe の値は出力しない。前提による拒否は verdict の値に依存しない（transitions.ts:403-410、P-02）。

## A6. Disposition と NEEDS_HUMAN
- check は固定の順序で評価し、最初に FAIL が出たら止める。残りは NOT_EVALUATED（`[]`）とする。
- FAIL があれば BLOCKED。FAIL がなく NEEDS_HUMAN があれば NEEDS_HUMAN。それ以外は ELIGIBLE_NOW。
- reasons は、PASS 以外の check の reason を check の順序で並べたもの。
- NH admissibility rule: NEEDS_HUMAN を返してよいのは、(1) 同じ action のほかの check がすべて PASS で、(2) 残る要件を、評価対象の action 自身の既存の Human path が実行時に満たし、(3) 存在しない過去の記録を必要としないとき、に限る。v1 でこれを満たすのは `human_decision` だけ。
- 解消可能性の根拠: `verdictConfirmedAt` に書き込むのは transitions.ts:418 と :440 の2か所だけ。FIX_REQUIRED / REVIEW_PASS に入る経路は confirmVerdict と resume だけ。schema は verdict と state の整合を検査しない（schema.ts:286）。confirmVerdict は REVIEWING からしか実行できない。FIX_REQUIRED から同じ round の記録を作る経路は block → markReady → startReview → confirmVerdict だけで、これは catalog 外の action を含み、verdict を再決定することになる。以上から、確認記録の欠落は FAIL `VERDICT_CONFIRMATION_NOT_RECORDED` とする。

## A7. 評価しない payload
| action | evaluation | fields | 評価しない domain の拒否 |
|---|---|---|---|
| start_review | NOT_APPLICABLE | [] | なし |
| confirm_verdict | NOT_EVALUATED | verdict, verdict_note, human_confirmation | `action.verdict.confirmationRequired`、`action.verdict.unknown` |
| start_next_round | NOT_EVALUATED | expected_head | `action.expectedHead.invalid`（次の round の freshness の前提も評価しない） |

- request field で payload を運ぶことはできない（UNRECOGNIZED_FIELD になる）。
- `PAYLOAD_FIELD_OF` を `Record<Exclude<keyof Extract<ReviewAction,{type:T}>,"type">, PayloadField>` として型付けする。これは domain の payload が変わったことを検出するための guard で、mutation の kill には数えない。

## A8. Evidence、Provenance、Privacy、Authority
- Citability:
  - PASS の check は、1つ以上の ref を示す。ref は fact の `evidence_ref` / `derived_from` のコピーか、5A の builder で作ったもの。
  - UNKNOWN が原因の FAIL は `[]` と fact_reason を返す。BLOCKED が原因の FAIL は `EVIDENCE_INCOMPLETE` と `[]` と fact_reason を返す。
  - `as EvidenceRef` を使わない。
- check ごとの ref:
  - state_guard: `…/field/review-state`
  - verdict_prerequisites: result の derived_from（judgment があればそれも）。FINAL_JUDGMENT_NOT_CAPTURED の場合は judgment の derived_from
  - project_registered PASS: `projectRef`
  - head: fact の evidence_ref
  - freshness: derived_from と basis_observed_at
  - verdict_confirmation_recorded: review_state の ref と verdict の ref
- assessment_id と generated_at は env から1回ずつ取る。TTL も cache も持たない。snapshot_id は出力しない。
- 出力してよいもの: contract の定数、ID（review / project）、enum、5A の EvidenceRef、ISO 時刻、round 番号。
- 出力しないもの: path、URL、自由記述、branch、Git の errorMessage、Message params / i18n の文言、probe の値、内部 basis の定数、IDENTITY_MISMATCH を起こした側の id の値、health object の余分な property。
- disclosure sentinel を入れる対象（到達しうる field）:
  - project: localRoot、repositoryUrl
  - session: reviewType、nextAction、chatgptThreadTitle、chatgptThreadUrl、verdictNote、riskTierSubjects、revalidation の explanation、archivedResults、archivedJudgments
  - git: branch、errorMessage
  - その他: health の余分な property、IDENTITY_MISMATCH の内側 id、unsafe な request key
- Authority: storage の変更、process、shell、Approval / Grant、Worker / Run、MCP / IPC / Tauri、durable entity、自動の Resume / Review / merge / Production。これらはすべて 0。

## A9. 列挙
- Reason code（17）: `REVIEW_STATE_NOT_ALLOWED`, `ROUND_LIMIT_REACHED`, `RESULT_NOT_CAPTURED`, `FINAL_JUDGMENT_NOT_CAPTURED`, `DOMAIN_REFUSED_OTHER`, `PROJECT_NOT_REGISTERED`, `EXPECTED_HEAD_NOT_RECORDED`, `EXPECTED_HEAD_NOT_EXACT`, `REVIEWED_HEAD_NOT_RECORDED`, `REVIEWED_HEAD_NOT_EXACT`, `HEAD_CHANGED`, `REVIEW_STALE`, `WORKTREE_DIRTY`, `FRESHNESS_UNKNOWN`, `EVIDENCE_INCOMPLETE`, `HUMAN_DECISION_REQUIRED`, `VERDICT_CONFIRMATION_NOT_RECORDED`
- Error code（8）は 5A と同じ。
- Error reason（15）: `NOT_AN_OBJECT`, `UNRECOGNIZED_FIELD`, `MISSING_FIELD`, `INVALID_FIELD_TYPE`, `REQUESTED_VERSION_NOT_SUPPORTED`, `APP_NOT_READY`, `REGISTRY_UNREADABLE`, `REGISTRY_IO_ERROR`, `REGISTRY_UNSUPPORTED_VERSION`, `BASIS_CONTRACT_VIOLATION`, `UNREADABLE`, `IO_ERROR`, `UNSUPPORTED_VERSION`, `MISSING`, `IDENTITY_MISMATCH`
- Check（8）、Outcome（4）、Payload field（4）、not_evaluated（4）は A2 のとおり。

## A10. rev 2 から変えていない決定
- Data Model Gate は NONE / EXISTING。
- UI は Option A。
- 不採用にした代替案（AA2〜AA6）と slice の比較（V2〜V4）。
- Action inventory は 38 件。
- disposition の定義、NH admissibility rule、payload の表、作り直し表の10組、env の消費。
<!-- DVCC-SECTION END ANNEX-A -->
<!-- DVCC-SECTION BEGIN ANNEX-B -->
# Annex B — Fixture と case group（RF-5B-AR2-01）

## B1. Synthetic fixture
- Project P: `projectId "project-alpha"`、`repositoryUrl "https://github.com/example-owner/example-repo"`、`localRoot "/synthetic/alpha"`、`createdAt "2026-10-01T00:00:00.000Z"`。
- `H = 0123456789abcdef0123456789abcdef01234567`、`H2 = fedcba9876543210fedcba9876543210fedcba98`、`T = 2026-10-11T00:59:30.000Z`。
- `O(x)`: `{localRoot: P.localRoot, projectCreatedAt: P.createdAt, observation: {status: "OK", head: x, dirty: false, branch: <sentinel>, observedAt: T}}`。
- Review id:
  - 対象 A: `rv-20261011-a1b2c3`
  - 不一致用 B: `rv-20261011-b1b2b3`
  - 他者 X: `rv-20261011-c1c2c3`
  - distractor（readable）: `rv-20261011-d1d2d3`
  - distractor（unreadable）: `rv-20261011-e1e2e3`
- F-READY: READY_FOR_REVIEW、R1 の expected が H、result なし、観測 O(H)。
- F-REV: REVIEWING、R1 の expected = reviewed = H、result あり、follow-up なし、観測 O(H)。
- F-FIX: FIX_REQUIRED、R1 の verdict が FIX_REQUIRED、verdictConfirmedAt あり、観測 O(H)。
- 略記: SR = start_review、CV = confirm_verdict、SNR = start_next_round。RSNA = BLOCKED [REVIEW_STATE_NOT_ALLOWED]。

## B2. Case group の定義と rev 2 との対応
- case group とは、同じ目的を持つ atomic case の集まりである。atomic case は、1回の呼び出しとその完全な期待値の組で、Annex D の1行の `count` に数える。
- rev 2 の「36」は decision case group 数（DT 16 + S 8 + N 9 + P 3）を指していた。rev 3 での扱い:
  - DT 16 group: 13 group が自前の atomic case を持つ。DT-07b〜e、DT-11、DT-13、DT-15 は REQ / DEL / ENV / CAT へ対応付けた（Annex D の MAP 行）。
  - S 8 / P 3: そのまま維持。
  - N 9: ID / BM / ENV の group へ移した。N-03 は期待値を変更した（rev 2: TARGET_UNAVAILABLE → rev 3: 両方の順序で IDENTITY_MISMATCH。順序に依存しないことの要件による）。
- rev 3 では、補助 group（REQ, DEL, BM, ENV, ID, PERM, PAR, CHK, CAT, DISC, SIDE, DET, SRC, DOC）も manifest に数える。group 数と atomic 数は Annex D の宣言値を正とし、機械的に照合する。
<!-- DVCC-SECTION END ANNEX-B -->
<!-- DVCC-SECTION BEGIN ANNEX-C -->
# Annex C — Mutation、AC、Verification profile

## C1. Mutation protocol（rev 3、RF-5B-AR2-04）
mutation を実行する場所は、canonical repository の外に作った scratch clone だけとする。共有 worktree に patch を当てることは、実装者にも Reviewer にも禁止する。

1. 準備
   - 実装者: 実装を commit した exact SHA X を対象にする。`git clone --no-local --no-hardlinks <canonical repo path> <S>` → `git -C <S> checkout --detach X`。
   - Reviewer: `git clone https://github.com/airesearchagl-art/DevVault-Control-Center.git <S>` → `git -C <S> fetch origin pull/<PR>/head` → `git -C <S> checkout --detach <PR head SHA>`。`git ls-remote origin refs/pull/<PR>/head` が、PR body / attestation に書かれた head SHA と一致すること。
   - 共通: `git -C <S> remote set-url --push origin DISABLED`。`git -C <S> rev-parse HEAD` が対象 SHA と一致すること。`<S>` で `npm ci` を実行する。
2. 共有側の baseline を記録する。対象は canonical worktree（実装者）または Reviewer が使っている既存 worktree。
   - `git -C <shared> rev-parse HEAD`
   - `git -C <shared> status --porcelain --untracked-files=all` の SHA-256
   - `git -C <shared> stash list` の行数
   - 実装者はこれに加えて `git -C <shared> diff --stat -- src docs` の SHA-256 を記録する（run folder への evidence の追加は許す）。
3. 各 mutation M について、`<S>` の中で次を行う。
   - a 対象ファイルの SHA-256 を記録する（pre）
   - b `git apply --check <patch>` → `git apply <patch>`
   - c `npm run typecheck` が exit 0 であること。exit 0 でなければその mutation は INVALID で、kill 数に数えず、書き直す
   - d `npx vitest run <killer file> -t "<case_id>"` が exit 0 以外で終わること。失敗した test の名前に、事前宣言した killer の case_id が含まれること。log に `Failed to load` / `Transform failed` / `SyntaxError` が出ていないこと
   - e `git apply -R <patch>` → SHA-256 が pre と一致し、`git status --porcelain` が空であること
4. 終了時、2 で記録した値がすべて一致すること。remote（該当する branch / PR head）も変化していないこと。
5. 生の log は `<S>` の外の scratch に置く。EVIDENCE.md に書くのは case_id、exit code、件数、assertion の要約、log の SHA-256 だけ。
6. 違反（共有側への適用、push、PR / branch の変更、2 の値の不一致）が起きたら STOP。kill されない mutation は FAIL とする（等価変異だと主張するには Reviewer の承認が必要）。
7. Reviewer は、どちらの profile でも最低5件（M-02、M-11、M-24、M-36、M-40）を、この手順で再実行する。

## C2. Mutation 表（40件。M = 両方の profile で必須、D = PILOT_FOCUSED では延期）
| ID | Mutation（型として有効なもの） | Killer（case_id） | AC | Profile |
|---|---|---|---|---|
| M-01 | freshness_aligned で UNKNOWN を PASS にする | DT-05-01, DT-06-01, PAR-FR | 16 | M |
| M-02 | human_decision を PASS にする | DT-02, DT-09, CAT-05 | 17 | M |
| M-03 | state_guard を常に PASS にする | DT-08-01, PAR-TC | 13 | D |
| M-04 | state_guard を局所的な state 一覧で判定する（startReview を NEW でも許す） | PAR-TC-NEW-startReview | 13 | M |
| M-05 | verdict_prerequisites を常に PASS にする | DT-08-02, DT-08-03, PAR-VG-01, PAR-VG-03 | 14 | M |
| M-06 | judgmentRequired を RESULT_NOT_CAPTURED に対応付ける | DT-08-03, PAR-VG-03 | 14 | D |
| M-07 | verdict_prerequisites を state_guard より先に評価する | CHK-ORD-CV | 14 | D |
| M-08 | fact との cross-check を外す | CHK-VPX-01, CHK-VPX-02 | 14 | D |
| M-09 | SHORT の expected head を受け入れる | S-01 | 19 | M |
| M-10 | VERDICT_CONFIRMATION_NOT_RECORDED を NEEDS_HUMAN にする | DT-10-01..03, DT-09 | 18 | D |
| M-11 | ENTERED を EXPLICIT として扱う | DT-10-01..03 | 18 | M |
| M-12 | version 2 / "1" を受け入れる | REQ-03-01, REQ-03-02 | 07 | M |
| M-13 | 未知の field を無視する | REQ-05-01..10 | 07, 11 | M |
| M-14 | 未知 field の判定を version の判定より先にする | REQ-07-01 | 07 | D |
| M-15 | NEEDS_HUMAN を BLOCKED より優先する | CHK-PREC-04, CHK-PREC-05 | 15 | D |
| M-16 | 最初の FAIL で止めない | CHK-SHAPE, DT-08-01 | 15 | D |
| M-17 | SNR に freshness の check を足す | DT-04-03, DT-05-03 | 19 | D |
| M-18 | fact_reason の INVALIDATED を NOT_OBSERVED に変える | DT-06-01..03 | 16 | D |
| M-19 | 内部の段階1〜6 の code をそのまま通す | BM-01 | 08 | M |
| M-20 | 内部 error を spread する | BM-02 | 08, 25 | M |
| M-21 | 内部 env の now に呼び出し側の now を使う | ENV-01 | 05, 06 | D |
| M-22 | error の経路でも env を消費する | REQ-01（env helper）, ENV-01 | 05 | D |
| M-23 | identity（pre-scan と post-binding）をすべて外す | ID-01, ID-04, ID-11 | 09 | D |
| M-24 | I1（外側 id の重複）を外す | ID-04, ID-05-01..02, ID-06 | 09 | M |
| M-25 | B6（round identity）を外す | ID-11, ID-12, ID-13-B6a..c | 09 | M |
| M-26 | payload の表を変える / ACTION_PAYLOAD を消す | P-01, ENV-05 | 11 | M |
| M-27 | 表にない拒否を PASS にする | S-07-01..02 | 20 | M |
| M-28 | Message params / i18n の文言を出力する | DISC-01..03 | 25 | M |
| M-29 | snapshot_id を出力する / 内部 id を使う | ENV-04 | 23 | M |
| M-30 | authority / revalidation / basis を変える | ENV-05 | 23 | M |
| M-31 | source を in-place で変更する | SIDE-01..03 | 26 | M |
| M-32 | catalog に action を足す / executor を変える | CAT-01, CAT-02 | 10 | M |
| M-33 | PROJECT_NOT_REGISTERED を無視する | DT-07-01..02 | 16 | M |
| M-34 | BLOCKED の fact を PASS にする | DT-14-01..02, S-08-FR（BLOCKED の行） | 16 | M |
| M-35 | state_guard の ref を誤った builder で作る | DT-01 | 24 | D |
| M-36 | I2（内側 id の主張）を無視する | ID-02, ID-03-01..02, ID-15-01..02 | 09 | M |
| M-37 | I4（project の重複）を外す | ID-07, ID-08-01..02 | 09 | M |
| M-38 | pre-scan を delegated TARGET_UNAVAILABLE より後に置く | ID-05-01, ID-06 | 09 | M |
| M-39 | I3（外側と内側の不一致）を外す | ID-01（scanIdentity の単体 assertion） | 09 | M |
| M-40 | freshness_aligned で DERIVED の非 ALIGNED を PASS にする | DT-03-01, DT-04-01, S-05, PAR-FR | 16 | M |

- FULL の必須集合（40件）: M-01〜M-40。
- PILOT_FOCUSED の必須集合（26件）: M-01, 02, 04, 05, 09, 11, 12, 13, 19, 20, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40。
- PILOT_FOCUSED で延期する14件: M-03, 06, 07, 08, 10, 14, 15, 16, 17, 18, 21, 22, 23, 35。
- 延期の安全性について: 延期する mutation のうち、到達しうる入力で誤った ELIGIBLE_NOW を生むのは M-03 と M-23 だけである。M-03 は M-04 に支配され（同じ killer の PAR-TC が、M-04 より広い差分を必ず検出する）、M-23 は M-24 / 25 / 36 / 37 / 38 / 39 に支配される。それ以外の12件は、reason・順序・evidence の正確さ、env の消費回数、到達不能な防御、判定を厳しくする方向の変更に限られる。延期するのは「mutation で test の検出力を証明すること」だけで、test そのものはすべて残る。

## C3. Acceptance criteria（32件。M = 必須、F = PILOT_FOCUSED では延期）
| AC | 内容 | 検証 | Profile |
|---|---|---|---|
| AC5B-01 | 承認受領: field、base / branch / run の一致、packet_file / packet_sha256 / verification_profile | P0 の証跡 | M |
| AC5B-02 | P1 の preflight（P1-1〜9、run ID の再帰検査 a〜e）で、repository への書き込みが 0 | P1 の証跡 | M |
| AC5B-03 | branch が exact base を指し、symbolic-ref が branch で、local main は変わっていない | P2 | M |
| AC5B-04 | 最初の commit は run folder だけで、HEAD^ が base、snapshot の hash が一致 | P3 | M |
| AC5B-05 | 5B env の消費: 成功時は 1/1 で順序どおり、error 時は 0/0 | ENV-01、error helper | M |
| AC5B-06 | 内部 basis env は定数で出力されず、呼び出し側の env を内部に渡さない | ENV-02..04、SRC-04 | M |
| AC5B-07 | request の段階1〜6 | REQ | M |
| AC5B-08 | basis error の閉じた作り直し、delegated の優先順位 | BM、DEL、REQ-07-05、REQ-07-08 | M |
| AC5B-09 | identity の I1〜I4 / B2, B4〜B7、順序に依存しないこと、曖昧な入力では data を返さないこと | ID、PERM | M |
| AC5B-10 | catalog が閉じている | CAT-01..04、REQ-05-09..10 | M |
| AC5B-11 | ACTION_LEVEL、payload の表、ACTION_PAYLOAD | P-01、ENV-05、REQ-05-05..08 | M |
| AC5B-12a | probe から独立していること、verdict の文字列を出力しないこと | P-02 | M |
| AC5B-12b | BLOCKED が payload に依存しないこと（witness） | P-03 | F |
| AC5B-13 | state_guard は guardAction だけを使い、TC / limits と parity がとれている | PAR-TC、S-06、SRC-02 | M |
| AC5B-14 | verdict_prerequisites の順序、VG との parity、cross-check | PAR-VG、DT-08、CHK-VPX、CHK-ORD | M |
| AC5B-15 | 優先順位、最初の FAIL での停止 | CHK-PREC、CHK-SHAPE、DT-08-01 | M |
| AC5B-16 | UNKNOWN / BLOCKED → FAIL と fact_reason（C-01 を含む） | DT-05/06/07/14、S-08、PAR-FR | M |
| AC5B-17 | NEEDS_HUMAN は human_decision だけ、CV は ELIGIBLE_NOW にならない | CAT-05、DT-09、DT-02 | M |
| AC5B-18 | 確認記録の欠落は BLOCKED | DT-10 | M |
| AC5B-19 | head-bound な action は EXACT かつ ALIGNED が必須、SNR は Git に依存しない | S-01..05、DT-03/04/05 | M |
| AC5B-20 | check ごとの閉じた mapping、fallback、params を出力しない | S-07、DISC | M |
| AC5B-21 | 選択した profile の全 atomic case が PASS。test 名に case_id を含み、group ごとの実行件数が manifest と一致 | Annex D | M |
| AC5B-22a | 5A の facts / refs、FRESHNESS_CONTRACT との parity | PAR-5A、PAR-FR | M |
| AC5B-22b | PR / UI predicate との parity | PAR-PR、PAR-UI | F |
| AC5B-23 | envelope の固定値、snapshot_id を出さない、id を env から取る | ENV-04/05、DT-12 | M |
| AC5B-24 | citability、5A の grammar、cast を使わない | CHK-CITE、DT-01、SRC-03 | M |
| AC5B-25 | disclosure sentinel | DISC、REQ-05-03/04、BM-02、P-02-11 | M |
| AC5B-26 | side effect が 0 | SIDE、SRC-01、SRC-05 | M |
| AC5B-27 | determinism と、順序に依存しないこと | DET、PERM、DT-16 | M |
| AC5B-28 | 禁止ファイル（oracle を含む）の差分が 0、5A に回帰がない（既存の test がすべて PASS）、docsContract の既存 assertion を変えていない | delta 表、SRC-06、npm test | M |
| AC5B-29 | 新しい doc を docsContract で検査する | DOC | M |
| AC5B-30 | profile ごとの必須 mutation 集合を、C1 の手順（scratch clone）ですべて kill し、Reviewer が抜き取りで再実行する | C2 | M（集合は profile による） |
| AC5B-31 | local の typecheck / test / build が PASS し、exact Ready head で C2 が SUCCESS | — | M |
| AC5B-32 | MCP / IPC / Tauri / UI / 永続化 / Approval / Worker / 5C〜5E を含まない | delta、SRC | M |

## C4. PILOT_FOCUSED で延期する項目（Post-Pilot QD）
実施目標: 5D Pilot が PASS した後、Phase 5E の Task を発行する前（目標 2026-11-06）。PILOT_FOCUSED を選んだ場合は、run folder の QUALITY_DEBT.md に記録する。

| QD | 対象 | リスク | 延期理由 |
|---|---|---|---|
| QD-5B-01 | M-03 | 低: M-04 に支配される | 検出力は M-04 の kill で論理的に示せる |
| QD-5B-02 | M-06 | 低: reason の取り違え（どちらも BLOCKED） | 判定結果は変わらない |
| QD-5B-03 | M-07 | 低: reason の順序 | 判定結果は変わらない |
| QD-5B-04 | M-08 | 低: 到達不能な矛盾への防御 | domain guard が主たる判定を担う |
| QD-5B-05 | M-10 | 中低: BLOCKED と NEEDS_HUMAN の取り違え（どちらも ELIGIBLE_NOW ではない） | read-only Pilot では実行権限がない。5E の前に必須 |
| QD-5B-06 | M-14 | 低: error code の優先順位 | どちらの場合も拒否される |
| QD-5B-07 | M-15 | 低: first-FAIL の停止があるため実際には到達しない | 判定結果は変わらない |
| QD-5B-08 | M-16 | 低: 評価する check が増える | 判定結果は変わらない |
| QD-5B-09 | M-17 | 低: 判定が厳しくなる方向 | fail-safe |
| QD-5B-10 | M-18 | 低: 診断用の reason の精度 | 判定結果は変わらない |
| QD-5B-11 | M-21 | 低: env の消費回数 | 値は捨てられる |
| QD-5B-12 | M-22 | 低: env の消費回数 | 出力は変わらない |
| QD-5B-13 | M-23 | 低: 個別の identity mutation 6件に支配される | 検出力は個別の kill で論理的に示せる |
| QD-5B-14 | M-35 | 低中: evidence の field の取り違え | DT-01 の ref 完全一致 test は残る |
| QD-5B-15 | P-03（10 case）/ AC5B-12b | 低: 文書の主張を検証していない | domain 側の guard の順序（transitions.ts:201-203）が根拠 |
| QD-5B-16 | PAR-PR（2）/ AC5B-22b | 低: DT-07 と重複 | DT-07-01..02 が残る |
| QD-5B-17 | PAR-UI（24）/ AC5B-22b | 低: UI は変更しない | domain 側の parity（TC / VG）が残る |
<!-- DVCC-SECTION END ANNEX-C -->
<!-- DVCC-SECTION BEGIN ANNEX-D -->
# Annex D — Atomic Case Manifest（machine-readable）

- 形式: 下の `text` block の中にある PSV（`|` 区切り）。1行目は header で、field の中に `|` は含めない。
- 列: `case_id|count|group|profile|file|input|expected|ac`
- `count`: その行が表す atomic case の数。
- `case_id` の展開規則:
  - `{a..b}`: 両端を含む、0埋め2桁の連番。
  - `{x,y}`: 列挙。
  - `{code}` / `{reason}`: A9 / 5A の enum。
  - `{state}`: ORACLE_REVIEW_STATES（8）。
  - `{action}`: startReview / confirmVerdict / startNextRound。
- `profile`: M = 両方の profile で必須、F = FULL のときだけ必須（PILOT_FOCUSED では延期）、`-` = MAP 行（count 0、rev 2 の group との対応付け）。
- `file`: `src/domain/actionEligibility/<file>.test.ts`。`docsContract` だけは `src/test/docsContract.test.ts`。
- 宣言値:
  - atomic の合計 = 519（M = 483、F = 36）
  - case group 数（MAP を除く group 列の異なり数）= 80
  - MAP 行 = 16
- error case はすべて、共有 helper で「5B env を 0 回消費」と「`data` を返さない」ことを assert する（この assert は件数に数えない）。

```text
case_id|count|group|profile|file|input|expected|ac
REQ-01-{01..08}|8|REQ-01|M|request|request in {null; undefined; 42; "s"; true; []; new Date(0); Object.create({})}|INVALID_REQUEST/NOT_AN_OBJECT|07,05
REQ-02-{01..04}|4|REQ-02|M|request|contract in {"dvcc.control-read"; "dvcc.action-eligibility "; absent; 1}|UNSUPPORTED_CONTRACT|07
REQ-03-{01..06}|6|REQ-03|M|request|version in {2; "1"; 0; absent; 1.5; null}|UNSUPPORTED_CONTRACT_VERSION/REQUESTED_VERSION_NOT_SUPPORTED; supported_versions [1]|07
REQ-04-{01..04}|4|REQ-04|M|request|operation in {"get_review_state"; "assess"; absent; 1}|UNSUPPORTED_OPERATION without reason|07
REQ-05-01|1|REQ-05|M|request|extra key actor|INVALID_REQUEST/UNRECOGNIZED_FIELD; fields [actor]|07,17
REQ-05-02|1|REQ-05|M|request|extra keys actor; grant; permission|fields [actor,grant,permission]|07,17
REQ-05-03|1|REQ-05|M|request|extra key "Bad Key"|unlisted_field_count 1; no fields key|07,25
REQ-05-04|1|REQ-05|M|request|extra keys actor; "Bad Key"|fields [actor]; unlisted_field_count 1|07,25
REQ-05-{05..08}|4|REQ-05|M|request|one extra key in {verdict; note; expected_head; confirmed_by_human}|fields [that key]|07,11
REQ-05-{09..10}|2|REQ-05|M|request|one extra key in {action_id; actions}|fields [that key]|07,10
REQ-06-01|1|REQ-06|M|request|review_session_id absent|INVALID_REQUEST/MISSING_FIELD; fields [review_session_id]|07
REQ-06-{02..04}|3|REQ-06|M|request|review_session_id in {123; null; {}}|INVALID_REQUEST/INVALID_FIELD_TYPE; fields [review_session_id]|07
REQ-07-01|1|REQ-07|M|request|version 2 plus unknown key|UNSUPPORTED_CONTRACT_VERSION|07
REQ-07-02|1|REQ-07|M|request|wrong contract plus wrong version|UNSUPPORTED_CONTRACT|07
REQ-07-03|1|REQ-07|M|request|wrong operation plus unknown key|UNSUPPORTED_OPERATION|07
REQ-07-04|1|REQ-07|M|request|unknown key plus id absent|UNRECOGNIZED_FIELD|07
REQ-07-05|1|REQ-07|M|request|id "rv-bad" plus registry unreadable|INVALID_TARGET|07,08
REQ-07-06|1|REQ-07|M|request|registry unreadable plus duplicate outer id A|SOURCE_UNAVAILABLE/REGISTRY_UNREADABLE|07,09
REQ-07-07|1|REQ-07|M|request|phase loading plus duplicate outer id A|SOURCE_UNAVAILABLE/APP_NOT_READY|07,09
REQ-07-08|1|REQ-07|M|request|registry unreadable plus unknown valid id|SOURCE_UNAVAILABLE/REGISTRY_UNREADABLE (not TARGET_NOT_FOUND)|07,08
DEL-01-{01..03}|3|DEL-01|M|request|review_session_id in {"rv-bad"; "RV-20261011-A1B2C3"; ""}|INVALID_TARGET|08
DEL-02-{01..02}|2|DEL-02|M|request|phase in {loading; fatal}|SOURCE_UNAVAILABLE/APP_NOT_READY|08
DEL-03-{01..03}|3|DEL-03|M|request|projectsHealth in {unreadable; io_error; unsupported_version}|SOURCE_UNAVAILABLE/REGISTRY_UNREADABLE; REGISTRY_IO_ERROR; REGISTRY_UNSUPPORTED_VERSION respectively|08
DEL-04-01|1|DEL-04|M|request|valid-format unknown id|TARGET_NOT_FOUND|08
DEL-05-{01..04}|4|DEL-05|M|request|target health in {unreadable; io_error; unsupported_version; missing} with session null|TARGET_UNAVAILABLE/UNREADABLE; IO_ERROR; UNSUPPORTED_VERSION; MISSING respectively|08
BM-01-{code}-{reason}|120|BM-01|M|basis|8 ControlReadErrorCodes x {NONE plus 14 ControlReadErrorReasons}|PASS10 combos keep code and reason; all others SOURCE_UNAVAILABLE/BASIS_CONTRACT_VIOLATION|08
BM-02-{01..10}|10|BM-02|M|basis|each PASS10 combo with extra error key fields ["x"]|SOURCE_UNAVAILABLE/BASIS_CONTRACT_VIOLATION; output error keys subset of {code; reason}|08,25
BM-03-{01..02}|2|BM-03|M|basis|PASS10 error with wrapper contract "dvcc.other"; with wrapper version 2|SOURCE_UNAVAILABLE/BASIS_CONTRACT_VIOLATION|08
BM-04-{01..04}|4|BM-04|M|basis|success envelope with contract mismatch; version mismatch; operation get_project_state; data absent|SOURCE_UNAVAILABLE/BASIS_CONTRACT_VIOLATION|08
ENV-01|1|ENV-01|M|basis|F-REV success with counting env|newAssessmentId x1 then now x1; output ids equal env values|05
ENV-02|1|ENV-02|M|basis|readBasis on F-REV with counting basisEnv|basisEnv newSnapshotId x1; now x1|06
ENV-03|1|ENV-03|M|basis|readBasis on unknown id with counting basisEnv|basisEnv newSnapshotId x0; now x0|06
ENV-04|1|ENV-04|M|basis|F-REV success serialized|no 1970-01-01T00:00:00.000Z; no snap-00000000-0000-4000-8000-000000000000; no key snapshot_id|06,23
ENV-05|1|ENV-05|M|basis|all success outputs of the suite|authority NONE; scope ACTION_LEVEL; revalidation REQUIRED_BEFORE_EXECUTION; basis fixed; not_evaluated fixed 4|23,11
ID-01|1|ID-01|M|basis|entry reviewId A with session.reviewSessionId B|IDENTITY_MISMATCH; scanIdentity reports I3|09
ID-02|1|ID-02|M|basis|only entry reviewId X with session.reviewSessionId A; request A|IDENTITY_MISMATCH by I2 (5A alone gives TARGET_NOT_FOUND)|09
ID-03-{01..02}|2|ID-03|M|basis|valid entry A plus entry X claiming A; orders [valid,conflict] and [conflict,valid]|IDENTITY_MISMATCH by I2 in both orders|09,27
ID-04|1|ID-04|M|basis|two identical readable entries reviewId A|IDENTITY_MISMATCH by I1|09
ID-05-{01..02}|2|ID-05|M|basis|two entries reviewId A (one unreadable with session null; one readable); orders [unreadable,readable] and [readable,unreadable]|IDENTITY_MISMATCH by I1 in both orders|09,27
ID-06|1|ID-06|M|basis|two entries reviewId A both unreadable|IDENTITY_MISMATCH by I1|09
ID-07|1|ID-07|M|basis|F-REV plus two identical project entries|IDENTITY_MISMATCH by I4|09
ID-08-{01..02}|2|ID-08|M|basis|F-REV plus two entries with the same projectId and different localRoot (observation matches one); both orders|IDENTITY_MISMATCH by I4 in both orders|09,27
ID-10|1|ID-10|M|basis|F-REV plus unrelated entry reviewId Y with session id Z|assessments deep-equal to F-REV baseline|09
ID-11|1|ID-11|M|basis|F-REV with reviewRound 2 and one round|IDENTITY_MISMATCH by B6|09
ID-12|1|ID-12|M|basis|F-REV with rounds [] and reviewRound 0|IDENTITY_MISMATCH by B6|09
ID-13-{B4,B5,B6a,B6b,B6c,B7}|6|ID-13|M|basis|bindIdentity with synthetic basis violating B4; B5; B6 current_round; B6 rounds[0].round; B6 empty basis rounds; B7 review_state value|IDENTITY_MISMATCH each|09
ID-14|1|ID-14|M|basis|F-READY with projectId constructor and gitObservations {}|SR BLOCKED [FRESHNESS_UNKNOWN]; fact_reason equals readControl freshness unknown_reason; no ELIGIBLE_NOW|09,16
ID-15-{01..02}|2|ID-15|M|basis|readable entry A plus entry X with non-null session id A and health unreadable; both orders|IDENTITY_MISMATCH by I2 in both orders|09,27
ID-INV|1|ID-INV|M|basis|all ID cases except ID-10 and ID-14|error response; no data; no assessments|09
PERM-READY-{01..12}|12|PERM-READY|M|basis|F-READY plus 2 distractor reviews (one readable; one unreadable) plus 1 distractor project; 6 review orders x 2 project orders|output deep-equal to canonical order|09,27
PERM-REV-{01..12}|12|PERM-REV|M|basis|F-REV with the same distractors and orders|output deep-equal to canonical order|09,27
PERM-FIX-{01..12}|12|PERM-FIX|M|basis|F-FIX with the same distractors and orders|output deep-equal to canonical order|09,27
DT-01|1|DT-01|M|decisionTable|F-READY|SR ELIGIBLE_NOW reasons []; CV RSNA; SNR RSNA; SR evidence refs exact|15,19,24
DT-02|1|DT-02|M|decisionTable|F-REV|SR RSNA; CV NEEDS_HUMAN [HUMAN_DECISION_REQUIRED] with payload NOT_EVALUATED; SNR RSNA|17,11
DT-03-01|1|DT-03|M|decisionTable|F-READY with observation O(H2)|SR BLOCKED [HEAD_CHANGED]; CV RSNA; SNR RSNA|19
DT-03-02|1|DT-03|M|decisionTable|F-REV with expected H; reviewed H2; observation O(H2)|CV BLOCKED [HEAD_CHANGED]; SR RSNA; SNR RSNA|19
DT-04-01|1|DT-04|M|decisionTable|F-READY dirty|SR BLOCKED [WORKTREE_DIRTY]; CV RSNA; SNR RSNA|19
DT-04-02|1|DT-04|M|decisionTable|F-REV dirty|CV BLOCKED [WORKTREE_DIRTY] with human_decision NOT_EVALUATED; SR RSNA; SNR RSNA|19,17
DT-04-03|1|DT-04|M|decisionTable|F-FIX dirty|SNR ELIGIBLE_NOW; SR RSNA; CV RSNA|19
DT-05-{01..03}|3|DT-05|M|decisionTable|no observation; fixture in {F-READY; F-REV; F-FIX}|head-bound action BLOCKED [FRESHNESS_UNKNOWN] fact_reason NOT_OBSERVED; F-FIX SNR ELIGIBLE_NOW; other actions RSNA|16,19
DT-06-{01..03}|3|DT-06|M|decisionTable|invalidated observation: F-READY localRoot changed; F-REV localRoot changed; F-REV createdAt changed|head-bound action BLOCKED [FRESHNESS_UNKNOWN] fact_reason OBSERVATION_INVALIDATED; other actions RSNA|16
DT-07-{01..02}|2|DT-07|M|decisionTable|project absent (0 entries); fixture in {F-REV; F-FIX}|F-REV CV BLOCKED [PROJECT_NOT_REGISTERED] after state_guard and verdict_prerequisites PASS; F-FIX SNR BLOCKED [PROJECT_NOT_REGISTERED]; other actions RSNA|16,22a
DT-08-01|1|DT-08|M|decisionTable|SUSPENDED from REVIEWING with result captured|SR CV SNR all RSNA; later checks NOT_EVALUATED|15,13
DT-08-02|1|DT-08|M|decisionTable|F-REV with result null and reviewed null (VG row 1)|CV BLOCKED [RESULT_NOT_CAPTURED]; SR RSNA; SNR RSNA|14
DT-08-03|1|DT-08|M|decisionTable|F-REV with follow-up saved and judgment null (VG row 3)|CV BLOCKED [FINAL_JUDGMENT_NOT_CAPTURED]; SR RSNA; SNR RSNA|14
DT-08-{04..06}|3|DT-08|M|decisionTable|F-REV with VG rows 2; 4; 5|CV NEEDS_HUMAN [HUMAN_DECISION_REQUIRED]; SR RSNA; SNR RSNA|14
DT-09|1|DT-09|M|decisionTable|every success output of the suite|no assessment has FAIL and NEEDS_HUMAN together; NEEDS_HUMAN only from human_decision; CV never ELIGIBLE_NOW|17
DT-10-{01..03}|3|DT-10|M|decisionTable|F-FIX with verdictConfirmedAt null; REVIEW_PASS with verdict null; FIX_REQUIRED with verdict REVIEW_PASS confirmed|SNR BLOCKED [VERDICT_CONFIRMATION_NOT_RECORDED]; SR RSNA; CV RSNA|18
DT-12|1|DT-12|M|decisionTable|F-REV with prNumber 42 versus null|assessments deep-equal; not_evaluated includes EXTERNAL_GATES|23
DT-14-{01..02}|2|DT-14|M|decisionTable|observedAt not-a-time; fixture in {F-READY; F-REV}|head-bound action BLOCKED [EVIDENCE_INCOMPLETE] fact_reason INVALID_SOURCE_VALUE; other actions RSNA|16
DT-16|1|DT-16|M|decisionTable|gitObservations {} with two calls and different env ids|data deep-equal; assessment_id differs; no persistence API touched|27
S-01|1|S-01|M|decisionTable|F-READY with expected 0123456|SR BLOCKED [EXPECTED_HEAD_NOT_EXACT]|19
S-02|1|S-02|M|decisionTable|F-READY with expected null|SR BLOCKED [EXPECTED_HEAD_NOT_RECORDED] fact_reason NOTHING_RECORDED|19
S-03|1|S-03|M|decisionTable|F-REV with reviewed null and result captured|CV BLOCKED [REVIEWED_HEAD_NOT_RECORDED]|19
S-04|1|S-04|M|decisionTable|F-REV with reviewed 0123456|CV BLOCKED [REVIEWED_HEAD_NOT_EXACT]|19
S-05|1|S-05|M|decisionTable|F-REV with observation O(H2)|CV BLOCKED [REVIEW_STALE]|19
S-06-01|1|S-06|M|decisionTable|F-FIX with 999 rounds (reviewRound equals maxReviewRounds)|SNR BLOCKED [ROUND_LIMIT_REACHED]|13
S-06-02|1|S-06|M|decisionTable|F-FIX with 998 rounds|SNR ELIGIBLE_NOW|13
S-07-{01..02}|2|S-07|M|checks|state_guard; verdict_prerequisites given Message key x.unmapped|FAIL [DOMAIN_REFUSED_OTHER]|20
S-08-FR-{reason}|12|S-08|M|checks|freshness_aligned given UNKNOWN with each of 10 UnknownReasons; BLOCKED with each of 2 BlockedReasons|UNKNOWN gives FAIL [FRESHNESS_UNKNOWN] with fact_reason; BLOCKED gives FAIL [EVIDENCE_INCOMPLETE] with fact_reason|16
S-08-EH-{reason}|12|S-08|M|checks|expected_head_exact given the same 12 facts|NOTHING_RECORDED gives [EXPECTED_HEAD_NOT_RECORDED]; other UNKNOWN give [EVIDENCE_INCOMPLETE] (C-01); BLOCKED give [EVIDENCE_INCOMPLETE]; all with fact_reason|16
S-08-RH-{reason}|12|S-08|M|checks|reviewed_head_exact given the same 12 facts|same pattern with REVIEWED_HEAD_NOT_RECORDED|16
S-08-PR-{reason}|12|S-08|M|checks|project_registered given freshness UNKNOWN x 10 and BLOCKED x 2|PROJECT_NOT_REGISTERED gives FAIL [PROJECT_NOT_REGISTERED]; others give PASS citing the project ref|16
S-08-VC-{reason}|2|S-08|M|checks|verdict_confirmation_recorded given review_state BLOCKED x 2|FAIL [EVIDENCE_INCOMPLETE] with fact_reason|16
S-08-SG-{reason}|2|S-08|M|checks|state_guard given review_state BLOCKED x 2|FAIL [EVIDENCE_INCOMPLETE] with fact_reason|16,24
P-01-{01..03}|3|P-01|M|catalog|payload scope of SR; CV; SNR|SR NOT_APPLICABLE []; CV NOT_EVALUATED [verdict,verdict_note,human_confirmation]; SNR NOT_EVALUATED [expected_head]|11
P-02-{01..10}|10|P-02|M|parity|VG rows 1-5 x verdict {FIX_REQUIRED; REVIEW_PASS} through applyReviewAction|prerequisite refusal key identical for both verdicts of each row|12a
P-02-11|1|P-02|M|parity|every success output serialized|no FIX_REQUIRED substring; no REVIEW_PASS substring|12a,25
P-03-{01..10}|10|P-03|F|parity|witness payloads: DT-08-01 (CV x2 verdicts; SNR x2 heads); DT-08-02 (CV x2); DT-08-03 (CV x2); S-06-01 (SNR x2 heads)|domain refuses every witness|12b
PAR-TC-{state}-{action}|24|PAR-TC|M|parity|8 ORACLE_REVIEW_STATES x 3 actions with reviewRound below the limit|state_guard PASS iff state is in the TRANSITION_CONTRACT from list|13
PAR-VG-{01..05}|5|PAR-VG|M|parity|VERDICT_GATE_TABLE rows 1-5 in REVIEWING|allowed gives PASS; resultRequired gives [RESULT_NOT_CAPTURED]; judgmentRequired gives [FINAL_JUDGMENT_NOT_CAPTURED] (literal map in the test)|14
PAR-FR-{01..31}|31|PAR-FR|M|parity|FRESHNESS_CONTRACT rows 1-31 projected through readControl|PASS iff expected ALIGNED; WORKTREE_DIRTY; REVIEW_STALE; HEAD_CHANGED give the same-named reason; UNKNOWN gives [FRESHNESS_UNKNOWN]|22a,16
PAR-5A-{01..03}|3|PAR-5A|M|parity|F-READY; F-REV; F-FIX|fact-derived evidence_refs; fact_reason; basis_observed_at equal readControl get_review_state|22a,24
PAR-PR-{01..02}|2|PAR-PR|F|parity|project registered; project absent|project_registered FAIL iff get_project_state gives TARGET_NOT_FOUND|22b
PAR-UI-{state}-{action}|24|PAR-UI|F|parity|8 states x 3 actions; round with result captured and no follow-up|SR and SNR state_guard iff canApply; CV state_guard and verdict_prerequisites iff actionRefusal null|22b
CHK-VPX-{01..02}|2|CHK-VPX|M|checks|domain PASS with result_captured false; with derived_from []|FAIL [EVIDENCE_INCOMPLETE]|14
CHK-PREC-{01..05}|5|CHK-PREC|M|checks|outcome sequences [PASS,PASS]; [FAIL,NOT_EVALUATED]; [PASS,NEEDS_HUMAN]; [FAIL,NEEDS_HUMAN]; [NEEDS_HUMAN,FAIL]|ELIGIBLE_NOW; BLOCKED; NEEDS_HUMAN; BLOCKED; BLOCKED|15
CHK-SHAPE-{SR1,SR2,SR3,SR4,CV1,CV2,CV3,CV4,CV5,SNR1,SNR2,SNR3}|12|CHK-SHAPE|M|checks|runChecks with FAIL injected at each position|later checks NOT_EVALUATED with []; reasons equal [injected reason]|15
CHK-ORD-CV|1|CHK-ORD|M|checks|SUSPENDED with result null|CV reasons [REVIEW_STATE_NOT_ALLOWED]; verdict_prerequisites NOT_EVALUATED|14
CHK-CITE|1|CHK-CITE|M|checks|every success output of the suite|each PASS cites at least 1 ref; every ref matches a 5A EvidenceRef grammar; NOT_EVALUATED cites []|24
CAT-01|1|CAT|M|catalog|ACTION_IDS|exactly review.start_review; review.confirm_verdict; review.start_next_round in order|10
CAT-02|1|CAT|M|catalog|executors|all HUMAN_UI|10
CAT-03-{SR,CV,SNR}|3|CAT|M|catalog|check order per action|exact arrays of Annex A5|10
CAT-04|1|CAT|M|catalog|rule ids|exactly the 3 ids of Annex A2|10
CAT-05|1|CAT|M|catalog|NEEDS_HUMAN_CAPABLE_CHECKS|exactly [human_decision]; only in CV; last position|17
DISC-{01..03}|3|DISC|M|disclosure|F-READY; F-REV; F-FIX with sentinels in every reachable field of Annex A8|no sentinel; no i18n text; no Message params in output|25
DISC-04|1|DISC|M|disclosure|TARGET_UNAVAILABLE with an extra sentinel property on the health object|sentinel absent|25
DISC-05|1|DISC|M|disclosure|ID-01 input whose inner id is a valid-format sentinel id|sentinel id absent|25
DISC-06|1|DISC|M|disclosure|UNRECOGNIZED_FIELD with a sentinel unsafe key|key absent; count only|25
SIDE-{01..03}|3|SIDE|M|disclosure|deep-frozen source; fixture in {F-READY; F-REV; F-FIX}|no throw; output equals the unfrozen output|26
SIDE-04|1|SIDE|M|disclosure|@tauri-apps/api/core mocked to throw|0 calls|26
DET-{01..03}|3|DET|M|disclosure|same input twice; fixture in {F-READY; F-REV; F-FIX}|deep-equal|27
DET-04|1|DET|M|disclosure|F-REV with two different env.now values|data deep-equal|27
SRC-01|1|SRC|M|catalog|product files of src/domain/actionEligibility|no import of services; app; features; components; i18n; @tauri-apps|26,32
SRC-02|1|SRC|M|catalog|product files|no ALLOWED_FROM; no review-state literal comparison; no head regex; no deriveFreshness import|13,22a
SRC-03|1|SRC|M|catalog|product files|no as EvidenceRef|24
SRC-04|1|SRC|M|catalog|assessEligibility.ts|readBasis or resolveBasis called without a third argument|06
SRC-05|1|SRC|M|catalog|product files|no import of src/test or test files|26
SRC-06|1|SRC|M|catalog|oracle files transitionContract; workflowContract; freshnessContract|no import of src/domain/actionEligibility|28
DOC-{01..10}|10|DOC|M|docsContract|doc enumerations: dispositions; action ids; check ids; outcomes; reason codes 17; error codes 8; error reasons 15; payload fields 4; not_evaluated 4; fixed envelope values|each listed exactly in docs/action-eligibility-contract-v1.md|29
DT-07b|0|MAP|-|-|rev 2 group DT-07b|see DEL-03|21
DT-07c|0|MAP|-|-|rev 2 group DT-07c|see DEL-05|21
DT-07d|0|MAP|-|-|rev 2 group DT-07d|see DEL-01; DEL-04|21
DT-07e|0|MAP|-|-|rev 2 group DT-07e|see DEL-02|21
DT-11|0|MAP|-|-|rev 2 group DT-11|see REQ-05-01; REQ-05-02; ENV-05|21
DT-13|0|MAP|-|-|rev 2 group DT-13|see REQ-02; REQ-03|21
DT-15|0|MAP|-|-|rev 2 group DT-15|see REQ-05-09; REQ-05-10; CAT-01|21
N-01|0|MAP|-|-|rev 2 group N-01|see ID-01|21
N-02|0|MAP|-|-|rev 2 group N-02|see ID-04|21
N-03|0|MAP|-|-|rev 2 group N-03|see ID-05 (expected changed to IDENTITY_MISMATCH in both orders)|21
N-04|0|MAP|-|-|rev 2 group N-04|see ID-11|21
N-05|0|MAP|-|-|rev 2 group N-05|see ID-12|21
N-06|0|MAP|-|-|rev 2 group N-06|see ID-13|21
N-07|0|MAP|-|-|rev 2 group N-07|see BM-01; BM-02; BM-03|21
N-08|0|MAP|-|-|rev 2 group N-08|see BM-04|21
N-09|0|MAP|-|-|rev 2 group N-09|see ENV-01..04 and the error-path env helper|21
```
<!-- DVCC-SECTION END ANNEX-D -->
<!-- DVCC-TASK-PACKET END -->
