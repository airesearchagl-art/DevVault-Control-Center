# Data Contract Gate — Phase 3 Wave 2

Resolved before any persistence code was written, as the Human required. Two questions: how the
**two reviewer responses** of the canonical protocol are stored, and how the **audit facts** of a
duplicate continuation and an evidence reuse are stored so that nothing has to be recovered by
reading prose.

## 1. Two-response preservation

### What the canonical contract requires

`02_Prompts/AI_Review/AI_Review_Request_Prompt.md` at obsidian-vault main `77ce41e`:

> ```text
> Turn 1 — Initial Review Request … Stage 2: Fresh Assessment指示
> ↓ ReviewerがFresh Assessmentを返す
> Turn 2 — Resolution Follow-up（必要な場合のみ送る） … Stage 3: Resolution Context
> ↓ Stage 4: Final Judgment（Turn 2の後。Turn 2不要ならFresh Assessmentをもとに実施）
> ```
> (lines 38–47)

> - Implementation narrativeは、ReviewerがFresh Assessmentを返した後、…必要な場合のみTurn 2で提示する。追加contextで初回findingを変更してよいが、**何が追加Evidenceによって変わったかを区別できるようにする**。 (line 51)

> 初回assessmentと本contextを統合し、最終判断を「指摘の出し方」の形式で更新してください。初回から変更した判断には、変更理由となった追加Evidenceを付記してください。 (line 149)

So there are **two reviewer responses** in a round that uses Turn 2 — the Fresh Assessment and the
Final Judgment — and the contract requires that what changed between them stays visible. A design
that overwrites the first with the second cannot satisfy line 51.

**The canonical contract names no file and no schema.** It is a prompt contract; storage is ours.
Everything below is therefore recorded as a minimal Data Contract decision rather than as discovery.

### What v1 has today

| File | Meaning | Round field |
|---|---|---|
| `request-r<N>.md` | the request handed to the reviewer, latest-wins | `requestSavedAt` |
| `result-r<N>.md` | the reviewer's response, latest-wins | `resultCapturedAt` |
| `result-r<N>-previous-<ms>[-<n>].md` | a response the Human **replaced**, kept | `archivedResults[]` |
| `checkpoint.md` | the suspend note | — |

`verdict` / `verdictConfirmedAt` / `verdictNote` record the Human's decision, and a verdict cannot be
confirmed before `resultCapturedAt` is set.

### Why `archivedResults` must not carry the Fresh Assessment

`archivedResults` means exactly one thing today: *a response the Human replaced because it was
wrong to begin with* (a mis-paste, a truncated copy). It is a generic replacement archive: the file
name carries only a timestamp, there is no field saying which protocol stage the text belongs to,
and `docs/data-contract-v1.md` describes it as the earlier text of the same capture.

If the Fresh Assessment were pushed into that archive when the Final Judgment arrived, then for any
round with both a replacement and a Turn 2 the archive would hold two texts of different kinds under
identical names, distinguishable only by guessing from timestamps. The semantic identity the
canonical contract depends on — *this* is the independent first assessment, *that* is the updated
final judgment — would be gone, and line 51 would no longer be checkable from the stored data.

**Decision: `archivedResults` keeps its current meaning and is not reused for the protocol.**

### The decision

One artifact per protocol message, named after the message:

| File | Protocol message | Round field | Replacement archive |
|---|---|---|---|
| `request-r<N>.md` | Turn 1 — Initial Review Request (Stage 1 + 2) | `requestSavedAt` | — (latest-wins, unchanged) |
| `result-r<N>.md` | **Fresh Assessment** — the reviewer's answer to Turn 1 | `resultCapturedAt` | `archivedResults[]` (unchanged) |
| `followup-r<N>.md` | Turn 2 — Resolution Follow-up (Stage 3 + 4 instruction) | `followupSavedAt` *(new, optional)* | — (latest-wins, same rule as the request) |
| `judgment-r<N>.md` | **Final Judgment** — the reviewer's answer to Turn 2 | `judgmentCapturedAt` *(new, optional)* | `archivedJudgments[]` *(new, optional)*, `judgment-r<N>-previous-<ms>[-<n>].md` |

- **`result-r<N>.md` keeps its name and its meaning.** It already holds the reviewer's response to
  the request; the canonical name for that response is the Fresh Assessment. Nothing about existing
  files changes, and no file is renamed or rewritten.
- **When Turn 2 is not needed** (the common case), nothing new exists: `followupSavedAt`,
  `judgmentCapturedAt` and `archivedJudgments` stay absent, and the verdict is confirmed against the
  Fresh Assessment — which is exactly what the canonical line 47 says happens
  (「Turn 2不要ならFresh Assessmentをもとに実施」).
- **When Turn 2 happens**, the Fresh Assessment stays in `result-r<N>.md`, untouched, and the Final
  Judgment is written to `judgment-r<N>.md`. Both survive, each under its own name, so "what changed
  because of the extra evidence" is answerable from the files alone.
- **The verdict is confirmed against the latest response of the round**: the Final Judgment when one
  exists, the Fresh Assessment otherwise. The existing guard (a verdict needs a captured result)
  keeps working unchanged, because `resultCapturedAt` is still set first in every round.
- **Replacement stays explicit.** Capturing over an existing Final Judgment needs the same Human
  confirmation as today and keeps the earlier text as `judgment-r<N>-previous-<ms>.md`. Nothing is
  ever overwritten silently, and a past round's artifacts are never touched by a later round.

Capture timestamps, restated plainly: `resultCapturedAt` = when the Fresh Assessment was captured;
`judgmentCapturedAt` = when the Final Judgment was captured; both are ISO-8601 UTC, both are written
by the same atomic-write path as everything else.

### Restart restoration

The Wave 1 state model reads, per round: `requestSavedAt` → Turn 1 sent, `resultCapturedAt` → the
assessment is in, `followupSavedAt` → Turn 2 sent, `judgmentCapturedAt` → the final judgment is in,
`verdictConfirmedAt` → the Human has decided. All five are fields of `session.json`, which is the
authoritative state, so a restart restores the workflow position without reading a single artifact
body and without parsing any prose. Wave 1's `FreshContextProgress` gains `judgmentCapturedAt` and
its state list gains `JUDGMENT_RECEIVED` between `TURN_2_SENT` and `JUDGMENT_CONFIRMED`; the
independent contract table is updated with it deliberately, as a contract change, not silently.

### Backward compatibility

- `schemaVersion` stays **1**. Every new field is optional and read as absent-means-null, the way
  `archivedResults` was added in Phase 1 — files written before Phase 3 load unchanged and mean
  exactly what they meant.
- No file is renamed, moved, rewritten or deleted. A round written by Phase 1 or 2 has no
  `followup-r<N>.md` and no `judgment-r<N>.md`, which reads as "no Turn 2 happened".
- The two new file names are added to the allowed review file names in the Rust boundary and its
  TypeScript mirror, so a path outside the set is still refused.
- A file written by this version and read by an older build: the older build's parser ignores unknown
  keys, so the round still loads; it would not show the new artifacts. That is a degradation, not a
  data loss, and it is the same direction as every earlier additive change.

## 2. Structured audit persistence

### The requirement

A duplicate continuation and an evidence reuse are governance facts. They must be machine-readable,
and **no state may be recovered by parsing a Human sentence**. The existing `events.jsonl` stays the
history; a second history store is not created.

### The decision

**a. The event gains an optional, typed `detail`.** The event shape keeps every field it has and
adds one optional key:

```jsonc
{ "v": 1, "ts": "…", "type": "duplicate_continued", "reviewSessionId": "…", "round": 2,
  "reviewState": null, "resourceState": null,
  "note": "…the Human's own words, never parsed…",
  "detail": { "kind": "duplicate_continued",
              "invalidationReason": "RELEVANT_CONTRACT_CHANGED",
              "priorReviews": [ { "reviewId": "rv-20260101-alpha1", "round": 1 } ] } }
```

```jsonc
{ "v": 1, "ts": "…", "type": "evidence_reused", …,
  "detail": { "kind": "evidence_reused",
              "items": [ { "id": "…", "source": "INDEPENDENT_REVIEW_RESULT",
                           "boundHead": "…40 chars…", "capturedAt": "…",
                           "status": "REUSABLE", "reason": "SHA_BOUND" } ] } }
```

- `detail` is a **closed discriminated union**, not a free bag: one shape per event type that has
  one, validated by the schema parser. A malformed `detail` makes the line unreadable, and the
  existing contract skips unreadable event lines with a visible count — it is never half-read.
- `note` stays what it is: text for a Human to read. Nothing reads it back.
- Old lines have no `detail`; new lines carry it. An older build ignores the key (and skips the new
  event types, which it already counts and reports).

**b. The governance facts that must survive an append failure also live on the round.** Appending to
`events.jsonl` can fail — the existing contract returns that as a warning after the state was saved.
Losing "this round was continued over a duplicate, for this reason" to a warning is not acceptable,
so the round record carries it as well:

```ts
revalidation?: { reason: InvalidationReason; priorReviews: { reviewId: string; round: number }[]; explanation: string | null } | null;
evidenceDecisions?: { id: string; source: EvidenceSource; boundHead: string | null; capturedAt: string | null; status: EvidenceStatus; reason: EvidenceReason }[];
```

Both are optional, both language-neutral except `explanation`, which is the Human's own text and is
stored verbatim, never translated and never parsed. `session.json` stays the authoritative state and
`events.jsonl` stays the audit trail; the two agree because they are written from the same values.

### What is rejected

- Recovering a permission or a reuse state by parsing `note`, or by matching words in any Human text.
- A free-form `detail` object whose keys vary by writer.
- A second history file beside `events.jsonl`.
- Reusing `archivedResults` for the Fresh Assessment (see the proof above).
- Raising `schemaVersion`, which nothing here needs.

## 3. Summary of the additive changes Wave 2 will make

| Where | Addition | Optional |
|---|---|---|
| Round record | `followupSavedAt`, `judgmentCapturedAt`, `archivedJudgments`, `riskTier`, `revalidation`, `evidenceDecisions` | all |
| Review files | `followup-r<N>.md`, `judgment-r<N>.md`, `judgment-r<N>-previous-<ms>[-<n>].md` | all |
| Events | `followup_saved`, `judgment_captured`, `evidence_reused`, `duplicate_continued`, `risk_tier_set` + optional typed `detail` | all |
| `schemaVersion` | unchanged (1) | — |

Data integrity, irreversible-data safety: nothing is renamed, overwritten or deleted; every new path
goes through the existing atomic write with its `.bak` and precondition; every new file name is added
to the allow-list on both sides of the boundary.
