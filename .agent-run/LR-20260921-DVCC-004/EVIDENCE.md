# Evidence — LR-20260921-DVCC-004

## Wave 0 — preflight and canonical discovery (2026-09-21)

### Fresh gate

`git fetch origin`, then: `origin/main` = `4c1962b0c47321805554be2218bba996ff5de92f` (the expected
value); PR #3 `MERGED` with merge commit `4c1962b` at 2026-09-21T04:15:05Z; working tree clean;
0 tracked changes; 0 untracked files; no pre-existing `feat/review-workflow-v0.3`. The branch was
created from `origin/main`. Nothing was reset, cleaned or stashed.

Task Packet revision 1 was written verbatim to `TASK_PACKET_SNAPSHOT.md` and bound by SHA-256
`22673c39c5136e0785ed9ca1a5a4367ce154916c1c62f872635c6d303469db92` (30 778 bytes).

### Canonical contract discovery

Recorded in `CANONICAL_REVIEW_CONTRACT.md` with source paths, line numbers and the canonical lines
themselves. How it was done:

- Two read-only delegated scans ran in parallel: one over the Obsidian vault, one over the other
  local project and review directories. Both were forbidden to write anything, to run git, to touch
  Notion or to search the web, and both were told to report `NOT FOUND` rather than reconstruct a
  definition.
- This session then read the two load-bearing sources directly rather than trusting a summary:
  `02_Prompts/AI_Review/AI_Review_Request_Prompt.md` (the 2-turn protocol, the 16 input items, the
  Stage 1–4 templates) and `02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` (Risk Tier
  0 / 1 / 2, the tier boundary rule, one substantive review per head), plus the evidence-reuse lines
  of `DevVault_GitHub_Review_Attestation.md`.
- The current product was checked for any existing implementation of the Phase 3 concepts: a grep of
  `src/` for "Turn 1", "Turn 2", "Risk Tier", "duplicate" and "evidence reuse" finds none — the only
  "duplicate" matches are the project-id and archive-file-name checks. `src/domain/prompt.ts` says so
  itself in its header: "The full two-turn workflow is Phase 3."

Nothing in the vault was modified. Notion was not accessed. No web search was used.

### SPEC_GAP gate

Assessed against Task Packet §5 and passed; the table is in `CANONICAL_REVIEW_CONTRACT.md` §7. One
point is canonically silent — an override licensing a second substantive review of the same head —
and Phase 3 does not invent one (DECISIONS RW-003).

### Canonical set re-bound to latest main (2026-09-21)

The delegated cross-project scan found five local mirrors of the vault repository and reported that
the newest one carries a `Tier 2 Review Execution Contract` the working copy does not. Checked
directly: `C:\Users\shuns\obsidian-vault\...\DevVault_Review_Depth_Tiering.md` is 2026-09-03,
7 103 bytes, 58 lines; the 2026-09-16 mirror is 9 845 bytes, 88 lines. The working copy this session
read first was therefore **stale**, and the missing section is exactly the one that defines evidence
reuse.

The Human then authorized a read-only fetch of `airesearchagl-art/obsidian-vault` main for this
discovery only. `gh api` was used to read the commit and five file blobs; nothing was written to the
vault, the repository or Notion, and no clone was made inside this repository. Main was
`77ce41e6ff9e243ac2c8dc37ee29f5d5f4f24157` (2026-09-21T04:34:07Z). Both load-bearing files came back
**byte-identical** to the 2026-09-16 mirror (diff empty after CRLF normalization), confirming that
mirror is current and the working vault copy is not.

What this changed in the contract:

- **Evidence reuse** is explicit on latest main (`DevVault_Review_Depth_Tiering.md` lines 43–47):
  SHA-bound evidence is reused, and only the part with a stated reason to be stale (head, base, the
  blob under review, the relevant contract, the execution environment) is re-checked. Duplicate
  execution without such a reason is prohibited.
- **Same-head duplicate** is therefore a prohibition **with a condition**, not an unconditional block
  and not a bare warning. The earlier reading — taken from the stale copy, which has no such
  condition — is superseded (DECISIONS RW-003 → RW-012).
- No override, no standing permission: the only exception routes in the canonical set are the CI
  degraded-mode ones, which are a different route, single-use and rebound to a fresh head and base.

The fetched files live in the session scratchpad and are not committed; the contract file cites them
by path, commit and line number so an independent reviewer can fetch the same bytes.

## Wave 1 — pure workflow domain (2026-09-21)

Five modules, no UI, no persistence, no events, no prompt change. Every value is language-neutral;
nothing in `src/domain` carries a word the Human reads.

| Module | What it decides |
|---|---|
| `src/domain/freshContext.ts` | the canonical turns, stages and the 16 input items' turn split; the derived state of a round; whether Turn 2 may be sent yet; that a single-turn send is not a fresh-context review |
| `src/domain/riskTier.ts` | the three tiers, the five Tier 2 subjects, the ambiguity rule (higher candidate, Tier 0 vs Tier 1 stops at Tier 1), and a refusal — never a silent correction — when a choice sits below what the contract requires |
| `src/domain/duplicate.ts` | whether this head already has a substantive review, over Phase 2's `compareHead`; `UNDECIDABLE` when a head cannot be compared |
| `src/domain/revalidation.ts` | whether a second substantive review may go ahead: `NO_DUPLICATE` / `DUPLICATE_BLOCKED` / `REVALIDATION_ALLOWED` / `UNDECIDABLE`, decided by a canonical reason code |
| `src/domain/evidenceReuse.ts` | per evidence item: `REUSABLE` / `RECHECK_REQUIRED` / `UNAVAILABLE`, with the reason that decided it |

**Independent oracle.** `src/test/workflowContract.ts` states the contract as literal tables and
imports nothing from `src/domain`: turn→stage, the 16 input items, the five fresh-context states,
tier escalation, tier choice validation, nine duplicate cases, nine revalidation cases and ten
evidence cases. `src/domain/workflowContract.test.ts` compares the implementation against it — 76
tests, all passing — and also checks that the vocabulary itself matches the contract and that every
persisted value is `[A-Z0-9_]+`.

**Mutation probes** (each reverted immediately; the file was restored byte-for-byte and verified):

| # | Mutation | Result |
|---|---|---|
| M1 | duplicate detection ignores the head comparison | 4 failed / 72 passed |
| M2 | revalidation allowed without an invalidation reason | 4 failed / 72 passed |
| M3 | evidence is always reusable | 8 failed / 68 passed |
| M4 | the Tier 2 subject rule is removed | 2 failed / 74 passed |
| M5 | Turn 1 and Turn 2 carry each other's stages | 2 failed / 74 passed |

**Scenarios from the Task Packet §12**, all covered by the tables: 1 same head with prior evidence
and no reason → blocked; 2 contract changed → allowed, and only contract-bound evidence rechecked;
3 head changed → old evidence not reused as-is; 4 environment changed → only environment-bound
evidence rechecked; 5 different head → not a duplicate; 6 Tier 2 changes nothing else (the module
exports no review, resource or freshness value); 7 unknown binding → never `REUSABLE`; 8 explanation
without a reason code → not allowed.

Checks: `npx tsc --noEmit` PASS, `npx vitest run` PASS (21 files, **653 tests**), `npm run build`
PASS. `src-tauri/` untouched, so the Rust suite was not re-run. The localization gates are part of
the suite and pass; the new domain adds no user-facing text, and its values map to translation keys
in a later wave.

## Wave 2 — persistence, events and handoff (2026-09-21)

The Data Contract Gate was resolved first and is recorded in `DATA_CONTRACT_GATE.md`: which artifact
holds which reviewer response, why `archivedResults` is not reused for the Fresh Assessment, and how
the audit facts are stored as data rather than prose.

**Round record.** Six optional fields, all absent-means-empty in older files: `followupSavedAt`,
`judgmentCapturedAt`, `riskTier`, `revalidation`, `evidenceDecisions`, `archivedJudgments`. A single
`newRound()` factory now builds a fresh round, so the two construction sites cannot drift.

**Artifacts.** `followup-r<N>.md` (the Turn 2 request) and `judgment-r<N>.md` (the Final Judgment),
with `judgment-r<N>-previous-<ms>[-<n>].md` for a replaced judgment. The archive helpers are
parameterised by response kind rather than copied. Both names were added to the allow-list in the
Rust boundary and its TypeScript mirror, with six new allowed names and five new refusals asserted in
the Rust test.

**Events.** Five language-neutral types (`followup_saved`, `judgment_captured`, `risk_tier_set`,
`duplicate_continued`, `evidence_reused`) and an optional `detail` that is a closed union — one shape
per type, and its `kind` must equal the event's own type. A malformed or mismatched detail makes the
line unreadable, which the existing loader already skips and counts. `note` stays Human text that
nothing reads back.

**Handoff.** `buildRequiredFixHandoff` and `buildReReviewHandoff` are pure and read-only: they
collect what is already recorded (reviewed head, the response artifact the verdict was made against,
the verdict and its note, the next action, the next expected head, the previous round, the evidence
decisions and the revalidation reason) and invent nothing. A test asserts the previous round is not
mutated while a handoff is built.

**Tests** (18 new, 672 total): an older fixture still loads with every Phase 3 field empty and still
means "no Turn 2 happened"; a full round trip of all six fields; three refusals (unknown Risk Tier,
unknown invalidation reason, an archived judgment from another round); four event-detail cases
including a mismatched kind and a malformed payload; and seven handoff cases.

**Mutation probes** (both reverted, file restored):

| Mutation | Result |
|---|---|
| Phase 3 keys read with the strict v1 helper (absent no longer means null) | 3 failed / 15 passed — the backward-compatibility tests |
| an event detail whose `kind` does not match its type is accepted | 1 failed / 17 passed |

Checks: `npx tsc --noEmit` PASS, `npx vitest run` PASS (22 files, **672 tests**), `npm run build`
PASS, `cargo fmt --check` PASS, `cargo clippy --all-targets` PASS (0 warnings), `cargo test` PASS
(68 passed, 2 ignored). `schemaVersion` is unchanged at 1.

## Wave 2.6 — protocol ordering closure (2026-09-21)

Three invariants, all enforced where they belong rather than in the interface.

**The persisted order.** The parser now refuses a round that skips a step: `followupSavedAt` without
`resultCapturedAt` (`schema.round.followupWithoutAssessment`), and `judgmentCapturedAt` without
`followupSavedAt` (`schema.round.judgmentWithoutFollowup`, from Wave 2.5). A round with neither key —
every round written before Phase 3 — stays valid. The independent table `PERSISTED_ORDER_TABLE` holds
all five shapes, including the two refusals and the old-round case.

**Re-sending Turn 2.** `canSendTurn2` now also requires that no Final Judgment has been captured, so
the follow-up is latest-wins only while it is still unanswered. The fresh-context state table was
updated with the new expectation for the `JUDGMENT_RECEIVED` row — deliberately, as a contract
change, with the reason written next to it.

**Tier 2 subjects** are persisted on the round (`riskTierSubjects`), validated against the canonical
five, and empty in older files. A test restores them from a round trip and shows the canonical rule
still refusing a downgrade afterwards; another shows a subject outside the five being refused.

Tests: 8 new (687 total), all passing. Checks were run in an **isolated worktree** at
`1c682cb` plus this wave's staged diff, because the working tree of this session also contains a
change to `src/domain/transitions.ts` that this session did not write (see below).

### Foreign changes in the working tree

While this wave was being written, four files were modified by something outside this session:

| File | Modified at | Shape |
|---|---|---|
| `src/domain/transitions.ts` | 18:15:36 | Wave 3 actions (`recordFollowupSaved`, `captureJudgment`), +108 −0 |
| `src/services/persistence.ts` | 18:17:04 | +16 |
| `src/services/reviewService.ts` | 18:18:17 | +165 |
| `src/services/reviewHub.ts` | 18:18:27 | +30 |

They reference translation keys that do not exist yet, so the working tree as a whole does not
compile. This session did not write them, did not stage them, did not commit them, and did not touch
them in any way: no checkout, no restore, no stash, no reset, no copy, not even to park them
elsewhere. They are left exactly as they are, unstaged, for their owner. The Human was asked before
anything was committed and chose this course.

Consequently the checkpoint was verified in a temporary worktree containing `1c682cb` plus only the
files this session changed, and the commit stages those files by explicit path.

## Wave 3a — the five actions, guarded in the domain (2026-09-21)

Commit `a4b41f3`. The five Phase 3 operations are `ReviewAction`s like every other operation:
`recordFollowupSaved`, `captureJudgment`, `setRiskTier`, `recordRevalidation` and
`recordEvidenceDecisions`. None of them re-implements a rule that already exists.

**The guards are the interface's guards.** `recordFollowupSaved` and `captureJudgment` ask
`canSendTurn2` and `canCaptureJudgment` — the same functions a disabled button reads — through a new
`progressOfRound`, so a refused action and a greyed-out control can never disagree. When the answer
is no, the refusal says which precondition failed rather than a generic "not allowed".

**The canonical rule decides the tier.** `setRiskTier` calls `validateTierChoice`; a tier below what
the declared Tier 2 subjects require is refused with the required tier in the message, and nothing on
the round moves. There is no silent correction and no implicit tier.

**Archive names are checked before anything is written**, by one helper shared with the result
capture (`archiveRefusal`), so a judgment archive name from the result family is refused.

**The audit facts are data.** `risk_tier_set`, `duplicate_continued` and `evidence_reused` carry a
typed `detail`; `note` stays Human text that nothing reads back.

Tests: 22 new in `src/domain/workflowActions.test.ts` (709 total, 23 files). `npx tsc --noEmit`
PASS, `npx vitest run` PASS, `npm run build` PASS.

## Wave 3b — Turn 2 and the Final Judgment, through the service layer (2026-09-21)

Commit `4b1866b`. The protocol now reaches disk.

**The Turn 2 document.** `buildResolutionFollowup` emits the canonical Stage 3 Resolution Context and
Stage 4 Final Judgment in Japanese and English, with the same facts in the same order and the same
line count, carrying the two rules the contract attaches to the added context: name the added
Evidence behind every changed finding, and let the Artifact win where the narrative disagrees with
it. The background itself stays a `<!-- Humanが記入 -->` placeholder — the local root, the project
notes and the next action are not volunteered, which a test asserts for both languages.

**The invariant is asked, not restated.** `saveFollowupRequest` runs `applyReviewAction` before it
builds or writes anything, so the Wave 2.5 / 2.6 rules hold on the service path with no second copy
of them; `followup-r<N>.md` is written only after the domain has agreed, and `ensureSessionUnchanged`
still runs before the write (E-3).

**Both responses of a round survive.** Capturing a reviewer response is now one flow parameterised by
kind: `judgment-r<N>.md` sits beside `result-r<N>.md`, never over it, and a replaced Final Judgment
archives under `judgment-r<N>-previous-<ms>.md` into `archivedJudgments`, leaving `archivedResults`
untouched.

Mutation probes, each applied to the committed source, run, then reverted (all three restores
verified byte-identical by SHA-256):

| Probe | Mutation | Result |
|---|---|---|
| M-B1 | `saveFollowupRequest` writes the follow-up before `applyReviewAction` is asked | CAUGHT — the "writes nothing before the Fresh Assessment" test fails |
| M-B2 | the Final Judgment is written to `result-r<N>.md` | CAUGHT — 5 tests fail, including the hub's full two-turn walk |
| M-B3 | a replaced judgment is archived under the result names | CAUGHT — the judgment-archive test fails |

Tests: 17 new (726 total, 24 files) — `src/services/workflowService.test.ts` (9), `prompt.test.ts`
(5, including a JA/EN equal-line-count check), `reviewHub.test.ts` (3, including an E-3 conflict
check on the follow-up path and a full Turn 1 → Turn 2 → both responses walk). `npx tsc --noEmit`
PASS, `npx vitest run` PASS, `npx vite build` PASS. `src-tauri/` untouched, so the Rust suite was not
re-run. The working tree was clean before and after both commits, and every file was staged by
explicit path.

## Wave 3c — the protocol, the tier and the timeline, in both languages (2026-09-21)

Commit `dcb3e83`. The workflow became reachable from the interface.

**A card that says where the Human stands.** Turn 1, the Fresh Assessment, Turn 2 and the Final
Judgment each show their time or an explicit "not sent" / "not received" — never a blank — above the
derived fresh-context state. The three operations sit with them: copy Turn 2, save the Final
Judgment, set the Risk Tier.

**The interface asks the domain.** Each control's enabled state comes from the function that would
refuse the action (`canSendTurn2`, `canCaptureJudgment`, `canApply`), and a disabled control carries
the reason in its title. The button is not the gate: the service path refuses the same operations
with no interface involved, which `workflowService.test.ts` and `reviewHub.test.ts` assert directly.

**The tier stays the Human's.** The dialog sends the tier and the subjects exactly as ticked. It
derives nothing from the checkboxes and raises nothing quietly; a tier below what the declared
subjects require comes back as the domain's refusal, rendered where every form error is rendered.

**Two responses, two dialogs.** The Final Judgment dialog names the file it writes and asks only
about replacing a judgment, because the Fresh Assessment is never overwritten.

**The timeline reads per round** (RW-12) through the pure `timelineByRound`, which groups the
existing `events.jsonl` and invents nothing.

`ActionButton` and `Row` moved to `src/components` so the new cards and the detail share one shape
rather than a copy.

Tests: 733 (25 files). The parity gate now also covers the risk tiers, the Tier 2 subjects and the
fresh-context states; `state.riskTier.*`, `workflow.riskTier.title` and `review.riskTier.tier` are
on the shared-value list because they are canonical names, and translating them would drift from the
vocabulary the reviewer and the Human share.

## Wave 3d — duplicates, evidence reuse and the handoffs (2026-09-21)

Commit `3175a7c`.

**A duplicate is shown, never skipped.** The card names the existing reviews of the same head,
states the canonical rule, and lists the two paths that need no permission: open the existing review,
or reuse the evidence and re-check only what went stale. There is no override button. The only way
forward is to record one of the canonical invalidation reasons, and the dialog offers only the four
that can apply to an unchanged head — `HEAD_CHANGED` contradicts the finding rather than justifying
it. The Human's own words are kept with the record and never grant anything. `UNDECIDABLE` is shown
as its own state, with the sentence that not being able to tell is not the same as there being no
duplicate.

**Evidence is offered from what DVCC holds.** `offeredEvidence` derives the candidates: an earlier
round's response (the Final Judgment when there is one, otherwise the Fresh Assessment), the head the
Human recorded for it, and the last successful Git observation. Each carries the head it is bound to
and when it was captured, and `assessEvidenceItem` rates it against the head this round is about.
Derived Freshness is not among them (RW-017), the current round's own response is never offered to
itself, and nothing is reused without a Human action.

**The handoffs are read from the domain models**, not reconstructed: what a confirmed `FIX_REQUIRED`
or `BLOCKED` hands on, and the relation a re-review has to the round before it. The previous round's
artifacts are named, never touched (RW-11).

Mutation probes, applied to the committed source, run, then reverted (all restores verified
byte-identical):

| Probe | Mutation | Result |
|---|---|---|
| M-C1 | a round may be its own duplicate | CAUGHT |
| M-C2 | the current round's response is offered to itself | CAUGHT |
| M-C3 | a review's conclusions are treated as contract-independent | CAUGHT |
| M-C4 | the timeline drops the round boundary | CAUGHT |

Tests: 745 (27 files). `npx tsc --noEmit` PASS, `npx vitest run` PASS, `npx vite build` PASS.
`src-tauri/` untouched in both waves, so the Rust suite was not re-run. The working tree was clean
before and after every commit, and every file was staged by explicit path.

## Wave 3 summary reconciliation (2026-09-23)

Commit `22167c5`, evidence only. `RUN_STATE.md` still named `3175a7c` as the current head and listed
Wave 3 items as future work; `TASK_QUEUE.md` had Wave 3 unchecked. Both current summaries now say
Wave 3 is complete at `ef9c3d7` (745 tests / 27 files, M-B1..3 and M-C1..4 CAUGHT, no foreign
writer). The Wave 3a–3d sections above were not changed. No product code changed.

## Wave 4 — prompts, readiness, Freshness, accessibility, documentation (2026-09-23)

Commit `cc36a82`. Start head `22167c5` (clean, single writer, no foreign change seen).

**Turn 1** is the canonical `Stage 1 — Review Target` (`Artifact` / `Contract` / `Material Facts`)
then `Stage 2 — Fresh Assessment` (RW-029). The Contract states the Risk Tier and its Tier 2 subjects;
Material Facts always ask for known risks and limitations, failing tests, security and
destructive-operation constraints, scope exclusions, unresolved issues and Human Gate items. A
re-review adds the previous round, its reviewed HEAD, its Human-confirmed verdict, its response file,
the evidence decisions with the re-check subset, and the invalidation reason code (RW-030). Items 7/8,
the verdict note and the revalidation explanation never reach Turn 1.

**Turn 2** is `Stage 3 — Resolution Context` then `Stage 4 — Final Judgment`: the narrative (verbatim
when supplied, placeholders otherwise, plus the Human's words about the previous round), and five
Final Judgment requirements — leave the Fresh Assessment untouched, restate in the same format, name
the added Evidence behind every change, confirm what still stands, state the Reviewed HEAD.

**Exact-head readiness** (RW-031): `EXACT` only for a full 40-character recorded HEAD; `SHORT` and
`MISSING` still generate but say `NOT EXACT` in the request. The observed HEAD is shown as a
candidate (`MATCHES` / `DIFFERS` / `UNDECIDABLE` / `UNAVAILABLE`) and never written.

**Freshness** (RW-034): its own card in the workflow, with the reason, expected / reviewed / observed
HEAD, `observedAt` and, for `UNKNOWN`, one of six causes; a Human-only **Refresh Git state**. A render
test passes all five statuses with the same session and observation and finds every other state on
the page unchanged, no callback invoked and the frozen session untouched.

**Refusals and accessibility** (RW-033, RW-035): Turn 2, Final Judgment, Confirm verdict, Set Risk
Tier, Copy review prompt, the invalidation reason and the evidence record show the domain's refusal
plus the next step, stay focusable (`aria-disabled`) and are described by that text; the duplicate
warning and the undecidable case are status regions with a next step; the Risk Tier dialog previews a
below-required choice before saving; dialogs are labelled by their visible title; button groups,
evidence and timeline lists carry labels; statuses are words, not only colours. JA and EN expose the
same accessible structure (asserted).

**Documentation**: README status (Phase 1 / 2 / Localization merged, Phase 3 under development with
no PR, not released, no installer) and Phase 3 features, marked as not yet verified in the running
app; `docs/data-contract-v1.md` gains the seven round fields, the three files, the five event types
with their typed `detail`, the protocol invariants and the prompt / Freshness rules, `schemaVersion`
1 unchanged. `src/test/docsContract.test.ts` ties both to the code.

**Localization**: 42 keys added in both dictionaries, 4 superseded keys removed; parity, blanks,
duplicates, placeholders and the hard-coded-text scan pass; the two new labels that were identical in
both languages were translated.

Mutation probes, applied to the working source, run, then restored (all restores verified
byte-identical by SHA-256):

| Probe | Mutation | Result |
|---|---|---|
| M-D1 | item 7 (背景・目的) added to Turn 1 | CAUGHT (anchoring test and JA/EN parity) |
| M-D2 | the JA Turn 2 "restate the final judgment" requirement removed | CAUGHT (parity and Stage 4 tests) |
| M-D3 | UNKNOWN rendered as ALIGNED | CAUGHT (Freshness surface tests, JA and EN) |
| M-D4 | REVIEW_STALE shown as a FIX_REQUIRED Review State | CAUGHT (separation test) |
| M-D5 | a short HEAD accepted as an exact binding | CAUGHT (readiness and prompt tests) |

Tests: 852 (31 files). `npx tsc --noEmit` PASS, `npx vitest run` PASS, `npm run build` PASS,
`git diff --check` clean. `src-tauri/` untouched, so the Rust suite was not re-run. Every file was
staged by explicit path; the tree was clean before and after the commit.

## Pre-Wave-5 summary reconciliation (2026-09-23)

Commit `21a3098`, evidence only: the implementation-state paragraph still listed Wave 4 work as not
done, and RW-24 was listed as unverified. Historical sections unchanged. No product code changed.

## Wave 5 — full verification and running-app smoke (2026-09-23)

Start head `21a3098` (clean, equal to `origin/feat/review-workflow-v0.3`; `origin/main` =
`4c1962b0c47321805554be2218bba996ff5de92f`; Task Packet SHA-256 `22673c39…69db92` match; no foreign
writer). Product freeze `85b0d11` — product source unchanged since `cc36a82`; Wave 5 added tests and
scripts only.

**Resource gate.** First reading 11.61 GiB available (< 12): no build and no WebView2 started, no
process touched; the light regression ran. Re-read 12.89 GiB → 13.32 GiB before the release build and
≥ 16 GiB before each smoke. No Human process was killed.

**Regression.** `npm ci`; typecheck PASS; Vitest PASS 31 files / 855 tests; build PASS; `cargo fmt
--check` PASS; `cargo clippy --all-targets` PASS, 0 warnings; `cargo check` PASS; `cargo test` 68
passed, 2 ignored. Tauri `build --no-bundle` PASS, release exe SHA-256
`9EDC3DA6A7D8928D063B3BDC1EDABE3C45A57AFB1C18F1BBEEDF2651BAE18913`. No installer, no release. No
GitHub CI exists: these are local results.

**Running-app smoke** — `scripts/verify-review-workflow-ui.ps1`, release build, hidden desktop,
temporary `DVCC_DATA_DIR`, synthetic projects and reviews, two throw-away Git repositories under
`%TEMP%`, spawned-PID-only cleanup, clipboard sequence guard. Final run: **80 PASS / 0 FAIL / 6
INCONCLUSIVE**.

- A direct pass: EXACT readiness, Risk Tier set by the Human, READY → REVIEWING, Fresh Assessment,
  REVIEW_PASS by the Human, no follow-up / judgment, events and per-round timeline — PASS; the Turn 1
  copy is INCONCLUSIVE in the final run.
- B Required Fix / R2: FIX_REQUIRED with note, Required Fix handoff, next action, R2 with its relation
  to R1 (previous head, previous response), R1 verdict and note intact, R1 artifacts byte-identical,
  R2 reviewed to a pass — PASS; the two Turn 1 copies are INCONCLUSIVE.
- C two-turn: Turn 2 and the Final Judgment refused with reasons before the assessment; the verdict
  dialog offered after the assessment can be declined — PASS; Turn 1 and Turn 2 copies are
  INCONCLUSIVE, so the Turn 2 → judgment → verdict part did not run in the final run.
- D duplicate: SAME_HEAD shown and blocked, prior review named, nothing skipped or closed, no
  override control, explanation alone refused, only the four same-head reasons offered, BASE_CHANGED
  recorded in `round.revalidation` and in the `duplicate_continued` detail with the explanation kept;
  UNDECIDABLE gives no permission and says why — PASS.
- E evidence: E1 `UNAVAILABLE / RECHECK_REQUIRED (contract) / REUSABLE / RECHECK_REQUIRED (another
  head)` and E2 environment-bound recheck, each row with status in words, source, head, time and
  reason; a dirty worktree changes Freshness and not the decisions; the stored decisions equal the
  event detail and the screen — PASS.
- F Freshness: UNKNOWN before any refresh (no automatic refresh), never shown as ALIGNED; ALIGNED,
  WORKTREE_DIRTY, HEAD_CHANGED, REVIEW_STALE each with reason, HEADs and `observedAt`; UNKNOWN with
  the NO_LOCAL_ROOT cause; Review State, Resource State, recorded HEADs, Risk Tier and workflow
  progress unchanged throughout; session files byte-identical — PASS.
- G locale / restart: JA → EN → restart → JA with `document.lang`, workflow, tier, Freshness,
  timeline, duplicate, evidence and refusal reason read in each language; state, progress and tier
  equal before and after the restart; no file but `settings.json` changed — PASS.
- Exact HEAD: EXACT / SHORT (with next step) / MISSING; observed full HEAD shown as a candidate only
  and never written; a differing observed HEAD not adopted — PASS; the short-HEAD request text is
  INCONCLUSIVE (copy).
- v1 fixture: loads, no migration, no unreadable row, Phase 3 fields empty, loading rewrites nothing,
  an old review can be worked and survives a restart — PASS.
- Artifact immutability: every frozen past artifact byte-identical after new rounds, locale switches,
  refreshes, evidence and tier operations; the malformed Phase 3 session untouched — PASS.
- Accessibility (running DOM): refused controls `aria-disabled`, focusable, described by visible
  text; dialog labelled by its `h2`; two fieldsets with legends; status regions; labelled evidence
  list; Tab reaches the workflow controls, refused ones included — PASS. Screen reader not tested.
- Negative paths: Turn 2 before assessment, judgment before Turn 2, verdict while the judgment is
  awaited (the refused button opens nothing), tier below a declared Tier 2 subject (preview and save
  refusal), explanation-only revalidation, UNDECIDABLE, missing binding, an external change to
  `session.json` not overwritten, a malformed Phase 3 ordering shown unreadable and untouched — PASS.

The 6 INCONCLUSIVE are the clipboard-writing steps: the operator's clipboard was unreadable
(`Get-Clipboard` failed; no window held it open) for more than 30 minutes of read-only polling, so
the guard did not press them. An earlier run of the same release build with a text clipboard
(`dvcc-wf-d17df1ae`) executed all of them and they passed, including the full two-turn path, the
judgment replacement with archive, and both request texts; that run used an earlier revision of the
script and is recorded here as supporting evidence only, not as the final result.

The localization smoke, re-run on the shared harness: 21 PASS / 0 FAIL / 2 INCONCLUSIVE (the two
request copies, same clipboard). An earlier run on the refactored harness with a text clipboard
passed 24/24.

Script defects found and fixed during Wave 5 (none in the product): the `Git` helper recursing into
itself (PowerShell names are case-insensitive), a PS 5.1 `.Count` on a single object, checks that did
not expect the verdict dialog the app opens after a result, clicks sent while the app was busy
loading a review, and helper output leaking into return values.

**Turn 2 narrative UX.** The clipboard-edit method works: `followup-r<N>.md` is written with items 7/8
as placeholders and the Human fills them in the copied text. Classified as a known limitation
(QD-004): the narrative actually sent is not stored.

**Mutation** (full Vitest per mutant, each restored byte-identical by SHA-256):

| Mutant | Mutation | Result |
|---|---|---|
| MC1 | an explanation alone grants a same-head revalidation | KILLED |
| MC2 | the verdict no longer waits for the Final Judgment | KILLED |
| MC3 | Freshness shown as the Review State | KILLED — same source change as M-D4, re-run, not counted again |
| MC4 | a short HEAD is EXACT by length (new site) | KILLED |
| MC5 | a new round's request overwrites R1's | KILLED |
| MC6 | the locale changes a recorded value in the prompt | KILLED |
| MC7 | a dirty worktree changes the evidence decisions | SURVIVED the unit suite → test added → KILLED |
| MC8 | Turn 2 may be re-sent after the Final Judgment | KILLED |
| MC9 | the revalidation dialog saves without a canonical reason | SURVIVED the unit suite → test added → KILLED (the domain also refuses it) |

Unique mutants 8 (+1 re-run), killed 8, equivalent 0, survivors 0.

**Hard checks.** Security / permission: the Phase 3 diff since `4c1962b` adds no network, socket,
GitHub or ChatGPT call; Tauri commands unchanged (`inspect_git_repository`, `open_data_dir`,
`open_external_url`, `open_project_folder`); `src-tauri` changes only the review-file allow-list, with
tests. Privacy: prompts carry no local root, notes or next action (tests); fixtures and smoke data are
synthetic. Data integrity: protocol invariants refused in the running app; external change not
overwritten; malformed data left untouched. Irreversible data: nothing deleted or renamed by the
workflow; past artifacts byte-identical. Operator: `%APPDATA%\DevVault-Control` byte-identical before
and after (4 entries, same hashes and timestamps), `DevVault-Control-dev` absent before and after, no
DVCC process left, clipboard never touched while unreadable.

## Wave 5 — clipboard re-run (2026-09-24)

Head `3859d77` (clean, equal to the remote branch; product freeze `85b0d11` unchanged), release exe
SHA-256 re-read `9EDC3DA6A7D8928D063B3BDC1EDABE3C45A57AFB1C18F1BBEEDF2651BAE18913` (the frozen build),
14.13 GiB available, clipboard readable text. Nothing in source, tests or scripts changed.

- Workflow smoke (`dvcc-wf-62f03c7e`): **97 PASS / 0 FAIL / 0 INCONCLUSIVE**. The six clipboard-writing
  steps now ran: Turn 1 requests for A, B R1 and B R2 and the short-HEAD request (NOT EXACT, HEAD not
  completed), and the full two-turn path of C — Turn 2 sent, verdict refused while the judgment was
  awaited, Final Judgment captured without touching `result-r1.md`, Turn 2 refused after it, judgment
  replacement only with confirmation and archived, verdict confirmed; request / result / follow-up /
  judgment all present. Restart persistence covered six reviews; 10 past artifacts byte-identical.
- Localization smoke: **24 PASS / 0 FAIL / 0 INCONCLUSIVE**.
- Operator: `%APPDATA%\DevVault-Control` byte-identical to the first Wave 5 snapshot; no DVCC
  process left; no guard note emitted. The clipboard's text length read 2367 before the workflow run
  and 935 before and after the localization run; its content was not read, and the change between
  the runs is not attributed.

This supersedes the 6 INCONCLUSIVE of the earlier final run; RW-23 closes on this run.
