# Task Queue — LR-20260920-DVCC-003

Legend: [ ] pending · [~] in progress · [x] done · [!] blocked

## Wave 0 — preflight and design

- [x] Fresh preflight (origin/main 318e273 with PR #2 merged, clean tree, toolchain)
- [x] Branch `feat/localization-foundation-v0.2.1` from `origin/main`
- [x] Task Packet revision 1 + SHA-256 binding
- [x] Storage contract reviewed for a `settings` target
- [x] UI string inventory (delegated, read-only) - about 390 strings across 18 files
- [x] Localization architecture and persistence design recorded in DECISIONS.md (L3-001..L3-017)
- [x] Wave 0 checkpoint (commit + push) — `050dc78`

## Wave 1 — i18n core

- [x] `src/i18n/`: `locale.ts`, `types.ts`, `ja.ts`, `en.ts`, `index.ts`
- [x] Typed dictionary so a missing key fails to compile
- [x] Language selector (native names, always reachable), `document.documentElement.lang`
- [x] `settings.json` persistence (new `settings` storage target, missing → ja, invalid → ja + warning)
- [x] Parity / blank / duplicate-key tests
- [x] Targeted checks → checkpoint

## Wave 1.5 — persistence hardening (Human request, before Wave 2)

- [x] `settings.json` is only accepted at `schemaVersion === 1` (missing, mistyped, `0` and future versions are invalid → Japanese, warning, file untouched)
- [x] A failed save takes the interface back to the stored language and says so, in the user's language
- [x] Preference writes are serialized per backend, so rapid switching cannot land out of order
- [x] Targeted checks + mutation probes → checkpoint

## Wave 2 — Phase 1 UI migration

- [x] App shell, queue, project and review forms, dialogs, toasts, banners, recovery and validation text
- [x] Review State / Resource State labels and hints
- [x] Domain and service messages become named messages the interface renders (`src/domain/message.ts`)
- [x] Targeted checks → checkpoint

## Wave 3 — Phase 2 UI migration

- [x] Git evidence card, Freshness badges, explanations, queue badge, Git status labels
- [x] Targeted checks → checkpoint

## Wave 4 — prompt, formatting, audit

- [x] Review request generated in the current locale (JA / EN), data identical
- [x] Timestamp formatting per locale; accessibility labels
- [x] Hard-coded user-facing text audit + documented rule + static test
- [x] README / data contract updates
- [x] Targeted checks → checkpoint

## Wave 5 — verification

- [x] Isolated-desktop UI smoke: Japanese default, switch to English, restart persistence, switch back
- [x] Locale switch leaves domain state and recorded values identical
- [x] JA / EN review request verified from the written artifact (clipboard saved and put back)
- [x] Phase 1 / Phase 2 regression
- [x] Checkpoint

## Focused Repair — RF-L10N-01..04 (after the Final Independent FULL Review of PR #3)

- [x] RF-L10N-01 a preference file this version cannot understand is never replaced (P2-1)
- [x] RF-L10N-02 schema and recovery text the Human reads is localized (P2-2)
- [x] RF-L10N-03 which choice decides is request identity, not the language value (P3-1)
- [x] RF-L10N-04 the UI smoke only takes a clipboard it can put back (P3-2)
- [ ] Full verification at the repaired head (release build + UI smoke)
- [ ] Checkpoint

## Final

- [x] Final Convergence (freeze, full diff review, Required Checks, Hard Checks, Quality Debt, unverified items)
- [ ] Independent Verification (separate context)
- [x] Draft PR → STOP — PR #3 (Draft)
