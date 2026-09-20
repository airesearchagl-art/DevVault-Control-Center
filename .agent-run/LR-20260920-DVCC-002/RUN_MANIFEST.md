# Run Manifest — LR-20260920-DVCC-002

```yaml
run_id: LR-20260920-DVCC-002
execution_mode: LONG_RUN
endurance: NOT AUTHORIZED
horizon: 8H
started_at: 2026-09-20
project: DevVault Control Center (DVCC)
phase: Phase 2 — Evidence / Freshness (v0.2)
repository: airesearchagl-art/DevVault-Control-Center
expected_remote: https://github.com/airesearchagl-art/DevVault-Control-Center.git
base_branch: main
base_sha: f557aa6f15222099f54790180e0ff71c5291734a
working_branch: feat/evidence-freshness-v0.2
task_packet_id: LRP-20260920-DVCC-002
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260920-DVCC-002/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: b9ecd5c0d1a9d8388cc212072c3c08a5a57a45af90035c4f2a2232688a6f9dd8
task_packet_snapshot_bytes: 17432
run_artifact_path: .agent-run/LR-20260920-DVCC-002/
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
resume_policy: ENABLED
quality_debt: ENABLED
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
remove_run_artifact_before_final_pr: false
final_output: DRAFT_PR
ready_for_review: PROHIBITED
merge: PROHIBITED
production: PROHIBITED
```

## Human authorization source

Standing Long-Run authorization in the development thread (2026-09-17): 「開発のペースとしては、小間切れで進めていくのではなくて、ある程度長時間の開発IDEが動き続けるような指示の出し方をしてください」, restated for this campaign in the Human message "DevVault Control Center — Phase 2 Evidence / Freshness v0.2 / LONG_RUN Initial Implementation" (2026-09-20) §2. ENDURANCE is explicitly NOT authorized.

## Route sources (read-only, obsidian-vault origin/main 4d3b60b @ 2026-09-20)

| File | Blob |
|---|---|
| `02_Prompts/LLM_IDE/Long_Run_Development_Route.md` | 0e7df41d08f956304f185d0a7cc4eded62d1767e |
| `03_Templates/Long_Run_Task_Packet.md` | d655e1a540eb7f53b6cea0df0603aa62bdead161 |
| `02_Prompts/LLM_IDE/Implementation_Task_Prompt.md` | cd5b3bbabb42ee3d65d753dafea92cfb7c8b8d5a |
| `02_Prompts/LLM_IDE/Claude_Code_Capability_Tier_Orchestration.md` | 4971f05a5c14de1893cf8e2b3003b7f221022be2 |
| `02_Prompts/LLM_IDE/Documentation_Sync_Handoff.md` | 6fbaca873580db0eeafd4dc9b78d4f72349ad0d4 |
| `00_Index/Development_Dashboard_Data_Contract.md` | bc3c2caa67a97964c2fa50e1622a850813977a86 |
| `01_Projects/DevVault-Control-Center/00_Project_Brief.md` | ef87205eb4f4… (read from origin/main) |
| `01_Projects/DevVault-Control-Center/01_Roadmap.md` | d34c60826112… (read from origin/main) |
| `01_Projects/DevVault-Control-Center/03_Decisions.md` | c3f01871c2a7… (read from origin/main) |
| `01_Projects/DevVault-Control-Center/05_LLM_IDE_Instructions.md` | 35aaa20e5fe1… (read from origin/main) |

The vault working tree is a detached checkout from 2026-09-13 and its local `main` is 333 commits behind; all route reading for this run therefore uses `git show origin/main:<path>` (read-only). The vault was not edited, checked out, reset or otherwise modified; only remote-tracking refs were updated by a `git fetch`.

## Artifact files

- `RUN_MANIFEST.md` — this file (identity and binding)
- `TASK_PACKET_SNAPSHOT.md` — immutable Task Packet (revision 1)
- `RUN_STATE.md` — current campaign state (Resume entry point)
- `TASK_QUEUE.md` — wave task queue
- `QUALITY_DEBT.md` — non-hard deferred items
- `DECISIONS.md` — decisions made during the run
- `EVIDENCE.md` — preflight and checkpoint evidence

The previous run's artifacts (`.agent-run/LR-20260917-DVCC-001/`) are historical and are not modified by this run.

## Digest verification procedure

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .agent-run/LR-20260920-DVCC-002/TASK_PACKET_SNAPSHOT.md).Hash.ToLower()
# must equal b9ecd5c0d1a9d8388cc212072c3c08a5a57a45af90035c4f2a2232688a6f9dd8
```
