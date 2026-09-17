# Run State

- Run ID: LR-20260917-DVCC-001
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: CHECKPOINTED (Wave 1 complete; continuing to Wave 2)
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/review-hub-v0.1
- Base SHA: bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d
- Current head: see `git log -1` on origin/feat/review-hub-v0.1 (Wave 1 checkpoint commit; parent dd6a82f)
- Current wave: 1 complete → 2 next
- Last successful checkpoint: Wave 1 checkpoint (commit "feat: scaffold Tauri shell with storage, launcher, domain and persistence core (Wave 1 checkpoint)")
- Task Packet ID: LRP-20260917-DVCC-001
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b (re-verified at Wave 1 checkpoint: match)

## Objective

Build DevVault Control Center — Review Hub v0.1 as a locally usable Windows desktop app that externalizes Project / Repository / Local Root / PR / expected and reviewed HEAD / ChatGPT thread / Review State / Resource State / Previous Result / Next Action for up to ~8 reviews, so any Review can be resumed after closing ChatGPT and restarting the app.

## Acceptance Criteria

- [ ] AC-01 Windows desktop app launches — shell compiles (`cargo check`); launch not yet run (Wave 2/3)
- [ ] AC-02 multiple Projects — service-level PASS (persistence.test.ts); UI pending (Wave 2)
- [ ] AC-03 multiple Review Sessions — service-level PASS; UI pending
- [ ] AC-04 Resource State independent — domain PASS (transitions.test.ts "independent resource axis"); UI pending
- [ ] AC-05 Review State transition contract — domain PASS (full guard table); UI pending
- [ ] AC-06 ChatGPT thread title / URL saved — schema / service PASS; UI pending
- [ ] AC-07 Repository / Local Root / PR / expected / reviewed HEAD saved — schema / service PASS; UI pending
- [ ] AC-08 request-r<N>.md / result-r<N>.md retained — service PASS ("keeps per-round request/result artifacts"); UI pending
- [ ] AC-09 Suspend checkpoint + Resume after exit — service-level restart scenario PASS; app-level restart pending (Wave 3)
- [ ] AC-10 GitHub / ChatGPT URL via safe launcher — Rust validation PASS; runtime open pending
- [ ] AC-11 Project Folder via validated launcher — Rust validation PASS; runtime open pending
- [ ] AC-12 Review Request → request-r<N>.md + clipboard — file part PASS (service); clipboard pending (Wave 2/3)
- [ ] AC-13 Human paste capture → result-r<N>.md — service PASS; UI pending
- [ ] AC-14 no verdict / state auto-confirmation — domain + service PASS; UI pending
- [ ] AC-15 runtime data not in Git — .gitignore + fixture hygiene test PASS; full repo scan pending (Wave 3)
- [ ] AC-16 no paid API — PASS so far (dependencies: tauri, opener, clipboard-manager, serde, react; no OpenAI / Anthropic SDK)
- [ ] AC-17 malformed input isolation — persistence tests PASS (Rust + TS); app-level pending
- [ ] AC-18 restart round-trip — TS service + Rust disk tests PASS; app-level pending
- [ ] AC-19 required tests / Rust checks / Windows smoke — tests / Rust checks PASS; Windows smoke pending
- [ ] AC-20 final diff within Phase 1 scope — pending final review

## Completed

- Preflight PASS; Task Packet snapshot bound (digest 4200048d…124b)
- Wave 1: scaffold, Rust storage / launcher / data-root, TS domain + services, fixtures, data contract, tests

## Current implementation state

- `src-tauri/`: storage.rs (data root, target confinement, atomic write + .bak, append-only events, quarantine, list), launcher.rs (URL allowlist, folder validation, opener API), lib.rs (plugins + commands), capability core:default + clipboard write only, CSP, bundle inactive.
- `src/domain/`: states, project, review (rounds), events, transitions (guard table, D2), validation, schema (v1 parse / serialize), prompt (Turn-1 skeleton), queue (attention order).
- `src/services/`: storage (invoke port), persistence (recovery contract), reviewService (use cases), launcher, clipboard.
- `src/app/App.tsx`: Wave 1 placeholder shell only.

## Checks

Wave 1: npm install PASS; tsc PASS; vitest 216/216 PASS; vite build PASS; cargo check PASS (no warnings); cargo test 22/22 PASS. See EVIDENCE.md.

## Quality Debt

none

## Explicit unverified items

- App launch, UI flows, clipboard write at runtime, real opener calls, app-level restart smoke — not yet run (scheduled Wave 2 / Wave 3).

## Known failures

none open. Resolved: tsc error in schema.ts (fixed); suggestProjectId combining marks (fixed); mock_app test binary 0xC0000139 (test removed, alternative verification — L-010).

## Decisions

See DECISIONS.md (D1–D3; L-001..L-010).

## Files changed

Wave 1: .gitignore, index.html, package.json, package-lock.json, tsconfig*.json, vite.config.ts, docs/data-contract-v1.md, fixtures/v1/**, src/** (domain, services, test, app placeholder, main.tsx), src-tauri/** (Cargo.toml, Cargo.lock, build.rs, tauri.conf.json, capabilities/default.json, icons, src/*.rs), .agent-run/** updates.

## Remaining tasks

Wave 2 UI → Checkpoint 2 → Wave 3 convergence → Final Convergence (Independent Verifier) → Draft PR.

## Next action

Start Wave 2: implement Review Hub UI (app reducer + tests, queue, detail, dialogs, actions, banners), then tsc / vitest / build / cargo check / tauri dev launch with DVCC_DATA_DIR in scratch.

## Stop conditions status

No stop condition triggered.

## Resume instructions

1. Verify RUN_MANIFEST.md identity; recompute SHA-256 of TASK_PACKET_SNAPSHOT.md (must equal 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b).
2. Verify repository / branch `feat/review-hub-v0.1` / base bbffea1 / head = latest checkpoint commit / clean working tree.
3. `npm ci` (or `npm install`), `npx vitest run`, `cargo test` in src-tauri as targeted smoke.
4. Continue from "Next action". Any mismatch → BLOCKED and escalate to Human.
