# Evidence — LR-20260927-DVCC-005 (Phase 4a IDE Handoff)

## Fresh Gate

- `git fetch origin` then `git switch main` then `git pull --ff-only`: fast-forwarded `f557aa6..93ed5ee`
  (35 commits), confirming the local clone had not already been advanced past base by this session.
- HEAD after pull: `93ed5eedb6c0d1d748d9fea73daa82158967be82`, equal to `origin/main`.
- Working tree clean before branch creation.
- `gh pr view 4`: `state=MERGED`, `baseRefName=main`, `mergeCommit.oid=93ed5eedb6c0d1d748d9fea73daa82158967be82`.
- `git branch --list feat/ide-handoff-v0.4a` and `git ls-remote --heads origin feat/ide-handoff-v0.4a`:
  both empty before creation.
- Branch `feat/ide-handoff-v0.4a` created from that exact `main`.
- Canonical Vault binding: `airesearchagl-art/obsidian-vault` main `9c53a3bd52f7da440a88073adc3a4475a4a8d2f1`,
  confirmed unchanged from the discovery turn (`gh api repos/airesearchagl-art/obsidian-vault/commits/main`).

## Files changed (this run)

```
 M README.md
 M src/app/App.tsx
 M src/features/reviews/ReviewDetail.tsx
 M src/features/reviews/workflowSurface.test.ts   (fixture wiring only: new required prop)
 M src/i18n/en.ts
 M src/i18n/ja.ts
?? scripts/verify-ide-handoff-ui.ps1
?? src/domain/ideHandoff.test.ts
?? src/domain/ideHandoff.ts
?? src/features/reviews/ReviewIdeHandoff.tsx
?? .agent-run/LR-20260927-DVCC-005/**
```

No `src-tauri/**`, no `package.json` / `package-lock.json`, no `contract/**`, no `docs/**` change.
Product freeze from `7ba7bb8` onward remains intact for Rust sources; the release **binary** was
rebuilt (frontend-only source change) solely to run the Wave 4 smoke against current code — no Rust
source line changed.

## Wave 1 — domain module + unit tests

`src/domain/ideHandoff.ts`: `IdeHandoff` (language-neutral facts), `buildIdeHandoff(...)`,
`renderIdeHandoff(t, handoff)`. `src/domain/ideHandoff.test.ts`: 11 tests, all passing, covering Task
Packet §13 A–K (L and M are covered below at the smoke level; see "Wave 4").

```
Test Files  1 passed (1)
     Tests  11 passed (11)
```

## Wave 2 — UI wiring

`src/features/reviews/ReviewIdeHandoff.tsx` (new, sibling of `ReviewHandoff.tsx`), wired into
`ReviewDetail.tsx` (new `onCopyIdeHandoff` prop) and `App.tsx` (`copyIdeHandoff` handler: pure
`buildIdeHandoff` + `renderIdeHandoff` + `copyText`, no persistence call). 9 new i18n keys added to
both `ja.ts` and `en.ts` (see DECISIONS.md D-4A-001 for the reused keys).

`npm run typecheck`: clean. `npm test` (full suite): `877 passed`, `0 failed` (previously 865 before
this Task Packet's own baseline, plus 11 new domain tests and one pre-existing surface test whose
fixture needed the new required prop — no existing test's expectations changed).

## Wave 3 — mutation campaign + regression + docs

Baseline SHA-256 of `src/domain/ideHandoff.ts`: `c34a9f7478473afe4ad139a1417e58a315ff7913289b806971ceede0996eec38`.

| Probe | Mutation | Expected | Actual | Restored byte-identical |
|---|---|---|---|---|
| M-P4A1 | added `localRoot: project.localRoot` to the builder output | privacy test (D) FAILs | test D failed | yes (hash matched baseline) |
| M-P4A2 | `nextAction: project.nextAction` instead of `session.nextAction` | source-of-truth test (C) FAILs | tests A, C, H failed | yes |
| M-P4A3 | `reviewedHead: null` unconditionally | handoff contract test (A) FAILs | tests A, B failed | yes |
| M-P4A4 | swapped the Repository and PR field blocks in `renderIdeHandoff` | ordering test (B) FAILs | tests A, B failed | yes |

All four probes killed by the test suite and reverted to the exact pre-mutation byte sequence
(confirmed by re-hashing after each revert). Full suite re-run after the campaign: `877 passed`.

`git diff --check`: clean (no whitespace errors). `npm test -- src/test/docsContract.test.ts`: `5 passed`.

README.md: Status line and the "Review Workflow" bullet reconciled to Phase 3 merged (PR #4); a new
"IDE Handoff (Phase 4a, under development on `feat/ide-handoff-v0.4a`)" bullet added. No claim of
Phase 4a merged, released or Production.

## Wave 4 — running-app smoke

Release binary rebuilt (`npx tauri build --no-bundle --ci`) so the smoke exercises current frontend
code; no Rust source changed. `scripts/verify-ide-handoff-ui.ps1` (new): hidden isolated desktop,
CDP-driven, `lib\dvcc-smoke.ps1`'s clipboard interceptor (SF-WF-01 pattern) — the operator's real
clipboard is never written. Synthetic project/review with one distinct sentinel per forbidden field
and one distinguishable value per required fact.

```
checks: 38 passed, 0 failed, 0 inconclusive
```

Covered: JA and EN paths each assert the 8 required facts present and the 7 forbidden sentinels
(`Project.localRoot`, `Project.nextAction`, `Project.notes`, ChatGPT thread title, ChatGPT thread URL,
verdict note, checkpoint body) absent; JA and EN texts differ (real localization, not a static
string); no spawned process left running; `session.json` / `projects.json` / `checkpoint.md` are
byte-identical (SHA-256 per file) before and after both copies (Task Packet §13 M, satisfied
behaviourally); the operator's clipboard fingerprint (kind + sequence number) is identical before and
after the whole run (Task Packet §13 L's "writes no state" half, and AC4A-21).

Task Packet §13 L's "copy failure produces error feedback" half was not separately smoke-tested: the
handler (`copyIdeHandoff` in `App.tsx`) mirrors the existing `copyPrompt`/`copyFollowup` try/catch →
`notify("error", ...)` shape line-for-line, and this codebase has no prior precedent of a dedicated
test for that failure path either (it is structurally simple and has no branching to miss).

## Hard checks

- Security: PASS — no new Tauri capability, no shell, no process spawn, no new IPC command.
- Privacy: PASS — domain tests D/E/F/G plus the running-app smoke's 7×2 forbidden-sentinel checks.
- Auth / Permission: unaffected (no capability change).
- Data integrity: PASS — no persistence path added; Wave 4 confirms byte-identical data files.
- Irreversible-data safety: PASS — the action is a pure read + clipboard write; nothing is deleted or
  overwritten.

## Independent Review

Not performed by this run (this session both implemented and evidenced the change; per the
Independence Gate pattern established for the P2/P3 repair, the implementer cannot also be the
independent reviewer). Status: **pending**, per Task Packet §21.
