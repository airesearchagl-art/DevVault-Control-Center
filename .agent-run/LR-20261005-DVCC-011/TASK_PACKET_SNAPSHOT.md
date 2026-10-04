# Task Packet — DVCC Phase 5A: Control Read Contract Vertical Slice (rev 3)

```text
PHASE_5A_IMPLEMENTATION_AUTHORIZED = NO
```

- Packet status: **REVISED FOR FINAL REVIEW** (`PHASE_5A_TASK_PACKET_FINAL_REVIEW`) — not an authorization
- Revision: rev 3.1 (2026-10-04) — closes RF-5A-R3-01 (RF-5A-R2-01 … 04 closed in rev 3; RF-5A-01 … 05 closed in rev 2)
- Repository: `airesearchagl-art/DevVault-Control-Center`
- Required implementation base: **`7efdc62cd1a72679355d8488481c9b071ddd3081`** (main; PR #11 merge commit)
- Human decisions HD-5A-01 … HD-5A-08: **RESOLVED / ADOPTED** (§19)
- Data Model Gate (expected): **NONE / EXISTING**
- Transport: **none** (MCP / IPC / new Tauri command / DOT are out of scope)
- Adopted architecture: **unchanged** (transport-neutral pure projection over the Human UI's own domain / application sources)

> この文書は実装準備のための提案である。HumanがPhase 5A implementation authorizationを別途発行するまで、implementation branchの作成もproduct code変更も行わない。

### Revision log

| Rev | RF | 修正 |
|---|---|---|
| 2 | RF-5A-01 … 05 | base固定、truthful provenance、unattributable count / INVALID_REQUEST、queue rank除外、smoke Case分離（CLOSED） |
| 3 | RF-5A-R2-01 | FileHealthの判別キーを実モデルどおり`status`へ（`projectsHealth.status` / `LoadedReview.health.status`） |
| 3 | RF-5A-R2-02 | unreadable sourceから不在を推論しない。registry unreadable / io_error / unsupported_version → `SOURCE_UNAVAILABLE`（明示reason）。review存在 + `session === null` → `TARGET_UNAVAILABLE`（明示reason）。snapshotでは`unattributable_review_count`のみでReviewStateV1を捏造しない |
| 3 | RF-5A-R2-03 | ID / repository検証は既存`isValidProjectId()` / `isValidReviewId()` / `normalizeRepositoryUrl()`（timestampは`isIsoTimestamp()`、roundは`MAX_REVIEW_ROUNDS`）を再利用。Control Read内に独自regexを持たない |
| 3 | RF-5A-R2-04 | `EvidenceRef`を承認済み7 variantのbranded型に限定し、検証済みstable ID / round / timestamp / 固定enumだけを受け取るpure builder経由でのみ生成。raw source textを補間しない |
| 3.1 | RF-5A-R3-01 | `UNRECOGNIZED_FIELD` exampleをcontract定義に一致させた（safe keyのみの場合`unlisted_field_count`なし）。`unlisted_field_count`はsafe echo pattern外のunknown keyが1件以上ある場合だけ付与。safe / unsafe / mixedの3ケースをrequest / disclosure testsで固定。Architecture・scope・ACは不変 |

---

## 1. Exact Fresh Gate（実装開始時に必ず実行）

```text
repository:      airesearchagl-art/DevVault-Control-Center
branch:          main
HEAD == origin/main == 7efdc62cd1a72679355d8488481c9b071ddd3081
worktree:        clean  (git status --porcelain --untracked-files=all = empty)
baseline:        npm run typecheck -> clean ; npm test -> all pass (record file / test counts)
open PRs:        gh pr list --state open --json number
                 for each open PR: gh pr view <N> --json files
                 STOP if any open PR touches
                   - src/**
                   - any path in §9 (planned change files), including
                     README.md, docs/control-read-contract-v1.md,
                     scripts/verify-control-read-ui.ps1, src/test/docsContract.test.ts,
                     src/i18n/ja.ts, src/i18n/en.ts, src/app/App.tsx,
                     src/features/reviews/ReviewDetail.tsx
helpers present: src/domain/validation.ts exports isValidProjectId, isValidReviewId,
                 isIsoTimestamp, normalizeRepositoryUrl (unchanged signatures);
                 src/domain/limits.ts exports MAX_REVIEW_ROUNDS
authorization:   a Human-issued "PHASE_5A_IMPLEMENTATION_AUTHORIZED = YES" for this packet revision
```

不一致・base drift・unknown change・helper signature差異があればSTOP。reset / clean / stashで消さない。

## 2. Exact base main

- **`7efdc62cd1a72679355d8488481c9b071ddd3081`**（PR #11 "docs: repair README current state after Phase 4b-2b merge" のmerge commit、2026-10-03T23:43:50Z merged）
- PR #11 merge条件: **RESOLVED**
- このbase上で `docsContract.test.ts` は merged 4b-2b のcurrent truthを検査している（5Aはこれを壊さない）

## 3. Implementation branch proposal

`feat/control-read-contract-v1`（作成はauthorization後、Task Packet snapshot + SHA-256をmain上で記録した後）

## 4. Scope

1 registered Projectの**current facts**を、Human UIと**同じDomain / Application source**から、versioned・sanitized・machine-readableなread-onlyのcontractとして取得できるようにする。

- transport-neutralな **Control Read v1**（型・request/response envelope・pure projection・EvidenceRef builders）を `src/domain/controlRead/` に追加
- AppState（Human UIが実際に使っている状態）からprojection inputを作るpure adapterを `src/app/controlReadSource.ts` に追加
- operations（v1）:
  - `get_control_snapshot`（1 project + そのreadable reviews）
  - `get_project_state`
  - `get_review_state`
  - `get_run_state` は**予約名のみ**。常に `UNSUPPORTED_OPERATION` / `NO_AUTHORITATIVE_RUN_SOURCE`（Run modelを捏造しない）
- version mismatch / unknown fieldの明示拒否
- unreadable sourceのfail-closed（不在を推論しない）
- fact class（OBSERVED / HUMAN_CONFIRMED / DERIVED / UNKNOWN / BLOCKED）と truthful provenance
- least disclosure（§11）、closed EvidenceRef grammar
- **Human UI adapter（HD-5A-01 ADOPTED）**: Review detailの「Copy control snapshot (JSON)」— 既存Copy Resume Commandと同型のcopy-only action。選択中reviewの`projectId`で`get_control_snapshot`を実行し、sanitized JSONをclipboardへ書くだけ

## 5. Non-goals

- MCP / local IPC / named pipe / HTTP / **new Tauri command** / window global（5C）
- DOT接続（5D）
- Action Eligibility / `allowed_actions` / 優先順位付け / 「Agentが何をしてよいか」（5B）。queue順位もv1に含めない
- Operation / ApprovalGrant / Lease / Worker / Run model（5E–5F）
- Events / notification（5H）、Jev
- 新しいdurable entity / 保存（snapshot保存・audit log含む）。必要と判明したらSTOPしてData Model Gate
- Rustへのbusiness rule移植
- IDE sessions（provider session）の出力（HD-5A-04 ADOPTED: `omitted_sections`に明記）
- 既存domain rule / validator helperの挙動変更
- README Status blockの更新（merge後のcurrent-state syncで行う）

## 6. Proposed Control Read v1 TypeScript types

`src/domain/controlRead/contract.ts`（案）

```ts
import type { EvidenceRef } from "./evidenceRef";

export const CONTROL_READ_CONTRACT = "dvcc.control-read" as const;
export const CONTROL_READ_VERSION = 1 as const;

export type FactClass = "OBSERVED" | "HUMAN_CONFIRMED" | "DERIVED" | "UNKNOWN" | "BLOCKED";

/** Closed set of derivation rules in v1 (no free-form rule strings). */
export type RuleId =
  | "project.local-root-presence@1"
  | "round.result-presence@1"
  | "round.judgment-presence@1"
  | "freshness.derive@1";

export type UnknownReason =
  | "NOT_OBSERVED"              // no raw observation exists in this DVCC process (observations are runtime-only)
  | "OBSERVATION_INVALIDATED"   // a raw observation exists AND observationForProject(...) === undefined
  | "GIT_UNAVAILABLE" | "NO_LOCAL_ROOT" | "NOT_A_GIT_REPOSITORY" | "OBSERVATION_FAILED"
  | "HEAD_NOT_COMPARABLE"
  | "NOTHING_RECORDED"          // the persisted model holds no value
  | "PROJECT_NOT_REGISTERED"    // a readable review names a projectId absent from a readable registry
  | "NOT_TRACKED_BY_DVCC";      // PR / merge / CI / external gates: DVCC does not know

export type BlockedReason =
  | "WITHHELD_BY_POLICY"        // a value EXISTS but this contract never discloses it
  | "INVALID_SOURCE_VALUE";     // a stored value fails the existing domain validator; never echoed

export type HumanConfirmation = "EXPLICIT" | "ENTERED";

export type Fact<T> =
  | { class: "OBSERVED"; value: T; observed_at: string; source: "GIT_OBSERVATION"; evidence_ref: EvidenceRef }
  | {
      class: "HUMAN_CONFIRMED";
      value: T;
      confirmation: HumanConfirmation;
      /** Exact source timestamp of THIS value, or null when the persisted model has no authoritative field timestamp.
       *  Never substituted with an entity-level updatedAt / createdAt. */
      recorded_at: string | null;
      evidence_ref: EvidenceRef;
    }
  | { class: "DERIVED"; value: T; rule: RuleId; derived_from: EvidenceRef[]; basis_observed_at: string | null }
  | { class: "UNKNOWN"; unknown_reason: UnknownReason }
  | { class: "BLOCKED"; blocked_reason: BlockedReason };

/** Presence derived from persisted records. `false` is an absence, never a Human confirmation. */
export interface PresenceFact<V extends boolean = boolean> {
  class: "DERIVED";
  value: V;
  rule: RuleId;
  derived_from: EvidenceRef[];
  basis_observed_at: null;              // derived from records, not from an observation
  basis_recorded_at: string | null;     // exact source timestamp when present (e.g. resultCapturedAt), else null
}

export type LocalRootV1 =
  | (PresenceFact<true> & { path: { class: "BLOCKED"; blocked_reason: "WITHHELD_BY_POLICY" } })
  | (PresenceFact<false> & { path?: never });   // not configured: no path exists, so nothing is "withheld"

export interface RepositoryIdentity { host: "github.com"; owner: string; name: string }

/** Only readable health can appear inside a returned fact set (unreadable sources fail closed, §13). */
export type ReadableHealth = "ok" | "restored_from_backup";

export interface ProjectStateV1 {
  project_id: string;                                  // stable ID (immutable projectId; isValidProjectId)
  registry_health: ReadableHealth;                     // projectsHealth.status (ok | restored_from_backup)
  repository: Fact<RepositoryIdentity>;                // HUMAN_CONFIRMED/ENTERED (recorded_at: null) | UNKNOWN NOTHING_RECORDED | BLOCKED INVALID_SOURCE_VALUE
  local_root: LocalRootV1;
  git: { head: Fact<string>; dirty: Fact<boolean>; detached: Fact<boolean> };   // OBSERVED | UNKNOWN
  review_session_ids: string[];                        // readable, non-CLOSED; sorted by reviewSessionId DESC; capped (§13)
  closed_review_count: number;                         // readable CLOSED reviews of this project
}

export interface RoundStateV1 {
  round: number;
  expected_head: Fact<string> & { binding?: "EXACT" | "SHORT" | "MISSING" };   // HUMAN_CONFIRMED/ENTERED (recorded_at: null) | UNKNOWN
  reviewed_head: Fact<string>;                         // HUMAN_CONFIRMED/ENTERED (recorded_at: resultCapturedAt) | UNKNOWN
  result_captured: PresenceFact;                       // basis_recorded_at: resultCapturedAt | null
  verdict: Fact<"FIX_REQUIRED" | "REVIEW_PASS" | "BLOCKED">;   // HUMAN_CONFIRMED/EXPLICIT (recorded_at: verdictConfirmedAt) | UNKNOWN
  judgment_captured: PresenceFact;                     // basis_recorded_at: judgmentCapturedAt | null
  risk_tier: Fact<"TIER_0" | "TIER_1" | "TIER_2">;     // HUMAN_CONFIRMED/EXPLICIT (recorded_at: null) | UNKNOWN
}

export type ReviewStateValue = "NEW" | "READY_FOR_REVIEW" | "REVIEWING" | "FIX_REQUIRED" | "REVIEW_PASS" | "BLOCKED" | "SUSPENDED" | "CLOSED";
export type FreshnessValue = "ALIGNED" | "HEAD_CHANGED" | "REVIEW_STALE" | "WORKTREE_DIRTY";   // "UNKNOWN" is expressed as class UNKNOWN

/** Built ONLY from a LoadedReview whose session !== null (health.status ok | restored_from_backup). */
export interface ReviewStateV1 {
  review_session_id: string;                           // rv-YYYYMMDD-xxxxxx (isValidReviewId)
  project_id: string;                                  // from the readable session; never fabricated
  file_health: ReadableHealth;                         // LoadedReview.health.status
  review_state: Fact<ReviewStateValue>;                // HUMAN_CONFIRMED (confirmation per §8 table; recorded_at: null)
  resource_state: Fact<"HOT" | "WARM" | "COLD">;       // HUMAN_CONFIRMED/ENTERED (recorded_at: null)
  pr_number: Fact<number>;                             // HUMAN_CONFIRMED/ENTERED (recorded_at: null) | UNKNOWN NOTHING_RECORDED
  current_round: number | null;
  rounds: RoundStateV1[];                              // most recent first; capped (§13)
  freshness: Fact<FreshnessValue>;                     // DERIVED | UNKNOWN
}

export type OmittedSection = "ide_sessions" | "runs" | "action_eligibility" | "queue_order";

export interface Envelope<TData> {
  contract: typeof CONTROL_READ_CONTRACT;
  version: typeof CONTROL_READ_VERSION;
  operation: Exclude<ControlReadOperation, "get_run_state">;
  snapshot_id: string;                                 // identifier only ("snap-" + UUID from injected generator) — never authority / lock / token
  generated_at: string;                                // ISO-8601 UTC
  complete: boolean;
  limits_applied: ("MAX_REVIEWS" | "MAX_ROUNDS")[];
  omitted_sections: OmittedSection[];                  // always ["ide_sessions","runs","action_eligibility","queue_order"] in v1
  data: TData;
}

export interface ControlSnapshotV1 {
  project: ProjectStateV1;
  reviews: ReviewStateV1[];                            // same order as project.review_session_ids
  /** LoadedReviews with session === null (unreadable / io_error / unsupported_version): they cannot be tied to any
   *  Project. Global count across the data folder; no IDs, no reasons, no fabricated ReviewStateV1. (HD-5A-05) */
  unattributable_review_count: number;
  external_gates: { class: "UNKNOWN"; unknown_reason: "NOT_TRACKED_BY_DVCC" };
}

export type ControlReadOperation = "get_control_snapshot" | "get_project_state" | "get_review_state" | "get_run_state";

/** Allowed keys per operation (anything else -> INVALID_REQUEST / UNRECOGNIZED_FIELD). */
export const ALLOWED_REQUEST_KEYS = {
  get_control_snapshot: ["contract", "version", "operation", "project_id"],
  get_project_state: ["contract", "version", "operation", "project_id"],
  get_review_state: ["contract", "version", "operation", "review_session_id"],
} as const;

export type ControlReadErrorCode =
  | "INVALID_REQUEST"                 // not a plain object, unrecognized / missing / wrongly typed field
  | "UNSUPPORTED_CONTRACT"            // contract !== "dvcc.control-read"
  | "UNSUPPORTED_CONTRACT_VERSION"    // version !== 1
  | "UNSUPPORTED_OPERATION"           // unknown operation, or get_run_state
  | "INVALID_TARGET"                  // isValidProjectId / isValidReviewId rejects the target
  | "SOURCE_UNAVAILABLE"              // app not loaded, or the project registry could not be read
  | "TARGET_NOT_FOUND"                // readable source, target absent
  | "TARGET_UNAVAILABLE";             // target exists but its own file cannot be read (session === null)

export type ControlReadErrorReason =
  // INVALID_REQUEST
  | "NOT_AN_OBJECT" | "UNRECOGNIZED_FIELD" | "MISSING_FIELD" | "INVALID_FIELD_TYPE"
  // UNSUPPORTED_CONTRACT_VERSION
  | "REQUESTED_VERSION_NOT_SUPPORTED"
  // UNSUPPORTED_OPERATION (get_run_state)
  | "NO_AUTHORITATIVE_RUN_SOURCE"
  // SOURCE_UNAVAILABLE
  | "APP_NOT_READY" | "REGISTRY_UNREADABLE" | "REGISTRY_IO_ERROR" | "REGISTRY_UNSUPPORTED_VERSION"
  // TARGET_UNAVAILABLE (from LoadedReview.health.status; never the Message / params / body)
  | "UNREADABLE" | "IO_ERROR" | "UNSUPPORTED_VERSION" | "MISSING";

export interface ControlReadError {
  contract: typeof CONTROL_READ_CONTRACT;
  version: typeof CONTROL_READ_VERSION;   // the version DVCC speaks
  error: {
    code: ControlReadErrorCode;
    reason?: ControlReadErrorReason;
    /** Field NAMES only, sorted, and only names matching ^[a-z][a-z0-9_]{0,63}$; never values. */
    fields?: string[];
    /** Count of unrecognized names that do NOT match the pattern above (not echoed). Present only when that count
     *  is >= 1; omitted (never 0) when every unrecognized name was listable in `fields`. */
    unlisted_field_count?: number;
    supported_versions?: [1];
  };
}
```

`src/domain/controlRead/evidenceRef.ts`（RF-5A-R2-04）

```ts
import { isIsoTimestamp, isValidProjectId, isValidReviewId } from "../validation";
import { MAX_REVIEW_ROUNDS } from "../limits";

declare const evidenceRefBrand: unique symbol;
export type EvidenceRefKind =
  | "project" | "project-repository" | "project-local-root"
  | "review" | "review-field" | "review-round-field"
  | "git-observation";
/** Only the builders below can produce this type (no `as EvidenceRef` outside this module — source-shape test). */
export type EvidenceRef = string & { readonly [evidenceRefBrand]: EvidenceRefKind };

export type ReviewField = "review-state" | "resource-state" | "pr-number";
export type ReviewRoundField = "expected-head" | "reviewed-head" | "result" | "verdict" | "judgment" | "risk-tier";

// Each builder validates every input with an EXISTING domain helper and returns null on any failure.
// Inputs are limited to: a validated projectId, a validated reviewSessionId, an integer round in
// 1..MAX_REVIEW_ROUNDS, a closed field enum, or an isIsoTimestamp-validated observation time.
// No other string — and no raw source text — is ever interpolated.
export function projectRef(projectId: string): EvidenceRef | null;                       // dvcc:project/<projectId>
export function projectRepositoryRef(projectId: string): EvidenceRef | null;             // dvcc:project/<projectId>/repository
export function projectLocalRootRef(projectId: string): EvidenceRef | null;              // dvcc:project/<projectId>/local-root
export function reviewRef(reviewSessionId: string): EvidenceRef | null;                  // dvcc:review/<reviewSessionId>
export function reviewFieldRef(reviewSessionId: string, field: ReviewField): EvidenceRef | null;
                                                                                         // dvcc:review/<id>/field/<field>
export function reviewRoundFieldRef(reviewSessionId: string, round: number, field: ReviewRoundField): EvidenceRef | null;
                                                                                         // dvcc:review/<id>/round/<n>/<field>
export function gitObservationRef(projectId: string, observedAt: string): EvidenceRef | null;
                                                                                         // dvcc:git-observation/<projectId>/<observedAt>
```

- builderが`null`を返した場合、そのrefを使うfactは`BLOCKED / INVALID_SOURCE_VALUE`になり、部分的なrefは出力しない
- `field`引数は型のclosed enumに加え、runtimeでも許可集合と照合（`as`キャスト経由の混入を防ぐ）

Entry point（transport-neutral、pure）:

```ts
export function readControl(
  request: unknown,
  source: ControlReadSource,
  env: { now: () => string; newSnapshotId: () => string },
): Envelope<ControlSnapshotV1 | ProjectStateV1 | ReviewStateV1> | ControlReadError;
```

Validation order（固定。後続のcheckは前段PASS時のみ）:

1. `request`がplain objectでない → `INVALID_REQUEST / NOT_AN_OBJECT`
2. `contract`欠落・非string・`"dvcc.control-read"`以外 → `UNSUPPORTED_CONTRACT`
3. `version`が数値`1`以外（欠落・`"1"`・`2`・`0`・`1.5`含む）→ `UNSUPPORTED_CONTRACT_VERSION / REQUESTED_VERSION_NOT_SUPPORTED`
4. `operation`が未知 → `UNSUPPORTED_OPERATION`；`get_run_state` → `UNSUPPORTED_OPERATION / NO_AUTHORITATIVE_RUN_SOURCE`
5. `ALLOWED_REQUEST_KEYS[operation]`外のkey → `INVALID_REQUEST / UNRECOGNIZED_FIELD`
6. 必須key欠落 → `INVALID_REQUEST / MISSING_FIELD`；型不一致（非string）→ `INVALID_REQUEST / INVALID_FIELD_TYPE`
7. `isValidProjectId(project_id)` / `isValidReviewId(review_session_id)`（既存helper）がfalse → `INVALID_TARGET`
8. `source.phase !== "ready"` → `SOURCE_UNAVAILABLE / APP_NOT_READY`
9. `projectsHealth.status`が`unreadable` / `io_error` / `unsupported_version` → `SOURCE_UNAVAILABLE / REGISTRY_UNREADABLE | REGISTRY_IO_ERROR | REGISTRY_UNSUPPORTED_VERSION`（全operation。§13参照）
10. target lookup:
    - `get_control_snapshot` / `get_project_state`: registry（`ok` / `restored_from_backup` / `missing`）にprojectIdが無い → `TARGET_NOT_FOUND`
    - `get_review_state`: reviewIdの`LoadedReview`が無い → `TARGET_NOT_FOUND`；存在するが`session === null` → `TARGET_UNAVAILABLE / <health.statusから写像>`

contract / versionを先に判定するのは、将来versionのrequestが新fieldを持っていても「version非対応」として明示拒否するため。registry判定をtarget lookupより先に置くのは、読めない台帳から「存在しない」を推論しないため。

## 7. Example sanitized JSON（synthetic）

`get_control_snapshot { project_id: "example-app" }`（Git未観測、起動直後、data folder内にunreadable review 1件）

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
      "project_id": "example-app",
      "registry_health": "ok",
      "repository": { "class": "HUMAN_CONFIRMED", "confirmation": "ENTERED", "value": { "host": "github.com", "owner": "example-org", "name": "example-app" }, "recorded_at": null, "evidence_ref": "dvcc:project/example-app/repository" },
      "local_root": { "class": "DERIVED", "value": true, "rule": "project.local-root-presence@1", "derived_from": ["dvcc:project/example-app/local-root"], "basis_observed_at": null, "basis_recorded_at": null, "path": { "class": "BLOCKED", "blocked_reason": "WITHHELD_BY_POLICY" } },
      "git": {
        "head": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" },
        "dirty": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" },
        "detached": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" }
      },
      "review_session_ids": ["rv-20261003-a1b2c3"],
      "closed_review_count": 2
    },
    "reviews": [
      {
        "review_session_id": "rv-20261003-a1b2c3",
        "project_id": "example-app",
        "file_health": "ok",
        "review_state": { "class": "HUMAN_CONFIRMED", "confirmation": "EXPLICIT", "value": "FIX_REQUIRED", "recorded_at": null, "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/field/review-state" },
        "resource_state": { "class": "HUMAN_CONFIRMED", "confirmation": "ENTERED", "value": "HOT", "recorded_at": null, "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/field/resource-state" },
        "pr_number": { "class": "HUMAN_CONFIRMED", "confirmation": "ENTERED", "value": 42, "recorded_at": null, "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/field/pr-number" },
        "current_round": 2,
        "rounds": [
          {
            "round": 2,
            "expected_head": { "class": "HUMAN_CONFIRMED", "confirmation": "ENTERED", "value": "3f7ee896ea0954ab0f27dd4f9f27729ecffac8d1", "recorded_at": null, "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/round/2/expected-head", "binding": "EXACT" },
            "reviewed_head": { "class": "UNKNOWN", "unknown_reason": "NOTHING_RECORDED" },
            "result_captured": { "class": "DERIVED", "value": false, "rule": "round.result-presence@1", "derived_from": ["dvcc:review/rv-20261003-a1b2c3/round/2/result"], "basis_observed_at": null, "basis_recorded_at": null },
            "verdict": { "class": "UNKNOWN", "unknown_reason": "NOTHING_RECORDED" },
            "judgment_captured": { "class": "DERIVED", "value": false, "rule": "round.judgment-presence@1", "derived_from": ["dvcc:review/rv-20261003-a1b2c3/round/2/judgment"], "basis_observed_at": null, "basis_recorded_at": null },
            "risk_tier": { "class": "UNKNOWN", "unknown_reason": "NOTHING_RECORDED" }
          },
          {
            "round": 1,
            "expected_head": { "class": "HUMAN_CONFIRMED", "confirmation": "ENTERED", "value": "5d0c2e1a", "recorded_at": null, "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/round/1/expected-head", "binding": "SHORT" },
            "reviewed_head": { "class": "HUMAN_CONFIRMED", "confirmation": "ENTERED", "value": "5d0c2e1a9b7f3c4d2e1f0a9b8c7d6e5f4a3b2c1d", "recorded_at": "2026-10-03T11:40:00.000Z", "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/round/1/reviewed-head" },
            "result_captured": { "class": "DERIVED", "value": true, "rule": "round.result-presence@1", "derived_from": ["dvcc:review/rv-20261003-a1b2c3/round/1/result"], "basis_observed_at": null, "basis_recorded_at": "2026-10-03T11:40:00.000Z" },
            "verdict": { "class": "HUMAN_CONFIRMED", "confirmation": "EXPLICIT", "value": "FIX_REQUIRED", "recorded_at": "2026-10-03T12:00:00.000Z", "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/round/1/verdict" },
            "judgment_captured": { "class": "DERIVED", "value": false, "rule": "round.judgment-presence@1", "derived_from": ["dvcc:review/rv-20261003-a1b2c3/round/1/judgment"], "basis_observed_at": null, "basis_recorded_at": null },
            "risk_tier": { "class": "HUMAN_CONFIRMED", "confirmation": "EXPLICIT", "value": "TIER_1", "recorded_at": null, "evidence_ref": "dvcc:review/rv-20261003-a1b2c3/round/1/risk-tier" }
          }
        ],
        "freshness": { "class": "UNKNOWN", "unknown_reason": "NOT_OBSERVED" }
      }
    ],
    "unattributable_review_count": 1,
    "external_gates": { "class": "UNKNOWN", "unknown_reason": "NOT_TRACKED_BY_DVCC" }
  }
}
```

Git観測後（Human が Refresh Git を押した後）の該当部分:

```json
"git": {
  "head": { "class": "OBSERVED", "value": "3f7ee896ea0954ab0f27dd4f9f27729ecffac8d1", "observed_at": "2026-10-04T01:02:00.123Z", "source": "GIT_OBSERVATION", "evidence_ref": "dvcc:git-observation/example-app/2026-10-04T01:02:00.123Z" },
  "dirty": { "class": "OBSERVED", "value": false, "observed_at": "2026-10-04T01:02:00.123Z", "source": "GIT_OBSERVATION", "evidence_ref": "dvcc:git-observation/example-app/2026-10-04T01:02:00.123Z" },
  "detached": { "class": "OBSERVED", "value": false, "observed_at": "2026-10-04T01:02:00.123Z", "source": "GIT_OBSERVATION", "evidence_ref": "dvcc:git-observation/example-app/2026-10-04T01:02:00.123Z" }
}
"freshness": { "class": "DERIVED", "value": "ALIGNED", "rule": "freshness.derive@1", "derived_from": ["dvcc:git-observation/example-app/2026-10-04T01:02:00.123Z", "dvcc:review/rv-20261003-a1b2c3/round/2/expected-head"], "basis_observed_at": "2026-10-04T01:02:00.123Z" }
```

観測後にProjectのlocal rootが編集された場合（raw observationは残るが`observationForProject`がdrop）:

```json
"git": {
  "head": { "class": "UNKNOWN", "unknown_reason": "OBSERVATION_INVALIDATED" },
  "dirty": { "class": "UNKNOWN", "unknown_reason": "OBSERVATION_INVALIDATED" },
  "detached": { "class": "UNKNOWN", "unknown_reason": "OBSERVATION_INVALIDATED" }
}
"freshness": { "class": "UNKNOWN", "unknown_reason": "OBSERVATION_INVALIDATED" }
```

local root未設定 / 保存値がvalidatorを通らないrepository:

```json
"local_root": { "class": "DERIVED", "value": false, "rule": "project.local-root-presence@1", "derived_from": ["dvcc:project/example-app/local-root"], "basis_observed_at": null, "basis_recorded_at": null }
"repository": { "class": "BLOCKED", "blocked_reason": "INVALID_SOURCE_VALUE" }
```

Errors:

```json
{ "contract": "dvcc.control-read", "version": 1,
  "error": { "code": "UNSUPPORTED_CONTRACT_VERSION", "reason": "REQUESTED_VERSION_NOT_SUPPORTED", "supported_versions": [1] } }
```

```json
{ "contract": "dvcc.control-read", "version": 1,
  "error": { "code": "INVALID_REQUEST", "reason": "UNRECOGNIZED_FIELD", "fields": ["include_paths"] } }
```

```json
{ "contract": "dvcc.control-read", "version": 1,
  "error": { "code": "SOURCE_UNAVAILABLE", "reason": "REGISTRY_UNREADABLE" } }
```

```json
{ "contract": "dvcc.control-read", "version": 1,
  "error": { "code": "TARGET_UNAVAILABLE", "reason": "UNSUPPORTED_VERSION" } }
```

```json
{ "contract": "dvcc.control-read", "version": 1,
  "error": { "code": "TARGET_NOT_FOUND" } }
```

```json
{ "contract": "dvcc.control-read", "version": 1,
  "error": { "code": "UNSUPPORTED_OPERATION", "reason": "NO_AUTHORITATIVE_RUN_SOURCE" } }
```

## 8. Source → projection mapping

projectionはAppStateの値を**既存のpure domain関数 / validatorに通した結果**だけを使う。ruleも検証regexも再実装しない。timestampはfield-levelの正確なsourceがある場合だけ使う。

| contract field | source | 経由する既存関数 / rule | class | `recorded_at` / basis |
|---|---|---|---|---|
| request target | `project_id` / `review_session_id` | `isValidProjectId()` / `isValidReviewId()`（`domain/validation.ts`） | — | — |
| registry gate | `AppState.projectsHealth.status` | `ok` / `restored_from_backup` / `missing` → 続行；`unreadable` / `io_error` / `unsupported_version` → `SOURCE_UNAVAILABLE`（§13） | — | — |
| `project_id` | `Project.projectId` | — | identity | — |
| `registry_health` | `AppState.projectsHealth.status` | `ok` / `restored_from_backup`のみ出力に現れる（`cause` / `quarantinedAs`は出さない） | — | — |
| `repository` | `Project.repositoryUrl` | `normalizeRepositoryUrl()`（`domain/validation.ts`）→ ok時のみcanonical URLを`{host, owner, name}`へ分解。null → `UNKNOWN NOTHING_RECORDED`；normalize失敗 → `BLOCKED INVALID_SOURCE_VALUE`（値はechoしない） | HUMAN_CONFIRMED / ENTERED | **null**（field timestampなし。`Project.updatedAt`で代用しない） |
| `local_root` | `Project.localRoot !== null` | rule `project.local-root-presence@1` | DERIVED (PresenceFact) | `basis_recorded_at: null`。`value: false`の時`path`なし |
| `git.head/dirty/detached` | raw = `AppState.gitObservations[projectId]` | raw不在 → `NOT_OBSERVED`；raw存在 AND `observationForProject(raw, {localRoot, createdAt})`（`domain/git.ts:98`）`=== undefined` → `OBSERVATION_INVALIDATED`；status≠OK → `GIT_UNAVAILABLE` / `NOT_A_GIT_REPOSITORY` / `NO_LOCAL_ROOT` / `OBSERVATION_FAILED`（TIMEOUT / ERROR） | OBSERVED / UNKNOWN | `observed_at = observation.observedAt`（`gitObservationRef`は`isIsoTimestamp`で検証） |
| `review_session_ids` / `closed_review_count` | `AppState.reviews`のうち`session !== null && session.projectId === projectId` | non-CLOSEDをreviewSessionId降順。queue / filterは使わない | — | — |
| `unattributable_review_count` | `AppState.reviews`のうち`session === null` | 件数のみ（ID・status・reasonは出さない） | count | — |
| `file_health` | `LoadedReview.health.status` | `ok` / `restored_from_backup`のみ（readable reviewだけがReviewStateV1になる） | — | — |
| `review_state` | `ReviewSession.reviewState` | confirmation table（下記） | HUMAN_CONFIRMED | **null**（`session.updatedAt`はmetadata更新でも動くため代用しない） |
| `resource_state` | `ReviewSession.resourceState` | — | HUMAN_CONFIRMED / ENTERED | **null** |
| `pr_number` | `ReviewSession.prNumber` | null → `UNKNOWN NOTHING_RECORDED` | HUMAN_CONFIRMED / ENTERED | **null** |
| `rounds[].expected_head` | `RoundRecord.expectedHead` | `headBinding()`（`domain/headBinding.ts:36`） | HUMAN_CONFIRMED / ENTERED | **null** |
| `rounds[].reviewed_head` | `RoundRecord.reviewedHead` | null → `UNKNOWN NOTHING_RECORDED` | HUMAN_CONFIRMED / ENTERED | `resultCapturedAt`（null可） |
| `rounds[].result_captured` | `RoundRecord.resultCapturedAt` presence | rule `round.result-presence@1` | DERIVED (PresenceFact) | `basis_recorded_at = resultCapturedAt` or null |
| `rounds[].verdict` | `RoundRecord.verdict` | null → `UNKNOWN NOTHING_RECORDED` | HUMAN_CONFIRMED / EXPLICIT | `verdictConfirmedAt` |
| `rounds[].judgment_captured` | `RoundRecord.judgmentCapturedAt` presence | rule `round.judgment-presence@1` | DERIVED (PresenceFact) | `basis_recorded_at = judgmentCapturedAt` or null |
| `rounds[].risk_tier` | `RoundRecord.riskTier` | null → `UNKNOWN NOTHING_RECORDED` | HUMAN_CONFIRMED / EXPLICIT（`setRiskTier`は`confirmedByHuman`必須） | **null** |
| `freshness` | current round + observation + project | `deriveFreshness()`（`domain/freshness.ts:93`）。status `UNKNOWN` → class UNKNOWN、reasonは`unknownCause()`から写像。raw存在 AND invalidated → `OBSERVATION_INVALIDATED`。sessionのprojectIdがreadable registryに無い → `PROJECT_NOT_REGISTERED`。**`explanation` Messageは出さない** | DERIVED / UNKNOWN | `basis_observed_at = observation.observedAt` |
| `get_review_state` unavailable | `LoadedReview.health.status`（`session === null`） | `unreadable`→`UNREADABLE`、`io_error`→`IO_ERROR`、`unsupported_version`→`UNSUPPORTED_VERSION`、`missing`→`MISSING`（`reason` Message / params / `setAside` / `code` / `version`値は出さない） | error | — |
| every `evidence_ref` / `derived_from[]` | validated IDs / round / observedAt | `evidenceRef.ts` builders only | — | — |
| `external_gates` | — | 固定 | UNKNOWN / NOT_TRACKED_BY_DVCC | — |

Persistence invariant（`services/persistence.ts` `loadJsonWithRecovery`、base時点で確認済み）: `session !== null` ⇔ `health.status ∈ {ok, restored_from_backup}`。`missing` session.jsonは`unreadable`へ写像される（`persistence.ts:207-209`）ため、`MISSING` reasonは防御的enumとして保持する（unit testでsynthetic `LoadedReview`により検証）。実装時にinvariantが崩れていたらSTOP。

`review_state`のconfirmation table（`transitions.ts`のguardとtestで照合すること）:

| reviewState | confirmation | 根拠 |
|---|---|---|
| `FIX_REQUIRED`, `REVIEW_PASS` | EXPLICIT | `confirmVerdict`（`confirmedByHuman: true`必須）でのみ到達 |
| `BLOCKED` | EXPLICIT | `block` / verdict BLOCKED（`confirmedByHuman`必須） |
| `CLOSED` | EXPLICIT | `close`（`confirmedByHuman`必須） |
| `NEW`, `READY_FOR_REVIEW`, `REVIEWING`, `SUSPENDED` | ENTERED | 明示確認フラグなしのHuman UI操作 |

照合testで「EXPLICIT stateへconfirmationなしで到達するtransitionが存在しない」ことを固定する。存在した場合はその状態をENTERED（保守側）に倒し、STOPしてHumanへ報告。

`ControlReadSource`（`src/app/controlReadSource.ts`）は`AppState`から`{ phase, projects, projectsHealth, reviews, gitObservations }`だけを抜き出す**pure function**。`ideSessions`・`artifacts`・`toasts`等は受け取らない（型で排除）。

## 9. Exact files expected to change

新規:
- `src/domain/controlRead/contract.ts` — 定数・型・error code / reason・`ALLOWED_REQUEST_KEYS`
- `src/domain/controlRead/evidenceRef.ts` — branded `EvidenceRef` + 7 builders
- `src/domain/controlRead/projection.ts` — pure builders（project / review / snapshot）
- `src/domain/controlRead/readControl.ts` — validation order（§6）・dispatch
- `src/domain/controlRead/evidenceRef.test.ts`
- `src/domain/controlRead/projection.test.ts`
- `src/domain/controlRead/readControl.test.ts`
- `src/domain/controlRead/disclosure.test.ts`
- `src/domain/controlRead/provenance.test.ts`
- `src/app/controlReadSource.ts` + `src/app/controlReadSource.test.ts`
- `src/app/copyControlSnapshotAction.ts` + `src/app/copyControlSnapshotAction.test.ts`（`copyResumeCommandAction.ts`と同型、clipboard write only）
- `docs/control-read-contract-v1.md`
- `scripts/verify-control-read-ui.ps1`（Case A〜D、synthetic data only）

既存の更新（最小）:
- `src/features/reviews/ReviewDetail.tsx` — ボタン1つ（`data-testid="action-copy-control-snapshot"`）
- `src/app/App.tsx` — handler配線のみ
- `src/i18n/ja.ts` / `src/i18n/en.ts` — ボタンラベル・toast key（parity必須、`noHardCodedText`準拠）
- `src/test/docsContract.test.ts` — `docs/control-read-contract-v1.md`が全FactClass・RuleId・UnknownReason・BlockedReason・operation・error code・error reason・EvidenceRef variantを名指しすることを追加（既存testは弱めない）
- `README.md` — 「What it does」に`**Control snapshot copy** (Phase 5A)`1項目、Boundariesに「read-only、transportなし、MCPなし」。**Status blockは変更しない**（`under development` / `not merged`の語は使わない — 既存docsContractが禁止）

## 10. Exact files prohibited from changing

- `src-tauri/**`（Rust、`lib.rs` invoke handlers、`capabilities/**`、`tauri.conf.json`、`Cargo.toml` / `Cargo.lock`）
- `package.json` / `package-lock.json`（dependency delta 0）
- `src/domain/validation.ts`（`isValidProjectId` / `isValidReviewId` / `isIsoTimestamp` / `normalizeRepositoryUrl` / `PROJECT_ID_PATTERN` / `REVIEW_ID_PATTERN`）— **importのみ。変更が必要ならSTOP**
- `src/domain/limits.ts`、`contract/limits.json`
- `src/domain/schema.ts`、`src/services/persistence.ts`、`src/services/storage.ts`、`src/services/trackedStorage.ts`、`src/services/reviewHub.ts`、`src/services/reviewService.ts`
- `docs/data-contract-v1.md`
- 既存domain rule modules（`freshness.ts`、`freshnessCause.ts`、`queue.ts`、`transitions.ts`、`headBinding.ts`、`git.ts`、`ideSessionDiscovery.ts`、`resumeIntent.ts`、`review.ts`、`project.ts` 等）— **importのみ**。private helperのexportが必要ならSTOP
- `src/app/appState.ts`（reducer / state shapeは変更しない）
- `src/services/codexLauncher.ts`、`src/app/launchCodexResumeAction.ts`、`src/features/reviews/ResumeLaunchDialog.tsx`、Resume in Codex一式
- `fixtures/**`（新規fixtureが必要ならsynthetic / hygiene準拠で**追加のみ**、既存不変）
- `.agent-run/**` の過去run

## 11. Privacy / disclosure threat analysis

| 脅威 | 経路 | 対策 | 検証 |
|---|---|---|---|
| absolute local path | `Project.localRoot`、`GitObservation.errorMessage`、`FileHealth.unreadable.reason` / `io_error.reason`（Message params）、`restored_from_backup.quarantinedAs`、discovery fingerprint | localRootはpresenceのみ。FileHealthは`status`のみ写像。Message / params / errorMessage / quarantinedAs / fingerprint / ideSessionsは出力経路に入らない | sentinel path（`C:\\SENTINEL-ROOT\\...`）を各sourceへ注入し、`JSON.stringify(output)`（success / error両方）に不在 |
| EvidenceRefへの混入 | builderへのraw text補間 | branded型 + 7 builder。入力は`isValidProjectId` / `isValidReviewId` / `MAX_REVIEW_ROUNDS`範囲の整数 / closed field enum / `isIsoTimestamp`のみ。失敗はnull→BLOCKED | 全`evidence_ref` / `derived_from`を収集し、承認7 variantのいずれかに完全一致、かつ absolute path / displayName / notes / errorMessage / provider identifier / credential・token sentinel を含まないこと。builder unit testでpath・空白入り文字列・token風文字列・`../`・改行を拒否 |
| Human free text | displayName（HD-5A-02: 出さない）、notes、nextAction、reviewType、chatgptThreadTitle / Url、checkpoint、verdictNote、request / result / judgment本文 | 出さない（presenceのみ） | 各fieldにsentinel |
| Git branch名 | `GitObservation.branch` | HD-5A-03: 出さない | sentinel branch名が不在 |
| provider identifier / transcript | IDE discovery（session ID、cwd、gitOriginUrl） | HD-5A-04: `omitted_sections`、source型から除外 | discovery stateにsentinel → 不在 |
| 不正repository値 | `Project.repositoryUrl`がnormalize不能 | `BLOCKED INVALID_SOURCE_VALUE`、値はechoしない | sentinel URLが不在 |
| unreadable sourceからの推論 | registry / session読込失敗 | `SOURCE_UNAVAILABLE` / `TARGET_UNAVAILABLE`（enum reasonのみ）。`TARGET_NOT_FOUND`にしない、ReviewStateV1を捏造しない | §14 source-semantics tests |
| request echo | unknown field名・値の反射 | 値は返さない。名前は`^[a-z][a-z0-9_]{0,63}$`のみ列挙、他は件数 | sentinel入りkey名 / 値が不在 |
| credential / token | （保持しないが混入防止） | 出力にtoken pattern（`gh*_`、`sk-`、`AKIA`）なし | regex test |
| 偽provenance | entity `updatedAt`を`recorded_at`に流用 | §8でnull指定 | provenance test |
| 推測値 / 観測と解釈の混同 | 未観測をOBSERVED、古い観測の流用、freshnessをOBSERVED扱い | raw不在→NOT_OBSERVED、invalidated→OBSERVATION_INVALIDATED、freshnessはDERIVED | mutation |
| snapshot_idのauthority化 | consumerがtoken扱い | 文書と型で「identifier only」。どのAPIもsnapshot_idを入力に取らない（key allow-list） | review checklist |
| clipboard経由の拡散 | Humanが貼る先 | sanitized出力のみ、明示Human操作のみ | running-app smokeでclipboard内容を検査 |

## 12. Version mismatch / error behavior

- §6 validation order 2〜3で判定。`UNSUPPORTED_CONTRACT` / `UNSUPPORTED_CONTRACT_VERSION + supported_versions: [1]`
- negotiate / downgrade / 推測解釈はしない（v1はreject-only）
- version判定はunknown-field判定より前
- 応答には常に`contract` / `version`（DVCCが話すversion）を含める
- source error（`SOURCE_UNAVAILABLE` / `TARGET_UNAVAILABLE`）はenum reasonのみ。FileHealth `reason`（Message）・`params`・`setAside`・`code`・`version`値・`quarantinedAs`を含めない

## 13. UNKNOWN / STALE / unreadable-source behavior

Project registry（全operation共通、validation step 9）:

| `projectsHealth.status` | 動作 |
|---|---|
| `ok` | 通常処理 |
| `restored_from_backup` | 通常処理（`registry_health: "restored_from_backup"`） |
| `missing` | 通常処理（台帳が無い＝登録0件。projectが無ければ`TARGET_NOT_FOUND`は真） |
| `unreadable` | `SOURCE_UNAVAILABLE / REGISTRY_UNREADABLE` |
| `io_error` | `SOURCE_UNAVAILABLE / REGISTRY_IO_ERROR` |
| `unsupported_version` | `SOURCE_UNAVAILABLE / REGISTRY_UNSUPPORTED_VERSION` |

読めない台帳で`state.projects`が空でも`TARGET_NOT_FOUND`を返さない。`get_review_state`もfreshness導出にproject（localRoot / createdAt）が必要なため同じgateに従う。

Review target:

| 状態 | `get_review_state` | `get_control_snapshot` |
|---|---|---|
| reviewIdの`LoadedReview`なし | `TARGET_NOT_FOUND` | — |
| `session !== null`（status `ok` / `restored_from_backup`） | `ReviewStateV1` | project一致なら`reviews[]`へ |
| `session === null`（status `unreadable` / `io_error` / `unsupported_version` / `missing`） | `TARGET_UNAVAILABLE / UNREADABLE \| IO_ERROR \| UNSUPPORTED_VERSION \| MISSING` | `unattributable_review_count += 1`。project_id / review_state / resource_state等を捏造しない |

Facts:
- raw observation不在（起動直後・未Refresh・DVCC再起動後）→ `UNKNOWN: NOT_OBSERVED`
- raw observation存在 AND `observationForProject(...) === undefined` → `UNKNOWN: OBSERVATION_INVALIDATED`。**raw不在で`OBSERVATION_INVALIDATED`を使わない**
- 観測status≠OK → 対応するUnknownReason
- 永続modelに値なし → `NOTHING_RECORDED`
- readable reviewのprojectIdがreadable registryに無い → freshness `UNKNOWN: PROJECT_NOT_REGISTERED`
- field-level timestampなし → `recorded_at: null`（UNKNOWNにはしない。値自体は既知）
- 保存値が既存validatorを通らない（repository）→ `BLOCKED: INVALID_SOURCE_VALUE`
- STALE: **TTLは定義しない**。currentnessは`observed_at` / `basis_observed_at`と`generated_at`からconsumerが判断。DVCCが保証するのは「観測がprojectの現在設定に結び付いていること」のみ
- 上限: readable non-CLOSED reviews 50（reviewSessionId降順で先頭50）、rounds 20（最新から）。超過で`complete: false` + `limits_applied`。incomplete時の不在は「存在しない」を意味しない
- `phase !== "ready"` → `SOURCE_UNAVAILABLE / APP_NOT_READY`

## 14. Test strategy

- **Unit (pure)**: synthetic Project / ReviewSession（`createProject` / `createReviewSession` / `newRound`、`MemoryStorage` + `ReviewHub`の`seededHub`パターン、synthetic `LoadedReview`）
- **Helper reuse / parity**: ID判定表（valid / invalid / 境界長 / 大文字 / 空白 / path風 / `rv-`日付形）で`readControl`の`INVALID_TARGET`判定が`isValidProjectId` / `isValidReviewId`と完全一致。repository表で`normalizeRepositoryUrl`のok / errorと`HUMAN_CONFIRMED` / `BLOCKED INVALID_SOURCE_VALUE`が一致。source-shape test: `src/domain/controlRead/**`がこれらhelperを`../validation`からimportし、ID / repository用の独自RegExp literalを持たないこと
- **Oracle parity**: 既存`src/test/freshnessContract.ts`の各caseで`freshness`（class / value）が`deriveFreshness().status`と一致
- **Source semantics（RF-5A-R2-02）**:
  - registry status 6種 × 3 operation: `ok` / `restored_from_backup` / `missing`は続行、`unreadable` / `io_error` / `unsupported_version`は`SOURCE_UNAVAILABLE`＋正しいreason。読めない台帳 + 空`projects`で`TARGET_NOT_FOUND`にならない
  - `get_review_state`: LoadedReviewなし→`TARGET_NOT_FOUND`；`session === null`の各status→`TARGET_UNAVAILABLE`＋正しいreason（`missing`はsynthetic）
  - snapshot: `session === null`のreviewは`unattributable_review_count`に数えられ、`reviews[]` / `review_session_ids`に現れない
  - persistence invariant test: `loadAll`（MemoryStorage）で各file状態を作り、`session !== null` ⇔ status ∈ {ok, restored_from_backup}
- **EvidenceRef（RF-5A-R2-04）**: 7 builderのvalid入力→期待文字列；invalid入力（absolute path、`..`、`/`入りID、空白、大文字、改行、token風、非整数 / 0 / `MAX_REVIEW_ROUNDS + 1`のround、非ISO timestamp、enum外field）→null。出力全体の全refが7 variantのいずれかに完全一致。source-shape test: `as EvidenceRef`キャストが`evidenceRef.ts`外に無い
- **Provenance**: `Project.updatedAt` / `session.updatedAt` / `createdAt`を固有sentinel時刻にし、出力に現れない。`reviewed_head.recorded_at === resultCapturedAt`、`verdict.recorded_at === verdictConfirmedAt`、他の指定fieldは`null`
- **Presence**: `result_captured` / `judgment_captured` / `local_root`は常にDERIVED、`local_root.value === false`で`path`キーなし
- **Observation states**: raw不在→NOT_OBSERVED、raw存在+invalidated→OBSERVATION_INVALIDATED、raw存在+有効→OBSERVED、status各種→対応reason
- **Confirmation table**: `transitions.ts` guard / `src/test/transitionContract.ts`と照合
- **Request**: validation order全10段、順序依存（version 2 + 未知key → VERSION error；不正ID + 読めない台帳 → INVALID_TARGET；読めない台帳 + 不在project → SOURCE_UNAVAILABLE）、`fields`のpattern制限と`unlisted_field_count`。`UNRECOGNIZED_FIELD`の3ケースを固定（RF-5A-R3-01）:
  - safe unknown key 1件（`include_paths`）→ `fields: ["include_paths"]`、`unlisted_field_count`キー**なし**
  - unsafe unknown key 1件（safe echo pattern外の名前）→ その名前は`fields`に入らない、`unlisted_field_count: 1`
  - mixed（safe 1件 + unsafe 2件）→ `fields: [<safe key>]`、`unlisted_field_count: 2`
- **Disclosure**: §11全行のsentinel（success応答・error応答・EvidenceRefそれぞれ）。上記unsafe / mixedケースで、unsafe key名（sentinel入り）がerror応答のどこにも現れないこと
- **Side-effect zero / Determinism / Ordering**: storage write / append 0、固定`now` / `newSnapshotId`でdeep-equal、順序はID降順でqueue filter / showClosed非依存
- **UI adapter**: `copyControlSnapshotAction`が`readControl`を1回呼びclipboardへ1回だけwrite、storage書込み0、error時toastはcode由来の固定文言のみ（path / Messageなし）
- **i18n / regression**: ja / en parity、`noHardCodedText`、`npm test`全件、`npm run typecheck`、`npm run build`

## 15. Mutation probes（apply → targeted tests → restore → SHA-256一致）

| ID | Mutation | Killed by（期待） |
|---|---|---|
| M-5A-01 | `local_root`に実pathを出す | disclosure |
| M-5A-02 | notes / nextAction / reviewType / displayNameを出す | disclosure |
| M-5A-03 | `errorMessage` / FileHealth `reason` / `quarantinedAs`を出力へ通す | disclosure |
| M-5A-04 | 未観測gitを`OBSERVED`として捏造 | observation states |
| M-5A-05 | raw不在時に`OBSERVATION_INVALIDATED`を返す | observation states |
| M-5A-06 | `observationForProject`を通さず古い観測を流用 | observation states |
| M-5A-07 | version 2を受理 / version無視 | request |
| M-5A-08 | 未知keyを黙って無視 | request（UNRECOGNIZED_FIELD） |
| M-5A-09 | unknown-field判定をversion判定より前に移動 | request（順序） |
| M-5A-10 | displayNameでproject lookup | request（INVALID_TARGET / TARGET_NOT_FOUND） |
| M-5A-11 | `recorded_at`に`session.updatedAt` / `Project.updatedAt`を代入 | provenance |
| M-5A-12 | `result_captured: false`をHUMAN_CONFIRMEDとして出す | presence |
| M-5A-13 | `local_root`未設定でも`path: WITHHELD_BY_POLICY`を出す | presence |
| M-5A-14 | freshnessを`OBSERVED`分類 | projection |
| M-5A-15 | freshnessを独自実装（edge case差分） | oracle parity |
| M-5A-16 | `get_run_state`が空Runを返す | request |
| M-5A-17 | projection / copy actionがstorageへwrite | side-effect |
| M-5A-18 | limit超過で`complete: true` | projection |
| M-5A-19 | review順序をqueue順にする / filterで落とす | ordering |
| M-5A-20 | source型にideSessionsを通しdiscoveryを出力 | disclosure + type |
| M-5A-21 | FileHealthを`.kind`で判定（常にundefined → 全unreadable扱い等） | source semantics（status表） |
| M-5A-22 | registry `unreadable`時に空`projects`から`TARGET_NOT_FOUND`を返す | source semantics |
| M-5A-23 | registry gateを外し`io_error` / `unsupported_version`でも続行 | source semantics |
| M-5A-24 | `session === null`のreviewに`TARGET_NOT_FOUND`を返す | source semantics |
| M-5A-25 | `session === null`のreviewをReviewStateV1として捏造（project_id推測等） | source semantics + snapshot |
| M-5A-26 | `unattributable_review_count`を常に0 | snapshot |
| M-5A-27 | `TARGET_UNAVAILABLE`にFileHealth `reason` Messageを含める | disclosure |
| M-5A-28 | Control Read内に独自ID regex（より緩い`/^[a-z0-9-]+$/`等）を導入 | helper parity + source-shape |
| M-5A-29 | `normalizeRepositoryUrl`を通さず生URLを分解（`.git`付き・大文字host等が通る） | repository parity |
| M-5A-30 | builder外で`` `dvcc:project/${displayName}` ``のようにrefを組み立てる | EvidenceRef grammar + disclosure + source-shape |
| M-5A-31 | `gitObservationRef`で`isIsoTimestamp`検証を外し`errorMessage`を補間 | EvidenceRef disclosure |
| M-5A-32 | `reviewRoundFieldRef`で範囲外roundを受理 | EvidenceRef unit |

全probeがtest failureでkillされること（compile errorのみのkillは不可）。

## 16. Running-app verification plan

`scripts/verify-control-read-ui.ps1`（既存`scripts/lib/dvcc-smoke.ps1`を利用、release build `npm run tauri build -- --no-bundle`、hidden desktop、CDP、clipboard interceptor）。**各Caseは独立したisolated `DVCC_DATA_DIR`**。tree比較は全fileのSHA-256で行い、runtime lock `.dvcc.lock`のみ比較対象外（データではないため。除外を明記）。

共通fixture: synthetic Projects / Reviews（`example-org`）、sentinel入りlocalRoot / notes / nextAction / displayName / thread URL / checkpoint / result本文、synthetic local Git repo、**unreadable review 1件（壊れた`session.json`）**。

**Case A — read-only invariant**
1. load → `T0 = tree(DVCC_DATA_DIR)`
2. readable review選択 → Copy control snapshot → JSON parse → contract / version / omitted_sections / git=`NOT_OBSERVED` / `unattributable_review_count = 1` / sentinel不在（EvidenceRef含む）/ provenance（null指定fieldがnull）
3. Refresh Git → Copy again → git=`OBSERVED`+`observed_at`、freshness=`DERIVED`
4. `T1 = tree(...)` → **`T0 == T1`（byte-identical）**、`events.jsonl`追記0、`settings.json`不変
5. 判定: Control Read由来のpersistent write = 0

**Case B — invalidation behavior**
1. load → Refresh Git（OBSERVED確認）→ `T0 = tree`
2. Human-intentional Project localRoot edit（authorized test write）→ `T1 = tree`
3. Copy control snapshot → git=`OBSERVATION_INVALIDATED`、freshness=`OBSERVATION_INVALIDATED`
4. `T2 = tree`
5. 判定: `diff(T0,T1) ⊆ {projects.json, projects.json.bak}`（expected Project edit以外のwrite 0）、**`T1 == T2`**（Control Read action由来のwrite 0）。run全体のbyte identityは要求しない

**Case C — restart**
1. load → Refresh Git → Copy（OBSERVED）→ app終了 → `T0 = tree`
2. app再起動 → Copy → git=`NOT_OBSERVED`（runtime-only観測の消失。`OBSERVATION_INVALIDATED`ではない）
3. `T1 = tree` → `T0 == T1`

**Case D — localization**
1. load → `T0 = tree` → Copy（JA label / toast確認）→ `T1 = tree` → `T0 == T1`
2. Human-intentional locale switch to EN（authorized `settings.json` write）→ `T2 = tree`
3. Copy（EN label / toast確認、JSONはlanguage-neutralでsnapshot_id / generated_at以外はJAと同値）→ `T3 = tree`
4. 判定: `diff(T1,T2) ⊆ {settings.json, settings.json.bak}`、`T2 == T3`

（Registry unreadable / `TARGET_UNAVAILABLE`はUI上Copyボタンに到達できない状態を含むため、unit / integration testで固定し、running-appでは要求しない。）

最後に既存regression smoke（session discovery、resume handoff、resume launcher、localization、review workflow）を再実行。

## 17. Acceptance criteria

- AC5A-01 Fresh Gate（base `7efdc62c…`、open PR × planned files競合なし、helper存在確認）とTask Packet snapshot SHA-256がbranch作成前に記録される
- AC5A-02 `readControl`がtransport-neutralなpure function（I/O・clock・randomはinjection）
- AC5A-03 projectionは既存domain関数 / validatorを経由し、ruleも検証regexも再実装しない: `observationForProject`、`deriveFreshness`、`unknownCause`、`headBinding`、**`isValidProjectId`、`isValidReviewId`、`normalizeRepositoryUrl`、`isIsoTimestamp`、`MAX_REVIEW_ROUNDS`**（oracle / helper parity + source-shape test）。これらhelperの変更が必要ならSTOP
- AC5A-04 全factが5 classのいずれかで、class別必須付帯情報を持つ（型 + test）。`rule`は`RuleId`のclosed setのみ
- AC5A-05 `recorded_at`はexact source timestamp（`resultCapturedAt` / `verdictConfirmedAt`）またはnull。entity `updatedAt` / `createdAt`が出力に現れない
- AC5A-06 presence（result / judgment / local_root）はDERIVED。`false`をHUMAN_CONFIRMEDにしない。`local_root`未設定時に`path`なし
- AC5A-07 raw不在→`NOT_OBSERVED`、raw存在+invalidated→`OBSERVATION_INVALIDATED`のみ。推測値なし
- AC5A-08 FileHealth判定は`projectsHealth.status` / `LoadedReview.health.status`のみを使う
- AC5A-09 registry `unreadable` / `io_error` / `unsupported_version` → `SOURCE_UNAVAILABLE`＋`REGISTRY_*` reason。読めない台帳から`TARGET_NOT_FOUND`を返さない
- AC5A-10 `get_review_state`: LoadedReviewなし→`TARGET_NOT_FOUND`、`session === null`→`TARGET_UNAVAILABLE`＋status由来reason。FileHealth Message / params / body / `quarantinedAs`を出さない
- AC5A-11 snapshot: `session === null`のreviewは`unattributable_review_count`のみ。ReviewStateV1 fieldを捏造しない
- AC5A-12 validation order（§6、10段）どおり。未知keyは`INVALID_REQUEST / UNRECOGNIZED_FIELD`（patternに合う名前のみ列挙、値なし）。version mismatchは`UNSUPPORTED_CONTRACT_VERSION`
- AC5A-13 `get_run_state`は`UNSUPPORTED_OPERATION / NO_AUTHORITATIVE_RUN_SOURCE`。Run modelなし
- AC5A-14 identityは`projectId` / `reviewSessionId`のみ
- AC5A-15 `EvidenceRef`は承認7 variantのbranded型で、`evidenceRef.ts`のbuilderだけが生成する。builder入力は検証済みID / 範囲内round / closed enum / ISO timestampのみ。出力中の全refが7 variantに完全一致し、absolute path / displayName / notes / errorMessage / provider identifier / credential・token sentinelを含まない
- AC5A-16 `queue_attention_rank`なし、`omitted_sections`に`queue_order`、review順序はID降順で固定
- AC5A-17 `external_gates`は常に`UNKNOWN NOT_TRACKED_BY_DVCC`
- AC5A-18 limits超過で`complete: false` + `limits_applied`
- AC5A-19 disclosure: §11全sentinelがsuccess / error応答とEvidenceRefに不在
- AC5A-20 side effect 0（unit: storage write / append 0）
- AC5A-21 Rust / capability / dependency / schema / appState / validation helper delta 0、new Tauri command 0
- AC5A-22 MCP / DOT / IPC / eligibility / approval / lease / worker / events / Jevを含まない
- AC5A-23 mutation M-5A-01..32 全kill、restore byte-identical
- AC5A-24 `npm run typecheck` / `npm test` / `npm run build` PASS、`cargo check`（変更なし確認）PASS
- AC5A-25 running-app Case A / B / C / D PASS（§16の判定式どおり）、既存regression smokes PASS
- AC5A-26 `docs/control-read-contract-v1.md`がdocsContract testで全class / RuleId / reason / operation / error code / error reason / EvidenceRef variantを名指し。既存docsContract testは弱めない

## 18. Evidence requirements

`.agent-run/LR-<date>-DVCC-0xx/`（既存形式）:
- `TASK_PACKET_SNAPSHOT.md` + SHA-256（main `7efdc62c…`上、branch作成前、他の変更なし）
- `RUN_MANIFEST.md`（base SHA、branch、Human authorization引用、HD-5A-01〜08 ADOPTED）
- `EVIDENCE.md`: verification出力、oracle / helper parity、source-semantics表（registry status × operation、review status → error）、provenance表、EvidenceRef variant表と拒否入力表、disclosure sentinel一覧（syntheticのみ）、mutation表、running-app Case A〜Dのtree比較結果、delta表
- 実path・実session ID・実project名・provider contentを含めない
- `RUN_STATE.md` / `TASK_QUEUE.md` / `DECISIONS.md` / `QUALITY_DEBT.md`

## 19. Human Gates

| Gate | 内容 | 状態 |
|---|---|---|
| G0 | **Phase 5A implementation authorization** | **未発行**（`PHASE_5A_TASK_PACKET_FINAL_REVIEW` PASS後にReview / Orchestration側で提示） |
| G1 | HD-5A-01〜08 | **RESOLVED / ADOPTED**（下表） |
| G2 | base SHA | **RESOLVED**: `7efdc62cd1a72679355d8488481c9b071ddd3081` |
| G3 | Independent FULL Review（READY CANDIDATE / Required Fixes none） | 実装後 |
| G4 | running-app dogfood（Humanが実データで1回copyし、disclosureを目視確認 — 実データはevidenceに転記しない） | 実装後 |
| G5 | Draft PR → Ready → merge（各々別Gate） | 実装後 |
| — | release / Production | 対象外 |

| ID | 決定 | 状態 |
|---|---|---|
| HD-5A-01 | Human UI adapter「Copy control snapshot (JSON)」を5Aに含める | ADOPTED |
| HD-5A-02 | `displayName`を出さない | ADOPTED |
| HD-5A-03 | Git branch名をv1で出さない | ADOPTED |
| HD-5A-04 | IDE sessionsをv1から除外（`omitted_sections`） | ADOPTED |
| HD-5A-05 | project未帰属unreadable reviewは件数のみ（`unattributable_review_count`） | ADOPTED |
| HD-5A-06 | requestの未知keyは拒否（`INVALID_REQUEST / UNRECOGNIZED_FIELD`） | ADOPTED |
| HD-5A-07 | contract文書は`docs/control-read-contract-v1.md` | ADOPTED |
| HD-5A-08 | implementation baseはPR #11 merge後のmain（= `7efdc62c…`） | ADOPTED |

## 20. Rollback / stop conditions

STOPしてHumanへ戻す条件:
- durable model（snapshot保存、audit log、client identity等）が必要と判明 → **Data Model Gate**
- 新しいTauri command / capability / window global / IPCが必要と判明 → 5C領域
- 既存domain rule / validator helper（`isValidProjectId` / `isValidReviewId` / `isIsoTimestamp` / `normalizeRepositoryUrl`）の変更、private helperのexport、`appState.ts`変更が必要
- persistence invariant（`session !== null` ⇔ status ∈ {ok, restored_from_backup}）が成り立たない
- confirmation tableが`transitions.ts`と一致しない
- field-level timestampの有無が§8と異なると判明（推測で埋めず、nullに倒した上で報告）
- EvidenceRefを7 variant外の形で出す必要が出た
- factを5 classに正しく分類できない項目が出た
- disclosure testを満たせない経路が見つかった
- oracle / helper parityが既存ruleとずれる
- running-app Case A / C / Dでbyte identityが崩れる、またはCase Bで想定外のwriteが出る
- base drift / unknown worktree change / open PRとplanned filesの競合
- mutationがcompile errorでしかkillされない

Rollback: 5Aはadditive（新規module + copy-only button）。merge前はbranch破棄のみ。merge後は単一revert commitで除去可能（stored data変更なし）。

```text
PHASE_5A_IMPLEMENTATION_AUTHORIZED = NO
```
