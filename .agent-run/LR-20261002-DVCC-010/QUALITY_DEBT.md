# Quality Debt — LR-20261002-DVCC-010

- **QD-4B2B-01 (hardening, optional)** — Authenticode verification of the configured `codex.exe`
  (e.g. `WinVerifyTrust` + expected publisher) is not implemented; the Human-configured absolute
  path is the MVP trust root (HD-4B2B-02).
- **QD-4B2B-02 (accepted TOCTOU)** — the executable file or a link in the Project path can be
  swapped between validation and `CreateProcess`; the thread can be archived/opened by Codex
  between the native recheck and the spawn. Not closable with a path-based `CreateProcess`.
- **QD-4B2B-03 (no signal)** — no supported "already open" signal exists; explicit warning +
  acknowledgement only (HD-4B2B-03).
- **QD-4B2B-04 (debug build)** — the console-subsystem debug build always refuses with
  `INTERACTIVE_CONSOLE_UNAVAILABLE` (by design: it holds std handles).
- **QD-4B2B-05 (review item)** — per-window restriction of the new commands would require a Tauri
  `AppManifest` for all commands; recorded, not done (DECISIONS D-10).
- **QD-4B2B-06 (test infra)** — the native spawn test and the smoke compile the fixture with
  `rustc` from PATH and briefly open a console window for the fixture during `cargo test`.
- QD-4B12-01, QD-4B12-02 and the older QD items remain as recorded in earlier runs.
