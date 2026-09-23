# DVCC Review Hub — Local Data Contract v1

This document describes the files DevVault Control Center (DVCC) Review Hub v0.1 writes on the
local machine. The TypeScript validators in `src/domain/schema.ts` are the executable form of
this contract; synthetic examples live in `fixtures/v1/`. Shared numeric limits live in
`contract/limits.json`.

Runtime data is **never** stored in this repository.

Phase 3 (Review Workflow v0.3, under development) extends this contract **additively**: new
optional round fields, new per-round files and new event types. `schemaVersion` stays `1`, nothing is
renamed, rewritten or deleted, and every file written by Phase 1 or 2 keeps loading with the same
meaning. See [Review workflow (Phase 3)](#review-workflow-phase-3).

## Location

| Build / mode | Data root |
|---|---|
| Release build | `%APPDATA%\DevVault-Control\` |
| Debug build (`tauri dev`) | `%APPDATA%\DevVault-Control-dev\` |
| Tests / smoke / experiments | value of `DVCC_DATA_DIR` (must be an absolute path) |

The data root is resolved by Rust (`src-tauri/src/storage.rs`). The frontend never passes file
paths; it addresses files through a validated target (`projects`, or `review` + review id +
allowed file name).

One DVCC process per Windows session uses the data, enforced in three layers:

1. **Start-up lock** (named mutex `Local\com.devvault.controlcenter.startup`): DVCC processes
   build the app one at a time, and the single-instance plugin registers the running instance
   during that build. A process started later, or at the same moment, therefore always finds a
   fully registered instance. The lock fails closed: a process that does not own it within 15 s,
   cannot create it, or gets any other wait result exits (code 75) before the app is built — no
   window, no WebView2, no data folder access.
2. **Single-instance plugin**: such a process hands over to the registered instance (its window is
   brought to the front) and exits inside the plugin set-up, before it creates any window or
   resolves the data folder.
3. **Data-folder lock** `.dvcc.lock`: the running process keeps this file open without sharing. A
   process that cannot open it (e.g. another Windows session using the same folder) performs no
   storage operation and shows `DATA_DIR_IN_USE`; close the other process, then start DVCC again.

Debug and release builds share the app identifier and the mutex names, so a running debug build
also stops a release build from starting (and vice versa), even though their data folders differ.

## Layout

```text
<data root>/
  .dvcc.lock                        empty; held open exclusively while DVCC runs (see above)
  settings.json                     interface preferences (language); written only when you change one
  settings.json.bak                 previous valid settings.json (written automatically)
  projects.json
  projects.json.bak                 previous valid projects.json (written automatically)
  projects.json.corrupt-<ms>[-n]    unusable file set aside (kept, never deleted)
  projects.json.bak.corrupt-<ms>    unusable backup set aside by a Human action (kept)
  reviews/
    <review-id>/                    rv-YYYYMMDD-xxxxxx (UTC date + 6 lowercase alphanumerics)
      session.json                  current state of the review (authoritative)
      session.json.bak
      checkpoint.md                 latest resume note written on Suspend
      request-r<N>.md               latest review request (Turn 1) of round N (one file per round)
      result-r<N>.md                latest Human-pasted review result of round N (canonical);
                                    in Phase 3 terms, the Fresh Assessment
      result-r<N>-previous-<ms>[-<n>].md
                                    an earlier result of round N that was replaced (kept)
      followup-r<N>.md              Phase 3: Turn 2 (Resolution Follow-up) of round N, if one was sent
      judgment-r<N>.md              Phase 3: the Final Judgment, the reviewer's answer to Turn 2
      judgment-r<N>-previous-<ms>[-<n>].md
                                    Phase 3: an earlier Final Judgment of round N that was replaced (kept)
      events.jsonl                  append-only history
```

- `request.md` / `result.md` without a round number are not used: every round keeps its own files.
- `N` is `1..maxReviewRounds` from `contract/limits.json` (currently 999), without leading zeros.
- Temporary files are named `<file>.tmp-<pid>-<n>`; they are never read as data. A leftover temp
  file after a crash can be deleted by hand.

## settings.json

Interface preferences only. No project or review data is read or written on this path, and the file
is written only when the Human changes the language.

```json
{
  "schemaVersion": 1,
  "locale": "ja"
}
```

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | number | Must be exactly `1`. A missing, mistyped, `0` or later version makes the file unusable. |
| `locale` | string | `"ja"` or `"en"`. Anything else makes the file unusable. |

- Missing file: the normal case for a fresh install. The interface is Japanese and nothing is written.
- Unusable file (unreadable, not JSON, wrong schema version, unknown locale): the interface is
  Japanese, a warning is shown, and **the file is left exactly as it is** — loading never writes, so
  a file belonging to a later version of DVCC survives being opened by this one.
- The language is a display choice only. Every stored value — review state, resource state,
  freshness, event type, schema field, file name, error code — stays language-neutral, and text the
  Human typed is never translated. A saved `request-r<N>.md` or `followup-r<N>.md` keeps the language
  it was written in; changing the language never rewrites an artifact.
- Writes of this file are serialized, so switching the language repeatedly cannot leave a different
  language on disk than the one on screen. A write that fails takes the interface back to the
  language that is still stored and says so.

## projects.json

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "projectId": "project-alpha",
      "displayName": "Project Alpha",
      "repositoryUrl": "https://github.com/example-org/project-alpha",
      "localRoot": "C:\\example\\project-alpha",
      "developmentIde": "Claude Code",
      "nextAction": "Address R1 required fixes",
      "notes": "",
      "createdAt": "2026-01-01T09:00:00.000Z",
      "updatedAt": "2026-01-02T09:00:00.000Z"
    }
  ]
}
```

| Field | Rule |
|---|---|
| `projectId` | `^[a-z0-9][a-z0-9-]{1,63}$`, unique, immutable after creation |
| `displayName` | non-empty |
| `repositoryUrl` | `null` or the canonical `https://github.com/<owner>/<repo>`. Normalization is idempotent: every trailing `.git` is removed, trailing slashes are dropped, the host is lowercased; anything the app accepts is accepted again on load. |
| `localRoot` | `null` or absolute drive path (`C:\...`); UNC paths are rejected |
| `developmentIde` | `null` or a label; v0.1 does not launch IDEs |
| `nextAction`, `notes` | strings |
| `createdAt`, `updatedAt` | ISO-8601 UTC (`...Z`) |

## session.json

```json
{
  "schemaVersion": 1,
  "reviewSessionId": "rv-20260101-alpha1",
  "projectId": "project-alpha",
  "prNumber": 45,
  "reviewType": "PR review",
  "reviewRound": 1,
  "resourceState": "WARM",
  "reviewState": "SUSPENDED",
  "suspendedFrom": "FIX_REQUIRED",
  "chatgptThreadTitle": "Project Alpha PR45 review",
  "chatgptThreadUrl": "https://chatgpt.com/c/example-thread-alpha",
  "nextAction": "Fix R1 required findings, then start R2",
  "rounds": [
    {
      "round": 1,
      "expectedHead": "0123456789abcdef0123456789abcdef01234567",
      "reviewedHead": "0123456789abcdef0123456789abcdef01234567",
      "requestSavedAt": "2026-01-01T10:05:00.000Z",
      "resultCapturedAt": "2026-01-01T11:00:00.000Z",
      "verdict": "FIX_REQUIRED",
      "verdictConfirmedAt": "2026-01-01T11:02:00.000Z",
      "verdictNote": "Two required fixes",
      "archivedResults": []
    }
  ],
  "createdAt": "2026-01-01T10:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

| Field | Rule |
|---|---|
| `reviewSessionId` | must equal the folder name |
| `prNumber` | `null` or positive integer |
| `reviewRound` | equals `rounds.length` (≤ `maxReviewRounds`); `rounds[i].round === i + 1` |
| `resourceState` | `HOT` / `WARM` / `COLD` — independent of `reviewState` |
| `reviewState` | `NEW` / `READY_FOR_REVIEW` / `REVIEWING` / `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED` / `SUSPENDED` / `CLOSED` |
| `suspendedFrom` | non-null **only** while `SUSPENDED`; never `SUSPENDED` or `CLOSED` |
| `chatgptThreadUrl` | `null` or `https://chatgpt.com/...` / `https://chat.openai.com/...` |
| `rounds[].expectedHead`, `reviewedHead` | `null` or lowercase 7–40 hex SHA. These are **Human-recorded values**, never observed Git facts: the Phase 2 Git observation only compares against them and never writes them. `null` means "not recorded" and is never filled by guessing. |
| `rounds[].resultCapturedAt` | capture time of the canonical latest `result-r<N>.md` |
| `rounds[].verdict` | `null` / `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED`, set only by explicit Human confirmation |
| `rounds[].archivedResults` | earlier results of the round kept when a result was replaced, oldest first (`result-r<N>-previous-<ms>.md`, `<ms>` = capture time of the replaced result; `-<n>` (1–999) is appended when that name is already taken, e.g. by an archive an interrupted capture left unrecorded). Missing in files written before this field existed → `[]`. |
| `rounds[].followupSavedAt` | Phase 3, optional. `null` or ISO-8601 UTC: when Turn 2 (`followup-r<N>.md`) was written. Absent → `null` ("no Turn 2 happened"). |
| `rounds[].judgmentCapturedAt` | Phase 3, optional. `null` or ISO-8601 UTC: capture time of the canonical latest `judgment-r<N>.md`. Absent → `null`. |
| `rounds[].archivedJudgments` | Phase 3, optional. Earlier Final Judgments of the round kept when one was replaced, oldest first (`judgment-r<N>-previous-<ms>[-<n>].md`, same naming rule as `archivedResults`). Absent → `[]`. |
| `rounds[].riskTier` | Phase 3, optional. `null` / `TIER_0` / `TIER_1` / `TIER_2`, set only by the Human. Absent → `null`. Independent of Review State, Resource State and Freshness. |
| `rounds[].riskTierSubjects` | Phase 3, optional. The Tier 2 subjects the Human declared: any of `SECURITY`, `PRIVACY`, `CREDENTIAL`, `PRODUCTION`, `MIGRATION`. Absent → `[]`. Persisted so the rule "these subjects require Tier 2" still applies after a restart. |
| `rounds[].revalidation` | Phase 3, optional. `null`, or `{ "reason", "priorReviews": [{ "reviewId", "round" }], "explanation" }`: why a second substantive review of an already-reviewed head was allowed. `reason` is one of `HEAD_CHANGED`, `BASE_CHANGED`, `TARGET_BLOB_CHANGED`, `RELEVANT_CONTRACT_CHANGED`, `EXECUTION_ENVIRONMENT_CHANGED` (for a same-head duplicate only the last four are accepted by the workflow); `explanation` is the Human's text, `null` when none, never parsed. Absent → `null`. |
| `rounds[].evidenceDecisions` | Phase 3, optional. `[{ "id", "source", "boundHead", "capturedAt", "status", "reason" }]`: what the Human recorded about each piece of evidence offered for reuse. `source`: `GIT_OBSERVATION` / `HUMAN_RECORDED_HEAD` / `INDEPENDENT_REVIEW_RESULT` / `PRIOR_RUN_EVIDENCE`; `status`: `REUSABLE` / `RECHECK_REQUIRED` / `UNAVAILABLE`; `reason`: `SHA_BOUND` / `NO_BINDING` / `HEAD_NOT_COMPARABLE` / `BOUND_TO_ANOTHER_HEAD` / `BASE_CHANGED` / `TARGET_BLOB_CHANGED` / `RELEVANT_CONTRACT_CHANGED` / `EXECUTION_ENVIRONMENT_CHANGED`; `boundHead` and `capturedAt` may be `null`. Absent → `[]`. |

A round written by this version always serializes its Phase 3 fields (at their empty values when
nothing happened), so "written before Phase 3" and "written by Phase 3 with nothing to say" read back
as the same round.

### Review State transitions

The independent, Human-approved form of this table used by the tests is
`src/test/transitionContract.ts`.

| Action | From | To | Conditions |
|---|---|---|---|
| Mark ready | NEW, BLOCKED | READY_FOR_REVIEW | — |
| Start review | READY_FOR_REVIEW | REVIEWING | — |
| Cancel review | REVIEWING | READY_FOR_REVIEW | — |
| Copy review prompt | any except SUSPENDED / CLOSED | unchanged | writes `request-r<N>.md` |
| Capture result | REVIEWING, FIX_REQUIRED, REVIEW_PASS, BLOCKED | unchanged | Human paste → `result-r<N>.md`. If the round already has a result: explicit Human replace confirmation, and the previous text is kept as `result-r<N>-previous-<ms>.md` first |
| Confirm verdict | REVIEWING | FIX_REQUIRED / REVIEW_PASS | Human confirmation + captured result of the round |
| Block | NEW, READY_FOR_REVIEW, REVIEWING, FIX_REQUIRED | BLOCKED | Human confirmation + reason (recorded as round verdict when blocked while reviewing) |
| Start next round | FIX_REQUIRED, REVIEW_PASS | READY_FOR_REVIEW | round + 1, only while `reviewRound < maxReviewRounds` |
| Suspend | any except SUSPENDED / CLOSED | SUSPENDED | checkpoint note required; `suspendedFrom` = previous state; Human picks resource WARM or COLD |
| Resume | SUSPENDED, or any non-CLOSED state whose resource is not HOT | `suspendedFrom` (if suspended) | resource → HOT |
| Close | any except CLOSED | CLOSED | Human confirmation |
| Set resource | any | unchanged | resource only |
| Copy Turn 2 *(Phase 3)* | REVIEWING | unchanged | Fresh Assessment captured, no Final Judgment yet, verdict not confirmed → writes `followup-r<N>.md`, sets `followupSavedAt` |
| Capture Final Judgment *(Phase 3)* | REVIEWING | unchanged | Turn 2 sent, verdict not confirmed → `judgment-r<N>.md`; replacing needs Human confirmation and archives the previous text first |
| Set Risk Tier *(Phase 3)* | NEW, READY_FOR_REVIEW, REVIEWING, BLOCKED | unchanged | Human confirmation; refused if the declared Tier 2 subjects require a higher tier, or once the round's verdict is confirmed |
| Record invalidation reason *(Phase 3)* | NEW, READY_FOR_REVIEW, REVIEWING, BLOCKED | unchanged | one per round, before the verdict; needs at least one prior review and a reason valid for a same-head duplicate |
| Record evidence decisions *(Phase 3)* | NEW, READY_FOR_REVIEW, REVIEWING, BLOCKED | unchanged | before the verdict; each item id at most once |

Phase 3 also tightens **Confirm verdict**: once a round has sent a Turn 2, the verdict is refused
until its Final Judgment is captured (`action.verdict.judgmentRequired`).

## events.jsonl

One JSON object per line, appended after `session.json` is written:

```json
{"v":1,"ts":"2026-01-01T12:00:00.000Z","type":"suspended","reviewSessionId":"rv-20260101-alpha1","round":1,"reviewState":{"from":"FIX_REQUIRED","to":"SUSPENDED"},"resourceState":{"from":"HOT","to":"WARM"},"note":null}
```

Types: `review_created`, `review_ready`, `review_started`, `review_cancelled`, `request_saved`,
`result_captured`, `verdict_confirmed`, `blocked`, `suspended`, `resumed`, `closed`,
`resource_changed`, `next_action_updated`, `metadata_updated`.

Phase 3 adds `followup_saved`, `judgment_captured`, `risk_tier_set`, `duplicate_continued` and
`evidence_reused`. An older build does not know these types and skips such lines with its visible
"skipped lines" count, as it does for any unreadable line.

Phase 3 events may carry an optional, **closed, typed** `detail`, one shape per type; `detail.kind`
must equal `type`, and any other shape makes the line unreadable (skipped, never rewritten):

| `type` | `detail` |
|---|---|
| `duplicate_continued` | `{ "kind", "invalidationReason", "priorReviews": [{ "reviewId", "round" }] }` |
| `evidence_reused` | `{ "kind", "items": [ … ] }`, each item shaped like a `rounds[].evidenceDecisions` entry |
| `risk_tier_set` | `{ "kind", "riskTier", "subjects": [ … ] }`, the subjects being Tier 2 subjects |

`note` stays Human-readable text that nothing reads back; a fact the workflow acts on is stored in
`detail` and in the round record, never recovered from a sentence.

`session.json` is authoritative. If appending an event fails, the state change is kept and a
warning is shown. Broken or unknown lines are skipped with a warning; the file is never rewritten.

## Write rules

- All application operations run one at a time in the order they were requested, each starting
  from the state committed by the previous one; the UI shows the committed state. Inside the
  process, every storage command is serialized by one lock.
- Files are replaced atomically: unique temp file (`create_new`) → `sync_all` → for JSON, copy the
  previous valid file to `.bak` → rename over the primary.
- Conditional writes: the file must still be absent, or contain exactly what DVCC last read or
  wrote in this run. If another program changed it, that write is refused (`CONFLICT`), the
  changed file is not overwritten, and the Human is asked to Reload.

  | File | Precondition |
  |---|---|
  | `projects.json`, `session.json` | always (loaded at start; a new review requires an absent `session.json`) |
  | `result-r<N>.md` | always: absent for a first capture, otherwise exactly the text that was just archived |
  | `result-r<N>-previous-<ms>[-<n>].md` | always: absent, or exactly the replaced text when an earlier attempt already wrote it |
  | `request-r<N>.md`, `followup-r<N>.md`, `checkpoint.md` | only when DVCC read or wrote that file in this run; otherwise the latest save replaces it (regenerated notes, not history). A `followup-r<N>.md` is never written again once its Final Judgment is captured |
  | `judgment-r<N>.md`, `judgment-r<N>-previous-<ms>[-<n>].md` | Phase 3: the same rules as `result-r<N>.md` and its archives |
  | `events.jsonl` | append only |

- A save that writes other files before `session.json` (Suspend → `checkpoint.md`, Copy review
  prompt → `request-r<N>.md`, Capture result → archive and result) first checks that
  `session.json` is unchanged, so a conflict is normally found before anything is written.
- Capture result can be retried after any interruption: an unrecorded archive that already holds
  the replaced text is reused, one holding other text is recorded as well (never overwritten),
  and the replaced text otherwise goes to the next free `-<n>` name.
- A JSON primary that is not valid JSON is never overwritten (`PRIMARY_UNREADABLE`).
- A missing JSON primary whose `.bak` exists cannot be recreated by a normal save
  (`RECOVERY_REQUIRED`); only an explicit restore from the backup (or setting the backup aside) can
  proceed, so the only recoverable copy is never replaced silently.

## Recovery rules (on load)

| Primary | Backup | Result |
|---|---|---|
| valid | — | used |
| newer `schemaVersion` | — | **read-only / unsupported**: never overwritten or restored |
| I/O error (permission, lock, device, unknown) | — | **I/O error** state: nothing renamed or restored; no set-aside offered; Reload after fixing access |
| missing | missing | empty (writable) |
| missing | valid | **recovery**: backup restored to the primary (backup kept), warning shown |
| missing | invalid | **UNREADABLE**: nothing written; Human may set the backup aside |
| invalid (bad JSON, schema violation, invalid UTF-8) | valid | primary renamed to `.corrupt-<ms>`, backup restored, warning shown |
| invalid | missing | **UNREADABLE**: file untouched, writes refused; Human may set it aside |
| invalid | invalid | **UNREADABLE**: Human may set both aside |
| any | newer `schemaVersion` | read-only / unsupported |
| any | I/O error | I/O error state |

- If a restore write fails, the backup is untouched, writes stay blocked, and the next load retries.
- A problem in one review's `session.json` affects only that review (read-only row).
- For an unreadable `projects.json`, the Human may choose "Set aside and start empty": the unusable
  primary and / or backup are renamed to `.corrupt-<ms>` (kept) and an empty project list starts.

## Git evidence and derived Freshness (Phase 2)

Observed Git facts and Human-recorded values are kept apart. The observation is **volatile runtime
state**: it is never written to `projects.json`, to a `session.json` or to any other file, so after a
restart there is no observation until the Human refreshes. Nothing is observed automatically at
start-up.

One observation of a project's local root yields:

| Field | Meaning |
|---|---|
| `status` | `OK` / `NO_LOCAL_ROOT` / `NOT_A_GIT_REPOSITORY` / `GIT_UNAVAILABLE` / `TIMEOUT` / `ERROR` |
| `head` | full 40-character SHA, or `null` (e.g. a repository without any commit) |
| `branch` | branch name, or `null` when detached or unknown |
| `detached` | `true` only when Git reports that HEAD is not a symbolic ref, `false` for a branch, `null` when HEAD could not be read |
| `dirty` | uncommitted changes including untracked files, or `null` when unknown |
| `observedAt` | ISO-8601 UTC, millisecond precision |
| `errorCode`, `errorMessage` | why an observation failed (e.g. the folder boundary's `NETWORK_TARGET`) |

Anything other than `status = OK` leaves every fact `null`; nothing is guessed.

How it is obtained: the recorded local root passes the same folder boundary as the launcher (absolute
local path, existing directory, no UNC, no mapped network drive, every link target checked without
following it). Git is then asked where the repository actually is (`rev-parse --show-toplevel` and
`--absolute-git-dir`) and **those** locations pass the same boundary again, because a `.git` file or
`core.worktree` can point Git somewhere else. Every object store listed in
`<git-dir>/objects/info/alternates` is checked the same way, since Git reads objects from those. Only then are
`rev-parse --verify --quiet HEAD`, `symbolic-ref --quiet --short HEAD` and `status --porcelain=v1`
trusted. Every invocation runs through `std::process::Command` — no shell, no argument built from
typed text, stdin closed, `-c core.fsmonitor=false`, `GIT_OPTIONAL_LOCKS=0` (so not even an index
refresh is written), `GIT_TERMINAL_PROMPT=0`, and the `GIT_*` variables that would redirect Git to
another repository, work tree, index or configuration removed (`GIT_DIR`, `GIT_COMMON_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`,
`GIT_NAMESPACE`, `GIT_DISCOVERY_ACROSS_FILESYSTEM`, `GIT_CEILING_DIRECTORIES`,
`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`,
`GIT_CONFIG_NOSYSTEM`). One 5 s bound
(`contract/limits.json` `gitObservationTimeoutMs`) covers the whole observation, including draining
the child's output, after which only the process DVCC started is terminated and the observation
fails closed. No command contacts a remote.

What the boundary does not cover: `git status` honours the observed repository's own configuration,
so a clean filter or a file-system monitor configured **in that repository** is executed by Git as
part of the observation, like for any other Git command run in that folder. DVCC disables the
file-system monitor for its own calls and cannot be redirected by inherited `GIT_*` variables, but
it does not sandbox a repository's own hooks or filters.

Freshness is derived from the observation and the current round's recorded HEADs, in this fixed
priority:

| Freshness | Condition |
|---|---|
| `WORKTREE_DIRTY` | observation `OK` and `dirty = true` |
| `REVIEW_STALE` | clean tree and a recorded `reviewedHead` that is not the current HEAD |
| `HEAD_CHANGED` | clean tree, reviewed HEAD matching or absent, and a recorded `expectedHead` that is not the current HEAD |
| `ALIGNED` | observation `OK`, clean tree, current HEAD known, and every recorded HEAD matches it |
| `UNKNOWN` | everything else: not observed yet, no local root, not a repository, Git unavailable, timeout, error, unknown current HEAD, no recorded HEAD at all, or a recorded value that cannot be compared |

A recorded HEAD of 40 characters must be equal to the current HEAD; a 7–39-character value must be a
prefix of it (comparison is case-insensitive). A malformed or unreadable value is never treated as a
difference — it yields `UNKNOWN`.

Freshness is informational: it is a third axis next to Review State and Resource State, and a refresh
never changes a review state, a resource state or a recorded HEAD. `REVIEW_PASS` + `REVIEW_STALE` and
`FIX_REQUIRED` + `ALIGNED` are both normal combinations.

## Review workflow (Phase 3)

Status: under development on `feat/review-workflow-v0.3`; not yet verified in the running app.

### Protocol invariants

The canonical Fresh-Context protocol runs Turn 1 → Fresh Assessment → (optional) Turn 2 → (optional)
Final Judgment → Human verdict. It is enforced in two places:

| Invariant | Enforced by |
|---|---|
| A Turn 2 requires the Fresh Assessment: `followupSavedAt` needs `resultCapturedAt` | the domain guard (`action.followup.assessmentRequired`) and the schema parser (`schema.round.followupWithoutAssessment`) |
| A Final Judgment requires a Turn 2: `judgmentCapturedAt` needs `followupSavedAt` | the domain guard (`action.judgment.followupRequired`) and the schema parser (`schema.round.judgmentWithoutFollowup`) |
| A verdict after a Turn 2 requires the Final Judgment | the domain guard (`action.verdict.judgmentRequired`) |
| A Turn 2 cannot be rewritten once its Final Judgment is captured, or once the verdict is confirmed | the domain guard (`action.followup.judgmentCaptured`, `action.followup.verdictConfirmed`) |
| The Final Judgment never replaces the Fresh Assessment | separate files: `result-r<N>.md` and `judgment-r<N>.md` |
| An old v1 round remains valid | every Phase 3 key is optional; a round without them means "no Turn 2, no tier, no duplicate continued, no evidence carried over" |

A file that claims a later step without the earlier one is refused by the parser and left untouched,
exactly like any other unreadable `session.json`.

### Prompt documents

`request-r<N>.md` (Turn 1) and `followup-r<N>.md` (Turn 2) are written in the interface language at
the moment they are generated and are never regenerated afterwards: a request written by an earlier
version keeps its headings, and only a newly generated one follows the current structure.

- Turn 1: `Stage 1 — Review Target` with `Artifact`, `Contract` and `Material Facts`, then
  `Stage 2 — Fresh Assessment`. It never contains the implementation narrative (background and
  purpose, decisions already taken, implementation history, design reasons, self-assessment), nor
  the local root, project notes or next action. It always asks for the Material Facts (known risks,
  limitations, failing tests, security and destructive-operation constraints, scope exclusions,
  unresolved issues, Human Gate items). A re-review states the previous round, its reviewed HEAD,
  its Human-confirmed verdict, its response file, the evidence decisions and the recorded
  invalidation reason code, as recorded.
- Exact HEAD: a request is an exact-head request only when the round's `expectedHead` is the full
  40-character SHA. Otherwise it still generates, but states in its own text that it is not an
  exact-head review. A 7–39-character value remains valid in the schema; nothing completes it, and a
  locally observed HEAD is never written into `expectedHead`.
- Turn 2: `Stage 3 — Resolution Context` (the implementation narrative, including the Human's note
  on the previous verdict and their explanation of a revalidation) and `Stage 4 — Final Judgment`,
  which asks for a separate answer that leaves the Fresh Assessment untouched and names the added
  Evidence behind every changed finding.

### Freshness stays a derived fact

The workflow shows Phase 2 Freshness with its reason, the recorded and observed HEADs and the
observation time, but Freshness is never written anywhere and never decides anything: it does not
change a Review State (`REVIEW_STALE` does not mean `FIX_REQUIRED`), does not start a round
(`HEAD_CHANGED`), does not make evidence reusable (`ALIGNED`), and `UNKNOWN` is never read as
`ALIGNED`. The stored `evidenceDecisions` are the workflow's own record of reuse.

## Launcher boundary

- URLs open only if they are `https` without credentials or a non-default port on `github.com`,
  `chatgpt.com` or `chat.openai.com` (decided by URL parsing). An explicit `:443` is the https
  default port: URL parsing normalizes it away, so it is accepted and never stored or opened with
  the port; any other explicit port is refused.
- Folders open only if the input is an absolute local drive path of an existing directory on a
  non-network drive, and the final target after resolving symbolic links, junctions and mapped
  drives is also on a local drive. UNC / network targets are refused (`NETWORK_TARGET`). The
  resolved local path is what gets opened. No shell command is executed.
- Before any metadata or resolution call follows a link, every symbolic link / junction along the
  path is read (not followed) and its target is checked the same way, so a link to a network
  location is refused without contacting that location.
