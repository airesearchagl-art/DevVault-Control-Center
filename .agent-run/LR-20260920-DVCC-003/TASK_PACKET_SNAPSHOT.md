# Long-Run Task Packet — LRP-20260920-DVCC-003 (revision 1)

> Template: obsidian-vault `03_Templates/Long_Run_Task_Packet.md` (origin/main, blob d655e1a540eb7f53b6cea0df0603aa62bdead161)
> Route: obsidian-vault `02_Prompts/LLM_IDE/Long_Run_Development_Route.md` (origin/main, blob 0e7df41d08f956304f185d0a7cc4eded62d1767e)
> This file is the exact completed instance of revision 1 for run `LR-20260920-DVCC-003`, derived from the Human message
> "DevVault Control Center — Localization Foundation v0.2.1 / LONG_RUN Implementation" (2026-09-20).
> IMMUTABLE: do not edit. The SHA-256 digest of this file's bytes is recorded in `RUN_MANIFEST.md`, `RUN_STATE.md`, `EVIDENCE.md` and `DECISIONS.md`.

## 1. Campaign identity

```yaml
run_id: LR-20260920-DVCC-003
task_packet_id: LRP-20260920-DVCC-003
task_packet_revision: 1
execution_mode: LONG_RUN
horizon: 8H
human_explicit_long_run_authorization: true
human_explicit_long_run_authorization_source: >-
  Human message "DevVault Control Center — Localization Foundation v0.2.1 / LONG_RUN Implementation" (2026-09-20):
  implementation through verification, independent review and Draft PR is to run as one Long-Run campaign.
human_explicit_endurance_authorization: false
endurance: NOT AUTHORIZED
project: DevVault Control Center (DVCC)
target: Localization Foundation v0.2.1
repository: airesearchagl-art/DevVault-Control-Center
local_root: the working copy of this repository on the operator's machine
final_output: DRAFT_PR
```

## 2. Repository state

```yaml
base_branch: main
base_sha: 318e273a1afe66c605da897a4f7603aaa921fc83
base_subject: "Merge pull request #2 from airesearchagl-art/feat/evidence-freshness-v0.2"
merged_phases: "Phase 1 Review Hub (PR #1), Phase 2 Evidence / Freshness (PR #2, merged 2026-09-20T12:11:09Z)"
working_branch: feat/localization-foundation-v0.2.1
branch_created_from: origin/main @ 318e273a1afe66c605da897a4f7603aaa921fc83
run_artifact_path: .agent-run/LR-20260920-DVCC-003/
previous_run_artifacts_immutable: .agent-run/LR-20260917-DVCC-001/, .agent-run/LR-20260920-DVCC-002/
preflight_working_tree: clean (0 tracked changes, 0 untracked files)
preflight_toolchain: node v24.15.0, npm 11.12.1, rustc 1.95.0, git 2.53.0.windows.2
branch_discipline: >-
  `git branch --show-current` is re-checked immediately before every commit; a commit is made only on
  feat/localization-foundation-v0.2.1 (Phase 2 produced commits on local main by accident).
```

## 3. Objective

Make the whole Phase 1 + Phase 2 user interface available in **Japanese and English**, with Japanese as the default, a switch the Human can use at any time, and the choice kept across restarts. This is a standing Product requirement, not an enhancement: from here on every user-facing feature ships in both languages in the same PR, and a missing translation is a Required Fix.

Internal state stays language-neutral: persisted enum values, schema field names, event types, file names and error codes do not change.

## 4. Scope

### 4.1 Required

```yaml
architecture:
  - small typed localization layer under src/i18n/ (locale.ts, types.ts, en.ts, ja.ts, index.ts, tests)
  - Locale = "ja" | "en"
  - user-facing components read text through translation keys, never literals
  - stable identifier keys (app.language.japanese, review.actions.start, freshness.aligned, …);
    never an English sentence as a key, never an internal enum value as display text
default_and_switch:
  - no stored preference -> "ja" (also for an upgraded install)
  - no OS language negotiation in v0.2.1
  - language selector in a permanently reachable place, native names (日本語 / English)
  - switching applies immediately, performs no I/O beyond saving the preference, and refreshes nothing
persistence:
  - <data root>/settings.json, e.g. {"schemaVersion": 1, "locale": "ja"}
  - reuses the existing atomic-write / recovery thinking but stays separate from project / review data
  - missing -> ja; invalid -> ja plus a visible warning, and no project / review data is touched
coverage:
  - every Phase 1 and Phase 2 user-facing surface: app shell, headers, buttons, forms, labels, hints,
    placeholders, dialog titles and confirmation text, checkbox labels, toasts, banners, recovery and
    validation messages, state / resource / freshness labels and explanations, Git evidence labels,
    queue, empty states, tooltips, accessibility labels, error presentation
  - product name "DevVault Control Center" is not translated
review_prompt:
  - request-r<N>.md is generated in the current locale (ja -> Japanese request, en -> English)
  - data (repository, PR, HEAD, project name, review type) is identical in both
  - changing locale never rewrites an existing artifact; only a new Copy review prompt uses the new locale
never_translated:
  - persisted Review State / Resource State / Freshness values, event types, schema fields, file names,
    error codes
  - Human content: display names, notes, next action, thread title, captured result, checkpoint,
    verdict note, repository URL, local path, branch, HEAD, Human-supplied event data
formatting_and_accessibility:
  - timestamps displayed per locale, persisted as ISO-8601 UTC
  - aria-label / title / dialog accessible text localized
  - document.documentElement.lang follows the locale
gates:
  - JA / EN translation parity test: missing, extra, blank or duplicated key fails
  - typed dictionaries so the compiler catches a missing key as well
  - a practical guard against new hard-coded user-facing text (documented rule + parity test +
    a small static test; no huge false-positive scanner)
state_safety:
  - a locale change must not alter project state, review state, resource state, freshness facts,
    recorded HEADs, the Git observation or artifacts; only the preference changes
```

### 4.2 Explicit non-goals

External translation APIs or LLM translation (resources live in the repository), OS language negotiation, network access of any kind, Phase 3 review workflow, changes to the Phase 2 Quality Debt items, and adding a GitHub Actions workflow.

## 5. Hard Boundary

```yaml
prohibited:
  - main direct commit (branch re-checked before every commit)
  - ready_for_review, merge, release, production
  - force push, branch delete
  - new network dependency, remote translation, dynamic code execution
  - credential access, permission escalation, arbitrary file paths outside the data root
  - Notion write, obsidian-vault write
  - adding a GitHub Actions workflow
  - modifying .agent-run/LR-20260917-DVCC-001/ or .agent-run/LR-20260920-DVCC-002/
  - "fixing" Phase 2 QD-001 / QD-002 inside this campaign
failure_policy:
  security_privacy_permission_data_integrity_irreversible: immediate BLOCKED, never Quality Debt
```

## 6. Required checks

```yaml
frontend: [tsc --noEmit, vitest, vite build]
rust: [cargo fmt --check, cargo clippy --all-targets, cargo check, cargo test]
tauri: [npm run tauri build -- --no-bundle]
localization:
  - translation key parity (missing / extra / blank / duplicate)
  - locale persistence (missing, invalid, round trip)
  - locale switch does not mutate domain state
  - review prompt in Japanese and in English
ui_smoke_isolated_desktop:
  - Japanese on a fresh data folder
  - switch to English applies immediately across queue, detail, dialogs, freshness
  - restart keeps English; switching back to Japanese survives a restart
  - review state, resource state, freshness and recorded HEADs unchanged by a switch
regression:
  - Phase 1 persistence / review workflow, Phase 2 freshness behaviour
hard_checks: [Security, Privacy, Permission, Data integrity, Irreversible-data safety]
```

## 7. Quality Debt

Non-hard items may be deferred with the route's YAML schema. Phase 2's QD-001 (detached reader threads after a timeout) and QD-002 (repository-configured filters executed by `git status`) are carried forward unchanged and are out of scope here. The Phase 2 final review's P3 test-hardening notes stay in the backlog and are not mixed into this PR.

## 8. Checkpoint / immutable contract binding

```yaml
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
task_packet_snapshot_path: .agent-run/LR-20260920-DVCC-003/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: recorded in RUN_MANIFEST.md / RUN_STATE.md / EVIDENCE.md / DECISIONS.md
digest_reverification: at every checkpoint and before the Draft PR
resume_policy: ENABLED
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
```

## 9. ENDURANCE settings

Not authorized.

## 10. Parallelism / roles, operator disturbance and resources

```yaml
orchestrator: plans, decides, writes and reviews the diff, writes the final summary
executor_subagents: read-only inventory / extraction only; no edits, no git writes, no network
operator_policy:
  - the Human uses the same Windows machine
  - UI verification runs on a hidden isolated desktop, background, non-interactive
  - no repeated foreground popups; no browser, Explorer, ChatGPT or GitHub page opened automatically
  - the Human's clipboard is protected: prompt localization is verified from the written artifact
    rather than by reading the clipboard where possible
  - heavy tasks run one at a time; available memory < 12 GiB -> checkpoint and SUSPEND
  - never kill an unrelated process
```

## 11. Wave plan

```yaml
wave_0: preflight; Task Packet + digest; UI string inventory; localization architecture; persistence design -> checkpoint
wave_1: i18n core, ja / en dictionaries, language selector, locale persistence, parity tests -> checkpoint
wave_2: Phase 1 UI migration (project, review, dialogs, states, errors) -> checkpoint
wave_3: Phase 2 UI migration (freshness, Git evidence, explanations, queue) -> checkpoint
wave_4: review prompt localization, timestamps, accessibility, hard-coded text audit, regression -> checkpoint
wave_5: isolated-desktop UI smoke (Japanese default, switch, restart persistence, JA/EN prompt, state non-mutation)
final: Final Convergence -> Independent Verification -> Draft PR -> STOP
```

## 12. Failure policy

```yaml
hard_check_failure: BLOCKED, stop, escalate (never Quality Debt)
scope_change_required: stop and ask
product_side_verification_failure: BLOCKED (no retry loop into PASS)
resource_gate: available memory < 12 GiB before heavy verification -> checkpoint + SUSPENDED
loop_limits: same-hypothesis retry 2, repair strategies 3, no-progress waves 2
```

## 13. Resume contract

Resume verifies `RUN_MANIFEST.md`, re-hashes this snapshot, checks repository / branch / base / head / clean tree, then continues from `RUN_STATE.md` "Next action". Any mismatch → BLOCKED.

## 14. Final convergence

```yaml
sequence: [feature freeze, freeze head, full diff review, all Required Checks, Hard Checks,
           Quality Debt review, explicit unverified items, Independent Verification,
           final checkpoint, Draft PR, STOP]
independent_verification_focus:
  - untranslated user-facing text anywhere in Phase 1 or Phase 2 surfaces
  - missing / extra / blank keys and the parity gate's real strength
  - Japanese naturalness for a development-management tool; English regression
  - settings.json missing / invalid recovery, and that it never touches project or review data
  - locale switch leaves every domain value identical
  - review prompt in both languages, with identical data
  - old runtime data still loads unchanged
  - locale survives a restart
  - hard-coded user-facing strings left behind
```

## 15. PR / Git policy

```yaml
working_branch: feat/localization-foundation-v0.2.1
branch_check_before_every_commit: required
wave_checkpoint_commit: allowed
wave_checkpoint_push: allowed
final_output: Draft PR (allowed)
main_direct_commit: PROHIBITED
ready_for_review: PROHIBITED
merge: PROHIBITED
branch_delete: PROHIBITED
force_push: PROHIBITED
release: PROHIBITED
production: PROHIBITED
github_actions_workflow_addition: PROHIBITED (separate Human decision)
github_ci_status: none exists; never report a GitHub CI result as PASS
```

## 16. Documentation Sync

```yaml
documentation_sync_trigger: yes
standing_authorization: no
notion_write: PROHIBITED
obsidian_vault_write: PROHIBITED
repository_docs: README and docs/data-contract-v1.md state the supported locales, the Japanese
  default, the switch, locale persistence, the parity rule and the neutrality of internal enums
delivery: canonical facts are returned in the Completion Report only
```

## 17. Acceptance criteria and completion report contract

```yaml
acceptance_criteria:
  L10N-01: feature branch created from the freshly merged main
  L10N-02: a fresh install with no setting shows Japanese
  L10N-03: English can be selected and applies immediately
  L10N-04: the chosen locale survives a restart
  L10N-05: Japanese can be selected again
  L10N-06: every Phase 1 user-facing surface exists in JA and EN
  L10N-07: every Phase 2 user-facing surface exists in JA and EN
  L10N-08: internal state / resource / freshness values are unchanged
  L10N-09: JA / EN key parity is enforced by a test
  L10N-10: a missing translation fails a Required Check
  L10N-11: the review request is generated in Japanese and in English
  L10N-12: existing runtime data still loads unchanged
  L10N-13: a locale switch does not change any domain state
  L10N-14: document language matches the locale
  L10N-15: no external translation API and no network use
  L10N-16: UI smoke touches no real user data and does not disturb the operator's clipboard
  L10N-17: no Phase 1 / Phase 2 regression
completion_report_contract: >-
  As specified by the Human in §42: Run ID; Task Packet / digest; Final state; Base; Branch; Head;
  Draft PR; Localization architecture; Coverage; Persistence; Parity Gate; Review Prompt; Checks;
  Hard Checks; Independent Verification; Quality Debt; Explicit unverified; Operator disturbance;
  GitHub CI none; Documentation Sync Trigger yes; Canonical facts; Phase 3 Gate; STOP.
```
