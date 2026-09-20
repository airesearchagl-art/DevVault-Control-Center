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

- [ ] Isolated-desktop UI smoke: Japanese default, switch to English, restart persistence, switch back
- [ ] Locale switch leaves domain state and recorded values identical
- [ ] JA / EN review request verified from the written artifact (clipboard untouched where possible)
- [ ] Phase 1 / Phase 2 regression
- [ ] Checkpoint

## Final

- [ ] Final Convergence (freeze, full diff review, Required Checks, Hard Checks, Quality Debt, unverified items)
- [ ] Independent Verification (separate context)
- [ ] Draft PR → STOP
