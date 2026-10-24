# F01 product integration: remaining conditions (preparation)

Status: **preparation for RF-5C-F01** (task `DVCC-F01-CANDIDATE-COMPLETE-01`). This list shows, item by
item, what a product integration of the F01 access gate would still need. **It is not an adoption or
an authorization. It does not close F01, and it starts no product implementation.** DVCC itself is
unchanged.

The candidates and their evidence are in [`f01-synthetic-data-boundary.md`](f01-synthetic-data-boundary.md)
(§6.5 to §6.9). Some items carry a **proposal** with its reasons. A proposal is a suggestion for the
Human decision. None is adopted or approved.

Each item gives:

- the existing requirement;
- the candidate implemented so far;
- what was verified, and the evidence;
- what was not verified;
- where it would change in the product;
- the decisions needed before adoption;
- when the item counts as done.

Where the evidence comes from:

- **memory**: `MemoryStorage`, checked by `verifyMemoryStorage`;
- **disk**: the reference disk verifier `verifyDataRoot` on `dvcc-f01-*` temp copies;
- **harness**: `src/test/f01AccessGateHarness.test.ts`, run on temp copies.

The Rust side, Tauri commands, real data, Windows diagnostics and any transport were not run for any
item.

## 1. Service entry and every storage write observed

- **Existing requirement.**
  - Settings writes and storage commands turn access OFF (§6.5 rule 3).
  - Settings bypass the hub (§6.2), so every writer must be wired (§6.8).
- **Candidate.**
  - `observeStorage` reports every storage operation. A write is counted from its start until it
    settles.
  - `trackService` counts hub and settings-store updates from the call, including the time they wait
    in the services' own queues.
  - The classification tables are typed: `HUB_CALLS` and `SETTINGS_CALLS`, plus the test's
    `Record<keyof StorageBackend>`.
  - An unknown member or operation is treated as an update (fail closed).
- **Verified (memory).**
  - The §6.8 and §6.9 scenarios, all started from real service calls.
  - Fault injection: 15 wiring and gate variants (§6.8) and 11 tracking variants (§6.9).
  - A missed notification from a writer outside the wiring is shown as such (§6.8).
- **Not verified.**
  - `App.tsx` itself, `tauriStorage`, and the Rust commands.
  - The other Tauri commands reached through `invokeCommand` were not reviewed for data-folder writes:
    `codexLauncher`, `git`, `ideSessionDiscovery` and `launcher`.
  - `open_data_dir` hands the folder to the Human's file manager, which is another process (item 9).
- **Product change candidates.**
  - `src/app/App.tsx`: today `ReviewHub`, `createLocaleStore` and `loadSettings` all take `tauriStorage`
    there directly.
  - `src/services/storage.ts` (`tauriStorage`).
  - A new gate module under `src/services/`.
  - `src/services/reviewHub.ts` and `src/services/settings.ts`, only if the tracking moves inside the
    services.
- **Decisions before adoption.**
  - Where the observer and the tracker sit.
  - How "nothing else writes" is enforced.
  - Whether in-process counts are enough, or the Rust commands should also report start and settle.
- **Proposal.** Three parts:
  - build one observed backend in a single wiring module, and pass it to the hub and the settings store;
  - track updates at the service entry, as in §6.9;
  - add a repository check that fails when `tauriStorage` or a storage command is referenced outside
    that module.

  Reason: one store on the unobserved backend is enough to miss a change (§6.8), and an update waiting
  in a service queue is invisible to a storage-only observer (§6.9).
- **Done when.**
  - Every product path that can write the data folder is listed and wired.
  - A check fails on a new unwired writer.
  - The §6.8 and §6.9 scenarios pass against the product wiring, not the test stand-in.

## 2. T0 / T1 / T2 and ticket epochs

- **Existing requirement.** The access rules (§6.5 rules 1–4) and the order T0 / T1 / T2 (§6.6).
- **Candidate.** The harness gate:
  - T0: the pin, the folder verification, and the live source against the verified bytes.
  - T1: re-verification, the source digest, and a frozen copy for the response.
  - T2: the source digest.
  - Epochs, with a re-check after every read.
  - Beside it, the candidate T2 `REVERIFY_STORAGE` (§6.9), which re-verifies the store before the
    hand-over. The default stays `SOURCE_ONLY`.
- **Verified.**
  - The harness tests (disk), and §6.8 / §6.9 (memory, and disk for the T2 comparison).
  - Fault injection: 31 gate variants and 10 candidate-T2 variants.
- **Not verified.** The gate in the product, with an asynchronous transport, and under
  `DataRoot::exclusive`.
- **Product change candidates.** A new gate module. The adapter that would call T1 and T2 does not exist;
  any transport is out of scope.
- **Decisions before adoption.**
  - Whether T2 re-verifies the store or checks only the source digest.
  - Which refusal codes a client may see. `CLOSED` and `UPDATE_PENDING` are more specific than
    `ACCESS_OFF`, and reveal slightly more about the gate's state.
- **Proposal.** Re-verify at T2 if the V-10 budget allows it (item 8).

  Reason: in the comparison, `SOURCE_ONLY` sent the payload built at T1 after any of these:
  - seven unreported file changes;
  - a save by a settings store outside the wiring;
  - a manifest change.

  The candidate refused all of them: the file changes in memory and on disk, the other two in memory.
  On the synthetic fixture its cost was about one extra folder verification per request.
- **Done when.**
  - The chosen T2 is in the product gate.
  - The comparison tests and the fault injection are run against the product code.
  - The choice is recorded as a Human decision.

## 3. Dispose and reload

- **Existing requirement.** The gate is closed when the wiring that delivers events is torn down (§6.8).
  A reload is a `loaded` event (§6.5).
- **Candidate.**
  - `close()`: T0 is refused from then on, and the status reason stays `CLOSED`.
  - `dispose()`: unsubscribes, stops reporting dispatches, and closes the gate.
  - `hub.load` is tracked as an update, because recovery may write.
- **Verified (memory).**
  - Dispose before, together with, or after the end of a call.
  - A reload that recovers a broken file.
  - Resume after a failed update: reload, re-verify, explicit ON.
- **Not verified.** The `App.tsx` lifecycle: window close, React StrictMode effects run twice, and hot
  reload. A gate created again after dispose was not tested either.
- **Product change candidates.** The `App.tsx` effects that subscribe to the hub and create the settings
  store, and whichever module owns the gate.
- **Decisions before adoption.**
  - What owns the gate: one per window, or one per data root.
  - Whether a reload keeps the same gate (OFF) or creates a new one.
  - What a StrictMode mount, unmount and mount again means for `close()`.
- **Proposal.** Create the gate and the wiring in one effect, and close the gate in that effect's
  cleanup.

  Reason: `close()` is permanent by design. If a gate were reused after an effect's cleanup, it would
  stay closed. A second mount should therefore get a new gate, which then needs its own explicit T0.
- **Done when.**
  - The lifecycle is decided.
  - It is tested in the app: mount, unmount, mount again, reload, and window close.
  - No path reopens a closed gate.

## 4. Settings, backup and temp files, disclosure

- **Existing requirement.** §6.2, §6.3, §6.7, and the disclosure checks in §4.
- **Candidate.**
  - `settings.json` is pinned and hashed like the data files.
  - Transient names are rejected (V-F01-07).
  - The Codex path is stored as a string only: nothing looks for it or starts it.
  - Every response is checked for disclosure.
- **Verified.**
  - The verifier tests (disk), and §6.8 / §6.9 (memory and disk).
  - Disclosure (harness, §6.8 and §6.9): the three goldens, plus error responses.
- **Not verified.**
  - Temp files created by the real `write_atomic`. Memory has none, and the disk tests plant the names.
  - A product response adapter, which does not exist.
- **Product change candidates.** The product verifier (item 7 decides where it runs), and any future
  adapter.
- **Decisions before adoption.**
  - Whether `settings.json` stays in the pinned set for a pilot.
  - What a settings change during a pilot leads to. §6.3 allows a new baseline only as a reviewed
    manifest change.
- **Done when.**
  - The product verifier applies V-F01-04 and V-F01-07 to the real folder.
  - The disclosure checks run on the product adapter's output.

## 5. Relation to `DataRoot::exclusive`

- **Existing requirement.**
  - `DataRoot::exclusive` is an in-process mutex that serializes DVCC's storage commands (§5).
  - The T1 verification is to hold it for a bounded time (§6.6).
- **Candidate.** None. The JS counts record intentions within one process, and the harness has no lock.
  This does not implement or reproduce `DataRoot::exclusive`.
- **Verified.** Nothing. The lock is not modeled, and the Rust tests were not run.
- **Not verified.**
  - A verification under the lock.
  - How long the lock is held.
  - How Rust commands interleave with a verification.
- **Product change candidates.** `src-tauri/src/storage.rs` (`DataRoot`, `exclusive`), and a new Rust
  command that verifies the folder under the lock.
- **Decisions before adoption.**
  - Whether T1 (and T2) verify in Rust under `DataRoot::exclusive`.
  - How the JS counts relate to the lock.
  - Whether other processes are in scope (item 11).
- **Proposal.** Verify the folder in one Rust command under `DataRoot::exclusive`, and keep the JS counts
  as the early OFF signal.

  Reason: the JS counts see DVCC's own updates from the call, but only the lock orders a verification
  against DVCC's own storage commands. Neither stops other processes.
- **Done when.**
  - The design is decided.
  - Rust tests show that no DVCC storage command interleaves with a verification.
  - The time the lock is held is bounded and measured (item 8).

## 6. Windows lock and reparse points

- **Existing requirement.** §6.1, §6.4, and V-F01-08 to V-F01-11.
- **Candidate.** The reference verifier's rules, tested with simulated `lstat` results.
- **Verified.** The decision logic only. No link, junction, other reparse point or held lock existed on
  disk.
- **Not verified.**
  - Real symbolic links, junctions, and other reparse tags such as cloud-file placeholders.
  - Reading the metadata of a held `.dvcc.lock`.
  - The listing/reading race (V-F01-11).
- **Product change candidates.** `src-tauri/src/storage.rs`, where no reparse-point check was found
  (§6.4), and the product verifier.
- **Decisions before adoption.**
  - The isolated environment, and who provides it.
  - Whether links are created with developer mode or administrator rights.
  - Which reparse tags are in scope.
- **What it needs.** More tests in this repository cannot settle this item. It needs:
  - an isolated Windows machine or VM, with a scratch volume where links, junctions and placeholder
    files can be created;
  - a check of `FILE_ATTRIBUTE_REPARSE_POINT` in Rust or Win32;
  - a two-process test while the lock is held.
- **Done when.** Each rule from V-F01-08 to V-F01-11 is exercised on real objects in that environment,
  and the product verifier rejects them.

## 7. HD-06 (the application's SHA-256)

- **Existing requirement.** §6.6 and §7: undecided.
- **Candidate.** None. The harness uses Node's built-in `crypto`, for the harness only.
- **Verified.** Nothing for the application.
- **Not verified.** All of it.
- **Product change candidates.** The Rust side (a dependency decision), or the TS side.
- **Decisions before adoption.**
  - Which implementation: a reviewed dependency, or a platform API.
  - Where it runs: in Rust under the lock (item 5), or in JS.
- **What it needs.**
  - A dependency review. Any dependency or lockfile change is outside this task.
  - Test vectors. The SHA-256 values in the committed manifest can serve across implementations.
- **Done when.** HD-06 is decided, and the implementation reproduces the committed manifest values for
  the fixture.

## 8. Verification time and V-10

- **Existing requirement.** The time the lock is held is bounded, and the SHA-256 cost is included in the
  V-10 timeout measurement (§6.6).
- **Candidate.** None.
- **Verified.** One informal local timing over the 7-file synthetic fixture (§6.9). Medians:
  - the folder verification: about 3.1 ms;
  - `handle()` with `SOURCE_ONLY`: about 3.3 ms;
  - `handle()` with `REVERIFY_STORAGE`: about 7.2 ms.

  This is Node and Windows 11 on one machine. It is not V-10.
- **Not verified.**
  - V-10 itself.
  - Real data sizes.
  - The product verifier, and the time under the lock.
  - Slower disks, or an antivirus scanner reading the files.
- **Product change candidates.** The verifier implementation and the V-10 timeout.
- **Decisions before adoption.**
  - The V-10 budget.
  - The largest folder in scope. The manifest limits are 64 entries and 64 KiB per file.
  - Whether T2 re-verification fits the budget.
- **What it needs.** Measurements with the product verifier on the target machines, at the manifest
  limits, with the lock held.
- **Done when.** The chosen T2, with the lock held, is measured within the V-10 budget.

## 9. The window from T2 to the actual send

- **Existing requirement.** A residual window remains, and accepting it is a Human decision (§6.6).
- **Candidate.**
  - In the harness, T2 and the hand-over run in one synchronous call.
  - The candidate T2 re-verifies the store at T2, which moves the last check to T2.
- **Verified.** Everything up to the hand-over to the recording transport (harness, §6.9).
- **Not verified.** Any real transport, an asynchronous send, and the process boundary.
- **Product change candidates.** The transport adapter. None exists: no IPC, MCP or tunnel is in scope.
- **Decisions before adoption.**
  - Whether the remaining window is accepted.
  - Whether a send can still be cancelled after T2.
- **What it needs.** A transport design, which is outside F01 preparation. Tests in this repository
  cannot close this window.
- **Done when.** The transport is designed, and the window is either closed by that design or accepted
  in writing.

## 10. Undecided events (UI-only actions and reads)

- **Existing requirement.** Open: whether actions that do not touch the source turn access OFF (§6.5).
- **Candidate.** `undecidedEvents: "OFF" | "KEEP"` must be given, with no default, and both values are
  tested.
- **Verified (harness, memory).**
  - Selection, filter changes and toasts leave the five source keys unchanged.
  - Artifact bodies never reach a response.
  - A typed test fails when an action type is added without a classification.
- **Not verified.** Actions the product adds later.
- **Product change candidates.** The gate's classification lists (`UNDECIDED_EVENTS`) and the app's
  action types.
- **Decisions before adoption.** `OFF` or `KEEP`.
- **Proposal.** `KEEP`, on the condition that unknown events stay OFF and the typed classification
  stays.

  Reasons:
  - These actions do not touch the five source keys (tested).
  - T1 verifies the store and the digest again for every request.
  - With `OFF`, every selection or toast would need a Human to turn access ON again.
- **Done when.** The Human decides and the decision is recorded, and the typed classification covers
  every action type.

## 11. Other processes

- **Existing requirement.** `DataRoot::exclusive` does not serialize other processes, such as an editor
  or a sync client (§5, §6.6).
- **Candidate.**
  - Other processes are seen only through verification: at T0, at T1, and at T2 with the candidate.
  - No folder watcher exists.
- **Verified (memory and disk).** Changes made after T1 are refused at the candidate T2 (§6.9).
- **Not verified.**
  - A change that is made and undone between two checks.
  - A file held open by another program.
  - Sync clients.
- **Product change candidates.** None until the scope is decided.
- **Decisions before adoption.**
  - Whether other processes are in scope.
  - Whether a folder watcher is wanted.
- **Done when.** The scope is decided. If other processes are in scope, a detection design exists and is
  tested.
