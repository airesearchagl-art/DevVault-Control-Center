# Quality Debt — LR-20260920-DVCC-002

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

Never deferrable (always a Hard Gate, never Quality Debt): Security / Privacy, Authentication / Permission, Data integrity / loss / migration, irreversible-data safety, schema corruption, secret exposure, main / merge / Production gates, anything that negates an Acceptance Criterion, and anything that cannot be rolled back. For this Phase additionally: read-only Git guarantee, network boundary, local-path boundary (F-9), and Review State separation.

## Open

none

## Resolved

none
