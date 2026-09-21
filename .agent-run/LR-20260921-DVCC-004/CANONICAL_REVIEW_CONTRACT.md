# Canonical Review Contract — discovery for LR-20260921-DVCC-004

What Phase 3 must implement is defined elsewhere. This file records **where** each concept is
defined, **the canonical lines themselves**, and what those lines do and do not settle. Nothing here
is invented: where the canonical sources are silent, this file says so.

The vault was read **read-only**; nothing in it was changed.

## Sources

| # | Path | What it is canonical for |
|---|---|---|
| S1 | `C:\Users\shuns\obsidian-vault\02_Prompts\AI_Review\AI_Review_Request_Prompt.md` | The DevVault AI Review Request prompt, the Fresh-Context 2-turn protocol, and the 16 input items |
| S2 | `C:\Users\shuns\obsidian-vault\02_Prompts\GPTS_Review_Agent\DevVault_Review_Depth_Tiering.md` | Risk Tier 0 / 1 / 2, the tier boundary rule, one-substantive-review-per-head |
| S3 | `C:\Users\shuns\obsidian-vault\02_Prompts\GPTS_Review_Agent\DevVault_GitHub_Review_Attestation.md` | Attestation form and procedure; what may not be carried across heads or PRs |
| S4 | `C:\Users\shuns\obsidian-vault\02_Prompts\GPTS_Review_Agent\DevVault_Custom_Instructions_Base.md` | Finding classification, judgment vocabulary, and the handoff shape (via the delegated scan) |
| S5 | `C:\Users\shuns\obsidian-vault\02_Prompts\GPTS_Review_Agent\DevVault_Review_Agent_V3_7_Test_Cases.md` | Case 20: a state change alone does not license a second review on the same head (via the delegated scan) |

S1 and S2 were read in full by this session; the quoted lines below are copied from them. S3 was read
by grep at the quoted lines. S4 and S5 were located by a read-only delegated scan and are used here
only for what that scan reported; nothing in Phase 3 depends on them alone.

## 1. Fresh-Context Review — the 2-turn protocol (S1)

S1 §Fresh-Context Review（anchoring制御）, lines 35–57:

> Review依頼は、Reviewerの独立判断が実装者の結論・自己評価・設計理由に引きずられる（anchoring）ことを防ぐため、**2-turn protocolを標準とする**。

```text
Turn 1 — Initial Review Request
  Stage 1: Review Target（Artifact + Contract + Material Facts + 中立な質問）
  Stage 2: Fresh Assessment指示
↓
ReviewerがFresh Assessmentを返す
↓
Turn 2 — Resolution Follow-up（必要な場合のみ送る）
  Stage 3: Resolution Context（implementation narrative）
↓
Stage 4: Final Judgment（Turn 2の後。Turn 2不要ならFresh Assessmentをもとに実施）
```

> - Turn 1のpayloadへimplementation narrative（背景・目的・すでに決まっている方針・実装経緯・設計理由・「修正済み」等の自己評価）を**含めない**。
> - Implementation narrativeは、ReviewerがFresh Assessmentを返した後、findingの解消・矛盾確認・intent確認が必要な場合のみTurn 2で提示する。
> - **fresh-context reviewはcontext minimizationではなくanchoring制御である。** known risk / limitation / failing test / security上の制約・破壊的操作・scope除外・未解決issue・Human Gate必須事項など、Reviewerの安全判断に必要なmaterial informationはnarrativeではないため、**Turn 1（Stage 1）から必ず開示し、隠さない**。
> - Reviewerへの質問は中立化する。
> - Implementation narrativeとArtifact Evidenceが矛盾する場合、Artifact Evidenceを優先する。
> - 2 turnへ分けられないSurfaceでは、Initial Review Requestの構造だけを送りnarrativeを省くことを優先する。… **soft anchoring mitigation（single-turn fallback）**であり、true fresh-context reviewと同一視しない。

S1 §入力項目, line 61 — which item goes in which turn:

> 依頼は2 turnへ分けて送る（1〜6・9〜16 → Turn 1: Initial Review Request、7・8 → Turn 2: Resolution Follow-up。7・8はTurn 1のpayloadへ含めない）。

The 16 items (lines 63–78): 1 プロジェクト名 / 2 レビュー対象 / 3 コードリポジトリURL / 4 PR URLまたはcommit hash（GitHub上で直接Reviewする場合はPR番号と対象headの完全SHA〈40文字〉を必須とする）/ 5 関連するObsidianノート / 6 今回の相談内容・迷っている点（中立な質問）/ **7 背景・目的** / **8 すでに決まっている方針・実装経緯** / 9 変更してよい前提 / 10 変更してはいけない前提 / 11 レビュー観点 / 12 レビュー方式: 通常 / 反証 / 13 確認済みの仕様・テスト・実行結果 / 14 Material Facts / 15 最終的にほしい出力 / 16 次にLLM IDEへ渡したい内容.

S1 also fixes the body of each turn: Turn 1 as `## Stage 1 — Review Target（Artifact + Contract）`
with `### レビュー対象（Artifact）`, `### 評価基準（Contract）`, `### Material Facts（初回から開示。fresh-contextを理由に隠さない）`, then
`## Stage 2 — Fresh Assessment（Reviewerへの指示）` (lines 84–119); Turn 2 as `## Stage 3 — Resolution Context`
then `## Stage 4 — Final Judgment` (lines 125–139).

**Settled for Phase 3:** what Turn 1 is, what it must not contain, what it must contain anyway
(Material Facts), when Turn 2 may be sent, what Turn 2 contains, the section names, and that a
single-turn send is a named fallback rather than an equal path.

## 2. Risk Tier 0 / 1 / 2 (S2)

S2 lines 13–18 (Tier 0), 20–26 (Tier 1), 28–31 (Tier 2), quoted in full in the source; the load-bearing
lines for Phase 3:

> ## Tier 0 — LOW / TRIVIAL
> - AI Review Agentを原則使用しない。Chat reviewも原則不要。
> - CI + developer self-check + Human mergeで足りる。
> - Formal Attestationは不要。…
> - 例: typo、wording、archive、pure rename、metadata、links、generated docs、runtime/security/schema/permissionへ影響しないsmall docs-only変更。

> ## Tier 1 — NORMAL
> - Independent Review Agent reviewは原則1回（substantive review 1回を標準とする）。
> - Ready化後のexact headをreviewするのを標準とする。
> - Formal Attestationは原則不要。…
> - Draft時にearly reviewを行った場合、head不変ならReady化だけでFULL reviewを再実行せず、fresh mutable-state gate（CI・conflict・mergeable_state・unresolved threadsの再確認）だけを行う。

> ## Tier 2 — HIGH RISK
> - strict FULL review、Formal Attestation推奨または必須、exact head binding、CI、conflicts、Reviews/Comments/unresolved threads、fresh mutable stateを確認し、Human merge gateを維持する。
> - 例: production、release、DB/schema migration、destructive operation、data migration、authentication、credentials、permission、security/privacy、public API compatibility、irreversible operation、Agent write authority、Review/merge governance、branch protection / repository security settings。

S2 §Tier判定の境界, lines 46–49:

> - Tier classificationが曖昧な場合、または判断が割れる場合は、候補Tierのうち高い方を採用する（例: Tier 0 vs Tier 1 → Tier 1、Tier 1 vs Tier 2 → Tier 2）。曖昧さの解決は常にこの1ルールに統一し…
> - Tier 0とTier 1の間の曖昧さだけでは、Tier 2やFormal Attestationへ直行しない（Tier 1止まりで判定する）。
> - security、privacy、credential、production、migrationに触れる変更はLOWへ分類しない（自動的にTier 2。この場合は曖昧性の有無に関わらずTier 2）。
> - Tier判定自体もHuman/Review Agentの明示判断であり、開発IDEが自己判定だけでTier 0/1へ格下げしない。

S2 line 7 also separates this axis from another one that shares the word "Tier":

> 本ファイルの「Tier」は、レビュー深度を決めるRisk-based Tierであり、…Model/Agent Capability Tierとは別概念です。混同しないでください。

**Settled for Phase 3:** the three tiers and their examples, the escalation rule when a tier is
ambiguous, the automatic Tier 2 triggers, and that a tier is an explicit Human (or Review Agent)
decision — a tool must not downgrade it by itself. Nothing in S2 makes a tier change a merge
permission or a security-gate release; S2 line 40 keeps the Human Gate.

## 3. Same-HEAD duplicate review (S2, S3, S5)

S2 §共通原則 2 and 7:

> 2. 同一headに対するsubstantive reviewは原則1回まで。Ready/Draft遷移だけではcontent reviewを無効化しない。
> 7. Chat/token economy: Tier 0はReview Agentへ原則持ち込まない。Tier 1は1 PRにつきsubstantive review 1回を標準とし、同一headでの重複FULL reviewを禁止・抑制する。mutable state再確認だけなら短いpreflightとして扱う。

S3 line 256:

> Draft時にすでにsubstantive reviewを実施済みで、Ready化の前後でheadが不変（新しいcommitの追加なし）である場合、Ready化だけを理由に同一headへのFULL reviewを再実行しない。この場合は、fresh mutable-state gate（current head不変の確認、CI、conflict、mergeable_state、unresolved threadsの再確認）だけを行えばよい。head変更後は、…「同一headに対するsubstantive reviewは原則1回」の原則に従い、新しいheadに対してレビュー手順を最初からやり直す。過去headの結論を無検証で流用しない。

**Settled:** a second *substantive* review of the same head is prohibited and suppressed, not merely
discouraged; a state transition alone does not license one; the allowed action on an unchanged head
is the mutable-state preflight; a changed head starts the procedure again.

**Not settled by any source found:** an explicit override that would license a second substantive
review of the same head. No source defines one. S2 line 40 keeps a Human Gate for governance, and
S2 line 49 says a tier is an explicit Human decision, but neither grants a duplicate-review override.

## 4. Evidence reuse (S2, S3)

S2 §共通原則 3:

> 3. head変更時: material changeなら再review。trivial/fix-only変更ではunchanged blob evidence + delta reviewの活用を検討するが、old headの結論を無検証で流用しない。

S3 line 256 (quoted above) and line 273:

> 「条件付きmerge可」はmerge実行許可ではない。条件充足後、Review Agentが同一headに対して改めて`conclusion: merge可`かつ`required fixes: none`かつ`review scope: FULL`のAttestationを出す必要がある。過去のPRや別headに対するAttestationを流用しない。

S3 §同一headに複数証跡がある場合の優先規則 (lines 281–290) resolves several records for one head:

> 6. 同一headに対する最新の有効Attestationを採用する。

S2 §共通原則 4 requires provenance to be kept and not misrepresented:

> いずれのrouteでもEvidence provenance（verification_source）を保持し、Human UIで確認した項目をReviewer自身のdirect API確認と表現しない

**Settled:** evidence is bound to an exact head. Evidence from another head or another PR is not
reusable, and an old head's conclusion is never reused unverified. For an unchanged head, the reuse
that is allowed is the unchanged-blob / delta path and the mutable-state recheck, not a repetition of
the substantive review. Where several records exist for one head, the latest valid one is the one
that counts. Provenance must survive with the evidence.

**Not settled:** there is no single consolidated list of reusable evidence kinds; the rules above are
distributed across S2 and S3. Phase 3 therefore implements exactly the rules quoted here and shows
the Human the provenance of anything it offers to reuse, rather than inventing a broader scheme.

## 5. Required Fix handoff and re-review handoff (S1, S4)

S1 line 116 fixes the reviewer's answer format, which is what a handoff carries:

> 回答は「指摘の出し方」の形式（総評／良い点／修正必須／修正推奨／後回しでよい改善／リスク・注意点／次にLLM IDE / Coding Agentへ渡すべき指示／Obsidianに記録すべき判断）に従って出力してください。

S1 line 118 separates a confirmed defect from an unproven one:

> 証拠が不足する指摘をConfirmed defectとして断定せず、InconclusiveまたはMissing contextとして分離してください。

The delegated read-only scan reports S4 as the source of the finding classification (confirmed
defect / spec gap / convention gap / enforcement gap / false positive / inconclusive), the judgment
vocabulary (merge可 / 条件付きmerge可 / merge不可 / 判断保留), and the requirement that a handoff
name the next IDE instruction and the next Human action, with no mutual waiting (相互待ち禁止).

**Settled for Phase 3:** what a handoff must carry across a round boundary — the reviewed head, the
result artifact, the Human's verdict and note, the next action, the next expected head, and the
previous round — and that DVCC must not classify a finding or a judgment on the Human's behalf.

## 6. What Phase 3 takes from the current product (D)

Read in this repository at `4c1962b`:

- `src/domain/prompt.ts` — builds one request document per round in JA or EN, described in its own
  header as the Turn-1 skeleton: "The full two-turn workflow is Phase 3." Sections today: Stage 1 —
  Artifact, Contract, Material Facts, Stage 2 — Fresh Assessment. The Contract section is a template
  with `<!-- Humanが記入 -->` placeholders.
- `src/domain/review.ts`, `transitions.ts`, `events.ts` — rounds, the Review State machine, and the
  14 event types; `request_saved` / `result_captured` / `verdict_confirmed` already exist.
- `src/domain/freshness.ts`, `git.ts` — the Phase 2 HEAD comparison (`compareHead`: 40-character
  exact, 7–39 prefix, case-insensitive, otherwise undecidable) and derived Freshness. Phase 3 reuses
  `compareHead` for same-head detection rather than writing another comparison.
- `docs/data-contract-v1.md` — the v1 file set and the write / recovery rules Phase 3 must not break.
- A grep of `src/` for "Turn 1", "Turn 2", "Risk Tier", "duplicate", "evidence reuse" finds **no**
  existing implementation of any Phase 3 concept: the only "duplicate" matches are the project-id and
  archive-file-name checks.

## 7. SPEC_GAP assessment

| Gate trigger (Task Packet §5) | Result |
|---|---|
| Turn 1 / Turn 2 meaning cannot be determined | **No** — S1 defines both, their contents, their order, and the fallback |
| Risk Tier 0 / 1 / 2 contradictory across sources | **No** — S2 is the only definition found; S2 line 7 warns against confusing it with the Capability Tier, which it is not |
| Evidence reuse scope unknown | **No, with a recorded limit** — S2 §3 and S3 lines 256 / 273 / 281–290 settle eligibility (exact head, provenance kept, never an unverified old-head conclusion). There is no consolidated list, so Phase 3 implements only what is quoted above |
| Duplicate suppression: block or warning | **No** — S2 §2 / §7 and S3 line 256 make a second substantive review of the same head prohibited and suppressed. What is **not** defined anywhere is an override that would license one |
| Shared review contract not found | **No** — S1–S5 are shared, cross-project sources |

**Conclusion: the gate is passed.** One point is canonically silent — an override for a same-head
duplicate substantive review. Phase 3 does not invent one: the action is shown and **disabled**, with
the canonical reason and the two allowed paths (open the existing review, or reuse the evidence as a
delta / mutable-state recheck), which is what Task Packet §28 asks for when a fact or a permission is
missing. This is recorded as a decision, and is named in the completion report as the place where the
canonical sources are silent.
