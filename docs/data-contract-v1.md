# DVCC Review Hub — Local Data Contract v1

This document describes the files DevVault Control Center (DVCC) Review Hub v0.1 writes on the
local machine. The TypeScript validators in `src/domain/schema.ts` are the executable form of
this contract; synthetic examples live in `fixtures/v1/`.

Runtime data is **never** stored in this repository.

## Location

| Build / mode | Data root |
|---|---|
| Release build | `%APPDATA%\DevVault-Control\` |
| Debug build (`tauri dev`) | `%APPDATA%\DevVault-Control-dev\` |
| Tests / smoke / experiments | value of `DVCC_DATA_DIR` (must be an absolute path) |

The data root is resolved by Rust (`src-tauri/src/storage.rs`). The frontend never passes file
paths; it addresses files through a validated target (`projects`, or `review` + review id +
allowed file name).

## Layout

```text
<data root>/
  projects.json
  projects.json.bak                 previous valid projects.json (written automatically)
  projects.json.corrupt-<n>         unreadable file set aside (kept, never deleted)
  reviews/
    <review-id>/                    rv-YYYYMMDD-xxxxxx (UTC date + 6 lowercase alphanumerics)
      session.json                  current state of the review (authoritative)
      session.json.bak
      checkpoint.md                 latest resume note written on Suspend
      request-r<N>.md               review request of round N (kept per round)
      result-r<N>.md                Human-pasted review result of round N (kept per round)
      events.jsonl                  append-only history
```

`request.md` / `result.md` without a round number are not used: every round keeps its own files.

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
| `repositoryUrl` | `null` or normalized `https://github.com/<owner>/<repo>` |
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
      "verdictNote": "Two required fixes"
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
| `reviewRound` | equals `rounds.length`; `rounds[i].round === i + 1` |
| `resourceState` | `HOT` / `WARM` / `COLD` — independent of `reviewState` |
| `reviewState` | `NEW` / `READY_FOR_REVIEW` / `REVIEWING` / `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED` / `SUSPENDED` / `CLOSED` |
| `suspendedFrom` | non-null **only** while `SUSPENDED`; never `SUSPENDED` or `CLOSED` |
| `chatgptThreadUrl` | `null` or `https://chatgpt.com/...` / `https://chat.openai.com/...` |
| `rounds[].expectedHead`, `reviewedHead` | `null` or lowercase 7–40 hex SHA. These are **Human-recorded values**, not observed Git facts (Git / GitHub freshness is Phase 2). `null` means "not recorded" and is never filled by guessing. |
| `rounds[].verdict` | `null` / `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED`, set only by explicit Human confirmation |

### Review State transitions

| Action | From | To | Conditions |
|---|---|---|---|
| Mark ready | NEW, BLOCKED | READY_FOR_REVIEW | — |
| Start review | READY_FOR_REVIEW | REVIEWING | — |
| Cancel review | REVIEWING | READY_FOR_REVIEW | — |
| Copy review prompt | any except SUSPENDED / CLOSED | unchanged | writes `request-r<N>.md` |
| Capture result | REVIEWING, FIX_REQUIRED, REVIEW_PASS, BLOCKED | unchanged | Human paste → `result-r<N>.md` |
| Confirm verdict | REVIEWING | FIX_REQUIRED / REVIEW_PASS | Human confirmation + captured result of the round |
| Block | NEW, READY_FOR_REVIEW, REVIEWING, FIX_REQUIRED | BLOCKED | Human confirmation + reason (recorded as round verdict when blocked while reviewing) |
| Start next round | FIX_REQUIRED, REVIEW_PASS | READY_FOR_REVIEW | round + 1 |
| Suspend | any except SUSPENDED / CLOSED | SUSPENDED | checkpoint note required; `suspendedFrom` = previous state; Human picks resource WARM or COLD |
| Resume | SUSPENDED, or any non-CLOSED state whose resource is not HOT | `suspendedFrom` (if suspended) | resource → HOT |
| Close | any except CLOSED | CLOSED | Human confirmation |
| Set resource | any | unchanged | resource only |

## events.jsonl

One JSON object per line, appended after `session.json` is written:

```json
{"v":1,"ts":"2026-01-01T12:00:00.000Z","type":"suspended","reviewSessionId":"rv-20260101-alpha1","round":1,"reviewState":{"from":"FIX_REQUIRED","to":"SUSPENDED"},"resourceState":{"from":"HOT","to":"WARM"},"note":null}
```

Types: `review_created`, `review_ready`, `review_started`, `review_cancelled`, `request_saved`,
`result_captured`, `verdict_confirmed`, `blocked`, `suspended`, `resumed`, `closed`,
`resource_changed`, `next_action_updated`, `metadata_updated`.

`session.json` is authoritative. If appending an event fails, the state change is kept and a
warning is shown. Broken or unknown lines are skipped with a warning; the file is never rewritten.

## Write and recovery rules

- JSON files are replaced atomically: temp file → `sync_all` → copy the previous valid file to
  `.bak` → rename over the primary.
- A primary file that is not valid JSON is never overwritten.
- On load:

| Primary | Backup | Result |
|---|---|---|
| valid | — | used |
| invalid (bad JSON, schema violation, invalid UTF-8) | valid | primary renamed to `.corrupt-<n>`, backup restored, warning shown |
| invalid | missing / invalid | **UNREADABLE**: file untouched, writes to it refused; Human action required |
| newer `schemaVersion` | — | **read-only / unsupported**: never overwritten or restored |
| I/O error | — | UNREADABLE (no rename, no restore) |

- A problem in one review's `session.json` affects only that review.
- For an unreadable `projects.json`, the Human may choose "Set aside and start empty": the file is
  renamed to `.corrupt-<n>` (kept) and an empty project list is started.
