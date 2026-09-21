# Canonical Review Contract — discovery for LR-20260921-DVCC-004

What Phase 3 must implement is defined elsewhere. This file records **where** each concept is
defined, **the canonical lines themselves**, and what those lines do and do not settle. Nothing here
is invented: where the canonical sources are silent, this file says so.

## Which copy is canonical

`00_Index/Tool_Index.md` (latest main, lines 59–72) declares the review files "Vault runtime
canonical" and says they are fetched from `airesearchagl-art/obsidian-vault` **最新main**. So the
binding source is that repository's main branch, not a local working copy.

The Human authorized a **read-only** fetch of that main for this discovery. Result:

| Copy | Date | `DevVault_Review_Depth_Tiering.md` |
|---|---|---|
| `airesearchagl-art/obsidian-vault` @ `77ce41e6ff9e243ac2c8dc37ee29f5d5f4f24157` (main, 2026-09-21T04:34:07Z) | latest | 88 lines, 9 845 bytes |
| `C:\Users\shuns\.vscode\project\obsidian-vault-self-hosted-fallback` | 2026-09-16 | **byte-identical** to latest main (modulo CRLF) for both load-bearing files |
| `C:\Users\shuns\obsidian-vault` (the working vault) | 2026-09-03 | 58 lines, 7 103 bytes — **stale**: it lacks the whole `Tier 2 Review Execution Contract`, including the evidence-reuse rules |

**Phase 3 binds to latest main `77ce41e`.** All line numbers below are from the files as fetched from
that commit; they are saved outside the repository (session scratchpad) and were not copied into it.
Nothing in the vault, the repository or Notion was written; only `gh api` reads were used, and no
product code reaches GitHub at runtime.

## Sources (all at `77ce41e`)

| # | Path | Canonical for |
|---|---|---|
| S1 | `02_Prompts/AI_Review/AI_Review_Request_Prompt.md` (302 lines) | the review request document, the Fresh-Context 2-turn protocol, the 16 input items, the reviewer's answer skeleton |
| S2 | `02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` (88 lines) | Risk Tier 0 / 1 / 2, the tier boundary rule, the Tier 2 execution contract, evidence reuse, one substantive review per head |
| S3 | `02_Prompts/GPTS_Review_Agent/DevVault_GitHub_Review_Attestation.md` (476 lines) | attestation form, head binding, what may not be carried across heads or PRs |
| S4 | `00_Index/Vault_Operation_Policy.md` (312 lines) | merge per tier, approval bound to repository + PR + head |
| S5 | `00_Index/Tool_Index.md` (105 lines) | which files are runtime canonical and where they come from |

## 1. Fresh-Context Review — Turn 1 and Turn 2 (S1)

S1 §Fresh-Context Review（anchoring制御）, lines 33–57:

> Review依頼は、Reviewerの独立判断が実装者の結論・自己評価・設計理由に引きずられる（anchoring）ことを防ぐため、**2-turn protocolを標準とする**。同一message内にimplementation narrativeを含めて「後で読むように」と指示する方式は、LLMのcontextからnarrativeを物理的に隔離できないため採用しない。

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
> - **fresh-context reviewはcontext minimizationではなくanchoring制御である。** known risk / limitation / failing test / security上の制約・破壊的操作・scope除外・未解決issue・Human Gate必須事項など…は**Turn 1（Stage 1）から必ず開示し、隠さない**。
> - Reviewerへの質問は中立化する。
> - Implementation narrativeとArtifact Evidenceが矛盾する場合、Artifact Evidenceを優先する。
> - 2 turnへ分けられないSurfaceでは…**soft anchoring mitigation（single-turn fallback）**であり、true fresh-context reviewと同一視しない。

S1 §入力項目, line 72 — which item belongs to which turn:

> 依頼は2 turnへ分けて送る（1〜6・9〜16 → Turn 1: Initial Review Request、7・8 → Turn 2: Resolution Follow-up。7・8はTurn 1のpayloadへ含めない）。

The 16 items are S1 lines 74–89. Item 4 requires, for a GitHub-direct review, the repository, the PR
number and **the full 40-character head SHA**. Items 7 (背景・目的) and 8 (すでに決まっている方針・実装経緯)
are the two that must not appear in Turn 1.

Document skeleton (S1): `## A. Initial Review Request（Turn 1）` at line 91 → `## Stage 1 — Review Target（Artifact + Contract）` (99) with
`### レビュー対象（Artifact）` (101), `### 評価基準（Contract）` (109), `### Material Facts（初回から開示。fresh-contextを理由に隠さない）` (118) →
`## Stage 2 — Fresh Assessment（Reviewerへの指示）` (121). Then `## B. Resolution Follow-up（Turn 2・必要な場合のみ）` (132) →
`## Stage 3 — Resolution Context` (139) → `## Stage 4 — Final Judgment` (147). `### Single-turn fallback（soft anchoring mitigation）` is line 152.

The reviewer's answer skeleton is S1 lines 183–201: 総評 / 良い点 / 修正必須 / 修正推奨 / 後回しでよい改善 /
リスク・注意点 / 次にLLM IDE / Coding Agentへ渡すべき指示 / Obsidianに記録すべき判断.

**Settled.** The current `src/domain/prompt.ts` emits Turn 1 with slightly different headings
(`## Stage 1 — Artifact（対象）`, `## Contract（前提）`, `## Material Facts（事実）`); Phase 3 aligns them with S1.

## 2. Risk Tier 0 / 1 / 2 (S2, S4)

S2 lines 13–18 (Tier 0), 20–26 (Tier 1), 28–31 (Tier 2) define the three tiers and their examples;
S2 line 7 warns that this Tier is not the Model/Agent Capability Tier.

S2 §Tier判定の境界, lines 74–79:

> - Tier classificationが曖昧な場合、または判断が割れる場合は、候補Tierのうち高い方を採用する（例: Tier 0 vs Tier 1 → Tier 1、Tier 1 vs Tier 2 → Tier 2）。曖昧さの解決は常にこの1ルールに統一し…
> - Tier 0とTier 1の間の曖昧さだけでは、Tier 2やFormal Attestationへ直行しない（Tier 1止まりで判定する）。
> - security、privacy、credential、production、migrationに触れる変更はLOWへ分類しない（自動的にTier 2。この場合は曖昧性の有無に関わらずTier 2）。
> - Tier判定自体もHuman/Review Agentの明示判断であり、開発IDEが自己判定だけでTier 0/1へ格下げしない。

S4 lines 48–54 attach the tier to the merge gate (Tier 0 no review required, Tier 1 at least one
independent review, Tier 2 an explicit `merge可` bound to repository + PR + head). Merge stays a
Human Gate in every tier.

**Settled**, including that a tool must not downgrade a tier by itself.

## 3. Evidence reuse (S2, S1, S3)

S2 §Tier 2 Review Execution Contract → `### Evidence reuse and targeted verification`, lines 43–47:

> - SHA-boundで有効な既確認Evidenceはreuseする。head、base、対象blob、relevant contract、実行環境等に合理的な失効理由がある部分だけを再確認する。
> - 合理的な失効理由なしに、同一headのfull-suiteや同一検査を最初からduplicate実行することを禁止する。mutable stateだけが変わり得る場合は、そのstateだけをfresh取得する。
> - speculative mutation campaignをdefaultにしない。確認対象のRisk仮説、期待観測、停止条件を持つtargeted experimentだけを実行する。

S2 §共通原則 3, line 67:

> 3. head変更時: material changeなら再review。trivial/fix-only変更ではunchanged blob evidence + delta reviewの活用を検討するが、old headの結論を無検証で流用しない。

S1 §Tier 2 Fail-Fast / Evidence Reuse routing, lines 59–66 — the request side of the same rule:

> - SHA-boundで有効な既確認Evidenceをreuseし、合理的な失効理由がないfull-suiteのduplicate verificationを依頼しない。

S3 line 252 (base movement) and line 269 (unchanged head after Ready) both end with the same
prohibition — `stale Human exceptionをbase movement後にそのまま流用しない`, `過去headの結論を無検証で流用しない` —
and S3 line 303 resolves several records for one head: `同一headに対する最新の有効Attestationを採用する`.

**Settled:** evidence is bound to an exact head (and, for base-sensitive evidence, to a base). It is
reusable while that binding holds; what may be re-checked is the part with a stated reason to be
stale (head, base, the blob under review, the relevant contract, the execution environment). An old
head's conclusion is never reused unverified, and provenance travels with the evidence (S2 §共通原則 4).

## 4. Same-HEAD duplicate review, and whether an override exists (S2, S3, S4)

S2 §共通原則 2 and 7 (lines 66, 71):

> 2. 同一headに対するsubstantive reviewは原則1回まで。Ready/Draft遷移だけではcontent reviewを無効化しない。
> 7. …Tier 1は1 PRにつきsubstantive review 1回を標準とし、同一headでの重複FULL reviewを禁止・抑制する。mutable state再確認だけなら短いpreflightとして扱う。

S2 line 46 states the condition under which doing it again is allowed at all:

> 合理的な失効理由なしに、同一headのfull-suiteや同一検査を最初からduplicate実行することを禁止する。

S4 line 58 (the same rule from the merge-gate side):

> …head不変のままDraft→Ready化しただけの場合、同一headへの重複したsubstantive reviewは必須としない（…「同一headに対するsubstantive reviewは原則1回」を参照）。

S3 line 269: on an unchanged head only the fresh mutable-state gate is done; after a head change the
procedure starts again from the beginning.

**Override:** the word does not appear for review duplication anywhere in S1–S5. The only exception
routes in the canonical set are the CI degraded-mode ones (S4 lines 75–82, S3 lines 246–255), and
they are explicitly a *different* route, single-use, rebound to a fresh head/base, and never carried
over (`Standing Authorizationや過去の例外承認を流用しない`, S4 line 75).

**Settled:** a second substantive review of the same head is prohibited **unless there is a stated
合理的な失効理由** (S2 line 46) — an invalidation reason tied to head, base, the blob under review,
the relevant contract or the execution environment. There is no free-form override, and no standing
permission. The allowed action on an unchanged head with no such reason is the mutable-state
preflight or reuse of the existing evidence.

## 5. Required Fix handoff and re-review handoff (S1, S2, S3)

Not defined as named contracts anywhere; their components are:

- S1 line 183–201: the answer skeleton a result is written in, including `## 次にLLM IDE / Coding Agentへ渡すべき指示`.
- S1 line 118 / §Material Facts: unresolved issues and Human-Gate items are disclosed from Turn 1.
- S2 line 51 (Phase A — Fail-Fast): on a Confirmed blocker or Confirmed Required Fix, the evidence is
  saved reproducibly and the non-essential exploration stops, returning to the fix step.
- S3 line 269 and S2 §共通原則 3: a head change invalidates the previous review; the new head starts
  the procedure again, and the old conclusion is not carried over unverified.

**Settled for Phase 3:** what must survive a round boundary — the reviewed head, the result artifact,
the Human's verdict and note, the next action, the next expected head, and the previous round — and
that DVCC classifies nothing on the Human's behalf.

## 6. What Phase 3 takes from the current product

- `src/domain/prompt.ts` — already emits Turn 1 (Stage 1 + Stage 2) per round, with its own heading
  wording, and says in its header that the two-turn workflow is Phase 3.
- `src/domain/review.ts`, `transitions.ts`, `events.ts` — rounds, the Review State machine, 14 event
  types; `request_saved` / `result_captured` / `verdict_confirmed` exist.
- `src/domain/freshness.ts`, `git.ts` — Phase 2's `compareHead` (40-character exact, 7–39 prefix,
  case-insensitive, otherwise undecidable). Phase 3 reuses it for same-head detection.
- `docs/data-contract-v1.md` — the v1 file set and the write / recovery rules Phase 3 must not break.
- A grep of `src/` finds **no** existing implementation of any Phase 3 concept.

## 7. SPEC_GAP assessment (against Task Packet §5, at latest main)

| Trigger | Result |
|---|---|
| Turn 1 / Turn 2 meaning cannot be determined | **No** — S1 defines both, their contents, their order, their section names and the fallback |
| Risk Tier 0 / 1 / 2 contradictory across sources | **No** — S2 is the single definition; S4 attaches it to the merge gate without redefining it; S2 line 7 separates it from the Capability Tier |
| Evidence reuse scope unknown | **No** — S2 lines 43–47 and 67, S1 lines 59–66, S3 lines 252 / 269 / 303 |
| Duplicate suppression: block or warning | **No** — prohibited unless a 合理的な失効理由 is stated (S2 lines 46, 66, 71; S4 line 58; S3 line 269) |
| Shared review contract not found | **No** — S1–S5 are the runtime-canonical set named by S5 |

**Gate passed at `77ce41e`.** The earlier assessment in this file was made against the stale
2026-09-03 working copy, which lacks S2's Tier 2 execution contract; it is superseded by this one.
The one point that looked undefined then — whether a duplicate same-head review may be continued —
is defined on latest main: only with a stated invalidation reason, never by a standing permission.
