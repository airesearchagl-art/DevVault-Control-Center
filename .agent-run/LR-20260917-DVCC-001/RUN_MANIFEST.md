# Run Manifest — LR-20260917-DVCC-001

```yaml
run_id: LR-20260917-DVCC-001
execution_mode: LONG_RUN
endurance: NOT AUTHORIZED
horizon: 8H
started_at: 2026-09-17T13:27:59Z
project: DevVault Control Center (DVCC)
repository: airesearchagl-art/DevVault-Control-Center
expected_remote: https://github.com/airesearchagl-art/DevVault-Control-Center.git
base_branch: main
base_sha: bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d
working_branch: feat/review-hub-v0.1
task_packet_id: LRP-20260917-DVCC-001
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b
task_packet_snapshot_bytes: 21438
run_artifact_path: .agent-run/LR-20260917-DVCC-001/
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
resume_policy: ENABLED
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
final_output: DRAFT_PR
ready_for_review: PROHIBITED
merge: PROHIBITED
production: PROHIBITED
```

## Human authorization source

Human instruction in the current development thread (2026-09-17):
「開発のペースとしては、小間切れで進めていくのではなくて、ある程度長時間の開発IDEが動き続けるような指示の出し方をしてください」,
confirmed by the Human message "DevVault Control Center — Review Hub v0.1 LONG_RUN Implementation Authorization".

## Route sources (read-only, obsidian-vault main)

| File | Blob |
|---|---|
| `02_Prompts/LLM_IDE/Long_Run_Development_Route.md` | 0e7df41d08f956304f185d0a7cc4eded62d1767e |
| `03_Templates/Long_Run_Task_Packet.md` | d655e1a540eb7f53b6cea0df0603aa62bdead161 |
| `02_Prompts/LLM_IDE/Implementation_Task_Prompt.md` | cd5b3bbabb42ee3d65d753dafea92cfb7c8b8d5a |
| `02_Prompts/LLM_IDE/Claude_Code_Capability_Tier_Orchestration.md` | 4971f05a5c14de1893cf8e2b3003b7f221022be2 |
| `02_Prompts/LLM_IDE/Documentation_Sync_Handoff.md` | 6fbaca873580db0eeafd4dc9b78d4f72349ad0d4 |
| `01_Projects/DevVault-Control-Center/05_LLM_IDE_Instructions.md` | 35aaa20e5fe1bade84b3c7c068d16a7df09d99f9 |

## Artifact files

- `RUN_MANIFEST.md` — this file (identity and binding)
- `TASK_PACKET_SNAPSHOT.md` — immutable Task Packet (revision 1)
- `RUN_STATE.md` — current campaign state (Resume entry point)
- `TASK_QUEUE.md` — wave task queue
- `QUALITY_DEBT.md` — non-hard deferred items
- `DECISIONS.md` — decisions made during the run
- `EVIDENCE.md` — preflight and checkpoint evidence

## Digest verification procedure

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md).Hash.ToLower()
# must equal task_packet_digest_sha256 above
```
