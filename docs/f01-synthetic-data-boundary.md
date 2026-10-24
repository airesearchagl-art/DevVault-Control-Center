# F01 synthetic-only pilot data boundary (preparation)

Status: **preparation for RF-5C-F01** (tasks `DVCC-F01-SYNTHETIC-PREP-01`,
`DVCC-F01-ACCESS-GATE-HARNESS-01`, `DVCC-F01-SERVICE-INTEGRATION-01`). This document is a candidate
specification. It does not close F01, adopt an architecture, start Phase 5C or authorize any transport.
Nothing in DVCC itself changes.

"Implemented" below means implemented in one of these, and not in the DVCC application:
- the **reference verifier** (`scripts/lib/f01-synthetic-fixture.mjs`, tests in
  `src/test/f01SyntheticFixture.test.ts`);
- the **access-gate harness** (`scripts/lib/f01-access-gate-harness.mjs`, tests in
  `src/test/f01AccessGateHarness.test.ts`);
- the **test-only service wiring** (`src/test/f01ServiceWiring.ts`, tests in
  `src/test/f01ServiceIntegration.test.ts`).

Everything the application would need is listed in §6 as **NOT IMPLEMENTED**.

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
| `scripts/lib/f01-access-gate-harness.mjs` (+ `.d.mts`) | Candidate §6.5 / §6.6 access gate for synthetic data only: not imported by the product, no CLI, recording transport only (Node built-ins only) |
| `src/test/f01AccessGateHarness.test.ts` | Tests of the gate (part of `npm test`) |
| `src/test/f01ServiceWiring.ts` | Test-only wiring of the real `ReviewHub` and settings store to the gate (§6.8): storage observer, held writes, in-memory verification. Not imported by the product |
| `src/test/f01ServiceIntegration.test.ts` | Tests started from real service calls (part of `npm test`) |

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

**Harness result (synthetic data only; still NOT IMPLEMENTED in DVCC).** The access-gate harness
implements these rules outside the product and runs them against a `dvcc-f01-*` temp copy of the fixture.
The application side is the app's own loading path and reducer, held by a small test stand-in.

| Rule | Harness behavior | Evidence |
|---|---|---|
| 1 | A new gate is OFF at epoch 0. Every request is refused with `ACCESS_OFF`, and no response is built | tested |
| 2 | `turnOn()` requires three checks: the manifest bytes hash to the pinned SHA-256; the folder verifies against that manifest; and the live source equals the source the app's loading path builds from the verified bytes. Only then does it record the binding: manifest ID, source digest and a new epoch | tested, including these refusals: a manifest rebuilt from changed data (the pin refuses it even though it describes the folder); an event during the asynchronous part of T0, which stops it before the live source is read; and an OFF event raised while T0 reads the live source, caught by an epoch check just before the binding is recorded (RF-F01-GATE-IR01-01). Both events give `CHANGED_DURING_CHECK` |
| 3 | `notify(event)` turns access OFF and advances the epoch on any of these: `loaded`, `hubCommitted`, `gitObserved`, `fatal`, `settings.write`, `storage.write` / `appendLine` / `quarantine` / `restoreBackup`, `verification.failed`, or any unknown event. A failed or throwing check at T0, T1 or T2 has the same effect | tested with simulated events, each with requests in flight |
| 4 | Only `turnOn()` turns access ON. The harness has no timer and no clock | tested: restoring the state or the files, undecided events and new requests all leave access OFF; the source contains no timer or clock call |

Additions to the rules above:

- `fatal` is in the OFF list because it changes `phase`, one of the five source keys.
- A storage command turns access OFF whether it succeeded or not, because a failed write can leave a temp
  file behind.

What the tests show, and what they do not:

- **Events are simulated.** The tests call `notify`, or dispatch through the stand-in, which calls it.
  The harness tests connect the gate to neither the real `ReviewHub`, `App.tsx`, the settings service
  nor the Tauri storage commands, so they do not show that every real path reports its change. §6.8
  connects the real `ReviewHub` and settings store through test-only wiring.
- **Changes on disk are real file edits** in the temp copy: a different language, a Codex path added to
  `settings.json`, an appended event, a removed file, and a `.bak`, `.tmp-` or `.corrupt-` file. The
  gate sees them only when it verifies the folder at T0 or T1. Until then access stays ON, because nothing
  watches the folder.
- **A change to the in-memory state without any event**, whether a replaced state or objects changed in
  place, is caught by the source digest at T1 or T2. Each of the five keys was tested.
- **The undecided actions stay undecided.** The harness lists them as `UNDECIDED_EVENTS`: selection,
  filter, artifact loading, IDE session events, notices, toasts and storage reads.
  - The caller must choose `OFF` or `KEEP`; there is no default. Both are tested.
  - With `KEEP`, a source change that arrives together with such an event is still caught by the digest.
  - The tests also show that dispatching a selection, a filter change or a toast leaves the five keys
    unchanged.
  - A typed test fails the typecheck when an application action or a storage method is added without
    being classified.

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

**Harness result (synthetic data only; still NOT IMPLEMENTED in DVCC).**

- **T0** works as in §6.5 rule 2.
- **Re-check after every read.** Reading the live source can run other code, and that code may raise
  an event. After each read (at T0, T1 and T2) the gate therefore checks again:
  - that the epoch has not moved;
  - at T1 and T2, also that access is still ON under the same binding.

  If either has changed, the request is refused with `CHANGED_DURING_CHECK`. The tests raise an OFF
  event from inside the read at each stage.
- **T1 (`ticket.verify()`)** checks the following:
  - access is ON and the ticket's epoch is current;
  - the manifest ID equals the binding;
  - the folder verifies again;
  - after reading the live source, access and epoch are unchanged. An OFF raised by the read refuses the
    request before any response is built;
  - the source digest equals the binding;
  - after the response is built, access and epoch are still unchanged.

  The response is built from a deep-frozen copy parsed back from the digested text, and is serialized at
  once. A later change to the live objects cannot reach it, even one made in place. This was tested by
  changing the state while the response was being built: the response stayed as expected, and T2 refused
  to send it.
- **T2 (`ticket.send()`)** checks the following:
  - access is ON and the epoch is current;
  - after reading the live source, access is still ON under the same binding and the epoch is unchanged;
  - the digest equals both that binding and the T1 digest.

  Only then is the payload handed to the transport, at most once. An OFF raised by the read itself gives
  a fixed refusal, never an exception. The ticket becomes `REFUSED` and its payload is dropped
  (RF-F01-GATE-IR01-02). The transport is a recording stand-in; nothing is sent.
- **Epochs.** Every OFF advances the epoch, and so does every ON.
  - A ticket from before an OFF is refused (`EPOCH_MISMATCH`), even after access is ON again with the
    same digest.
  - Restoring the state or the files does not revive it.
  - Refusing such a ticket does not turn access OFF again, because it says nothing about the current
    data.
- **Refusals.** A refused request gives the caller `{ status: "REFUSED", code }` and nothing else, and
  the ticket offers no way to read the response. Most refusal tests also check the transport's call
  count, and no refused request added a call. The payloads sent in the disclosure test (the three
  operations and four error responses) contain no sentinel, path, data-folder file name, `settings` /
  `locale`, binding value or secret-like pattern.
- **Digest.** SHA-256 over a label and the canonical JSON of the five source keys:
  - keys are sorted, and an `undefined` property counts as absent;
  - anything JSON cannot carry exactly is refused, which turns access OFF.

  The hash is Node's built-in `crypto`, for the harness only. HD-06 stays undecided.
- **Why the response counts as verified data.** T1 verifies the folder but builds the response from
  the in-memory source. The two are tied together at T0:
  - the bound digest is the digest of the source built from the verified bytes;
  - passing verification at T1 against the same manifest means the bytes have not changed;
  - so a T1 digest equal to the binding means the response comes from the source of the verified
    synthetic data.

Not resolved by the harness:

- **The window between T2 and the actual send.** In the harness the T2 checks and the hand-over to the
  transport run in one synchronous call. A real transport is asynchronous and leaves the process.
- **A file change by another process after T1.** T2 does not re-verify the folder, so the request
  verified at T1 is still sent, with the payload built at T1. The next T1 refuses. This residual window
  is tested as such.
- **Holding `DataRoot::exclusive` during T1, and bounding that time.** The harness has no lock, so this
  is not modeled.

### 6.7 Disclosure

- A pilot response carries only Control Read v1 output for the one shared Project.
- Verification findings never leave the machine except as fixed codes.
- The checks in §4 (no sentinel, no path, no file name) are a gate for any future adapter.

### 6.8 Real services through test-only wiring

Task `DVCC-F01-SERVICE-INTEGRATION-01`. **Still NOT IMPLEMENTED in DVCC.** `src/test/f01ServiceWiring.ts`
is a candidate for how the product could connect the gate. Nothing in the product imports it. The tests
are in `src/test/f01ServiceIntegration.test.ts`.

What runs for real, and what stands in:

| Part | In these tests |
|---|---|
| `ReviewHub`: its serial queue, `TrackedStorage`, `subscribe` and commit | real |
| Settings: `loadSettings`, `createLocaleStore` (`save`, `saveCodexExecutablePath`, its own write queue) | real |
| `loadAll` recovery (set-aside, restore from backup) and `setAsideProjectsFile`, through the hub | real |
| `appReducer`, `controlReadSourceFrom`, `readControl` | real |
| Storage | `MemoryStorage`, the in-memory mirror of the Rust storage semantics, seeded with the verified fixture. No Tauri command runs |
| App.tsx | a stand-in that wires the hub and the reducer as App.tsx does: `subscribe` → `hubCommitted`, and `reload` → `loaded` |
| A write in progress | `HeldStorage` holds each write until the test releases it. No timer is involved |
| Transport | the recording stand-in |

The wiring:

- **Storage observer (`observeStorage`).** Every operation of the hub and of the settings store passes
  through it.
  - A write calls `gate.beginWrite()` before the store is touched, so access turns OFF at once. Writes
    are `write`, `appendLine`, `quarantine`, `restoreBackup`, and any operation the observer does not
    know.
  - The write's token ends when the operation settles: resolved, rejected, or thrown synchronously.
  - A write to `settings.json` is reported as `settings.write`, the others as `storage.*`. An unknown
    operation is reported under its own name, which the gate treats as unknown (`UNKNOWN_EVENT`).
  - A read (`info`, `read`, `listReviews`, `assertUnchanged`) is an undecided event. Each test states
    `OFF` or `KEEP`.
- **Hub subscription.** `hub.subscribe` feeds `hubCommitted` to the reducer. Every dispatch is reported
  to the gate under its action type.
- **Verifying the store the services use.**
  - T0 and T1 verify the in-memory store against the pinned manifest with the reference verifier's own
    decision function (`evaluateEntries`). They read the store directly, not through the observer.
  - Disk is used only to write the store out to a `dvcc-f01-*` temp copy, which the disk verifier then
    checks.
- **Dispose** unsubscribes and closes the gate. Since events can no longer arrive, T0 is refused from
  then on (`CLOSED`).

Additions to the gate harness:

- `beginWrite(event)` returns a token with `end()`. The gate keeps a pending count, and `turnOn()` is
  refused while it is above zero (`WRITE_PENDING`). Each token's `end()` counts once.
- A `verifyStorage` option. The default, the data folder on disk, is unchanged for the earlier tests.
- `close()`.

This is a candidate in-process mechanism. It does not implement or reproduce `DataRoot::exclusive`, and
it says nothing about other processes.

**Results.** Every scenario below starts from real service calls; the tests never call `notify` for these.

| Scenario | Result |
|---|---|
| Hub project edit, held in progress | OFF as the write starts, before the data changes. While it is pending: a ticket past T1 is refused, new requests are refused, and T0 is refused (`WRITE_PENDING`). Once it settles: `hubCommitted`, still OFF, and T0 refused (`VERIFICATION_FAILED`) |
| A write succeeds, or fails | access never comes back ON by itself. After a failure the data is unchanged, and an explicit T0 turns ON |
| Two overlapping writes (hub and settings), in either settle order, both succeeding or both failing | while one is still pending, T0 is refused (`WRITE_PENDING`) |
| Exceptions | a synchronous throw and a rejection both end their tokens. A token ended three times counts once. An old ticket stays refused (`EPOCH_MISMATCH`) |
| `ReviewHub.apply` (a session write, then an event append) | OFF from the first write; the commit follows both |
| Language save | OFF through the storage write alone. The source digest does not change, because settings are not in the source |
| Fictional Codex path saved, then cleared | stored as a string only; nothing looks it up or starts it, and it never reaches the source. Clearing it restores the bytes but leaves `settings.json.bak`, so T0 stays refused |
| Reload of a broken `projects.json` that has a valid backup | `quarantine` and `restoreBackup` each keep access OFF while in progress, then `loaded`. T0 is refused (`.bak`, `.corrupt-1`) |
| Each storage write called through the observer | OFF from its start, pending until it settles |
| `CONFLICT`, from the hub or from the settings store | OFF, and nothing is overwritten. The settings store becomes read-only, and later saves never reach storage |
| Consecutive settings saves | the second starts only after the first settles (settings queue). Pending throughout; T0 refused |
| Unsubscribe | commits no longer reach the app, but writes still turn access OFF, and T0 refuses the stale state |
| Dispose | the gate is closed; T0 is refused even over unchanged data |
| Reads (loading review artifacts) | with `OFF`, access turns OFF. With `KEEP`, it stays ON, and no artifact body reaches a response |
| Unknown storage operation | OFF, and pending until it settles |
| Ordered sequences | see below |
| In memory compared with on disk | five changes made by service calls give the same findings in memory as in a written-out temp copy: a language save, a project edit, a new review, recovery from backup, and a set-aside. For the last two, a broken `projects.json` is planted first. The unchanged store verifies on disk as well |
| Restoring content | does not turn access ON. Only an explicit T0, once the store equals the baseline, does |
| Disclosure | the three operations equal the goldens. Five error responses are checked as well. No response carries a sentinel, path, setting, artifact body, binding value or secret-like pattern |

The ordered sequences:

- a write during T0 gives `CHANGED_DURING_CHECK`;
- a write between T1 and T2 refuses the send;
- after a failure, a reload and an explicit ON serve the goldens again, and the old ticket stays refused;
- interleaved tickets are each sent at most once, and only before the write;
- releasing a held write is not the same as settling it.

What this does not show, and what still constrains it:

- **A writer that bypasses the observer is a missed notification.** This was tested with a settings store
  on the unobserved backend:
  - the write raises no event, and access stays ON;
  - a ticket already past T1 is still sent, because T2 does not re-verify and settings are not in the
    source;
  - the next T1 refuses.

  So every writer must be wired.
- **Writes queued inside a service are not counted** (the settings queue, the hub queue). They count
  only once they reach storage. Nothing has changed before then, but the gate cannot see a pending
  intention.
- **Memory has no links, handles, reparse points or temp files** (temp files come from Rust's
  `write_atomic`). Those rules stay with the disk verifier (§3) and its tests.
- **The Rust side did not run.** `MemoryStorage` mirrors the Rust semantics; the Tauri commands and Rust
  storage were not executed.
- **One process only.** Other processes (an editor, a sync client) are seen only when T0 or T1 verifies
  the store.

Product behavior recorded here, not changed:

- **A partial failure that commits nothing.** In a suspend, `checkpoint.md` is written first. If the
  following `session.json` write fails, nothing is committed, so there is no `hubCommitted`. The source
  digest does not change either, because artifacts are not in the source. Only the storage observer and
  verification see the change.
- **A failed event append** is returned as a warning, and the session write is still committed.
- **Settings writes bypass `ReviewHub`** (already noted in §5).

None of these is a defect of the product as specified. A hub subscription alone would miss the first and
the settings writes.

Decisions needed before any product integration:

- **Placement.** Where the observer sits: around `tauriStorage`, for every writer including the settings
  store and any future one. Also how that placement is enforced.
- **The lock.** How a write in progress relates to `DataRoot::exclusive`, and whether other processes
  are in scope.
- **Undecided actions.** Whether reads and UI-only actions turn access OFF (§6.5).
- **T2.** Whether T2 should re-verify the store. That would close the bypass and other-process window,
  at the cost of one verification per send.
- **`close()`.** What it means in the app's lifecycle: window close, reload, StrictMode effects.
- **The real data folder.** Its production verifier (HD-06, reparse checks).

## 7. Not verified, not decided

- Real Windows behavior of the reference verifier with links, junctions and other reparse tags.
- Reading metadata of a held `.dvcc.lock` (§6.1).
- The listing/reading race of V-F01-11 (not reproduced).
- SHA-256 cost for V-10 (not measured).
- HD-06, the application's SHA-256 implementation, is undecided. The reference verifier and the
  access-gate harness use Node's built-in `crypto` and imply nothing for Rust.
- The product connects the gate to nothing, and no folder watcher exists (§6.5).
  - The test-only wiring (§6.8) connects the real `ReviewHub`, settings store and reducer, but only over
    an in-memory store.
  - `App.tsx` itself, the Tauri storage commands and the Rust side are not connected.
- The harness reuses the reference verifier, so the Windows lock and reparse-point items above remain
  unverified.
- The window between T2 and the actual send, and file changes by other processes after T1, are not
  resolved (§6.6).
- Whether the undecided actions turn access OFF (§6.5) is still open.
- Earlier mutation counts (38 / 42 variants) are not used as a fixed condition here. The reference
  verifier was checked locally by injecting faults one at a time; the tests caught each one:
  - in the verifier: hash comparison, transient-name rejection, link rejection, missing-file
    reporting, root restriction, and descent into folders outside the manifest (RF-F01-IR01-01);
  - in the generator: foreign-entry refusal and root restriction.
- The access-gate harness was checked the same way. Its stop decisions were removed one at a time (31
  variants), and each made at least one test fail:
  - T0: the manifest pin; the folder verification; the live-versus-verified source check; the epoch
    check after the asynchronous part, the one after the final read, or both;
  - events: OFF events ignored, unknown events ignored, and undecided events ignored under `OFF`;
  - T1: the ON check; the first or all epoch checks; the manifest identity; the folder
    re-verification; the source digest; the check after the read; the check after building the
    response; and a throwing check that leaves access ON;
  - T2: the ON check; one or both epoch checks; the source digest; the check after the read; the defect
    found in review restored (no check after the read, compared with the live binding); and a throwing
    check that leaves access ON;
  - structure: a response built from the live source, an unfrozen copy, a source key left out of the
    digest, a refusal that carries the response, an OFF that does not advance the epoch, and a ticket
    accepted while OFF.

  In some variants another check still refused the request. Those were caught by tests that assert
  which stage refused, or with which code. For example, without the T1 digest check the request is still
  refused at T2, and the test fails because a response was built at T1.
- The service wiring (§6.8) was checked the same way. One guard was disabled at a time (15 variants),
  and each made at least one test fail:
  - in the gate: a starting write that does not turn access OFF; T0 ignoring pending writes; a boolean
    instead of a count; a token that counts every `end()`; `close()` not blocking T0; old tickets not
    refused at T2;
  - in the wiring: a rejected write, or one that throws synchronously, never ending its token; access
    turned OFF only once a write has settled; unknown operations treated as reads; the hub subscription
    removed; dispatches not reported to the gate; the settings store on the unobserved backend; dispose
    not closing the gate; the in-memory verifier skipping backups.
- How a pilot DVCC is pointed at a copy of the fixture (`DVCC_DATA_DIR`), and what happens to the lock
  file and backups it creates there, needs its own runbook.

## 8. Running it (synthetic data only)

```text
node scripts/lib/f01-synthetic-fixture.mjs verify
node scripts/lib/f01-synthetic-fixture.mjs print-manifest
npx vitest run src/test/f01SyntheticFixture.test.ts
npx vitest run src/test/f01AccessGateHarness.test.ts
npx vitest run src/test/f01ServiceIntegration.test.ts
npm run typecheck
```

Nothing outside the repository and the OS temp folder is read. The tests create and delete `dvcc-f01-*`
temp copies.
