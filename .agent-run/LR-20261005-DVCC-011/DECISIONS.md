# Decisions — LR-20261005-DVCC-011

## D-01 — review_state confirmation classification (HD-5A-09)

Status: **ADOPTED — option A** (Human decision HD-5A-09)

Implementation discovery (authorized STOP, rev 3.1 §8 / §20), found before any Control Read
product implementation:

- rev 3.1 §8 classified `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED` as EXPLICIT because they were
  "reached only by `confirmVerdict` / `block` (`confirmedByHuman` required)".
- The existing domain does not support that rationale:
  - `resume` restores `suspendedFrom` into `reviewState` without `confirmedByHuman`
    (`src/domain/transitions.ts:472`);
  - `block` records a round verdict only when blocking from `REVIEWING`
    (`src/domain/transitions.ts:440`).
- Confirmed consistent (no change needed): `reviewedHead` is written together with
  `resultCapturedAt` (`transitions.ts:266-267`); `verdict` only together with
  `verdictConfirmedAt` via `confirmVerdict` / `block` (`:418`, `:440`); `riskTier` only via
  `setRiskTier` (`confirmedByHuman`); `CLOSED` only via `close`; persistence invariant
  `session !== null` ⇔ `health.status ∈ {ok, restored_from_backup}`.

Decision (option A — durable-record-based conservative classification):

- `CLOSED` → EXPLICIT
- `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED` → EXPLICIT iff `currentRound.verdict === session.reviewState`
  AND `currentRound.verdictConfirmedAt !== null`; otherwise ENTERED
- `NEW` / `READY_FOR_REVIEW` / `REVIEWING` / `SUSPENDED` → ENTERED
- No event-history inference, no state-name-only inference, no inference from `suspendedFrom` alone.
- `transitions.ts` is not modified; the projection adapts to the existing domain truth.

Rejected: option B (CLOSED only EXPLICIT — discards durable verdict evidence); option C (keep the
rev 3.1 table with an induction argument — trusts `suspendedFrom` on disk).

Effect: Task Packet rev 3.2 (§8 rules, §14 confirmation tests, §15 M-5A-33..36, AC5A-23 /
AC5A-27, §19 HD table). No other contract / architecture / scope change.

## D-02 — Snapshot handling

- rev 3.1 snapshot (`TASK_PACKET_SNAPSHOT.md`, SHA-256 `de0d0f8e…3d18da`) is preserved unchanged
  as evidence of the packet initially authorized.
- rev 3.2 is recorded as a second immutable snapshot (`TASK_PACKET_SNAPSHOT_REV3_2.md`,
  SHA-256 `1d663c7c…44d2bd02`), created after branch creation and before Control Read product
  implementation.

## D-03 — Structural, minimal source types in the domain

`ControlReadSource` is declared in `src/domain/controlRead/contract.ts` with structural types
(`ControlReadSourceProject` = projectId / repositoryUrl / localRoot / createdAt;
`ControlReadSourceReview.health` = `{ status }` only; `SourceHealthStatus` mirrors the six
`FileHealth` statuses). The domain does not import `services/persistence`, and the projection cannot
reach display name, notes, next action, health messages or set-aside names through its types. A new
`FileHealth` status would stop `AppState` from being assignable (compile-time guard).

## D-04 — Fail-closed edges not spelled out in rev 3.2

- Observed HEAD is OBSERVED only when `headBinding(head) === "EXACT"` (full SHA, the existing
  workflow test); otherwise `UNKNOWN HEAD_NOT_COMPARABLE`. Observed `dirty` / `detached` null →
  `UNKNOWN OBSERVATION_FAILED` (the existing `unknownCause` grouping for the same condition).
- A review whose `session !== null` but whose status is not readable is treated as unattributable
  (the persistence invariant says this cannot occur; the code does not trust it).
- `get_review_state` follows the registry gate too (§13: freshness needs the project's local root and
  creation time).
- `fields` is omitted when no unrecognized name is listable (all unsafe).

## D-05 — Human UI adapter details

- `onCopyControlSnapshot` is an optional `ReviewDetail` prop; the button renders only when wired, so
  existing component tests are unchanged.
- The copied JSON is pretty-printed (2 spaces + final newline) for the Human; the contract content is
  the `readControl` result unchanged.
- Refusals toast only the error code; a copy failure toasts a fixed sentence (no underlying message).
- `snapshot_id` = `snap-` + UUID v4 from `crypto.getRandomValues` (`newControlSnapshotId`).

## D-07 — Round verdict confirmation fails conservative (RF-5A-IR-01)

Independent FULL Review (`41b4ee95…`) required that a stored round verdict not be `EXPLICIT` merely
because it is non-null. Same durable-evidence principle as HD-5A-09: `EXPLICIT` (with
`recorded_at = verdictConfirmedAt`) only when `verdictConfirmedAt` is set; otherwise `ENTERED` with
`recorded_at: null`; no verdict → `UNKNOWN NOTHING_RECORDED`. `schema.ts` / `transitions.ts` are not
tightened; the projection represents the source as it exists.

## D-06 — Mutation probe split and pre-run coverage

M-5A-17 ("projection / copy action writes") was run as 17a (projection writes into its source,
killed by the frozen-source test) and 17b (copy action writes twice). Two probes (M-5A-10 display-name
lookup with a valid-looking name, M-5A-18 envelope `complete`) had no killing test before the
campaign; the identity and truncation tests were added before running it.
