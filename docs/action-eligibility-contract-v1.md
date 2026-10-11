# Action Eligibility contract v1 (`dvcc.action-eligibility`)

Phase 5B. A versioned, transport-neutral, **read-only** assessment of the closed set of review actions
for one review, built on Control Read v1 (`dvcc.control-read`) and on the same domain functions the
Human UI uses.

- Contract: `dvcc.action-eligibility`, version `1`. Operation: `assess_review_actions`.
- Question answered: *which of the review actions would be refused now for a reason that does not
  depend on the payload, which wait only on the Human decision of the action itself, and which met
  every action-level check.* It is **never an authorization**, a reservation, a lock or a promise of
  success.
- Transport: none. The entry point is the pure function `assessActionEligibility(request, source, env)`
  (`src/domain/actionEligibility/assessEligibility.ts`). No MCP server, IPC channel, named pipe, HTTP
  endpoint, Tauri command or UI exists for it.
- Nothing is written: no storage write, no event, no new file, no assessment record, no cache, no grant
  and no lease. Control Read v1 is unchanged.

## Request

| Field | Value |
|---|---|
| `contract` | `dvcc.action-eligibility` |
| `version` | `1` |
| `operation` | `assess_review_actions` |
| `review_session_id` | the review ID |

No other field is accepted; in particular no payload can be passed (it would be an unrecognized field).

## Envelope

Every successful response carries fixed values:

- `contract: "dvcc.action-eligibility"`, `version: 1`, `operation: "assess_review_actions"`
- `assessment_id` (identifier only — never an authority, lock or concurrency token) and `generated_at`,
  each taken once from the caller's environment, only on success
- `authority: "NONE"`
- `scope: "ACTION_LEVEL"`
- `revalidation: "REQUIRED_BEFORE_EXECUTION"`
- `basis: { contract: "dvcc.control-read", version: 1, operation: "get_review_state" }`
- `not_evaluated`: `ACTION_PAYLOAD`, `AGENT_PERMISSION`, `EXTERNAL_GATES`, `EXECUTION_OUTCOME`
- `data`: `review_session_id`, `project_id`, `current_round` and one assessment per catalog action

There is no `snapshot_id`, and no time-to-live: an assessment is a reading of the current facts, and the
action is revalidated by its own Human path before it runs.

## Dispositions

| Disposition | Meaning at action level |
|---|---|
| `BLOCKED` | At least one evaluated check failed. The refusal does not depend on the payload. |
| `NEEDS_HUMAN` | No check failed; only the Human decision of the action itself remains (`human_decision`). |
| `ELIGIBLE_NOW` | Every check passed. The payload is not evaluated, so a real payload may still be refused at run time. |

Checks run in a fixed order and stop at the first `FAIL`; every later check is `NOT_EVALUATED` with no
evidence. Check outcomes: `PASS`, `FAIL`, `NEEDS_HUMAN`, `NOT_EVALUATED`. Only `human_decision` may
answer `NEEDS_HUMAN` (NH admissibility rule).

## Catalog

| Action | Executor | Checks (in order) | Payload |
|---|---|---|---|
| `review.start_review` | `HUMAN_UI` | `state_guard`, `project_registered`, `expected_head_exact`, `freshness_aligned` | `NOT_APPLICABLE` |
| `review.confirm_verdict` | `HUMAN_UI` | `state_guard`, `verdict_prerequisites`, `project_registered`, `reviewed_head_exact`, `freshness_aligned`, `human_decision` | `NOT_EVALUATED`: `verdict`, `verdict_note`, `human_confirmation` |
| `review.start_next_round` | `HUMAN_UI` | `state_guard`, `project_registered`, `verdict_confirmation_recorded` | `NOT_EVALUATED`: `expected_head` |

Rules: `eligibility.review.start-review@1`, `eligibility.review.confirm-verdict@1`,
`eligibility.review.start-next-round@1`.

| Check | Decided by | Passes when |
|---|---|---|
| `state_guard` | the domain's `guardAction` | the domain allows the action in the current review state |
| `verdict_prerequisites` | the domain's `actionRefusal(…, "confirmVerdict")` | the result (and, after Turn 2, the Final Judgment) is captured, cross-checked with the result-presence fact |
| `project_registered` | Control Read freshness fact | the review's project is registered |
| `expected_head_exact` | Control Read `expected_head` binding | a full commit SHA is recorded |
| `reviewed_head_exact` | Control Read `reviewed_head` and the domain's `headBinding` | a full commit SHA is recorded |
| `freshness_aligned` | Control Read freshness fact | `ALIGNED` only |
| `verdict_confirmation_recorded` | Control Read review-state confirmation | `EXPLICIT` (a durable verdict confirmation) |
| `human_decision` | — | never: always `NEEDS_HUMAN` |

This contract is stricter than the Human UI in two places and never looser: `review.start_review` and
`review.confirm_verdict` need an exact head and `ALIGNED` freshness, and `review.start_next_round` is
blocked when the verdict confirmation is not recorded. The Human UI itself is unchanged.

## Reason codes

`REVIEW_STATE_NOT_ALLOWED`, `ROUND_LIMIT_REACHED`, `RESULT_NOT_CAPTURED`, `FINAL_JUDGMENT_NOT_CAPTURED`,
`DOMAIN_REFUSED_OTHER`, `PROJECT_NOT_REGISTERED`, `EXPECTED_HEAD_NOT_RECORDED`, `EXPECTED_HEAD_NOT_EXACT`,
`REVIEWED_HEAD_NOT_RECORDED`, `REVIEWED_HEAD_NOT_EXACT`, `HEAD_CHANGED`, `REVIEW_STALE`, `WORKTREE_DIRTY`,
`FRESHNESS_UNKNOWN`, `EVIDENCE_INCOMPLETE`, `HUMAN_DECISION_REQUIRED`, `VERDICT_CONFIRMATION_NOT_RECORDED`.

An `UNKNOWN` or `BLOCKED` Control Read fact is never a pass: the check fails, cites no evidence and
reports the fact's reason in `fact_reason`. A head fact that is `UNKNOWN` for a reason other than
`NOTHING_RECORDED` is `EVIDENCE_INCOMPLETE`. A domain refusal outside the closed tables is
`DOMAIN_REFUSED_OTHER`, never a pass.

## Evidence

A `PASS` always cites at least one Control Read evidence reference (`dvcc:…`), copied from the fact it
relied on; a check that cannot cite one fails with `EVIDENCE_INCOMPLETE`. `basis_observed_at` is the
observation time of the freshness fact the action evaluated, else `null`.

## Least disclosure

Output contains only contract constants, the review and project IDs, enumerations, Control Read
evidence references, timestamps and round numbers. Never: paths, URLs, free text, branch names, Git
error messages, domain message keys or parameters, localized text, the probe payload, the internal
basis environment, or any identifier from an identity conflict.

## Identity

The source is scanned without regard to array order before any lookup result is trusted. The request is
refused with `TARGET_UNAVAILABLE` / `IDENTITY_MISMATCH` when two entries carry the review ID, when
another entry's session claims it, when the entry's session names a different ID, when the review's
project is registered more than once, or when the projected basis disagrees with the raw review (ID,
project, current round, review state). An unregistered project is not an identity error: the actions
are `BLOCKED` with `PROJECT_NOT_REGISTERED`.

## Errors

Error codes are the Control Read v1 codes: `INVALID_REQUEST`, `UNSUPPORTED_CONTRACT`,
`UNSUPPORTED_CONTRACT_VERSION`, `UNSUPPORTED_OPERATION`, `INVALID_TARGET`, `SOURCE_UNAVAILABLE`,
`TARGET_NOT_FOUND`, `TARGET_UNAVAILABLE`.

Error reasons: `NOT_AN_OBJECT`, `UNRECOGNIZED_FIELD`, `MISSING_FIELD`, `INVALID_FIELD_TYPE`,
`REQUESTED_VERSION_NOT_SUPPORTED`, `APP_NOT_READY`, `REGISTRY_UNREADABLE`, `REGISTRY_IO_ERROR`,
`REGISTRY_UNSUPPORTED_VERSION`, `BASIS_CONTRACT_VIOLATION`, `UNREADABLE`, `IO_ERROR`, `UNSUPPORTED_VERSION`,
`MISSING`, `IDENTITY_MISMATCH`.

Validation order: plain object → contract → version → operation → unrecognized fields → missing /
mistyped `review_session_id` → (internal Control Read) target format → app ready → registry readable →
identity conflict → not found / unavailable → project uniqueness → basis shape and binding. Internal
Control Read errors are rebuilt from a closed table of ten (code, reason) pairs; anything else is
`SOURCE_UNAVAILABLE` / `BASIS_CONTRACT_VIOLATION`. An error carries no data, and the caller's environment
is not consumed.
