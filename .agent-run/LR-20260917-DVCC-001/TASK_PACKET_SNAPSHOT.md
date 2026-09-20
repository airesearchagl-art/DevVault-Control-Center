# Long-Run Task Packet — LRP-20260917-DVCC-001 (revision 1)

> Template: obsidian-vault `03_Templates/Long_Run_Task_Packet.md` (main, blob d655e1a540eb7f53b6cea0df0603aa62bdead161)
> Route: obsidian-vault `02_Prompts/LLM_IDE/Long_Run_Development_Route.md` (main, blob 0e7df41d08f956304f185d0a7cc4eded62d1767e)
> This file is the exact completed instance used for run `LR-20260917-DVCC-001`.
> IMMUTABLE: do not edit. Any change to Objective / Acceptance Criteria / Scope / Hard Boundary / Human authorization requires a Human-approved new revision with a new snapshot and digest.
> The SHA-256 digest of this file's bytes is recorded in `RUN_MANIFEST.md` and `RUN_STATE.md` (a file cannot embed its own digest).

## 1. Campaign identity

```yaml
run_id: LR-20260917-DVCC-001
task_packet_id: LRP-20260917-DVCC-001
task_packet_revision: 1
execution_mode: LONG_RUN
horizon: 8H
human_explicit_long_run_authorization: true
human_explicit_long_run_authorization_source: >-
  Human instruction in the current development thread (2026-09-17):
  「開発のペースとしては、小間切れで進めていくのではなくて、ある程度長時間の開発IDEが動き続けるような指示の出し方をしてください」;
  confirmed by the Human message "DevVault Control Center — Review Hub v0.1 LONG_RUN Implementation Authorization"
  approving the "Review Hub v0.1 Implementation Plan".
human_explicit_endurance_authorization: false
human_explicit_endurance_authorization_source: UNSET
```

LONG_RUN_ENDURANCE is NOT AUTHORIZED.

## 2. Repository state

```yaml
project: DevVault Control Center (DVCC)
repository: airesearchagl-art/DevVault-Control-Center
base_branch: main
base_sha: bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d
work_branch: feat/review-hub-v0.1
expected_remote: https://github.com/airesearchagl-art/DevVault-Control-Center.git
local_root: <Human-provided local root; omitted because the repository is PUBLIC. See Vault 01_Projects/DevVault-Control-Center/10_Links.md>
current_worktree_state: clean (preflight 2026-09-17T13:27Z; HEAD == origin/main == base_sha; 0 branch-only commits)
pre_existing_changes: none
project_instruction: obsidian-vault 01_Projects/DevVault-Control-Center/05_LLM_IDE_Instructions.md (main, blob 35aaa20e5fe1bade84b3c7c068d16a7df09d99f9); repository has no CLAUDE.md / AGENTS.md
empty_repository_bootstrap_gate: not-applicable (origin/main has base commit bbffea1)
```

## 3. Objective

### Objective

- Build DevVault Control Center — Review Hub v0.1 as a Windows desktop app that is actually usable locally.
- For roughly up to 8 Project Reviews, externalize Project / Repository / Local Root / PR / expected and reviewed HEAD metadata / ChatGPT thread / Review State / Resource State / Previous Result / Next Action, so that after closing the ChatGPT review surface and restarting the app, any Review can be resumed.

### Why Long Run

- Human explicitly requested continuous long-running IDE execution instead of fragmented steps (authorization source above).
- The work spans scaffold + native boundary + domain + persistence + UI + verification and requires checkpoint / resume.

### Acceptance Criteria

1. AC-01: Launches as a Windows desktop app.
2. AC-02: Multiple Projects can be registered.
3. AC-03: Multiple Review Sessions can be registered.
4. AC-04: Resource State HOT / WARM / COLD is managed independently of Review State.
5. AC-05: Review State NEW / READY_FOR_REVIEW / REVIEWING / FIX_REQUIRED / REVIEW_PASS / BLOCKED / SUSPENDED / CLOSED is managed by a defined transition contract.
6. AC-06: ChatGPT thread title / URL can be saved.
7. AC-07: Repository / Local Root / PR / expected HEAD / reviewed HEAD can be saved.
8. AC-08: Per Review Round `request-r<N>.md` and `result-r<N>.md` are retained.
9. AC-09: On Suspend a checkpoint is saved, and the same Review can be Resumed after app exit.
10. AC-10: GitHub / ChatGPT URLs can be opened through the safe launcher.
11. AC-11: Project Folder can be opened through a validated launcher.
12. AC-12: A Review Request is generated, saved to `request-r<N>.md`, and copied to the clipboard.
13. AC-13: ChatGPT results are captured by Human paste and saved to `result-r<N>.md`.
14. AC-14: Verdict / Review State changes are never auto-confirmed without Human confirmation.
15. AC-15: Runtime data never enters the Git repository.
16. AC-16: Works without OpenAI / Anthropic paid APIs.
17. AC-17: Malformed persistence input does not lose other Projects / Reviews.
18. AC-18: Persistence round-trip across restart PASSes.
19. AC-19: Required tests / Rust checks / Windows smoke are established.
20. AC-20: Final diff stays within Phase 1 scope.

### Non-goals

- Git HEAD automatic freshness; GitHub API; PR HEAD automatic fetch
- Claude Code / Codex session auto-discovery; terminal embedding
- ChatGPT automation / scraping; Notion API; Vault auto sync
- MCP; REST server; SQLite; Cloud DB; authentication; multi-user
- capacity / subscription monitor
- installer publication; public release; Production deployment
- any Phase 2+ feature

## 4. Scope

### Allowed changes

- Files inside repository `airesearchagl-art/DevVault-Control-Center` on branch `feat/review-hub-v0.1`, following the approved plan file structure:
  root config (`package.json`, lockfile, `tsconfig*.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.gitattributes`, `README.md`),
  `src/**`, `src-tauri/**`, `docs/**`, `fixtures/**`, `.agent-run/LR-20260917-DVCC-001/**`.
- Dependency install from npm registry / crates.io needed for the approved stack
  (Tauri 2, React 19, TypeScript, Vite, Vitest, tauri-plugin-opener, tauri-plugin-clipboard-manager, serde, serde_json).
- Local build / test / launch / smoke using a scratch data directory via `DVCC_DATA_DIR`.
- Feature-branch checkpoint commits and pushes to `origin/feat/review-hub-v0.1` (first push: `git push -u origin feat/review-hub-v0.1`).
- Draft PR creation (base `main`, head `feat/review-hub-v0.1`).

Approved decisions (binding):

- D1 APPROVED: keep per-round artifacts `reviews/<review-id>/request-r<N>.md` and `result-r<N>.md`; do not overwrite latest-only `request.md` / `result.md`; `checkpoint.md` holds the latest resume state.
- D2 APPROVED: Suspend sets `reviewState = SUSPENDED` and stores the prior Review State in `suspendedFrom`; Resume restores `reviewState = suspendedFrom`. Resource State is an independent axis; on Suspend the Human selects WARM or COLD; on Resume Resource becomes HOT.
- D3 MODIFIED AND APPROVED FOR LONG RUN: Wave 1 → Checkpoint → Wave 2 → Checkpoint → Wave 3 → Final Convergence → feature branch push → Draft PR → STOP / Human Gate.

Approved architecture (binding):

- Hybrid; Windows desktop; React 19 + TypeScript strict + Vite; Tauri 2.
- Rust responsibility: filesystem / storage boundary, safe launcher, data-directory resolution. Do not broaden unnecessarily.
- TypeScript responsibility: domain model, state transition, schema validation, prompt generation, queue ordering, application state, UI.
- Reuse: HybridGauge `reference_pattern` (Tauri 2 structure, React/Vite structure, tauri-plugin-opener, capabilities, Windows build pattern, main.rs → lib.rs::run()); `adopt_dependency` tauri-plugin-opener. Persistence `build_custom`. AgentDeck `defer`. Taurus `defer`. No new external OSS research unless a clear gap appears.

Persistence contract (binding):

- Release default `%APPDATA%\DevVault-Control\`; Debug default `%APPDATA%\DevVault-Control-dev\`; testing / smoke override `DVCC_DATA_DIR`.
- Structure: `projects.json`; `reviews/<review-id>/{session.json, request-r<N>.md, result-r<N>.md, checkpoint.md, events.jsonl}`.
- Repository holds only schema, synthetic fixtures, tests, documentation.
- JSON write: temp file → flush / sync_all → backup valid existing JSON → rename / replace. Never silently overwrite a corrupt file with defaults.
- Recovery: valid primary → use; invalid primary + valid backup → set primary aside as corrupt, restore from backup, warn; invalid primary + no valid backup → UNREADABLE, writes prohibited, Human action required; future schema version → read-only / unsupported, overwrite prohibited; `events.jsonl` broken lines may be skipped with warning, never auto-rewritten.

ChatGPT boundary (binding):

- Prohibited: automated login, DOM automation, automated send, conversation scraping, subscription limit circumvention, paid OpenAI API dependency.
- Allowed: thread title, thread URL, Review Request, Human clipboard, Human-pasted Review Result, local result artifact, Review state.
- Clipboard: write-only permission. No clipboard read permission. Capture uses Human Ctrl+V into a textarea.

Launcher boundary (binding):

- External URL: https only; allowed hosts `github.com`, `chatgpt.com`, `chat.openai.com`; decide using URL parsing, not string prefix. Reject `javascript:`, `file:`, `http:`, userinfo abuse such as `https://github.com@evil.example`.
- Project Folder: absolute path, existing directory, reject UNC, reject file path, no shell command execution; open via Opener API.

### Prohibited changes

- Any write to obsidian-vault or Notion; Documentation Sync execution.
- Commits to `main`; push to `main`; changes to other repositories.
- Ready for Review; merge; auto-merge; branch delete; force push; Production; Release; installer publish.
- Credential / secret changes; permission / branch protection changes.
- Paid API adoption; clipboard read permission; granting opener permissions to the webview; administrator manifest / `requireAdministrator`; perMachine installer assumption.
- HybridGauge hardware / NVML / sysinfo / WMI / fan control / persistence implementation reuse.
- Phase 2+ features; scope expansion beyond this packet.
- Committing runtime data, real ChatGPT thread URLs, real private repository fixtures, user absolute runtime paths, secrets.

### Explicitly protected files / systems

- `main` branch of airesearchagl-art/DevVault-Control-Center.
- Real runtime data directories `%APPDATA%\DevVault-Control\` and `%APPDATA%\DevVault-Control-dev\` (development and smoke runs use `DVCC_DATA_DIR` pointing to a scratch directory).
- airesearchagl-art/obsidian-vault; Notion workspace; airesearchagl-art/HybridGauge.

## 5. Hard Boundary

```yaml
main_direct_commit: prohibited
ready_for_review: prohibited
merge: prohibited
auto_merge: prohibited
production: prohibited
release: prohibited
credential_change: prohibited
permission_change: prohibited
force_push: prohibited
branch_delete: prohibited
destructive_data_operation: prohibited
```

## 6. Required checks

### Per-wave targeted checks

- Wave 1: `npm install`; TypeScript check; Vitest; Vite build; `cargo check`; `cargo test`.
- Wave 2: TypeScript check; Vitest; Vite build; `cargo check`; `tauri dev` launch.
- Wave 3: release no-bundle build; Windows launch smoke; persistence restart smoke; event / checkpoint verification; repository hygiene scan; synthetic fixture verification; full diff review.

### Full convergence checks

- Frontend: TypeScript PASS; Vitest PASS; Vite build PASS.
- Rust: `cargo check` PASS; `cargo test` PASS.
- Tauri: no-bundle release compile / build PASS.
- Persistence: round-trip PASS; malformed input PASS; backup recovery PASS; UNREADABLE safety PASS.
- Windows: application launch smoke PASS.
- Repository hygiene: no real ChatGPT thread URL; no real private repository fixture; no user absolute runtime path; no secret / credential.

### Manual / Preview / device verification

- E2E on Windows: Create Project → Create Review → set Resource / Review states → Suspend → close → reopen → Resume → metadata preserved.

### Hard checks — PASS required / no waiver

- Security: launcher accepts only https URLs on allowed hosts via URL parsing (rejects javascript:, file:, http:, userinfo abuse); project-folder launcher accepts only absolute existing local directories (rejects UNC / file / relative); no shell command execution; storage commands confine paths to the data root with validated identifiers; explicit CSP.
- Privacy: no real ChatGPT thread URL, real private repository, user absolute path, customer data or secret in tracked files; generated Review Request excludes local root and notes.
- Authentication: no authentication surface or credential handling introduced.
- Permission: webview capability limited to `core:default` + `clipboard-manager:allow-write-text`; no clipboard read; no opener permission granted to webview; no administrator manifest (default asInvoker); no perMachine installer.
- Data integrity: atomic write (temp + sync + rename); valid backup kept; corrupt primary never overwritten; UNREADABLE blocks writes; future schema read-only; per-file isolation so one malformed Review does not affect others; restart round-trip preserves metadata.
- Irreversible-data safety: no runtime data deletion; corrupt files are renamed aside (quarantine), never deleted; events.jsonl never rewritten.

Hard Checks require explicit PASS for COMPLETE_VERIFIED. No Human waiver, Quality Debt, accepted_by_human, INCONCLUSIVE or NOT RUN substitution.

## 7. Quality Debt

```yaml
quality_debt:
  enabled: true
  allow_defer_noncritical_checks: false
  allow_defer_external_preview: false
  allow_defer_flaky_noncritical_test: false
  high_risk_debt_blocks_final_verify: true
```

Only non-required / non-hard items may be recorded as Quality Debt. Required Check failures are repaired or lead to BLOCKED. Hard Gate real failures → immediate BLOCKED + Human escalation, no independent-task continuation.

## 8. Checkpoint / immutable contract binding

```yaml
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
run_artifact_path: .agent-run/LR-20260917-DVCC-001/
task_packet_snapshot_path: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: recorded in RUN_MANIFEST.md and RUN_STATE.md (self-referential digest cannot be embedded in this file)
resume_policy: ENABLED
remove_run_artifact_before_final_pr: false
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
snapshot_byte_stability: .gitattributes marks TASK_PACKET_SNAPSHOT.md as -text (no EOL conversion)
```

Each wave checkpoint records: targeted checks, self review, current diff, Acceptance Criteria status, explicit unverified items (`none` if empty), Quality Debt, remaining tasks, next action, Task Packet digest verification.

## 9. ENDURANCE settings

```yaml
endurance:
  enabled: false
```

## 10. Parallelism / roles

```yaml
execution_style: Delegated (limited)
lead: Claude Code main session — Design and Integration Lead; also implements (implementation uncertainty and shared state model make delegation of writes unsafe)
workers: read-only subagents only when independent research / verification is needed; no subagent file edits
independent_verifier: separate-context subagent at Final Convergence; checks diff, tests, actual persisted files, launch result, boundary cases; does not accept implementer self-assessment as evidence
parallel_tasks: independent read-only research / independent tests / verifier only
shared_file_conflict_policy: prohibit
```

Prohibited: concurrent edits of the same file; competing implementations before architecture decisions; multiple agents changing the state model.

## 11. Wave plan

| Wave | Goal | Dependency | Expected check | Checkpoint |
|---|---|---|---|---|
| 1 | Tauri shell + Rust storage / launcher / data-dir boundary + clipboard write + Project / Review domain + Resource / Review transitions + schema validation + prompt foundation + persistence + fixtures + data contract + unit tests | Task Packet init | npm install, TypeScript, Vitest, Vite build, cargo check, cargo test | required |
| 2 | Review Hub usable UI: queue, detail, create / edit Project and Review, state controls, Resume / Suspend with checkpoint, Open GitHub / ChatGPT / Project Folder, Copy Review Prompt, Capture Result, Human verdict confirmation, Next Action, empty / error states, recovery banners | Wave 1 | TypeScript, Vitest, Vite build, cargo check, tauri dev launch | required |
| 3 | Convergence / dogfood-ready: defect repair, README, runtime-data hygiene, release no-bundle build, Windows launch smoke, restart persistence smoke, event / checkpoint verification, repository hygiene scan, full diff review, fixture verification. No new features after convergence begins. | Wave 2 | all full convergence checks | required |

## 12. Failure policy

```yaml
same_hypothesis_blind_retry_max: 2
repair_strategies_max: 3
no_progress_waves_max: 2
transient_failure: retry_or_stop (bounded)
localized_test_failure: repair
systemic_test_failure: repair_or_blocked
persistence_failure: checkpoint_recovery_or_stop
scope_conflict: blocked
authority_required: blocked
state_corruption: blocked
hard_gate_failure: immediate_block_and_human_escalation_no_independent_continuation
rate_quota_context_runtime_end: SUSPENDED if a valid checkpoint can be created
```

### Hard Stop Conditions

- Preflight drift (repository / branch / base / HEAD / working tree mismatch) or Resume-time digest / state mismatch.
- Any need to write to main, obsidian-vault, Notion, other repositories, or to change credentials / permissions.
- Any need for administrator privilege, clipboard read permission, webview opener permission, paid API, or Phase 2+ scope.
- A Hard Check real FAIL (Security / Privacy / Authentication / Permission / Data integrity / irreversible-data safety).
- The same failure persisting after 2 same-hypothesis retries and 3 repair strategies.
- Required changes to Objective / Acceptance Criteria / Scope / Hard Boundary (requires new Task Packet revision).

## 13. Resume contract

Resume prioritizes, over conversation memory:

1. `RUN_MANIFEST.md` Run ID / Repository / working branch / base / Task Packet binding
2. immutable `TASK_PACKET_SNAPSHOT.md`
3. SHA-256 recomputation of `TASK_PACKET_SNAPSHOT.md` and match against recorded digest
4. current repository / branch / base / head / working tree
5. `RUN_STATE.md` Repository / Working branch / Acceptance Criteria / Explicit unverified items
6. `RUN_STATE.md` Task Packet ID / revision / digest match with Manifest
7. `QUALITY_DEBT.md`
8. last successful checkpoint
9. targeted smoke check
10. `Next action`

State mismatch, missing required state, or digest mismatch → BLOCKED + Human escalation.

## 14. Final convergence

```yaml
freeze_new_features_before_final_verify: true
full_diff_review: required
full_required_checks: PASS_REQUIRED
hard_checks: PASS_REQUIRED_NO_WAIVER
nonhard_human_acceptance: RECORD_ONLY_DOES_NOT_YIELD_COMPLETE_VERIFIED
quality_debt_review: required
explicit_unverified_items_must_be_empty_for_complete_verified: true
independent_verification: required
final_output: DRAFT_PR
```

Final state: all PASS → COMPLETE_VERIFIED; unexecuted / unresolved required verification → COMPLETE_PENDING_FULL_VERIFY (Draft PR allowed; Ready / merge / Production / Release prohibited).

```yaml
allow_draft_pr_with_incomplete_verification: true
```

## 15. PR / Git policy

```yaml
commit_strategy: run-artifact initialization commit, then one checkpoint commit per wave (plus final convergence checkpoint)
push: allowed (feature branch only; first push `git push -u origin feat/review-hub-v0.1`; never main)
create_draft_pr: allowed (base main, head feat/review-hub-v0.1)
ready_for_review: prohibited
merge: prohibited
branch_delete: prohibited
```

Draft PR body must include: Run ID; Execution Mode; Horizon; Task Packet ID / revision / SHA-256 digest; Base SHA; Head SHA; Objective; implemented scope; Acceptance Criteria; Checks; Hard Checks; Quality Debt; Explicit unverified items; Known failures; Checkpoint / Resume location; Reuse decisions; Human Gate items; Documentation Sync Trigger.

### Commit message candidates

- `chore(run): initialize LR-20260917-DVCC-001 long-run artifacts`
- `feat: scaffold Tauri shell with storage, launcher, domain and persistence core (Wave 1 checkpoint)`
- `feat: add Review Hub UI (Wave 2 checkpoint)`
- `chore: converge Review Hub v0.1 with smoke evidence and docs (Wave 3 / final checkpoint)`

## 16. Documentation Sync

```yaml
documentation_sync_trigger: yes
expected_canonical_change: major initial implementation — Review Hub v0.1 Draft PR (Phase 0 bootstrap → Phase 1 Review Hub MVP implementation under review)
```

The development IDE does not write Notion or obsidian-vault. Canonical facts are handed off to the Review / Orchestration LLM in the Completion Report.

## 17. Completion report contract

As specified by the Human (section 28 of the authorization): Run ID; Execution Mode; Horizon; Task Packet ID / revision / SHA-256; Final State; Repository; Branch; Base SHA; Head SHA; Draft PR; Completed; Acceptance Criteria AC-01..AC-20; Checks (TypeScript, Vitest, Vite, cargo check, cargo test, Tauri build, Windows launch, Persistence, E2E smoke); Hard Checks (Security, Privacy, Permission, Data integrity, irreversible-data safety); Quality Debt; Explicit unverified items; Known failures; Reuse (HybridGauge, AgentDeck, Taurus); Checkpoint / Resume (path, last checkpoint, task packet digest verified); Human Gate required (Ready for Review, merge, release, Production); Documentation Sync Trigger: yes; Canonical facts for reviewer (base, head, PR, checks, milestone, blocker / debt); Suggested Vault targets; Suggested Notion fields; Obsidian Vaultに記録候補.
