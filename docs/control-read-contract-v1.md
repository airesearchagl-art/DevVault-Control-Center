# Control Read contract v1 (`dvcc.control-read`)

Phase 5A. A versioned, transport-neutral, **read-only** machine contract for the current facts of one
registered Project, built from the same domain and application sources the Human UI uses.

- Contract: `dvcc.control-read`, version `1`.
- Question answered: *what is true now, as far as DVCC knows.* It never answers what an agent may do
  (Action Eligibility is a later phase).
- Transport: none. The entry point is the pure function `readControl(request, source, env)`
  (`src/domain/controlRead/readControl.ts`). No MCP server, IPC channel, named pipe, HTTP endpoint or
  Tauri command exists for it; MCP may later be an adapter, never the canonical contract.
- Human UI adapter: **Copy control snapshot (JSON)** on a review's detail copies the sanitized
  `get_control_snapshot` response of that review's project to the clipboard. Nothing is persisted.
- Nothing is written: no storage write, no event, no new file. Runtime observations stay runtime-only.

## Operations

| Operation | Request fields | Result |
|---|---|---|
| `get_control_snapshot` | `contract`, `version`, `operation`, `project_id` | project state, its readable reviews, `unattributable_review_count`, `external_gates` |
| `get_project_state` | `contract`, `version`, `operation`, `project_id` | project state |
| `get_review_state` | `contract`, `version`, `operation`, `review_session_id` | one review state |
| `get_run_state` | — | always refused: `UNSUPPORTED_OPERATION` / `NO_AUTHORITATIVE_RUN_SOURCE` (reserved name; no Run model exists) |

Every successful response is an envelope: `contract`, `version`, `operation`, `snapshot_id`
(identifier only — never an authority, lock or concurrency token), `generated_at`, `complete`,
`limits_applied` (`MAX_REVIEWS`, `MAX_ROUNDS`), `omitted_sections` (always `ide_sessions`, `runs`,
`action_eligibility`, `queue_order`) and `data`. When `complete` is false, the absence of an item
proves nothing.

Limits: at most 50 readable non-CLOSED reviews per project (by review ID, descending) and the 20 most
recent rounds per review.

## Fact classes

| Class | Meaning | Always carries |
|---|---|---|
| `OBSERVED` | DVCC observed it locally (the Human-triggered Git observation) | `observed_at`, `source: GIT_OBSERVATION`, `evidence_ref` |
| `HUMAN_CONFIRMED` | entered (`ENTERED`) or explicitly confirmed (`EXPLICIT`) by the Human in DVCC; not verified against an external source | `confirmation`, `recorded_at` (exact field timestamp or `null`), `evidence_ref` |
| `DERIVED` | computed deterministically from other facts | `rule`, `derived_from`, `basis_observed_at` |
| `UNKNOWN` | no value, not observed, or undecidable | `unknown_reason` |
| `BLOCKED` | DVCC cannot or will not provide the value | `blocked_reason` |

`recorded_at` is never an entity-level `createdAt` / `updatedAt`. Exact sources: a reviewed head uses
`resultCapturedAt`, a verdict uses `verdictConfirmedAt`; repository, resource state, PR number,
expected head, risk tier and review state have no field timestamp and report `null`. Presence
(`result_captured`, `judgment_captured`, `local_root`) is `DERIVED`; an absence is never a Human
confirmation.

Rules (`rule`): `project.local-root-presence@1`, `round.result-presence@1`,
`round.judgment-presence@1`, `freshness.derive@1`.

`unknown_reason`: `NOT_OBSERVED` (no raw observation in this DVCC process), `OBSERVATION_INVALIDATED`
(a raw observation exists but no longer describes the project's current local root / identity),
`GIT_UNAVAILABLE`, `NO_LOCAL_ROOT`, `NOT_A_GIT_REPOSITORY`, `OBSERVATION_FAILED`,
`HEAD_NOT_COMPARABLE`, `NOTHING_RECORDED`, `PROJECT_NOT_REGISTERED`, `NOT_TRACKED_BY_DVCC` (PR, merge,
CI and other external gates are outside DVCC).

`blocked_reason`: `WITHHELD_BY_POLICY` (a value exists but is never disclosed — the local root path),
`INVALID_SOURCE_VALUE` (a stored value fails the existing domain validator; it is not echoed).

### Review state confirmation (HD-5A-09)

The confirmation of `review_state` uses only durable state available to Control Read:

- `CLOSED` → `EXPLICIT`.
- `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED` → `EXPLICIT` only if the current round's `verdict`
  equals the review state **and** its `verdictConfirmedAt` is set; otherwise `ENTERED`.
- `NEW` / `READY_FOR_REVIEW` / `REVIEWING` / `SUSPENDED` → `ENTERED`.

No inference from the state name alone, from `suspendedFrom`, or from event history.

## Evidence references

`evidence_ref` and `derived_from` hold only these seven variants, built from validated stable IDs,
round numbers, closed field names and ISO-8601 observation times — never from a path, a display name,
a note, an error message or a provider identifier:

| Kind | Form |
|---|---|
| `project` | `dvcc:project/<projectId>` |
| `project-repository` | `dvcc:project/<projectId>/repository` |
| `project-local-root` | `dvcc:project/<projectId>/local-root` |
| `review` | `dvcc:review/<reviewSessionId>` |
| `review-field` | `dvcc:review/<reviewSessionId>/field/<review-state\|resource-state\|pr-number>` |
| `review-round-field` | `dvcc:review/<reviewSessionId>/round/<n>/<expected-head\|reviewed-head\|result\|verdict\|judgment\|risk-tier>` |
| `git-observation` | `dvcc:git-observation/<projectId>/<observedAt>` |

## Least disclosure

Never in a response: the local root path, the data folder path, the Codex executable path, display
name, notes, next actions, review type, ChatGPT thread title or URL, verdict note, checkpoint, request /
result / judgment bodies, event notes, Git branch name, Git error messages, file health messages or
set-aside names, IDE / provider session identifiers, workspaces or transcripts, credentials. The
repository appears only as `{ host, owner, name }` from the canonical URL.

## Errors

Every error is `{ contract, version: 1, error: { code, reason?, fields?, unlisted_field_count?,
supported_versions? } }`. Requests are validated in this fixed order:

1. not a plain object → `INVALID_REQUEST` / `NOT_AN_OBJECT`
2. another contract → `UNSUPPORTED_CONTRACT`
3. any version but the number `1` → `UNSUPPORTED_CONTRACT_VERSION` / `REQUESTED_VERSION_NOT_SUPPORTED`, `supported_versions: [1]` (no negotiation)
4. unknown operation → `UNSUPPORTED_OPERATION`; `get_run_state` → `UNSUPPORTED_OPERATION` / `NO_AUTHORITATIVE_RUN_SOURCE`
5. unrecognized field → `INVALID_REQUEST` / `UNRECOGNIZED_FIELD` — names matching `^[a-z][a-z0-9_]{0,63}$` are listed in `fields`; others are only counted in `unlisted_field_count` (present only when at least one); values are never echoed
6. missing or mistyped target → `INVALID_REQUEST` / `MISSING_FIELD` or `INVALID_FIELD_TYPE`
7. target fails the existing project / review ID validator → `INVALID_TARGET`
8. app data not loaded → `SOURCE_UNAVAILABLE` / `APP_NOT_READY`
9. project registry unreadable → `SOURCE_UNAVAILABLE` / `REGISTRY_UNREADABLE`, `REGISTRY_IO_ERROR` or `REGISTRY_UNSUPPORTED_VERSION` (absence is never inferred from a registry DVCC could not read)
10. lookup → `TARGET_NOT_FOUND` (readable source, no such target) or `TARGET_UNAVAILABLE` / `UNREADABLE`, `IO_ERROR`, `UNSUPPORTED_VERSION` or `MISSING` (the review exists but its session file cannot be read)

A review whose session cannot be read is never projected: in a snapshot it only increments
`unattributable_review_count`.

## Example

`get_control_snapshot` for `project-alpha` (synthetic), right after start-up (Git not observed yet):

```json
{
  "contract": "dvcc.control-read",
  "version": 1,
  "operation": "get_control_snapshot",
  "snapshot_id": "snap-3b1f0c6e-2a44-4f7e-9d1a-0c5e8b7a6d21",
  "generated_at": "2026-10-04T01:00:00.000Z",
  "complete": true,
  "limits_applied": [],
  "omitted_sections": ["ide_sessions", "runs", "action_eligibility", "queue_order"],
  "data": {
    "project": {
      "project_id": "project-alpha",
      "registry_health": "ok",
      "repository": { "class": "HUMAN_CONFIRMED", "value": { "host": "github.com", "owner": "example-org", "name": "example-app" }, "confirmation": "ENTERED", "recorded_at": null, "evidence_ref": "dvcc:project/project-alpha/repository" },
      "local_root": { "class": "DERIVED", "value": true, "rule": "project.local-root-presence@1", "derived_from": ["dvcc:project/project-alpha/local-root"], "basis_observed_at": null, "basis_recorded_at": null, "path": { "class": "BLOCKED", "blocked_reason": "WITHHELD_BY_POLICY" } },
      "git": {
        "head": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" },
        "dirty": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" },
        "detached": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" }
      },
      "review_session_ids": ["rv-20261003-a1b2c3"],
      "closed_review_count": 0
    },
    "reviews": ["…"],
    "unattributable_review_count": 0,
    "external_gates": { "class": "UNKNOWN", "unknown_reason": "NOT_TRACKED_BY_DVCC" }
  }
}
```
