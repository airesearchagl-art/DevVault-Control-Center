# Task Packet Snapshot — LRP-20260921-DVCC-004 (revision 1)

Recorded verbatim as received from the Human at the start of run LR-20260921-DVCC-004. This file is
never edited; a later revision is a new snapshot.

---

# DevVault Control Center
# Phase 3 — Review Workflow v0.3
# LONG_RUN Implementation

Phase 1 Review Hub、Phase 2 Evidence / Freshness、
Localization Foundation v0.2.1 はmainへmerge済みです。

次はPhase 3 Review Workflowを実装してください。

小分けのprototypeではなくLONG_RUNで、
canonical contract discovery
→ design
→ implementation
→ verification
→ independent review
→ Draft PR
まで継続します。

────────────────────────────────────────
1. Campaign Identity
────────────────────────────────────────

Project:
DevVault Control Center

Repository:
airesearchagl-art/DevVault-Control-Center

Local Root:
C:\Users\shuns\.claude\projects\DevVaultControlCenter

Expected current main:
4c1962b0c47321805554be2218bba996ff5de92f

Merged:
PR #1 — Review Hub
PR #2 — Evidence / Freshness
PR #3 — Localization Foundation

Target:
Phase 3 — Review Workflow v0.3

Working branch:
feat/review-workflow-v0.3

Run ID:
LR-20260921-DVCC-004

Task Packet:
LRP-20260921-DVCC-004

Revision:
1

Execution Mode:
LONG_RUN

Horizon:
8H

LONG_RUN_ENDURANCE:
NOT AUTHORIZED

Final endpoint:
Draft PR

Ready:
PROHIBITED

merge:
PROHIBITED

release / Production:
PROHIBITED

────────────────────────────────────────
2. Canonical Priority
────────────────────────────────────────

優先順位:

1. Human current instruction
2. GitHub fresh main / actual source
3. exact branch / actual diff / local checks
4. existing canonical DevVault review contracts
5. Project-local Vault docs
6. Notion
7. historical implementation artifacts

Vault / README等がfresh GitHubと矛盾する場合、
fresh repositoryを優先する。

現READMEには旧status記述が残っている可能性があるため、
status文をcanonical sourceとして扱わない。

────────────────────────────────────────
3. Fresh Gate
────────────────────────────────────────

最初に:

git fetch origin

確認:

origin/main ==
4c1962b0c47321805554be2218bba996ff5de92f

さらに:

- repository
- origin
- current local branch
- local HEAD
- origin/main
- working tree
- tracked changes
- untracked files
- target branch存在有無
- PR #3 merged=true

dirty treeをreset / cleanしない。

正常ならfresh origin/mainから:

feat/review-workflow-v0.3

を作成。

commit直前は毎回:

git branch --show-current

を確認。

main direct commitは禁止。

────────────────────────────────────────
4. Mandatory Canonical Contract Discovery
────────────────────────────────────────

Phase 3で以下の意味を新規に発明してはいけない。

- DevVault AI Review Request Prompt
- Fresh Context Turn 1
- Fresh Context Turn 2
- Risk Tier 0 / 1 / 2
- evidence reuse
- same-head duplicate review suppression
- Required Fix handoff
- re-review handoff

最初にread-only reuse scanを実施。

検索対象:

A.
obsidian-vault内のshared DevVault review policy / route / prompt / review contract

B.
既存Application repositoryのreview task packets / run artifactsのうち、
shared contractを参照しているもの

C.
DevVault-Control-Center Project docs:
01_Projects/DevVault-Control-Center/
- 00_Project_Brief.md
- 01_Roadmap.md
- 03_Decisions.md
- 05_LLM_IDE_Instructions.md

D.
現在のDVCC:
- prompt.ts
- review.ts
- transitions.ts
- ReviewDialogs
- ReviewDetail
- events
- current data contract

Discovery結果を:

.agent-run/LR-20260921-DVCC-004/
CANONICAL_REVIEW_CONTRACT.md

またはEVIDENCEへ記録。

────────────────────────────────────────
5. SPEC_GAP Gate
────────────────────────────────────────

次のいずれかなら、
実装を推測で続けずSTOP:

- Fresh Context Turn 1 / Turn 2の意味がcanonical sourceから確定できない
- Risk Tier 0 / 1 / 2の意味が複数sourceで矛盾
- evidence reuseの許可範囲が不明
- duplicate suppressionがblockかwarningか不明
- shared review contractが見つからない

その場合:

SPEC_GAP

として、

- 見つかったsource
- 不明点
- 既存実装
- 最小の選択肢

だけをHumanへ提示。

勝手に定義して実装しない。

Canonical contractが確定できた場合のみWave 1へ進む。

────────────────────────────────────────
6. Phase 3 Objective
────────────────────────────────────────

現在の「Review Sessionを保存できるReview Hub」から、

Humanが

Review準備
→ fresh reviewer context
→ review request
→ evidence確認
→ result capture
→ Required Fix
→ re-review
→ final pass

までを見失わず進められる
Review Workflowへ拡張する。

ただしChatGPT自体は自動化しない。

Human-operated review surfaceを維持。

────────────────────────────────────────
7. Phase 3 Required Scope
────────────────────────────────────────

Roadmap上のrequired scope:

- DevVault AI Review Request PromptのUI化
- Fresh Context Turn 1 / Turn 2
- Risk Tier 0 / 1 / 2
- evidence reuse
- same-head duplicate review抑制
- Review result
- Required Fix handoff
- re-review handoff
- Review history / event timeline

canonical contract discoveryで確定した意味を
そのまま実装する。

────────────────────────────────────────
8. Review Workflow Must Remain Human-Controlled
────────────────────────────────────────

DVCCは以下を自動で行わない:

- ChatGPT login
- prompt送信
- result取得
- scraping
- review verdict推定
- Ready
- merge
- release
- Required Fixの自動抽出
- Risk TierのAI自動判定

Risk Tier等はcanonical contractに従い
Humanが選択・確認する。

Human decisionを推測で埋めない。

────────────────────────────────────────
9. Fresh Context Workflow
────────────────────────────────────────

Turn 1 / Turn 2の具体的意味は
Canonical Contract Discoveryで確定する。

UIでは少なくとも:

- 今どのTurnか
- 何をコピーするか
- 何をReviewerへ渡したか
- 何を受け取ったか
- 次にHumanが何をするか

が明確であること。

ChatGPT conversationそのものは保存しない。

pointer / generated request / captured resultだけを扱う。

────────────────────────────────────────
10. Risk Tier
────────────────────────────────────────

Risk Tier 0 / 1 / 2は、
canonical DevVault contractに従う。

禁止:

- 独自定義
- severityとの混同
- Review Stateとの混同
- Resource Stateとの混同

Risk Tierは独立軸として扱う。

Risk Tier変更だけで:

- review pass
- merge許可
- security gate解除

を行わない。

persistする場合はlanguage-neutral value。

表示ラベルはJA / EN双方。

────────────────────────────────────────
11. Evidence Reuse
────────────────────────────────────────

同じ事実をreviewerへ何度も取り直す必要を減らす。

ただしreuse可能なのは、
canonical contractが許可するEvidenceだけ。

最低でも区別:

- current observed Git fact
- Human-recorded fact
- prior independent-review result
- prior run evidence
- stale evidence

FreshnessとEvidence reuseを混同しない。

reuse時は:

source
head
captured/reviewed time
reason

をHumanが確認できること。

────────────────────────────────────────
12. Same-HEAD Duplicate Review Suppression
────────────────────────────────────────

同じProject / Review target / HEADについて
既存review evidenceがある場合に検知する。

重要:

自動削除・自動close・自動skipは禁止。

Humanへ:

- existing reviewを開く
- evidenceをreuseする
- 新規reviewを続行する

の選択肢を提示。

overrideがcanonical contractで許されるなら、
Humanが明示的に続行できる。

duplicate判定ロジックはpure function化し、
独立oracle testを用意する。

SHA prefix比較等はPhase 2の既存contractを再利用し、
似たロジックを重複実装しない。

────────────────────────────────────────
13. Review Result / Required Fix Handoff
────────────────────────────────────────

現在のCapture Result / Confirm Verdictを
壊さずPhase 3 workflowへ統合する。

Review resultをAIで分類しない。

Humanが:

FIX_REQUIRED
REVIEW_PASS
BLOCKED

を確定する現在のHuman Gateを維持。

FIX_REQUIRED時に:

- reviewed HEAD
- result artifact
- Human verdict note
- next action
- next expected HEAD
- prior round

を見失わず、
次のre-reviewへhand offできること。

────────────────────────────────────────
14. Re-review Workflow
────────────────────────────────────────

次round開始時に、
canonical DevVault contractに従って
前回Reviewとの関係を明示。

最低:

- previous round
- previous reviewed HEAD
- previous verdict
- current expected HEAD
- prior result artifact pointer
- reuseするEvidence
- re-review reason

Humanが確認可能。

過去artifactは書き換えない。

────────────────────────────────────────
15. Review History / Timeline
────────────────────────────────────────

既存 events.jsonl を再利用。

別の重複history storeを安易に作らない。

UIではReview Sessionを
round単位で読めるtimelineへ拡張。

候補:

- review created
- ready
- Turn 1 request saved
- Turn 2 request saved
- result captured
- verdict confirmed
- Required Fix
- next round started
- evidence reused
- duplicate override
- suspended / resumed
- closed

event typeはlanguage-neutral。

表示だけJA / EN。

既存event historyを壊さない。

────────────────────────────────────────
16. Data Contract
────────────────────────────────────────

Phase 1 / 2 / Localizationの既存runtime dataを
migrationなしで読めることを優先。

現在:

projects.json
settings.json
reviews/<id>/session.json
request-r<N>.md
result-r<N>.md
checkpoint.md
events.jsonl

を保持。

Phase 3追加dataについて:

- sessionへoptional追加
- 新規workflow artifact
- event追加

のどれが最小かを比較。

schemaVersionを安易に上げない。

schema changeが必要なら:

- backward compatibility
- old fixture load
- unsupported future schema
- rollback
- atomic write

を先に設計。

Data Integrityが曖昧ならBLOCKED。

────────────────────────────────────────
17. Review Request Artifacts
────────────────────────────────────────

現在のrequest-r<N>.mdとの互換を考慮。

Fresh Turn 1 / Turn 2で複数artifactが必要な場合は、
canonical contractと既存latest-wins contractを確認して
命名を決定。

既存request-r<N>.mdを
黙って別の意味へ変更しない。

artifact naming変更はData Contractへ明記。

────────────────────────────────────────
18. Localization Gate
────────────────────────────────────────

PR #3で導入されたstanding requirementを継続。

すべての新規user-facing feature:

JA
EN

を同じPRで実装。

Required:

- typed TranslationKey
- JA / EN parity
- blanks zero
- placeholder parity
- hard-coded text gate
- accessibility text両言語

Missing JA / EN:
Required Fix

Risk Tier
Fresh Context
Evidence reuse
Duplicate warning
Timeline
Handoff

すべて両言語対応。

内部enum / event / schema値はlanguage-neutral。

────────────────────────────────────────
19. User Content
────────────────────────────────────────

翻訳・変更禁止:

- Project name
- review type selected by Human
- next action
- notes
- verdict note
- captured result
- checkpoint
- thread title
- repository URL
- local path
- branch
- HEAD
- evidence content
- existing event notes

UI chromeだけ翻訳。

────────────────────────────────────────
20. Review Prompt JA / EN
────────────────────────────────────────

Phase 3で追加されるTurn 1 / Turn 2 / re-review promptも
JA / EN parityを持つ。

ただしReview Requestは文書なので、
既存方針どおりdictionaryではなく
prompt module内のlanguage variantsでもよい。

必須:

- same facts
- same risk tier
- same evidence references
- same Hard Gate
- same required checks
- same semantic strength

日英で要求レベルを変えない。

────────────────────────────────────────
21. Freshness Integration
────────────────────────────────────────

Phase 2 FreshnessをReview Workflowに統合。

例:

REVIEW_PASS + REVIEW_STALE

は正常に表現可能。

Freshnessがstaleでも、
Review Stateを勝手に変更しない。

Review request生成時にcurrent Git stateが未観測なら、
UNKNOWNを勝手にALIGNED扱いしない。

必要なEvidenceが未観測なら、
Humanへ明示。

────────────────────────────────────────
22. Duplicate / Evidence Fingerprint
────────────────────────────────────────

必要であれば、
same-head判定用のlanguage-neutral keyを導入。

ただし暗号的identityを過剰設計しない。

候補因子:

- project ID
- review target
- expected HEAD
- review type
- workflow stage

canonical contractに必要なものだけ使用。

Human-written text全文をhash keyへ
不用意に混ぜない。

────────────────────────────────────────
23. No GitHub API Yet
────────────────────────────────────────

Phase 3では原則:

GitHub API automationを追加しない。

PR state / comments / checks等を
runtimeで自動取得しない。

Phase 2と同様、
local factsとHuman-recorded valuesを中心にする。

GitHub integration拡張が必要になった場合は
scope expansionとしてHuman Gate。

────────────────────────────────────────
24. No IDE Bridge Yet
────────────────────────────────────────

Claude Code / Codex:

- session discovery
- terminal embedding
- session resume automation

はPhase 4。

Phase 3へ前倒ししない。

Review request/result file handoffも、
IDE session discoveryを必要とする設計にしない。

────────────────────────────────────────
25. No Documentation Sync Write
────────────────────────────────────────

Vault / Notionはread-only参照のみ。

Standing Authorization:
NO

変更禁止:

obsidian-vault
Notion

Completion Reportで:

Documentation Sync Trigger: yes

とcanonical factsを返す。

Human authorization後に別処理。

────────────────────────────────────────
26. README Status
────────────────────────────────────────

current mainのREADME statusが
Phase 2 under review等のstale表現を含んでいる場合、
Phase 3 PR内で現状へreconcile。

最低:

Phase 1 merged
Phase 2 merged
Localization merged
Phase 3 under development / review

とfresh factsに合わせる。

historical evidenceは書き換えない。

────────────────────────────────────────
27. Required Pure Contracts
────────────────────────────────────────

可能な限りpure function + independent oracleを使う。

最低候補:

- duplicate review detection
- evidence eligibility / reuse
- workflow stage transition
- Risk Tier validity
- re-review handoff construction

implementationと同じ条件分岐を
test oracleへコピーしない。

literal contract table等を優先。

────────────────────────────────────────
28. Failure / Unknown Handling
────────────────────────────────────────

UNKNOWN
UNRESOLVED
not observed
not recorded

を推測で埋めない。

Review Workflow上必要なfactが欠ける場合:

- visible reason
- next Human action
- disabled action

を提示。

silent fallback禁止。

────────────────────────────────────────
29. Hard Gates
────────────────────────────────────────

Security
Privacy
Auth
Permission
Data integrity
Irreversible-data safety

は既存DevVault Hard Gateを維持。

FAIL:
BLOCKED

Quality Debtへ送らない。

Risk Tierが低くてもHard Gateは緩和しない。

────────────────────────────────────────
30. Operator Disturbance
────────────────────────────────────────

Humanは同じWindows PCを使用中。

- foreground popup禁止
- browser自動open禁止
- Explorer自動open禁止
- unrelated process kill禁止
- process-name blanket kill禁止
- clipboardを使うテストはPR #3で確立したsequence guardを再利用
- isolated desktopを優先

available memory < 12 GiB:
heavy build / WebView2 smokeを開始しない。

checkpoint → SUSPENDED。

Human processを停止してGateを開けない。

────────────────────────────────────────
31. Existing Quality Debt
────────────────────────────────────────

carry forward:

Phase 2:
QD-001 timeout reader thread detach
QD-002 repository configured filters

Localization:
hard-coded text scannerのAST化候補等

Phase 3 scopeと無関係なら修正しない。

新規featureが悪化させた場合のみ扱う。

────────────────────────────────────────
32. Wave Plan
────────────────────────────────────────

Wave 0
- fresh preflight
- Task Packet
- canonical review contract discovery
- reuse scan
- SPEC_GAP Gate
- data model / workflow design

Checkpoint

Wave 1
- pure workflow domain
- Risk Tier
- Fresh Context stages
- duplicate detection
- evidence reuse contract
- independent oracle tests

Checkpoint

Wave 2
- persistence / backward compatibility
- event additions
- review handoff model
- re-review model

Checkpoint

Wave 3
- Review Workflow UI
- Turn 1 / Turn 2
- duplicate warning
- evidence reuse UX
- Required Fix / re-review handoff
- timeline

JA / EN simultaneously.

Checkpoint

Wave 4
- prompt generation JA / EN
- accessibility
- stale / unknown UX
- current Freshness integration
- README / data-contract updates

Checkpoint

Wave 5
- full regression
- synthetic workflow scenarios
- isolated desktop UI smoke
- restart persistence
- same-head suppression
- re-review round trip

Final Convergence

Independent Verification

Draft PR

STOP

────────────────────────────────────────
33. Minimum Scenario Tests
────────────────────────────────────────

Scenario A:
new review
→ correct initial workflow stage
→ Turn 1 / Turn 2 flow
→ result capture
→ Human verdict PASS

Scenario B:
FIX_REQUIRED
→ next action
→ new expected HEAD
→ new round
→ re-review request
→ previous artifacts intact

Scenario C:
same HEAD already independently reviewed
→ duplicate detected
→ existing review shown
→ Human can reuse / open / explicitly continue
→ no silent suppression

Scenario D:
reviewed HEAD differs from current local HEAD
→ REVIEW_STALE
→ Review State unchanged
→ workflow explains why

Scenario E:
Git unobserved / UNKNOWN
→ no fake freshness
→ Human can refresh or proceed only as contract allows

Scenario F:
JA / EN
→ same workflow semantics
→ same facts in generated request

Scenario G:
restart
→ workflow / history / round relation restored

────────────────────────────────────────
34. Required Checks
────────────────────────────────────────

Frontend:
npx tsc --noEmit
npx vitest run
npm run build

Rust:
cargo fmt --check
cargo clippy --all-targets
cargo check
cargo test

Tauri:
npm run tauri build -- --no-bundle

Localization:
JA / EN parity
blank
placeholder
hard-coded text
prompt semantic parity

Workflow:
independent contract tests
duplicate detection
evidence reuse
Risk Tier
Turn transition
re-review handoff
old fixture compatibility

UI:
isolated desktop smoke

GitHub CI:
none unless separately Human-authorized

────────────────────────────────────────
35. Mutation / Failure Detection
────────────────────────────────────────

最低mutation候補:

- duplicate comparisonをHEAD無視へ変更
- stale reviewをALIGNED扱い
- Risk Tier mappingずれ
- Turn順序逆転
- evidence reuse eligibilityを常にtrue
- previous-round artifactを上書き
- JA translation key削除

重要contractのtestが
実際にmutationをkillすること。

mutation sourceは必ず復元。

────────────────────────────────────────
36. Product Freeze
────────────────────────────────────────

Required Checks + UI smoke完了後:

Product freeze commit

を明示。

その後は:

.agent-run/**

のevidence-only変更を基本とする。

Independent Review中にRequired Fixが出た場合だけ
product codeを再開。

────────────────────────────────────────
37. Git Policy
────────────────────────────────────────

main direct commit:
PROHIBITED

feature branch:
commit / push allowed

Draft PR:
allowed

Ready:
PROHIBITED

merge:
PROHIBITED

release:
PROHIBITED

Production:
PROHIBITED

force push:
PROHIBITED

commit前:

git branch --show-current

を毎回確認。

────────────────────────────────────────
38. Run Artifact
────────────────────────────────────────

.agent-run/LR-20260921-DVCC-004/

必須:

RUN_MANIFEST.md
TASK_PACKET_SNAPSHOT.md
RUN_STATE.md
TASK_QUEUE.md
QUALITY_DEBT.md
DECISIONS.md
EVIDENCE.md

Task Packet digest binding必須。

必要ならcanonical contract discovery evidenceも追加。

既存Run Artifactは変更しない。

────────────────────────────────────────
39. Acceptance Criteria
────────────────────────────────────────

RW-01
fresh merged main 4c1962bからbranch作成。

RW-02
canonical DevVault Review Workflow contractを発見・記録。
不明ならSPEC_GAPで停止。

RW-03
Fresh Context Turn 1 / Turn 2をcanonical通り実装。

RW-04
Risk Tier 0 / 1 / 2をcanonical通り実装。

RW-05
Risk TierはReview/Resource/Freshnessとは独立。

RW-06
same-head duplicateを検知。

RW-07
duplicateはHumanへ提示し、
silent skip / auto-closeしない。

RW-08
canonical contractで許可されたEvidence reuseを実装。

RW-09
reused Evidenceはsource / head / ageがHumanに分かる。

RW-10
FIX_REQUIREDからre-reviewへ
round relationを失わずhandoff可能。

RW-11
past request/result/checkpointを自動書換えしない。

RW-12
Review timelineがround単位で読める。

RW-13
Phase 2 FreshnessとReview Stateの分離を維持。

RW-14
UNKNOWNを推測で埋めない。

RW-15
JA/EN parity。

RW-16
new workflow promptsもJA/ENで意味等価。

RW-17
existing Phase 1/2/Localization runtime dataをload可能。

RW-18
ChatGPT auto login/send/scrapeなし。

RW-19
GitHub API automationなし。

RW-20
IDE BridgeをPhase 4から前倒ししない。

RW-21
locale switchでworkflow/domain dataが変化しない。

RW-22
Security / Privacy / Permission /
Data integrity / Irreversible-data safety PASS。

RW-23
isolated desktop workflow smoke PASS。

RW-24
README / data-contractがfresh product stateへ更新。

────────────────────────────────────────
40. Independent Verification
────────────────────────────────────────

実装sessionとは別context。

重点:

- canonical contractを本当に再利用しているか
- Turn 1 / Turn 2の意味ずれ
- Risk Tierの意味ずれ
- duplicate false-positive / false-negative
- stale evidence reuse
- previous round overwrite
- Human Gate erosion
- Review/Freshness state coupling
- prompt JA/EN semantic drift
- backward compatibility
- timeline completeness
- operator disturbance

Required FixがあればDraftのままSTOP。

────────────────────────────────────────
41. Completion Report
────────────────────────────────────────

# DVCC Phase 3 — Review Workflow v0.3 Long-Run Report

Run ID:
Task Packet / revision / digest:
Final state:

Repository:
Base:
Branch:
Head:
Draft PR:

Canonical Review Contract:
- sources:
- Fresh Context Turn 1:
- Fresh Context Turn 2:
- Risk Tier:
- evidence reuse:
- duplicate suppression:
- SPEC_GAP:

Implemented:
- workflow:
- duplicate:
- evidence reuse:
- required-fix handoff:
- re-review:
- timeline:
- prompts:
- JA/EN:

Data Contract:
- schema changed:
- new artifacts:
- old data:
- migration:

Checks:
- tsc:
- Vitest:
- Vite:
- fmt:
- clippy:
- cargo:
- Tauri:
- UI smoke:
- mutation:

Hard Checks:
- Security:
- Privacy:
- Permission:
- Data integrity:
- Irreversible-data safety:

Quality Debt:

Explicit unverified:

Operator disturbance:
- foreground:
- browser:
- Explorer:
- clipboard:
- unrelated process killed:
- minimum available memory:

GitHub CI:
none

Documentation Sync Trigger:
yes

Canonical facts:
- main base:
- head:
- PR:
- milestone:
- blocker:
- debt:

Obsidian Vaultに記録候補:
- Phase 1 merged
- Phase 2 merged
- Localization Foundation merged
- Phase 3 state
- new decisions
- next action

Phase 4:
BLOCKED until Phase 3 merge.

STOP.
