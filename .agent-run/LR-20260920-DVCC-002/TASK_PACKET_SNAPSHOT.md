# Long-Run Task Packet — LRP-20260920-DVCC-002 (revision 1)

> Template: obsidian-vault `03_Templates/Long_Run_Task_Packet.md` (origin/main 4d3b60b, blob d655e1a540eb7f53b6cea0df0603aa62bdead161)
> Route: obsidian-vault `02_Prompts/LLM_IDE/Long_Run_Development_Route.md` (origin/main 4d3b60b, blob 0e7df41d08f956304f185d0a7cc4eded62d1767e)
> This file is the exact completed instance of revision 1 for run `LR-20260920-DVCC-002`, derived from the Human message
> "DevVault Control Center — Phase 2 Evidence / Freshness v0.2 / LONG_RUN Initial Implementation" (2026-09-20).
> IMMUTABLE: do not edit. The SHA-256 digest of this file's bytes is recorded in `RUN_MANIFEST.md`, `RUN_STATE.md`, `EVIDENCE.md` and `DECISIONS.md`.

## 1. Campaign identity

```yaml
run_id: LR-20260920-DVCC-002
task_packet_id: LRP-20260920-DVCC-002
task_packet_revision: 1
execution_mode: LONG_RUN
horizon: 8H
human_explicit_long_run_authorization: true
human_explicit_long_run_authorization_source: >-
  Human instruction in the development thread (2026-09-17, standing):
  「開発のペースとしては、小間切れで進めていくのではなくて、ある程度長時間の開発IDEが動き続けるような指示の出し方をしてください」
  restated in the Human message "DevVault Control Center — Phase 2 Evidence / Freshness v0.2 / LONG_RUN Initial Implementation" §2.
human_explicit_endurance_authorization: false
endurance: NOT AUTHORIZED
project: DevVault Control Center (DVCC)
phase: Phase 2 — Evidence / Freshness
module_version: Evidence / Freshness v0.2
repository: airesearchagl-art/DevVault-Control-Center
local_root: C:\Users\shuns\.claude\projects\DevVaultControlCenter
final_output: DRAFT_PR
per_wave_human_confirmation: not required (only Hard Boundary or scope change stops the run)
```

## 2. Repository state

```yaml
base_branch: main
base_sha: f557aa6f15222099f54790180e0ff71c5291734a
base_subject: "Merge pull request #1 from airesearchagl-art/feat/review-hub-v0.1"
working_branch: feat/evidence-freshness-v0.2
branch_created_from: origin/main @ f557aa6f15222099f54790180e0ff71c5291734a
previous_phase: Phase 1 — Review Hub v0.1 (PR #1, merged)
previous_run_artifact: .agent-run/LR-20260917-DVCC-001/ (must not be modified by this run)
run_artifact_path: .agent-run/LR-20260920-DVCC-002/
preflight_working_tree: clean (0 tracked changes, 0 untracked files)
preflight_toolchain: node v24.15.0, npm 11.12.1, rustc 1.95.0, cargo 1.95.0, git 2.53.0.windows.2, gh 2.96.0
```

## 3. Objective

Phase 1 records `expectedHead` and `reviewedHead` as Human-recorded metadata. Phase 2 additionally observes **current local Git facts read-only** and presents **Freshness as derived state**, without mixing Human-recorded state and machine-observed facts.

Purpose:

- notice immediately when the reviewed target HEAD and the current HEAD diverge,
- notice when a reviewed HEAD has gone stale,
- notice an uncommitted working tree,
- never change Review State automatically: "facts" and "judgement" stay on separate axes.

## 4. Scope

### 4.1 Required (A–E)

```yaml
A_local_git_observation:
  - local repository detection
  - current HEAD (full 40-char SHA)
  - current branch
  - detached HEAD detection
  - clean / dirty working tree
  - observation timestamp
  - distinction between Git unavailable / not-a-repo / timeout / error
B_human_recorded_values:
  - expectedHead and reviewedHead are kept as they are
  - a Git refresh must never rewrite expectedHead or reviewedHead
C_derived_freshness:
  - ALIGNED
  - HEAD_CHANGED
  - REVIEW_STALE
  - WORKTREE_DIRTY
  - UNKNOWN
D_ui:
  - Refresh Git State
  - Refresh All
  - current branch / current HEAD / working tree / observedAt
  - Freshness badge
  - comparison explanation
E_queue:
  - Freshness shown per review row, independent of Review State
```

### 4.2 Explicit non-goals

GitHub API; `git fetch` as a product feature; `git pull`; remote PR HEAD retrieval; remote branch synchronization; automatic commit; checkout; reset; clean; push; GitHub status / check retrieval; Notion / Vault sync; Phase 3 review workflow; Risk Tier; Turn 1 / Turn 2 review automation; Claude Code / Codex session discovery; terminal embedding; SQLite; REST / MCP; cloud sync; installer / release. **Phase 2 is local Git facts only.**

### 4.3 Git observation architecture

- A Rust-native boundary command (`inspect_git_repository` or equivalent). **No generic shell executor.**
- Git CLI use goes through `std::process::Command` directly — never through a shell, `cmd.exe` or PowerShell.
- User input is never concatenated into a command line; path and arguments are passed as separate arguments.

### 4.4 Git CLI safety (read-only)

Prohibited commands: `fetch`, `pull`, `checkout`, `switch`, `reset`, `clean`, `commit`, `add`, `stash`, `push`, config write, branch mutation, tag mutation. The product performs no network operation. Git child processes get `GIT_OPTIONAL_LOCKS=0` where possible. Repository inspection must not intentionally change the working tree, index or config. No shell execution.

### 4.5 Local path boundary

Reuse the Phase 1 local-folder security boundary (F-9): absolute local path, existing directory, local drive, not UNC, not a mapped network drive, and the resolved link / junction target is local as well. Reuse the existing validation / canonicalization rather than duplicating it; the F-9 closure must not be weakened.

### 4.6 Git facts contract

```yaml
GitObservation:
  status: OK | NO_LOCAL_ROOT | NOT_A_GIT_REPOSITORY | GIT_UNAVAILABLE | TIMEOUT | ERROR
  head: full 40-char SHA or null
  branch: branch name or null
  detached: boolean or null
  dirty: boolean or null
  observedAt: ISO-8601 UTC
  errorCode: optional
  errorMessage: optional
rule: never fill an unknown field with a guessed value
```

### 4.7 Persistence decision (v0.2)

`GitObservation` is **runtime memory only**; it is not canonical persistent state. Reasons: the current Git fact is volatile; a cache could be mistaken for a current fact; no Phase 1 persistence schema migration is needed; the need for a cache can be judged after first dogfooding. After an app restart the observation is `UNKNOWN` until the Human runs Refresh Git State / Refresh All, and the UI must make this explicit. "Last known current HEAD" must not be stored as a persistent current fact.

### 4.8 HEAD comparison

Human-recorded HEAD values accept 7–40 hex characters; the observed current HEAD is a full SHA. Comparison is concentrated in one safe helper: a 40-character recorded value must match exactly; a 7–39-character value matches when the current full SHA starts with it; case handling follows the existing schema contract. Ambiguous or invalid values are never guessed.

### 4.9 Derived Freshness contract (fixed priority)

```yaml
1_WORKTREE_DIRTY: observation OK and dirty == true
2_REVIEW_STALE: clean and reviewedHead != null and current HEAD does not match reviewedHead
3_HEAD_CHANGED: clean and expectedHead != null and current HEAD does not match expectedHead
4_ALIGNED: observation OK, clean, current HEAD known, at least one recorded HEAD exists and every recorded HEAD matches
5_UNKNOWN: everything else (no localRoot, Git unavailable, not a repo, timeout, observation error, unknown current HEAD, both recorded HEADs null)
```

### 4.10 Explanation contract

Every status is shown with its reason, e.g. "Local working tree has uncommitted changes."; "Reviewed HEAD abc1234 differs from current HEAD def5678."; "Expected HEAD abc1234 differs from current HEAD def5678."; "Recorded HEAD values match current local HEAD."; "Git state has not been observed." The Human must understand the reason in one interaction.

### 4.11 State separation (critical)

A Freshness update never changes Review State. `REVIEW_PASS` + `REVIEW_STALE` and `FIX_REQUIRED` + `ALIGNED` are both legitimate. Freshness is derived, informational state; no automatic transition such as `REVIEW_PASS → READY_FOR_REVIEW`.

### 4.12 Refresh behaviour, timeout, child processes

Refresh Git State for the selected project; Refresh All for every project (~8 expected), executed **sequentially** in v0.2 to avoid resource spikes and operator disturbance. Git processes get a bounded timeout (~5 s); on timeout the status is `TIMEOUT` and Freshness is `UNKNOWN`. Only the PID started by this observation is terminated — never kill by process name. A Git process error must never crash the app. No automatic refresh at app startup: start as `UNKNOWN` and let the Human refresh.

### 4.13 UI

Review detail gains a **Git Evidence** section (status, branch, current HEAD, working tree, observed time, Refresh button) and a **Freshness** section (badge, explanation, expected HEAD, reviewed HEAD, current HEAD). Queue rows gain a Freshness badge. Within one Review State the attention order may be WORKTREE_DIRTY > REVIEW_STALE > HEAD_CHANGED > UNKNOWN > ALIGNED, but the existing Review State ordering must not be reworked in Phase 2.

### 4.14 Test repositories and read-only verification

Synthetic temporary Git repositories only — never a real user project as a fixture. Minimum scenarios: clean repo / branch; dirty tracked file; untracked file; detached HEAD; expected match / mismatch; reviewed match / mismatch; no localRoot; not a Git repo; Git executable unavailable; timeout. Temporary repositories may use per-command local config (`git -c user.name=DVCC-Test -c user.email=dvcc-test@example.invalid`); the global Git config must never be written. Inspection must leave the synthetic repository unchanged — worktree file hashes, HEAD, index, config and refs identical before and after, proven by a test.

## 5. Hard Boundary

```yaml
prohibited:
  - arbitrary shell command execution
  - user-provided command execution
  - network Git operation
  - credential access
  - Git config mutation
  - destructive Git operation
  - local repository modification
  - UNC / network repository traversal
  - direct commit to main
  - Ready for Review
  - merge
  - release
  - Production
  - Notion write
  - obsidian-vault write
  - adding a GitHub Actions workflow in this task
failure_policy:
  security_permission_data_integrity_failure: immediate BLOCKED (never converted into Quality Debt)
```

## 6. Required checks

```yaml
frontend:
  - TypeScript (tsc --noEmit): PASS
  - Vitest: PASS
  - Vite build: PASS
rust:
  - cargo fmt --check: PASS
  - cargo clippy --all-targets: PASS
  - cargo check: PASS
  - cargo test: PASS
tauri:
  - npm run tauri build -- --no-bundle: PASS
git_evidence:
  - clean repo observation, dirty repo, detached HEAD, not-a-repo, safe-path rejection,
    no-network behaviour, timeout / error, no repository mutation: PASS
freshness:
  - independent oracle tests for UNKNOWN / ALIGNED / HEAD_CHANGED / REVIEW_STALE / WORKTREE_DIRTY: PASS
ui:
  - Refresh selected, Refresh all, observed facts displayed, explanation, Review State unchanged,
    restart returns to UNKNOWN — verified on a scratch / isolated desktop
hard_checks:
  - Security, Privacy, Permission, Data integrity, Irreversible-data safety
```

## 7. Quality Debt

Non-hard items may be deferred and recorded in `QUALITY_DEBT.md` with id, source wave, type, description, why deferred, risk, blocks_final_verify and required resolution. Security, Permission, Data integrity and Irreversible-data safety failures may never be deferred.

## 8. Checkpoint / immutable contract binding

```yaml
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
task_packet_snapshot_path: .agent-run/LR-20260920-DVCC-002/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: recorded in RUN_MANIFEST.md / RUN_STATE.md / EVIDENCE.md / DECISIONS.md
digest_reverification: at every checkpoint and before the Draft PR
previous_run_artifact_immutable: .agent-run/LR-20260917-DVCC-001/ is not modified by this run
```

## 9. ENDURANCE settings

Not authorized. The run stops at the 8H horizon, at a Hard Boundary, at a scope change, or on the resource policy below.

## 10. Parallelism / roles, operator disturbance and resources

```yaml
orchestrator: plans, decides, reviews diffs, writes the final summary
executor_subagents: read-only discovery / extraction only; no edits, no git, no network, no external services
operator_policy:
  - the Human uses the same Windows machine
  - automated tests run in the background, hidden, on an isolated desktop, non-interactive
  - no repeated foreground popups
  - never open a browser, Explorer, ChatGPT or a GitHub page automatically
  - heavy tasks (build, UI smoke, independent verifier) run sequentially, never in parallel
  - available memory < 12 GiB: do not start heavy verification — checkpoint and SUSPEND
  - never kill unrelated processes
```

## 11. Wave plan

```yaml
wave_0: preflight; Task Packet + digest binding; current architecture review; minimal internal reuse scan -> checkpoint
wave_1: Git inspection Rust boundary; safe local path reuse; timeout / failure model; Rust tests -> checkpoint
wave_2: TypeScript GitObservation model; HEAD comparison; Freshness derivation; independent contract tests -> checkpoint
wave_3: UI integration; Refresh selected; Refresh all (sequential); queue / detail badges; error and unknown states -> checkpoint
wave_4: scratch synthetic repositories; release UI smoke; dogfood-style flow; regression; README / data contract update if required
final: Final Convergence -> Independent Verification -> Draft PR -> STOP
```

## 12. Failure policy

```yaml
hard_check_failure: BLOCKED, stop, escalate to the Human (never Quality Debt)
scope_change_required: stop and ask
product_side_verification_failure: BLOCKED (no retry loop into PASS)
resource_gate: available memory < 12 GiB before heavy verification -> checkpoint + SUSPENDED
```

## 13. Resume contract

Resume verifies: `RUN_MANIFEST.md` binding; the SHA-256 of this snapshot; repository / branch / base / head / clean working tree; then continues from `RUN_STATE.md` "Next action". Any mismatch → BLOCKED and escalate.

## 14. Final convergence

```yaml
sequence:
  - feature freeze
  - freeze the current head
  - full diff review
  - all Required Checks
  - Hard Checks
  - Quality Debt review
  - explicit unverified items
  - Independent Verification (separate context from the implementer)
  - final checkpoint
  - Draft PR
  - STOP
independent_verification_focus:
  - read-only Git guarantee
  - network boundary
  - path validation
  - freshness oracle
  - Review State separation
  - no persistence of volatile current Git state
  - Phase 1 regression
```

## 15. PR / Git policy

```yaml
working_branch: feat/evidence-freshness-v0.2
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
github_actions_workflow_addition: PROHIBITED in this task (report as a Human Decision Candidate if needed)
github_ci_status: none exists; never report a GitHub CI result as PASS
```

## 16. Documentation Sync

```yaml
documentation_sync_trigger: yes
standing_authorization: no
notion_write: PROHIBITED
obsidian_vault_write: PROHIBITED
delivery: canonical facts are returned in the Completion Report only
expected_canonical_change: Phase 1 merged; Phase 2 Evidence / Freshness implementation
```

## 17. Acceptance criteria and completion report contract

```yaml
acceptance_criteria:
  AC2-01: feature branch created from the fresh origin/main merge commit
  AC2-02: the current full HEAD of a local Git repository is obtained read-only
  AC2-03: branch / detached state is determined
  AC2-04: clean / dirty working tree is determined
  AC2-05: UNC / network localRoot is not inspected
  AC2-06: Git unavailable / not-a-repo / timeout fail closed into the UNKNOWN family
  AC2-07: a refresh never changes expectedHead / reviewedHead
  AC2-08: the five Freshness states are derived exactly as contracted
  AC2-09: a Freshness change never changes Review State
  AC2-10: Refresh Git State works for the selected project
  AC2-11: Refresh All runs sequentially
  AC2-12: Freshness and its reason are visible in queue and detail
  AC2-13: after an app restart the observation is UNKNOWN again
  AC2-14: no unintended mutation of a test repository before / after inspection
  AC2-15: product Git inspection performs no network operation
  AC2-16: no regression in Phase 1 persistence / review workflow
  AC2-17: Windows release build and isolated UI smoke PASS
  AC2-18: runtime fixtures contain no real user project and no secret
completion_report_contract: >-
  As specified by the Human in "Phase 2 Evidence / Freshness v0.2 / LONG_RUN Initial Implementation" §33:
  Run ID; Task Packet ID / revision / digest; Final state; Repository; Base; Branch; Head; Draft PR;
  Implemented (Git observation, safe path, timeout, freshness, UI, Refresh all); Freshness Contract per state;
  Read-only Evidence (Git commands, GIT_OPTIONAL_LOCKS, repository state before/after, network operations, mutation);
  Checks; Hard Checks; Independent Verification; Quality Debt; Explicit unverified items;
  Operator disturbance (foreground popup, browser, Explorer, unrelated process killed, minimum available memory);
  GitHub CI none; Documentation Sync Trigger yes; Canonical facts; Obsidian Vault recording candidates; Human Gate; STOP.
```
