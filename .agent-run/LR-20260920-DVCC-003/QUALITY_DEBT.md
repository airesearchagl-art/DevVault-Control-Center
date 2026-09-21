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

## After the Final Independent FULL Review of PR #3 (2026-09-21)

Deferred by the Human in the Focused Repair packet, and not touched here:

- P3-3 — the hard-coded-text scanner is a regular-expression scan, not an AST walk. It skips a
  sentence carrying code punctuation and only reads the three rendering directories. Named as a
  known limit in the test itself.
- Advisories from the same review: the start-up race advisory, `CommandError` wording from Rust,
  `app.subtitle` and the detached-HEAD wording, and a scan for translation keys nobody uses.
- Phase 2 carry-overs QD-001 (reader threads detached after a timeout) and QD-002 (`git status`
  runs filters configured in the observed repository).
