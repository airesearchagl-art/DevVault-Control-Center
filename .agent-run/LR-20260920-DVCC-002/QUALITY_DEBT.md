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

```yaml
- id: QD-001
  source_wave: Wave 5 (independent verification finding F8)
  type: resource_limitation
  description: "When an observation times out, the two pipe-reader threads are detached instead of joined; they end when every write end of the pipe is closed, which a process the killed Git left behind can delay."
  why_deferred: "The alternative — killing the whole process tree with a Windows job object — is a larger change than this phase's scope, and the leak is bounded by the lingering process's own lifetime. No data or correctness effect: the observation itself already failed closed."
  risk: low
  blocks_final_verify: false
  required_resolution: "Start each Git child in a job object and terminate the tree before detaching, so the pipes close immediately."
  evidence: "src-tauri/src/git.rs run_git timeout branch; test a_git_that_leaves_a_lingering_child_still_ends_at_the_bound."
  status: open

- id: QD-002
  source_wave: Wave 5 (independent verification finding F3)
  type: threat_model_boundary
  description: "`git status` honours the observed repository's own configuration, so a clean filter (.gitattributes + filter.*.clean) or a file-system monitor configured in that repository is executed by Git during an observation. The verifier proved this with a probe script that ran four times."
  why_deferred: "It is the user's own repository and their own configuration, executed by Git exactly as it would be for any Git command run in that folder; DVCC adds no privilege. Fully neutralising it (for example `-c filter.<name>.clean=` for every configured filter) needs a design decision about how much of a repository's configuration DVCC may override."
  risk: low
  blocks_final_verify: false
  required_resolution: "Human decision: either document it as accepted (current state), or neutralise filters and hooks explicitly for the observation."
  evidence: "Independent verification F3; mitigated in part by `-c core.fsmonitor=false` on every invocation; stated in README.md and docs/data-contract-v1.md."
  status: open
```

## Resolved

none
