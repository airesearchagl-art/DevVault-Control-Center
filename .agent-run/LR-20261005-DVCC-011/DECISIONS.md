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
