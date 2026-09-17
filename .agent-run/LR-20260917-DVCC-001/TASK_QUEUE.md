# Task Queue — LR-20260917-DVCC-001

Legend: [ ] pending · [~] in progress · [x] done · [!] blocked

## Wave 0 — Preflight / Task Packet init

- [x] Fresh preflight with evidence
- [x] Read required Vault route files (read-only)
- [x] TASK_PACKET_SNAPSHOT.md + SHA-256 binding
- [~] Run artifact init commit + first push

## Wave 1 — Tauri shell + Rust boundary + domain + persistence foundation

- [ ] Scaffold Tauri 2 + React 19 + TypeScript strict + Vite (+ Vitest)
- [ ] Rust: data-root resolution (env override / debug / release)
- [ ] Rust: storage commands (read / atomic write + backup / append / list / quarantine / info) with path confinement
- [ ] Rust: launcher (https allowlist URL, validated project folder, data dir) via opener API
- [ ] Capabilities: core:default + clipboard-manager:allow-write-text only; CSP
- [ ] TS domain: states, project, review (rounds), transitions (D2), events, validation, schema, prompt, queue
- [ ] TS services: storage backend (invoke), persistence (recovery), review operations, launcher, clipboard
- [ ] Synthetic fixtures (valid + malformed) + fixture hygiene test
- [ ] docs/data-contract-v1.md
- [ ] Checks: npm install, tsc, vitest, vite build, cargo check, cargo test
- [ ] Checkpoint 1 (commit + push)

## Wave 2 — Review Hub UI

- [ ] App shell + reducer + loading / fatal states
- [ ] Queue (attention sort, filter, closed toggle, unreadable rows)
- [ ] Detail (project, review, heads, states, thread, previous result, checkpoint, next action)
- [ ] Create / Edit Project; Create / Edit Review
- [ ] State controls: Resource segmented control, Mark Ready / Start Review / Cancel / Next Round / Block / Close
- [ ] Suspend dialog (checkpoint + WARM/COLD) / Resume
- [ ] Open GitHub / ChatGPT / Project Folder / Data folder
- [ ] Copy Review Prompt (request-r<N>.md + clipboard)
- [ ] Capture Result (paste textarea → result-r<N>.md) + Human verdict confirmation
- [ ] Empty states, error toasts, recovery / unreadable banners
- [ ] Checks: tsc, vitest, vite build, cargo check, tauri dev launch
- [ ] Checkpoint 2 (commit + push)

## Wave 3 — Convergence

- [ ] Defect repair, README
- [ ] Release no-bundle build
- [ ] Windows launch smoke
- [ ] E2E restart smoke (Create → Suspend → close → reopen → Resume) + event / checkpoint verification
- [ ] Repository hygiene scan + synthetic fixture verification
- [ ] Full diff review
- [ ] Checkpoint 3

## Final Convergence

- [ ] Freeze, full diff, AC review, required checks re-run, hard checks, debt / unverified inventory
- [ ] Independent Verifier
- [ ] Final checkpoint + push
- [ ] Draft PR → STOP / Human Gate
