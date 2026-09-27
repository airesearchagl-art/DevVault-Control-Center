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

## Independent Review (2026-09-28)

Performed, by a separate context from the one that implemented Wave 0–4 (Independence Gate).

**Result: NOT READY.**

Required Fixes:

- **P3-01** — Task Packet §13-L ("copy failure produces error feedback and writes no state") was
  claimed in this file's Wave 4 section above but not separately evidenced by an executable test that
  exercises the real App/UI handler path; only the render path (`renderIdeHandoff`) was covered by the
  Wave 1 domain tests.
- **P3-02** — `RUN_STATE.md`'s "Next" section was stale: it described commit and push as happening
  *after* the Independent Review, when both had already happened before this review ran.

This NOT READY result is preserved here as historical fact; it is not rewritten by the repair below.

## P3-01/P3-02 Focused Repair (2026-09-28)

### P3-01 — source finding

`src/app/App.tsx`'s `copyIdeHandoff` (the Human's click handler) was an inline closure over component
state, `t`, `notify` and the imported `copyText` — not independently callable or mockable without
rendering the full app, which this codebase's test setup (`environment: "node"`, no jsdom, no
`@testing-library/react`) cannot do, and Task Packet §5 forbids adding (`package.json` unchanged).

### New test

- File: `src/app/ideHandoffAction.test.ts` (new)
- New product file: `src/app/ideHandoffAction.ts` (new) — `copyIdeHandoffAction(project, session,
  hasCheckpoint, t, copy, notify)`, the exact logic `copyIdeHandoff` runs, factored out with `copy` and
  `notify` as its only side-effecting parameters (no storage/hub/dispatch reference at all). This is
  the "small dependency seam" Task Packet §2 anticipated; `App.tsx`'s `copyIdeHandoff` is now a
  one-line wrapper passing the real `copyText`/`notify`, so production behavior is unchanged
  byte-for-byte (verified: full regression suite green before and after the extraction, see below).
- Test 1, "on copy failure": `copy` rejects with `new Error("clipboard write failed")`. Asserts:
  - error feedback: exactly one `notify` call, `["error", "Copying the IDE handoff failed: clipboard
    write failed"]` (the exact `toast.ideHandoffCopyFailed` contract, with the clipboard error detail)
  - success feedback absent: no `notify` call with kind `"info"`
  - state unchanged: `Project` and `ReviewSession` passed in are `toEqual` a `structuredClone` taken
    before the call (the "reducer/domain state before/after identical" evidence form)
  - persistence/event writes: not separately mocked, because `copyIdeHandoffAction`'s parameter list
    contains no storage, hub or dispatch reference — `copy` and `notify` are its entire side-effecting
    surface, both observed above. A version of this function that tried to reach storage would need a
    reference this test never supplies; there is nothing else in scope for it to call. (A sanity check
    — temporarily changing the failure branch's `notify("error", ...)` to `notify("info", ...)` — was
    run and confirmed the test fails, then the file was reverted and its SHA-256 confirmed
    byte-identical to before the check.)
  - result: **PASS**
- Test 2, "on copy success" (added for contrast, not required by P3-01): asserts exactly one
  `notify("info", "Copied the IDE handoff to the clipboard")` call, no `"error"` call, and that `copy`
  received exactly `renderIdeHandoff(t, buildIdeHandoff(project, session, round, hasCheckpoint))`.
  Result: **PASS**.

```
Test Files  1 passed (1)
     Tests  2 passed (2)
```

### Full verification after the repair

```
npm run typecheck   -> clean
npm test             -> Test Files  33 passed (33) / Tests  879 passed (879)
git diff --check     -> clean
```

(877 from Wave 4 + 2 new `ideHandoffAction.test.ts` tests = 879.)

### Product behavior changed?

**NO.** `src/app/App.tsx`'s only change is replacing the inline closure body of `copyIdeHandoff` with
a call to the extracted `copyIdeHandoffAction`, passing the exact same `project`, `session`,
`hasCheckpoint`, `t`, `copyText` and `notify` it always used. The full regression suite (879/879) and
`docsContract`/`i18n`/`noHardCodedText` tests all pass unchanged. `src/domain/ideHandoff.ts` was not
touched, so the Wave 3 mutation-probe evidence (M-P4A1..4) remains valid and was not re-run.
`src-tauri/**`, `package.json`, `scripts/verify-ide-handoff-ui.ps1`, the clipboard interceptor, the
launcher, the schema and the persistence contract are all unchanged; no running-app smoke re-run was
performed (none is required, since nothing the smoke exercises changed).

### P3-02 reconciliation

`RUN_STATE.md`'s "Next" section is rewritten to say a Focused Independent Delta Re-review comes next,
that a Draft PR follows only if that returns READY CANDIDATE with no Required Fix, and that commit and
push for this repair happen before, not after, that re-review. The stale wording is removed; the
Wave 4 sections above remain as historical record.

## Independent Delta Re-review

**Pending.** Not performed by this run: the implementer of this repair cannot also be its independent
reviewer (Independence Gate, same pattern as the earlier P2/P3 cycle).
