# Run Manifest — LR-20260920-DVCC-003

```yaml
run_id: LR-20260920-DVCC-003
execution_mode: LONG_RUN
endurance: NOT AUTHORIZED
horizon: 8H
started_at: 2026-09-20
project: DevVault Control Center (DVCC)
target: Localization Foundation v0.2.1
repository: airesearchagl-art/DevVault-Control-Center
expected_remote: https://github.com/airesearchagl-art/DevVault-Control-Center.git
base_branch: main
base_sha: 318e273a1afe66c605da897a4f7603aaa921fc83
working_branch: feat/localization-foundation-v0.2.1
task_packet_id: LRP-20260920-DVCC-003
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260920-DVCC-003/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: 1eaf6ee66218e6fa2128db89914dfbc6b03a046e4b83dd94f176a7736e577531
task_packet_snapshot_bytes: 13954
run_artifact_path: .agent-run/LR-20260920-DVCC-003/
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
resume_policy: ENABLED
quality_debt: ENABLED
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
final_output: DRAFT_PR
ready_for_review: PROHIBITED
merge: PROHIBITED
production: PROHIBITED
```

## Human authorization source

Human message "DevVault Control Center — Localization Foundation v0.2.1 / LONG_RUN Implementation" (2026-09-20): Japanese as the standard UI with an English switch is a standing Product requirement, to be implemented as one Long-Run campaign through verification, independent review and a Draft PR. ENDURANCE is not authorized.

## Route sources (read-only, obsidian-vault origin/main)

The five Long-Run route prompts and the four DVCC project documents are the same blobs recorded in `.agent-run/LR-20260920-DVCC-002/RUN_MANIFEST.md`; the vault working tree is a stale detached checkout, so they are read with `git show origin/main:<path>`. The vault is never edited.

## Branch discipline

Phase 2 (`LR-20260920-DVCC-002`) accidentally produced commits on local `main` because a `git checkout main` went unnoticed. In this run `git branch --show-current` is verified immediately before every commit, and a commit is made only on `feat/localization-foundation-v0.2.1`.

## Artifact files

`RUN_MANIFEST.md` (this file) · `TASK_PACKET_SNAPSHOT.md` (immutable) · `RUN_STATE.md` · `TASK_QUEUE.md` · `QUALITY_DEBT.md` · `DECISIONS.md` · `EVIDENCE.md`. The two previous runs' artifacts are historical and are not modified.

## Digest verification procedure

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .agent-run/LR-20260920-DVCC-003/TASK_PACKET_SNAPSHOT.md).Hash.ToLower()
# must equal 1eaf6ee66218e6fa2128db89914dfbc6b03a046e4b83dd94f176a7736e577531
```
