# Evidence — LR-20260920-DVCC-003

## Wave 0 — preflight (2026-09-20)

| Item | Evidence |
|---|---|
| Repository | `airesearchagl-art/DevVault-Control-Center` |
| Base SHA | `origin/main` = `318e273a1afe66c605da897a4f7603aaa921fc83` — matches the Human-stated expected main; subject "Merge pull request #2 from airesearchagl-art/feat/evidence-freshness-v0.2" |
| Merged phases | PR #1 (Review Hub v0.1) and PR #2 (Evidence / Freshness v0.2, merged 2026-09-20T12:11:09Z) |
| Current branch before | `feat/evidence-freshness-v0.2` (Phase 2 branch, already merged) |
| Working tree | clean — 0 tracked changes, 0 untracked files |
| Target branch | did not exist locally or on the remote |
| Working branch created | `feat/localization-foundation-v0.2.1` from `origin/main` @ `318e273` (L10N-01) |
| Tool surface | node v24.15.0, npm 11.12.1, rustc 1.95.0, git 2.53.0.windows.2 |
| Available memory | 13.64 GiB (heavy-verification gate: 12 GiB) |
| GitHub CI | none — no Actions workflow and no status checks; every check is local |

## Task Packet binding

- Snapshot: `.agent-run/LR-20260920-DVCC-003/TASK_PACKET_SNAPSHOT.md`, 13 954 bytes.
- SHA-256: `1eaf6ee66218e6fa2128db89914dfbc6b03a046e4b83dd94f176a7736e577531`.
- Revision 1; the two previous runs' artifacts are untouched.

## Branch discipline after the Phase 2 incident

Phase 2 produced commits on local `main` because a `git checkout main` went unnoticed. In this run the branch is verified with `git branch --show-current` immediately before every commit, and the check is recorded with each checkpoint.

## Wave 0 — UI string inventory (delegated, read-only)

A separate read-only context inventoried every user-facing string under `src/` at `318e273`. Result: **about 390 distinct strings across 18 files**.

| Area | Files | Approx. strings |
|---|---|---|
| App shell, toasts, banners, confirm dialogs | `app/App.tsx` | 65 |
| Review detail pane | `features/reviews/ReviewDetail.tsx` | 75 |
| Review dialogs (suspend / capture / verdict / next round) | `features/reviews/ReviewDialogs.tsx` | 40 |
| Review create / edit form, project form | `features/reviews/ReviewForm.tsx`, `features/projects/ProjectForm.tsx` | 38 |
| Queue pane | `features/reviews/ReviewQueue.tsx` | 16 |
| Shared components, recovery notices, formatting | `components/*`, `app/appState.ts`, `app/format.ts` | 13 |
| Label maps (review / resource / Git status / freshness) | `domain/states.ts`, `domain/git.ts`, `domain/freshness.ts` | 26 |
| Freshness explanations | `domain/freshness.ts` | 13 sentences |
| Validation and field errors | `domain/validation.ts`, `project.ts`, `review.ts` | 25 |
| Transition guards and event notes | `domain/transitions.ts` | 27 |
| Schema parse reasons reaching a banner | `domain/schema.ts` | 34 |
| Service errors | `services/persistence.ts`, `reviewService.ts`, `reviewHub.ts`, `trackedStorage.ts` | 19 |
| Review request template | `domain/prompt.ts` | 20 emitted lines |

Findings that shape the design (each is answered by a decision in DECISIONS.md):

1. **`prompt.ts` is already bilingual** — English headings and labels with Japanese instruction sentences and placeholders (`未記録`, `なし（初回Round）`, three JA guidance lines). Localizing it is a split of a mixed template into two coherent ones, not an addition (L3-006).
2. **Four places where UI text becomes persisted data**: the review-type suggestion list (stored verbatim in `session.reviewType` and emitted into the request), the pre-filled checkpoint text (becomes `checkpoint.md`), the event notes written to `events.jsonl`, and the request artifact itself (L3-009..L3-011).
3. **Raw enums are rendered as visible text** in six places (`HOT`/`WARM`/`COLD` in the badge, the resource segmented control, the review form and the suspend dialog; verdicts in a toast and in the previous-result line; event types in the history) — an extractor cannot see these, so they need explicit label lookups (L3-012).
4. **Ten rich-text messages** carry `<strong>`, `<code>` or `<kbd>` mid-sentence plus interpolated values (unreadable-review explanations, the two `projects.json` banners, the set-aside dialog, the suspend and capture dialog bodies, the next-round body, the suspended-from line) — plain string lookup is not enough (L3-013).
5. **Sentences assembled from fragments in JSX** (queue row "PR45 / R2", "from {state}", "· {n} reviews", the detail header, "Earlier results of R{n} kept: …", the unreadable-review heading) break in Japanese word order and must become single parameterised messages (L3-014).
6. **`describeHealthProblem` returns a sentence fragment** that is spliced into three different grammatical contexts; it has to become a structured problem (code + parameters) the UI renders (L3-015).
7. **Pluralisation by string surgery** in three places (`project${n===1?"":"s"}`, "reviews", "line(s)") needs a real rule for English and none for Japanese (L3-016).
8. Punctuation that is effectively a locale setting: `—` placeholders, `…`, `·`, `→`, `∅`, typographic quotes and the `": "` joiner in the resource tooltip.
9. Must stay literal: persisted enum values (also used as CSS class fragments and `data-state`), schema field names, file names, error codes, Tauri command names, product and tool names, the IDE suggestion list, and every `data-testid`.
