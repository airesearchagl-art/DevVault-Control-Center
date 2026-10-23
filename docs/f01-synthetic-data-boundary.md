# F01 synthetic-only pilot data boundary (preparation)

Status: **preparation for RF-5C-F01** (task `DVCC-F01-SYNTHETIC-PREP-01`). This document is a
candidate specification. It does not close F01, adopt an architecture, start Phase 5C or authorize any
transport. Nothing in DVCC itself changes.

"Implemented" below means implemented in the **reference verifier**
(`scripts/lib/f01-synthetic-fixture.mjs`) and exercised by `src/test/f01SyntheticFixture.test.ts` — not in
the DVCC application. Everything the application would need is listed in §6 as **NOT IMPLEMENTED**.

Out of scope: named pipes, process identity, DS-5C-01, MCP / tunnel / DOT connections, access to real
data, and any change to what DVCC publishes.

## 1. Artifacts

| Path | Role |
|---|---|
| `fixtures/f01-synthetic/v1/data-root/` | The synthetic data folder (7 files) |
| `fixtures/f01-synthetic/v1/manifest.json` | Pinned file list, sizes and SHA-256 values; outside the data folder |
| `fixtures/f01-synthetic/v1/expected/*.json` | Expected Control Read responses for the fixture |
| `scripts/lib/f01-synthetic-fixture.mjs` (+ `.d.mts`) | Fixture definitions, generator and reference verifier (Node built-ins only) |
| `src/test/f01SyntheticFixture.test.ts` | Tests (part of `npm test`) |

## 2. The synthetic fixture

- One fictional Project `synthetic-alpha` (repository `example-org/synthetic-alpha`) and one fictional
  Review `rv-20261020-synth1` (round 1, `FIX_REQUIRED`, verdict confirmed), fixed times
  `2026-10-20T00:00:00.000Z`–`00:32:00.000Z`, fixed HEAD.
- Built only from constants in the generator. Nothing is copied from real data or anonymized from it.
- Every field Control Read must never disclose holds a `SENTINEL_*` value: display name, notes, next
  actions, IDE label, review type, ChatGPT thread title and URL (an `example-` URL), verdict note,
  checkpoint, request / result bodies, event note, and the local root (a fictional `X:` drive path).
- `settings.json` holds the language only (the pilot baseline has no Codex executable path).
- No `.dvcc.lock`, temp, backup or set-aside file is committed.

The tooling never writes the manifest. `print-manifest` prints the manifest the definitions imply, for
review; the test requires the committed manifest to equal it **and** pins the manifest's own SHA-256.
Changing the fixture therefore needs a reviewed change to the definitions, the manifest and the pin.
`generate` writes only the 7 fixture files into `data-root`. The CLI always targets `data-root`; the
tests call the same function on a `dvcc-f01-*` temp folder, and any other root is refused. Before
anything is written, it refuses a folder that is a link or holds anything else. It uses the same
scan as the verifier, so an unknown folder is refused without being entered.

## 3. Verification rules (reference verifier)

Fail closed: any finding rejects the whole folder and returns no bytes.

| ID | Rule | Rejection code | Evidence |
|---|---|---|---|
| V-F01-01 | Only the fixture folder or a `dvcc-f01-*` folder directly in the OS temp folder may be verified; anything else is refused before it is listed | `ROOT_NOT_ALLOWED` | tested |
| V-F01-02 | Manifest is strict: closed keys, relative lowercase paths without `..`, unique entries, size ≤ 64 KiB, lowercase 64-hex SHA-256, `runtime_managed` is exactly `.dvcc.lock` | `MANIFEST_INVALID` | tested (13 variants) |
| V-F01-03 | The manifest lives outside the data folder (no self-hash) and is pinned by the test | — | tested |
| V-F01-04 | Exactly the manifest's file set: nothing missing, nothing extra. The scan enters only the manifest's folders: any other folder (including one named like the lock, an expected file or a backup) is recorded at its entrance and never listed. Unknown files are never opened | `MISSING_FILE`, `MISSING_DIRECTORY`, `UNEXPECTED_ENTRY` (or the folder's own code: `RUNTIME_FILE_INVALID`, `NOT_EXPECTED_KIND`, `TRANSIENT_STORAGE_FILE`) | tested on the real scan: no listing call inside such a folder, one finding even with 65 files inside, no bytes returned |
| V-F01-05 | Size, then SHA-256 of the bytes actually read | `CONTENT_MISMATCH` | tested (same size and other size) |
| V-F01-06 | Expected values come only from the committed manifest, never from the data being checked | `CONTENT_MISMATCH` | tested (a manifest that disagrees with the data rejects it) |
| V-F01-07 | DVCC temp / backup / set-aside names (`*.tmp-*`, `*.bak`, `*.corrupt-*`) | `TRANSIENT_STORAGE_FILE` | tested |
| V-F01-08 | `.dvcc.lock` may exist only as an empty regular file; it is never hashed or returned | `RUNTIME_FILE_INVALID` | tested (no lock held) |
| V-F01-09 | An entry Node's `lstat` reports as a link is rejected and not entered (expected for Windows symbolic links and junctions; not exercised on disk here) | `LINK_OR_REPARSE` (root: `ROOT_INVALID`) | tested on the real scan with a simulated `lstat` result; no link was created on disk |
| V-F01-10 | Each entry's resolved path must equal the resolved root plus its relative path | `LINK_OR_REPARSE` | decision logic tested; no redirection was created on disk |
| V-F01-11 | A file is read through one handle whose device and file ID must equal the listing | `CHANGED_OR_UNREADABLE` | normal path tested; the race was not reproduced |
| V-F01-12 | At most 64 listed entries (the root and the manifest's folders only), depth 4, 64 KiB per file | `LIMIT_EXCEEDED`, `CHANGED_OR_UNREADABLE` | entry limit tested in the root and in a review folder |
| V-F01-13 | Findings carry fixed codes and a relative path only when it matches a safe pattern (otherwise `null`); no absolute path, no error text | — | tested |
| V-F01-14 | On success the verified bytes are returned, and only they are used afterwards | — | tested: a later disk change does not reach the response |

The reference verifier is not a complete reparse-point check: Node's `lstat` does not expose
`FILE_ATTRIBUTE_REPARSE_POINT`, and reparse tags other than symbolic links and junctions (for example
cloud-file placeholders) may be reported as regular files. V-F01-10 catches path redirection, not every
tag. See §6.4.

## 4. Control Read over the fixture

The verified bytes go through the application's own pure loading path: an in-memory storage backend
(`src/test/memoryStorage.ts`, strict UTF-8 decoding) → `loadAll` → `appReducer` (`loaded`) →
`controlReadSourceFrom` → `readControl`. Only the Tauri storage commands are replaced.

- `get_control_snapshot`, `get_project_state` and `get_review_state` must equal
  `expected/*.json`. These were produced once from `readControl` with a fixed clock and snapshot ID and
  checked by hand against `docs/control-read-contract-v1.md` (repository `ENTERED` with
  `recorded_at: null`, local root path `WITHHELD_BY_POLICY`, Git facts `NOT_OBSERVED`, review state and
  verdict `EXPLICIT`, reviewed head and result presence bound to `resultCapturedAt`). The tests compare;
  they never rewrite these files.
- No response or error (including `TARGET_NOT_FOUND` and `get_run_state`) may contain a `SENTINEL_*`
  value, a drive or UNC path, a ChatGPT reference, a data-folder file name, `settings`, `locale` or the
  temp folder.
- The source passes on exactly five keys; `settings.json`, review artifacts and storage information never
  reach it.

Not covered by this fixture: observed Git states, the 50-review / 20-round limits, unreadable sessions.
Existing Control Read tests cover those with in-memory sources.

## 5. Facts this specification relies on

- Data folder layout: `projects.json`, `settings.json`, `reviews/<rv-YYYYMMDD-xxxxxx>/` holding
  `session.json`, `checkpoint.md`, `events.jsonl`, `request-rN.md`, `result-rN.md`, `followup-rN.md`,
  `judgment-rN.md` and archived `*-rN-previous-<ms>[-n].md` (`src-tauri/src/storage.rs`:
  `target_path`, `is_allowed_review_file`).
- `.dvcc.lock`: opened read/write with share mode 0 by the owning process for its whole lifetime;
  another process gets sharing violation 32 → `DATA_DIR_IN_USE` (`acquire_data_dir_lock`).
- `write_atomic`: `<name>.tmp-<pid>-<n>` then rename; the previous valid JSON is kept as `<name>.bak`.
  `quarantine`: renames to `<name>.corrupt-<ms>[-n]`.
- Every storage command runs under `DataRoot::exclusive`, an in-process mutex. It serializes DVCC's own
  operations only; other processes (an editor, a sync client) are not serialized by it.
- `settings.json` may hold `codexExecutablePath`, an absolute local path (`src/services/settings.ts`). The
  settings service writes it through storage directly, not through `ReviewHub`.
- `ReviewHub.commit` notifies subscribers after every mutation made through the hub; the app turns that
  into `hubCommitted` (`src/services/reviewHub.ts`, `src/app/App.tsx`). Git observations arrive as
  `gitObserved`; a reload is `loaded`.
- No data-folder watcher exists. An external change is noticed only when DVCC writes the same file again
  (`CONFLICT` through `TrackedStorage`) or reloads.
- No digest of the whole application state exists. The only fingerprint,
  `computeProjectBindingFingerprint` (`src/domain/ideSessionDiscovery.ts`), covers the Project registry's
  binding fields for IDE session scans.

## 6. Remaining F01 items (specification only — NOT IMPLEMENTED in DVCC)

### 6.1 `.dvcc.lock`

- Classify as runtime-managed: excluded from content hashing, never read, never disclosed.
- Require a regular, non-reparse file directly in the data root, checked through metadata only.
- Keep the existing DataRoot lock contract unchanged.
- Unmeasured: whether metadata (attributes, size) of the lock file can be read while the owning
  process holds it with share mode 0. V-F01-08 was tested without a held lock.

### 6.2 `settings.json`

- Pinned and hashed like every data file; the pilot baseline holds the language only.
- Changing the language or configuring a Codex path during a pilot is a change (§6.5).
- Settings writes bypass `ReviewHub`, so a hub subscription alone would not see them. Detection must
  also cover the settings service.
- Never part of a response (already true for Control Read v1).

### 6.3 Temp, backup and set-aside files

- Any `*.tmp-*`, `*.bak` or `*.corrupt-*` means the folder no longer equals the pinned baseline.
  Publication stops, and nothing is accepted automatically.
- A new baseline is only a reviewed manifest change.
- Restoring from backup and setting a file aside are writes, so both stop publication as well.

### 6.4 Reparse points

- No reparse-point check was found in `src-tauri/src/storage.rs` (searched for `reparse`,
  `FILE_ATTRIBUTE`, `symlink`). Its `symlink_metadata` call is an existence check only.
- Requirements for the application:
  - Reject every entry whose attributes include `FILE_ATTRIBUTE_REPARSE_POINT`, whatever its tag.
  - Reject a data root that is itself a reparse point.
  - Open files so that the opened handle can be shown to be the listed file, by file ID or final path,
    before its bytes are used.
- On-disk tests with real links, junctions or other reparse tags were not run in this change. They
  belong to an isolated environment.

### 6.5 Stop publishing when application state or storage changes

Candidate rules:

1. Access starts OFF and is kept in memory only.
2. Access ON requires a full verification against the pinned manifest. It also records a binding: the
   manifest identity, a digest of the Control Read source (`phase`, `projects`, `projectsHealth`,
   `reviews`, `gitObservations`) and a new epoch.
3. Access turns OFF and the epoch advances on any of these:
   - `loaded` (a reload), `hubCommitted` or `gitObserved`
   - a settings write
   - any storage command that succeeds (write, append, set-aside, restore)
   - a failed verification

   A normal DVCC operation and an unintended change are not told apart.
4. Turning access back ON needs a Human action and a full re-verification.

Open: whether actions that do not touch the source (selection, filter, toasts, notices, IDE session
scans, artifact loading) should also turn access OFF.

### 6.6 Substitution between verification and sending

Candidate order:

- **T0 (access ON):** full verification and binding (§6.5).
- **T1 (each request):** re-verify the folder against the manifest, compare the source digest with the
  binding, and check the epoch. Any mismatch refuses the request and turns access OFF. The response is
  built only from the in-memory source checked here.
- **T2 (immediately before sending):** check the epoch and the source digest again. An OFF that races
  with a send refuses the send.

Constraints on this order:

- The T1 verification holds `DataRoot::exclusive`, so no DVCC write interleaves. The lock is released
  before the transport send.
- The time the lock is held is bounded, and the SHA-256 cost is included in the V-10 timeout
  measurement.
- Writes wait for the lock; they are never allowed to succeed concurrently.

`DataRoot::exclusive` does not stop other processes. A residual window between the last check and the
send remains, and accepting it is a Human decision. The reference verifier shows only "use the bytes you
verified" (V-F01-14). DVCC does not have this today: storage commands re-read files on every call.

### 6.7 Disclosure

- A pilot response carries only Control Read v1 output for the one shared Project.
- Verification findings never leave the machine except as fixed codes.
- The checks in §4 (no sentinel, no path, no file name) are a gate for any future adapter.

## 7. Not verified, not decided

- Real Windows behavior of the reference verifier with links, junctions and other reparse tags.
- Reading metadata of a held `.dvcc.lock` (§6.1).
- The listing/reading race of V-F01-11 (not reproduced).
- SHA-256 cost for V-10 (not measured).
- HD-06, the application's SHA-256 implementation, is undecided. The reference verifier uses Node's
  built-in `crypto` and implies nothing for Rust.
- Earlier mutation counts (38 / 42 variants) are not used as a fixed condition here. This change was
  checked locally by injecting faults one at a time; the tests caught each one:
  - in the verifier: hash comparison, transient-name rejection, link rejection, missing-file
    reporting, root restriction, and descent into folders outside the manifest (RF-F01-IR01-01);
  - in the generator: foreign-entry refusal and root restriction.
- How a pilot DVCC is pointed at a copy of the fixture (`DVCC_DATA_DIR`), and what happens to the lock
  file and backups it creates there, needs its own runbook.

## 8. Running it (synthetic data only)

```text
node scripts/lib/f01-synthetic-fixture.mjs verify
node scripts/lib/f01-synthetic-fixture.mjs print-manifest
npx vitest run src/test/f01SyntheticFixture.test.ts
npm run typecheck
```

Nothing outside the repository and the OS temp folder is read. The tests create and delete `dvcc-f01-*`
temp copies.
