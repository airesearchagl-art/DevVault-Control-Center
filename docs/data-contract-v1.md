# DVCC Review Hub — Local Data Contract v1

This document describes the files DevVault Control Center (DVCC) Review Hub v0.1 writes on the
local machine. The TypeScript validators in `src/domain/schema.ts` are the executable form of
this contract; synthetic examples live in `fixtures/v1/`. Shared numeric limits live in
`contract/limits.json`.

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
  projects.json
  projects.json.bak                 previous valid projects.json (written automatically)
  projects.json.corrupt-<ms>[-n]    unusable file set aside (kept, never deleted)
  projects.json.bak.corrupt-<ms>    unusable backup set aside by a Human action (kept)
  reviews/
    <review-id>/                    rv-YYYYMMDD-xxxxxx (UTC date + 6 lowercase alphanumerics)
      session.json                  current state of the review (authoritative)
      session.json.bak
      checkpoint.md                 latest resume note written on Suspend
      request-r<N>.md               latest review request of round N (one file per round)
      result-r<N>.md                latest Human-pasted review result of round N (canonical)
      result-r<N>-previous-<ms>[-<n>].md
                                    an earlier result of round N that was replaced (kept)
      events.jsonl                  append-only history
```

- `request.md` / `result.md` without a round number are not used: every round keeps its own files.
- `N` is `1..maxReviewRounds` from `contract/limits.json` (currently 999), without leading zeros.
- Temporary files are named `<file>.tmp-<pid>-<n>`; they are never read as data. A leftover temp
  file after a crash can be deleted by hand.

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
  | `request-r<N>.md`, `checkpoint.md` | only when DVCC read or wrote that file in this run; otherwise the latest save replaces it (both are regenerated notes, not history) |
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
`--absolute-git-dir`) and **those** locations pass the same boundary again, because a `.git` file,
`core.worktree` or an alternates entry can point Git somewhere else. Only then are
`rev-parse --verify --quiet HEAD`, `symbolic-ref --quiet --short HEAD` and `status --porcelain=v1`
trusted. Every invocation runs through `std::process::Command` — no shell, no argument built from
typed text, stdin closed, `-c core.fsmonitor=false`, `GIT_OPTIONAL_LOCKS=0` (so not even an index
refresh is written), `GIT_TERMINAL_PROMPT=0`, and the `GIT_*` variables that would redirect Git to
another repository, work tree, index or configuration removed. One 5 s bound
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
