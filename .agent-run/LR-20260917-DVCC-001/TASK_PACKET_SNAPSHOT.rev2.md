# Long-Run Task Packet — LRP-20260917-DVCC-001 (revision 2)

> Template: obsidian-vault `03_Templates/Long_Run_Task_Packet.md` (main, blob d655e1a540eb7f53b6cea0df0603aa62bdead161)
> Route: obsidian-vault `02_Prompts/LLM_IDE/Long_Run_Development_Route.md` (main, blob 0e7df41d08f956304f185d0a7cc4eded62d1767e)
> This file is the exact completed instance of revision 2 for run `LR-20260917-DVCC-001`.
> IMMUTABLE: do not edit. Revision 1 (`TASK_PACKET_SNAPSHOT.md`, SHA-256 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b) is retained unchanged as evidence.
> The SHA-256 digest of this file's bytes is recorded in `RUN_MANIFEST.md`, `RUN_STATE.md`, `EVIDENCE.md` and `DECISIONS.md`.

## 1. Campaign identity

```yaml
run_id: LR-20260917-DVCC-001
task_packet_id: LRP-20260917-DVCC-001
task_packet_revision: 2
previous_revision: 1
previous_revision_snapshot_path: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md
previous_revision_digest_sha256: 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b
execution_mode: LONG_RUN
horizon: 8H
human_explicit_long_run_authorization: true
human_explicit_long_run_authorization_source: >-
  Revision 1 source: Human instruction in the current development thread (2026-09-17)
  「開発のペースとしては、小間切れで進めていくのではなくて、ある程度長時間の開発IDEが動き続けるような指示の出し方をしてください」
  and the Human message "DevVault Control Center — Review Hub v0.1 LONG_RUN Implementation Authorization".
human_explicit_repair_authorization: true
human_explicit_repair_authorization_source: >-
  Human message "DevVault Control Center — Review Hub v0.1 LONG_RUN Repair Authorization / Task Packet Revision 2"
  (2026-09-17, after the BLOCKED Long-Run Report): Repair Wave AUTHORIZED (Decision R2-D1),
  tauri-plugin-single-instance adoption approved, Task Packet revision 2 required.
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
local_root: <Human-provided local root; omitted because the repository is PUBLIC>
starting_evidence_head: bf833767c12e9a2e420855ed11fce0083c5dd923
starting_code_head: b2c3ae892e81178f742ad96423eb3d0a859e5ed6
starting_state: BLOCKED — HARD_GATE_FAILURE (Data integrity, Irreversible-data safety)
current_worktree_state: clean (repair preflight 2026-09-17T14:35Z; HEAD == origin/feat/review-hub-v0.1 == bf83376; no code change after b2c3ae8)
pre_existing_changes: none
project_instruction: obsidian-vault 01_Projects/DevVault-Control-Center/05_LLM_IDE_Instructions.md (main, blob 35aaa20e5fe1bade84b3c7c068d16a7df09d99f9)
```

## 3. Objective

### Objective

- Build DevVault Control Center — Review Hub v0.1 as a Windows desktop app that is actually usable locally.
- For roughly up to 8 Project Reviews, externalize Project / Repository / Local Root / PR / expected and reviewed HEAD metadata / ChatGPT thread / Review State / Resource State / Previous Result / Next Action, so that after closing the ChatGPT review surface and restarting the app, any Review can be resumed.

### Repair objective (revision 2)

- Resolve the Independent Verification hard-gate failures F-1, F-2, F-3 and the test-validity failure F-5, plus F-4, F-6, F-8, F-11 in the same Repair Wave.
- Verify F-9 (junction / reparse point bypass of the launcher UNC / network boundary) with measured evidence; fix it if reproduced.
- Re-establish Data integrity and Irreversible-data safety Hard Checks as explicit PASS, re-run Full Convergence and a new Independent Verification, then create the Draft PR only if the Draft PR conditions (§15) hold.

### Why Long Run

- Human explicitly requested continuous long-running IDE execution; Human explicitly authorized this repair campaign in the same run.

### Acceptance Criteria (unchanged from revision 1)

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

### Repair acceptance criteria (revision 2)

- R-F1 (required): repository URL normalization is idempotent: `normalize(normalize(x)) == normalize(x)`; for every accepted input `validate → normalize → save → reload → validate` holds; the app never rejects canonical data it wrote itself. Table-driven tests cover `.git`, `.git.git`, trailing slash, mixed casing where applicable, userinfo, invalid host, invalid scheme; `.git.git` regression test.
- R-F2 (required): `primary missing + valid backup` is RECOVERY REQUIRED, not empty state: backup existence check, backup validation, primary restore, recovery banner / state, backup protection, recovery write failure — all tested. A valid backup that is the only recoverable copy is never silently overwritten by a normal save.
- R-F3 (required): multi-process simultaneous execution is prevented with `tauri-plugin-single-instance` AND (A) storage temp file names are unique (no collision under concurrent writes; stale temp files after a crash are never read as canonical data), (B) storage mutations inside one process are serialized so an older write cannot overwrite newer state, (C) a multi-instance test or reproducible verification proves the plugin is effective by evidence (not by dependency presence). Tests: second-instance prevention evidence, unique temp path, no cross-process silent overwrite.
- R-F4: near-simultaneous mutations in one process keep UI state, `session.json`, `projects.json` and `events.jsonl` mutually consistent; application operation order equals disk commit order (not "last finished I/O wins"); race reproduction test.
- R-F5 (required): the transition test uses an independent, Human-approved transition contract fixture / table (not the implementation table) covering allowed transitions, prohibited transitions, verdict prerequisites, suspend / resume, resource independence, next round; a contract-violating change to the implementation table makes the test FAIL.
- R-F6: re-capturing a result in the same round never silently deletes the existing result: explicit Human overwrite confirmation plus preservation of the previous result (deterministic archive / history naming, e.g. `result-r<N>-previous-<timestamp>.md`); the canonical latest result per round is clearly defined. Tests: re-capture preserves previous result; explicit Human confirmation required.
- R-F8: generic I/O errors are never presented as "set aside and start empty"; a recovery action is offered only for corrupt / unreadable states where a safe Human action is defined; permission / device / transient I/O / unknown failures are a separate error state. Test: corrupt recovery vs ordinary I/O failure distinction.
- R-F9 (mandatory verification, security boundary): Project Folder launcher verified for normal absolute local directory, UNC path, junction / symlink / reparse point, and local path → UNC / network target, checking the resolved / canonical target where possible. Human-approved boundary: UNC / network targets are not opened. If reproduced → fix as Security / Permission boundary issue and re-run Hard Checks. If not reproduced → record measured evidence. If Windows API / Rust std cannot decide safely → INCONCLUSIVE + BLOCKED. Never Quality Debt.
- R-F11: one round-limit contract defined in one place and shared by domain, schema, UI and tests (no duplicated magic number); value chosen so existing data is not invalidated unnecessarily. Test: round limit consistency.

### Non-goals (unchanged)

- Git HEAD automatic freshness; GitHub API; PR HEAD automatic fetch
- Claude Code / Codex session auto-discovery; terminal embedding
- ChatGPT automation / scraping; Notion API; Vault auto sync
- MCP; REST server; SQLite; Cloud DB; authentication; multi-user
- capacity / subscription monitor
- installer publication; public release; Production deployment
- any Phase 2+ feature

## 4. Scope

### Allowed changes

- Files inside repository `airesearchagl-art/DevVault-Control-Center` on branch `feat/review-hub-v0.1` needed for the repair items above: `src/**`, `src-tauri/**`, `docs/**`, `fixtures/**`, `README.md`, root config (`package.json`, lockfiles, `tsconfig*.json`, `vite.config.ts`, `.gitignore`, `.gitattributes`), a shared contract file for limits if needed, and `.agent-run/LR-20260917-DVCC-001/**` (append / update; never delete existing run artifacts).
- New dependency (Human-approved, `adopt_dependency`): `tauri-plugin-single-instance` (Tauri 2 plugin) — purpose: prevent multi-process simultaneous execution of DVCC.
- Existing approved dependencies remain: Tauri 2, React 19, TypeScript, Vite, Vitest, tauri-plugin-opener, tauri-plugin-clipboard-manager, serde, serde_json.
- Local build / test / launch / smoke using scratch data directories via `DVCC_DATA_DIR`; temporary local-only verification fixtures for F-9 (junctions / symlinks / a temporary loopback drive mapping to `\\localhost\C$`), removed after verification.
- Feature-branch implementation commits, checkpoint commits and pushes to `origin/feat/review-hub-v0.1`.
- Draft PR creation only under §15 conditions.

Approved decisions (binding; carried from revision 1): D1 per-round artifacts; D2 Suspend / Resume semantics; D3 wave flow with checkpoints. Approved architecture, persistence contract, ChatGPT boundary and launcher boundary from revision 1 remain binding, with the revision 2 additions: storage writes are serialized and use unique temp names; primary-missing-with-valid-backup is a recovery state; generic I/O errors are a distinct non-recoverable-by-set-aside state; previous same-round results are preserved; UNC / network targets are not opened even through reparse points or mapped drives.

Human decisions (revision 2):

- R2-D1: Repair Wave AUTHORIZED. Required: F-1, F-2, F-3, F-5. Included in the same wave: F-4, F-6, F-8, F-11. Quality Debt allowed: F-7, F-10. F-9: DEFER PROHIBITED (mandatory verification).
- R2-D2: `tauri-plugin-single-instance` adopted (`adopt_dependency`); the plugin alone does not close F-3 (A / B / C required).
- R2-D3: Draft PR only after Repair + Full Convergence + Independent Verification and only if §15 conditions hold; otherwise report BLOCKED without a Draft PR.

### Prohibited changes

- Any write to obsidian-vault or Notion; Documentation Sync execution.
- Commits to `main`; push to `main`; force push; changes to other repositories.
- Ready for Review; merge; auto-merge; branch delete; Production; Release; installer publish.
- Credential / secret changes; permission / branch protection changes.
- Paid API adoption; clipboard read permission; granting opener permissions to the webview; administrator manifest / `requireAdministrator`; perMachine installer assumption.
- New dependencies other than `tauri-plugin-single-instance`.
- HybridGauge hardware / NVML / sysinfo / WMI / fan control / persistence implementation reuse.
- Phase 2+ features; scope expansion beyond this packet.
- Deleting existing run artifacts or the revision 1 snapshot.
- Committing runtime data, real ChatGPT thread URLs, real private repository fixtures, user absolute runtime paths, network share names / addresses, secrets.
- Accessing or opening the user's existing network drive mappings or shares.

### Explicitly protected files / systems

- `main` branch of airesearchagl-art/DevVault-Control-Center.
- Real runtime data directories `%APPDATA%\DevVault-Control\` and `%APPDATA%\DevVault-Control-dev\`.
- airesearchagl-art/obsidian-vault; Notion workspace; airesearchagl-art/HybridGauge.
- The user's existing mapped network drives and SMB shares.
- `.agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md` (revision 1).

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

### Per-repair targeted checks

- Relevant Vitest suites and `cargo test` after each repair group; TypeScript check.

### Required repair tests (minimum)

- F-1: normalization idempotence; save / reload / validate round-trip; `.git.git` regression.
- F-2: primary missing + valid backup; backup recovery; recovery write failure; unique valid copy protection.
- F-3: second instance prevention evidence; unique temp path; no cross-process silent overwrite.
- F-4: concurrent / rapid mutation ordering; persisted state equals final application state.
- F-5: independent transition oracle.
- F-6: re-capture preserves previous result; explicit Human confirmation requirement.
- F-8: corrupt recovery vs ordinary I/O failure distinction.
- F-9: direct UNC rejected; junction / reparse target verification.
- F-11: round limit consistency.

### Final required checks

- Frontend: TypeScript PASS; Vitest PASS; Vite build PASS.
- Rust: `cargo check` PASS; `cargo test` PASS.
- Tauri: no-bundle release build PASS.
- Persistence: normal round-trip PASS; malformed input PASS; backup recovery PASS; missing-primary backup recovery PASS; concurrent mutation PASS; re-capture preservation PASS.
- Single instance: PASS with evidence.
- Launcher: allowed URL PASS; malicious URL reject PASS; local folder PASS; UNC reject PASS; junction / reparse boundary PASS or BLOCKED.
- Windows: release launch PASS; restart persistence PASS.

### Hard checks — PASS required / no waiver

- Security, Privacy, Authentication, Permission, Data integrity, Irreversible-data safety (definitions as in revision 1, extended by the revision 2 repair acceptance criteria). Hard Checks require explicit PASS; no Human waiver, Quality Debt, accepted_by_human, INCONCLUSIVE or NOT RUN substitution.

## 7. Quality Debt

```yaml
quality_debt:
  enabled: true
  allow_defer_noncritical_checks: false
  allow_defer_external_preview: false
  allow_defer_flaky_noncritical_test: false
  high_risk_debt_blocks_final_verify: true
human_allowed_debt:
  - F-7 (UTF-8 BOM JSON treated as corrupt; older backup restored)
  - F-10 (hygiene test scope)
```

Other existing non-hard debt not designated for repair must have risk and blocks_final_verify re-evaluated. High-risk debt blocks COMPLETE_VERIFIED. Security boundary items (F-9) are never debt.

## 8. Checkpoint / immutable contract binding

```yaml
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
run_artifact_path: .agent-run/LR-20260917-DVCC-001/
task_packet_snapshot_path: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.rev2.md
task_packet_digest_sha256: recorded in RUN_MANIFEST.md / RUN_STATE.md / EVIDENCE.md / DECISIONS.md
retained_previous_snapshot: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md (revision 1, unchanged)
resume_policy: ENABLED
remove_run_artifact_before_final_pr: false
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
snapshot_byte_stability: .gitattributes marks TASK_PACKET_SNAPSHOT*.md as -text
```

## 9. ENDURANCE settings

```yaml
endurance:
  enabled: false
```

## 10. Parallelism / roles

```yaml
execution_style: Delegated (limited)
lead: Claude Code main session — Design and Integration Lead; implements the repairs
workers: read-only subagents only when independent research / verification is needed; no subagent repository edits
independent_verifier: new separate-context subagent at Final Convergence; previous findings may be named, but "fixed" claims are not evidence; must itself inspect actual diff, tests, persisted files, release executable, concurrency behaviour, backup recovery, launcher boundary and transition oracle, with focus on F-1 / F-2 / F-3 / F-9
parallel_tasks: independent read-only research / independent tests / verifier only
shared_file_conflict_policy: prohibit
```

## 11. Wave plan (revision 2)

| Step | Goal | Expected check | Checkpoint |
|---|---|---|---|
| R0 | Repair preflight; revision 2 snapshot / digest | digest recorded; revision 1 retained | commit + push |
| R1 | F-1 idempotent normalization + round-trip tests | vitest | commit |
| R2 | F-2 missing-primary recovery + backup protection (Rust + TS) | vitest, cargo test | commit |
| R3 | F-3 single-instance plugin + unique temp names + serialized storage; F-4 serialized application operations | vitest, cargo test, race tests | commit |
| R4 | F-5 independent transition oracle | vitest (+ mutation probe) | commit |
| R5 | F-6 re-capture preservation + confirmation; F-8 I/O error state; F-11 shared round limit | vitest, cargo test | commit |
| R6 | F-9 launcher reparse / UNC / network verification (fix if reproduced) | cargo test + measured evidence | commit |
| R7 | Targeted checks → checkpoint → Full Convergence (all final required checks, release build, Windows smoke, restart E2E, single-instance evidence, recovery smoke) | all §6 final checks | checkpoint + push |
| R8 | Independent Verification → Hard Checks → Draft PR (only if §15) → STOP | verifier report | final checkpoint + push |

## 12. Failure policy

```yaml
same_hypothesis_blind_retry_max: 2
repair_strategies_max: 3
no_progress_waves_max: 2
systemic_test_failure: repair_or_blocked
scope_conflict: blocked
authority_required: blocked
state_corruption: blocked
hard_gate_failure: immediate_block_and_human_escalation_no_independent_continuation
rate_quota_context_runtime_end: SUSPENDED if a valid checkpoint can be created
```

### Hard Stop Conditions

- New Hard Gate failure (other than the F-1 / F-2 / F-3 / F-9 items this packet authorizes to repair), scope conflict, authority requirement, or state corruption → BLOCKED.
- F-9 undecidable with Windows API / Rust std → INCONCLUSIVE + BLOCKED.
- Any need to write to main, obsidian-vault, Notion, other repositories, the user's network shares, or to change credentials / permissions.
- Any need for a dependency other than `tauri-plugin-single-instance`, administrator privilege, clipboard read permission, webview opener permission, paid API, or Phase 2+ scope.
- Draft PR conditions (§15) not met at the end → report BLOCKED without Draft PR.
- Same failure after 2 same-hypothesis retries and 3 repair strategies.
- Required change to Objective / Acceptance Criteria / Scope / Hard Boundary → new Task Packet revision.

## 13. Resume contract

As revision 1, with `TASK_PACKET_SNAPSHOT.rev2.md` as the active snapshot and its recorded digest; revision 1 snapshot digest must also still match.

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
final_output: DRAFT_PR (conditional, §15)
```

## 15. PR / Git policy

```yaml
commit_strategy: implementation commits per repair group + checkpoint commits; push to feature branch
push: allowed (origin/feat/review-hub-v0.1 only)
force_push: prohibited
create_draft_pr: allowed only if all Draft PR conditions hold
ready_for_review: prohibited
merge: prohibited
release: prohibited
production: prohibited
branch_delete: prohibited
```

Draft PR conditions (all required):

- F-1 resolved
- F-2 resolved
- F-3 resolved
- F-9 PASS
- Data integrity Hard Check PASS
- Irreversible-data safety Hard Check PASS
- Required checks PASS

If any condition is not met: no Draft PR; report BLOCKED.

Draft PR body must include: Run ID; Execution Mode; Horizon; Task Packet ID / revision / SHA-256 digest; Base SHA; Head SHA; Objective; implemented scope; Acceptance Criteria; Checks; Hard Checks; Quality Debt; Explicit unverified items; Known failures; Checkpoint / Resume location; Reuse decisions; Human Gate items; Documentation Sync Trigger.

## 16. Documentation Sync

```yaml
documentation_sync_trigger: yes
expected_canonical_change: Review Hub v0.1 repaired after hard-gate failure; Draft PR if conditions hold
```

Notion write prohibited. obsidian-vault write prohibited. Canonical facts are returned to Review / Orchestration in the Completion Report.

## 17. Completion report contract

As specified by the Human in "LONG_RUN Repair Authorization / Task Packet Revision 2" §21: Run ID; Task Packet ID; Revision; Digest; Starting state BLOCKED; Final state; Base; Head; Draft PR; Resolved findings F-1, F-2, F-3, F-4, F-5, F-6, F-8, F-9, F-11; Remaining Quality Debt F-7, F-10, others; Checks (TypeScript, Vitest, Vite, cargo check, cargo test, Tauri build, Windows launch, Persistence, Single instance, Launcher boundary, E2E restart); Hard Checks (Security, Privacy, Authentication, Permission, Data integrity, Irreversible-data safety); Independent Verification; Explicit unverified items; Checkpoint / Resume (revision 2 snapshot, digest verified, last checkpoint); Documentation Sync Trigger yes; Canonical facts (base, head, PR, milestone, blocker / debt); Human Gate (Ready for Review, merge, release, Production); STOP.
