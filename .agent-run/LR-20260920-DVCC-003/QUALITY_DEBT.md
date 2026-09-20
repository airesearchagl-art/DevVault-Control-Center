# Quality Debt — LR-20260920-DVCC-003

Item schema (route contract):

```yaml
- id:
  source_wave:
  type:
  description:
  why_deferred:
  risk: low | medium | high
  blocks_final_verify:
  required_resolution:
  evidence:
  status: open | resolved | accepted_by_human
```

Never deferrable: Security / Privacy, Authentication / Permission, Data integrity / loss / migration, irreversible-data safety, schema corruption, secret exposure, main / merge / production gates, anything that negates an Acceptance Criterion. For this campaign additionally: a missing JA or EN translation is a Required Fix, never Quality Debt.

## Carried forward from LR-20260920-DVCC-002 (out of scope here)

- QD-001 — after a timeout the Git pipe-reader threads are detached until the pipes close.
- QD-002 — `git status` executes filters / file-system monitors configured in the observed repository.

Both keep their Phase 2 classification; this campaign does not change them.

## Open

none

## Resolved

none
