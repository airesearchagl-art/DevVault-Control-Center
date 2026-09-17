# Task Queue — LR-20260917-DVCC-001

Legend: [ ] pending · [~] in progress · [x] done · [!] blocked

## Wave 0 — Preflight / Task Packet init

- [x] Fresh preflight with evidence
- [x] Read required Vault route files (read-only)
- [x] TASK_PACKET_SNAPSHOT.md + SHA-256 binding
- [x] Run artifact init commit (`dd6a82f`) + first push

## Wave 1 — Tauri shell + Rust boundary + domain + persistence foundation

- [x] Scaffold Tauri 2 + React 19 + TypeScript strict + Vite (+ Vitest)
- [x] Rust: data-root resolution (env override / debug / release)
- [x] Rust: storage commands (read / atomic write + backup / append / list / quarantine / info) with path confinement
- [x] Rust: launcher (https allowlist URL, validated project folder, data dir) via opener API
- [x] Capabilities: core:default + clipboard-manager:allow-write-text only; CSP
- [x] TS domain: states, project, review (rounds), transitions (D2), events, validation, schema, prompt, queue
- [x] TS services: storage backend (invoke), persistence (recovery), review operations, launcher, clipboard
- [x] Synthetic fixtures (valid + malformed) + fixture hygiene test
- [x] docs/data-contract-v1.md
- [x] Checks: npm install, tsc, vitest, vite build, cargo check, cargo test
- [x] Checkpoint 1 (`fd733e1`, pushed)

## Wave 2 — Review Hub UI

- [x] App shell + reducer (+ tests) + loading / fatal states
- [x] Queue (attention sort, filter, closed toggle, unreadable rows) + project list
- [x] Detail (project, review, heads, states, thread, previous result, checkpoint, next action, recent events)
- [x] Create / Edit Project; Create / Edit Review
- [x] State controls: Resource segmented control, Mark Ready / Start Review / Cancel / Next Round / Block / Close
- [x] Suspend dialog (checkpoint + WARM/COLD) / Resume
- [x] Open GitHub / ChatGPT / Project Folder / Data folder
- [x] Copy Review Prompt (request-r<N>.md + clipboard)
- [x] Capture Result (paste textarea → result-r<N>.md) + Human verdict confirmation
- [x] Empty states, error toasts, recovery / unreadable banners, set-aside flow
- [x] Checks: tsc, vitest, vite build, cargo check, tauri dev launch (DVCC_DATA_DIR = scratch)
- [x] Checkpoint 2 (`bec4a7b`, pushed)

## Wave 3 — Convergence

- [x] Defect repair, README
- [x] Release no-bundle build
- [x] Windows launch smoke
- [x] E2E restart smoke (Create → Suspend → close → reopen → Resume) + event / checkpoint verification
- [x] App-level malformed recovery smoke (restored / unsupported / unreadable + set-aside / fatal data dir)
- [x] Real launcher opens (folder, GitHub, ChatGPT) + clipboard write
- [x] Repository hygiene scan + synthetic fixture verification
- [x] Full diff review (scope / boundary grep)
- [x] Checkpoint 3 (`b2c3ae8`, pushed)

## Final Convergence

- [x] Freeze (code head `b2c3ae8`), required checks re-run (all PASS), release launch smoke
- [x] Independent Verifier → Data integrity FAIL, Irreversible-data safety FAIL (F-1, F-2, F-3)
- [!] HARD_GATE_FAILURE → BLOCKED: evidence-only checkpoint + push; Human escalation
- [!] Repair wave (F-1 / F-2 / F-3 + test validity) — awaiting Human authorization
- [!] Re-run hard checks + Independent Verification after repair — blocked
- [!] Draft PR → STOP / Human Gate — blocked (not created)
