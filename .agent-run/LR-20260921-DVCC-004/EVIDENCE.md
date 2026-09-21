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
