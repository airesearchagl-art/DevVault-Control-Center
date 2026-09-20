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

## Wave 1 — i18n core, persistence and the language switch (2026-09-20)

- `src/i18n/`: `locale.ts` (ja / en, Japanese default, native names), `ja.ts` (the key set, covering Phase 1 and Phase 2), `en.ts` (typed as a full record of that set, so a missing or unknown key is a compile error), `types.ts`, `index.ts` (translator with `{placeholder}` substitution and a `_one` plural variant, `formatParts` for rich messages, label-key maps for every persisted enum, locale-aware timestamp), `context.ts` (React context, `useT`).
- `src/components/LanguageSelector.tsx`: always in the top bar, options written in their own language.
- Persistence: a new `settings` storage target in Rust (`<data root>/settings.json`) mirrored in the TypeScript port and the in-memory test double; `src/services/settings.ts` loads and saves the preference only. Missing file means Japanese; unreadable or invalid means Japanese, a warning, and the file is left exactly as it was.
- `App.tsx` reads the preference once at start-up, provides the context, mirrors the locale into `document.documentElement.lang`, and saves on change without touching any other state.

Tests (24 new): locale set and default; parity of the key sets; no blank values; no duplicate key in either source file; identical placeholders in both languages; every key actually translated except a named list of shared technical terms; a plural variant present in both dictionaries; a label key for every persisted enum value; parameter substitution; the English singular variant; `formatParts` in both word orders; locale-aware timestamps. Settings: fresh install, round trip, five kinds of unusable content, an unreadable file, and proof that no other file is read or written.

Checks at this checkpoint: `npx tsc --noEmit` PASS, `npx vitest run` PASS (18 files, **524 tests**), `npm run build` PASS, `cargo fmt --check` PASS, `cargo clippy --all-targets` PASS (0 warnings), `cargo test` PASS (68 passed, 2 ignored).

Note: `npx prettier --write` was run once by mistake on `src/app/App.tsx` (this repository does not use Prettier); the file was restored from Git and the wiring re-applied, so its diff contains only the intended 48 added lines.

## Wave 1.5 — persistence hardening (2026-09-20)

Asked for by the Human after the Wave 1 checkpoint, before any UI migration. Three defects in the Wave 1 persistence path, all in `src/services/settings.ts` and the language wiring in `src/app/App.tsx`.

1. **Schema version was accepted without being checked.** `parseSettings` read `locale` whatever `schemaVersion` said. It now requires exactly `1`; a missing version, a version of the wrong type, `0` and any later version all make the file invalid, which means Japanese, the existing warning, and the file left exactly as it was — loading still writes nothing, so a file belonging to a later version is not destroyed by this one.
2. **A failed save was swallowed after the interface had already changed.** The switch is now backed by a `LocaleStore` that reports what is actually stored: the interface follows the choice immediately, and if the write fails it goes back to the stored language and shows `notice.settingsSaveFailed` in that language. A failure whose choice has already been superseded by a newer one does not pull the interface back (the newer choice owns it). The restart requirement is unaffected: what the interface shows after a switch settles is what the file holds.
3. **Overlapping writes could land out of order.** Preference writes now go through one serial queue per storage backend, inside `saveLocale`, so every caller is covered. Rapid switching ends with the last chosen language both on screen and in the file.

Tests (10 new, 534 total): four more unusable-file cases (missing, mistyped, `0` and future schema version) with the file byte-identical afterwards; `parseSettings` version rules; a successful save reporting the stored language; a failed write keeping the stored language, the `WRITE_FAILED` code, and every file in the folder unchanged; an older failed write not pulling the interface back over a newer choice; four rapid switches with descending write durations landing in the order they were chosen; the same for `saveLocale` called directly; and no file but `settings.json` written across a mixed success/failure burst.

Mutation probes (each reverted immediately afterwards):

| Mutation | Result |
| --- | --- |
| `saveLocale` writes without the queue | 2 failures — writes landed `ja, en, ja, en` for choices `en, ja, en, ja` |
| the `schemaVersion === 1` guard removed | 5 failures — all four new file cases plus the `parseSettings` rules |
| a failed save reports the requested locale instead of the stored one | 1 failure — rollback target `ja` instead of `en` |

Checks at this checkpoint: `npx tsc --noEmit` PASS, `npx vitest run` PASS (18 files, **534 tests**), `npm run build` PASS. `src-tauri/` is byte-unchanged in this wave; the Rust checks were re-run anyway (see RUN_STATE).

Hard boundary held: no Project, Review or GitObservation code touched; the only file written on a language switch is `settings.json` (asserted by test); no dependency added; no Wave 2 UI migration started.

## Wave 2 — Phase 1 UI migration (2026-09-20)

Two commits: the components first, then the text that is produced outside React.

**Components** (`8bd82d4`). Every rendered surface reads its words from the dictionaries: app shell, queue, project and review forms, all five dialogs, the review detail pane, and the shared badge / banner / dialog components. The label maps left the domain (`REVIEW_STATE_LABELS`, `RESOURCE_STATE_LABELS`, `RESOURCE_STATE_HINTS`, `FRESHNESS_LABELS`, `GIT_STATUS_LABELS` are gone); `data-state`, the CSS class fragments and all 74 `data-testid` attributes keep the stored enum, so nothing that identifies an element moved. Sentences that were assembled in JSX became single parameterised messages, ten rich messages go through `formatParts`, two pluralisation hacks became `_one` variants, and timestamps are formatted through the translator.

**Messages from the layers that have no context** (this checkpoint). `src/domain/message.ts` introduces `Message` — a typed key plus parameters, with optional nested messages — and `translate(t, message)` renders it. Converted: 12 validation rules, 7 project and 5 review field errors, 21 transition guards and action checks, 9 service failures, the three file-health problems, the event-append warning, and the two recovery notices. `FieldErrors`, `Result`'s default error, `QueueSource.problem`, `SaveOutcome.warning` and the dialog submit callbacks all carry `Message` now; `Field` and `FormError` are the only two places that turn one into words, so neither form needed a translation call. 51 new keys in both dictionaries.

Deliberately left literal (L3-023): schema parse reasons, storage error codes and messages, the action type inside a guard message, event notes and file names — all shown as detail inside a localized sentence.

Still English, by wave: the Freshness explanation sentences (`src/domain/freshness.ts`, Wave 3) and the review request template (`src/domain/prompt.ts`, Wave 4).

Checks at this checkpoint: `npx tsc --noEmit` PASS, `npx vitest run` PASS (18 files, **534 tests**), `npm run build` PASS. `src-tauri/` unchanged in this wave. A grep of `src/app`, `src/components` and `src/features` for JSX text and the usual text attributes finds no English literal left; the static gate that enforces this is Wave 4.

Test changes: assertions that printed a failed `Result` now stringify it (6 files), the queue fixture builds its problem as a message, the event-append warning is asserted by key, and the two recovery-notice assertions check the key and the quarantined file name parameter instead of an English sentence.

## Wave 3 — Phase 2 UI migration (2026-09-20)

The Git evidence card, the Git status labels and the Freshness badges moved with their file in Wave 2; what was left is the part the domain produces.

- `deriveFreshness` returns its explanation as a `Message`. All thirteen sentences are named keys; the two that carry values (`reviewStale`, `headChanged`) pass both short HEADs as parameters, so the same two SHAs read correctly in either word order.
- A Git error that came back with a reason keeps the reason exactly as Git reported it, inside a localized frame. A malformed observation no longer invents an English sentence: `asGitObservation` leaves `errorMessage` unset and the explanation is chosen from `errorCode`, which is the part that carries the meaning.
- The queue badge and the detail pane render the explanation through `translate`.

The freshness contract test now asserts the key and the parameters — the oracle table stays independent of the wording — and additionally renders the two difference sentences in both languages to show the same two SHAs land in each.

Checks: `npx tsc --noEmit` PASS, `npx vitest run` PASS (18 files, 534 tests), `npm run build` PASS. `src-tauri/` unchanged.

## Wave 4 — review request, the gate against new English, documentation (2026-09-20)

- **Review request per language.** `buildReviewRequest(project, session, locale)` builds one set of facts and renders them in Japanese or English; the locale travels from the language selector through `ReviewHub.saveRequest` to the file. Both versions carry the same values in the same order — asserted by a test that compares the interpolated values and the line count of the two renderings — and the Japanese version replaces the mixed English/Japanese template that existed before. A saved request is never rewritten when the language changes (L3-006).
- **Timestamps and accessibility** moved with their components in Wave 2: the locale-aware formatter is the only one left, and every `aria-label` in the app is a translation.
- **Static gate** (`src/i18n/noHardCodedText.test.ts`, 12 cases): every `.tsx` under `src/app`, `src/components` and `src/features` is scanned for text written straight into JSX and for `placeholder` / `title` / `aria-label` / `label` / `hint` / `confirmLabel` / `reasonLabel` / `alt`. All eleven components pass with an allowlist of fourteen things that are not language (file names and fragments, `Ctrl`, `V`, punctuation and glyphs). The test also checks itself: three shapes it must catch, three it must not.
- **Mutation probe**: replacing the banner body with the literal `Something went wrong` fails the gate at `src/components/Banner.tsx` (1 failed / 11 passed); reverted immediately, 12 pass again.
- **Documentation**: README gains the bilingual interface in *What it does*, the no-translation-API boundary, `settings.json` under *Data location*, `i18n/` in the repository layout and a *Where words live* section stating the rule, the gates and what is deliberately not translated. `docs/data-contract-v1.md` gains `settings.json` in the layout and a section with its schema, its fail-safe behaviour, the neutrality rule and the serialized-write guarantee.

Checks: `npx tsc --noEmit` PASS, `npx vitest run` PASS (19 files, **549 tests**), `npm run build` PASS. `src-tauri/` unchanged.

## Wave 5 — isolated-desktop UI verification (2026-09-20)

Release build from `6d849f6` (`npm run tauri build -- --no-bundle`, SHA-256 `8582934a6265b5290addf6b83f4ed4ab5bb18c26efd6cc8d47d5b1a3a2d2c1e6`). The app ran on a hidden isolated desktop (`CreateDesktopW` + `CreateProcessW` with `lpDesktop`) against a dedicated `DVCC_DATA_DIR` seeded from `fixtures/v1/valid`, driven over the WebView2 debugging protocol. Nothing appeared on the operator's desktop and nothing outside the temporary data folder was written. Available memory was 12.17 GiB when the build started, above the 12 GiB gate.

**18 checks, 18 PASS**, in three runs of the same data folder:

| Part | Checks | Result |
|---|---|---|
| First start (fresh preference) | `document.documentElement.lang` is `ja`; the top bar reads `＋ プロジェクト`; **no `settings.json` is written** by a fresh install; the selected review's badge reads `レビュー中` while `data-state` stays `REVIEWING` | PASS (5) |
| Switch to English | the same review reads `Reviewing` with `data-state` still `REVIEWING`; the selected review is still `rv-20260102-beta01`; `settings.json` becomes `{"schemaVersion":1,"locale":"en"}`; **all 7 project and review files are byte-identical** (SHA-256 before and after the switch) | PASS (4) |
| Restart and the request | after a restart the interface comes up in English (`lang=en`, `+ Project`); **Copy review prompt** writes `request-r1.md` beginning `# Independent Review Request — Project Beta / R1`; switching back to Japanese and copying again writes `# 独立レビュー依頼 — Project Beta / R1`; both carry the same PR fact (`#12`); `settings.json` becomes `ja`; a third start comes up Japanese with 2 reviews and 3 projects intact | PASS (9) |

The clipboard was read before the two **Copy review prompt** clicks and put back afterwards (it is the only action that writes it). No `devvault-control-center` process was left behind, and none of the 55 `msedgewebview2` processes on the machine belonged to this run (checked by command line) — none were touched. The operator's own data folder `%APPDATA%\DevVault-Control` still shows its pre-run timestamp (17:06:50). The temporary data folder was removed afterwards.

AC coverage from this run: L10N-01 (Japanese default), L10N-02 (switch), L10N-03 (immediate), L10N-04 (persisted across restart), L10N-10 (no state change on switch), L10N-11 (recorded values unchanged), L10N-13 (request in the language in use), L10N-16 (Phase 1 / Phase 2 still work).

## Final convergence checks (frozen head `6d849f6`)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 19 files, 549 tests |
| `npm run build` | PASS |
| `npm run tauri build -- --no-bundle` | PASS — no bundle directory |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets` | PASS — 0 warnings |
| `cargo test` | PASS — 68 passed, 2 ignored |
| Isolated-desktop localization UI smoke | PASS — 18 / 18 |
| Windows app launch smoke / persistence round trip (project instruction checks) | PASS — part of the UI smoke above (three launches, restart, restore) |

GitHub Actions CI: none in this repository; no CI result is claimed.

Diff versus `origin/main` (`318e273`): 59 files, +3 648 / −576; excluding run artifacts, 52 files, +2 940 / −576. No dependency added, no capability change, no `tauri.conf.json` change. `src-tauri/` changed only in Wave 1 (the `settings` storage target).
