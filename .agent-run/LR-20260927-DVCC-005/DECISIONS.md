# Decisions — LR-20260927-DVCC-005 (Phase 4a IDE Handoff)

## Human Decisions (binding, recorded here for the run; canonical text is the conversation record)

- HD-P4-01 (2026-09-27): external Obsidian Vault read-only discovery authorized.
- HD-P4-02 (2026-09-27): Phase 4 split into 4a (IDE Handoff) and 4b (Session Discovery / Resume).
- HD-P4-03 (2026-09-27): actual IDE/process launching deferred out of Phase 4a.
- HD-P4-04 (2026-09-27): terminal embedding prohibited in Phase 4a.
- Final Human decision (2026-09-27, in response to the "IDE launch boundary" discovery question):
  Phase 4a is **handoff-artifact-only**. No process launch, no console, no terminal, no session
  discovery, no session resume. This supersedes the narrower HD-P4-03 reading that would have left an
  IDE-launch capability in 4a; the Human chose the more conservative option to avoid the unresolved
  question of whether a bare `CreateProcess` (no shell) launch of an interactive CLI tool satisfies
  the "no shell" invariant.

## Orchestrator decisions (this run, not dictated by the Task Packet)

- D-4A-001 — Reuse existing i18n keys wherever the existing label already matches the Task Packet's
  text-contract intent, instead of declaring new ones: `project.form.projectId`, `detail.field.repository`,
  `detail.field.reviewType`, `detail.field.pr`, `detail.field.round`, `detail.field.reviewState`,
  `detail.field.expectedHead`, `detail.field.reviewedHead`, `detail.value.round`,
  `detail.value.unrecorded`, `workflow.handoff.nextAction`, `detail.card.checkpoint`. Only 9 new keys
  were added (`ideHandoff.card.title`, `.card.description`, `.action.copy`, `.heading`, `.field.project`,
  `.boundary.heading`, `.boundary.body`, `toast.ideHandoffCopied`, `toast.ideHandoffCopyFailed`).
  Reason: `token-economy` / "existing DevVault contractsを重複再定義せずreferenceする" (Vault D-005).
- D-4A-002 — Deterministic missing-value rule (Task Packet §6 "choose one rule and test it"): every
  optional fact always renders its own `label\nvalue` block; a missing fact renders the localized
  `detail.value.unrecorded` placeholder in the value position. No line is ever omitted, so the shape
  of the text never depends on which facts are present. Verified by domain test H.
  - This includes `reviewSessionId`: the Task Packet said "only if useful for traceability" — the
    Orchestrator's call is that DVCC already surfaces the id elsewhere (`data-review-id`) and it adds
    no fact the Human cannot already see, so it was **not** included in the visible text, keeping the
    contract to the Task Packet §8 template exactly. It is still present on `IdeHandoff` itself for
    any future caller that needs it.
- D-4A-003 — Checkpoint existence is read from `ReviewArtifacts.checkpoint` (already loaded by
  `loadReviewArtifacts` and passed down as `artifacts` to `ReviewDetail`) as `artifacts?.checkpoint != null`.
  No new storage read was added.
- D-4A-004 — `ReviewIdeHandoff.tsx` is a sibling of `ReviewHandoff.tsx`, not a change inside it, per
  Task Packet §4's explicit instruction; it owns its own "hide when Project is null" rule instead of
  `ReviewDetail` deciding it externally, matching how `ReviewHandoff` already owns its own null case.
- D-4A-005 — Availability-detection-before-launch (raised as an open question in the Phase 4a
  discovery turn) is moot: the Human's final decision removed IDE/process launch from 4a entirely, so
  there is no launch path to gate on availability.
- D-4A-006 — The running-app smoke (`scripts/verify-ide-handoff-ui.ps1`) is a new, separate script
  rather than an addition to `verify-review-workflow-ui.ps1`: Phase 4a is a distinct feature area with
  its own sentinel-heavy fixture, and the existing script's fixture is shared by the localization smoke
  (`fixtures/v1/valid/*` project/review counts are asserted elsewhere) and was not touched.
