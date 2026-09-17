# Run State

- Run ID: LR-20260917-DVCC-001
- Mode: LONG_RUN (ENDURANCE not authorized)
- Horizon: 8H
- Current state: CHECKPOINTED (Wave 2 complete; continuing to Wave 3)
- Repository: airesearchagl-art/DevVault-Control-Center
- Working branch: feat/review-hub-v0.1
- Base SHA: bbffea1177b80dfe46a0f6887a9fc05dd5e4f05d
- Current head: Wave 2 checkpoint commit on origin/feat/review-hub-v0.1 (parent fd733e1)
- Current wave: 2 complete → 3 next
- Last successful checkpoint: Wave 2 checkpoint (commit "feat: add Review Hub UI (Wave 2 checkpoint)")
- Task Packet ID: LRP-20260917-DVCC-001
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260917-DVCC-001/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b (re-verified at Wave 2 checkpoint: match)

## Objective

Build DevVault Control Center — Review Hub v0.1 as a locally usable Windows desktop app that externalizes Project / Repository / Local Root / PR / expected and reviewed HEAD / ChatGPT thread / Review State / Resource State / Previous Result / Next Action for up to ~8 reviews, so any Review can be resumed after closing ChatGPT and restarting the app.

## Acceptance Criteria

- [ ] AC-01 Windows desktop app launches — dev build launch PASS (Wave 2); release no-bundle launch pending (Wave 3)
- [ ] AC-02 multiple Projects — service tests PASS; dev UI pre-check PASS (2 projects); release E2E pending
- [ ] AC-03 multiple Review Sessions — service tests PASS; dev UI pre-check PASS (2 reviews); release E2E pending
- [ ] AC-04 Resource State independent — domain tests PASS; dev UI pre-check PASS; release E2E pending
- [ ] AC-05 Review State transition contract — domain guard table PASS; UI buttons gated by `canApply`; release E2E pending
- [ ] AC-06 ChatGPT thread title / URL saved — dev UI pre-check PASS (persisted session.json); restart check pending
- [ ] AC-07 Repository / Local Root / PR / expected / reviewed HEAD saved — dev UI pre-check PASS; restart check pending
- [ ] AC-08 request-r<N>.md / result-r<N>.md retained — service test PASS; dev files present; release E2E pending
- [ ] AC-09 Suspend checkpoint + Resume after exit — service-level PASS; app restart pending (Wave 3)
- [ ] AC-10 GitHub / ChatGPT URL via safe launcher — Rust tests + runtime rejections PASS; real open pending (Wave 3)
- [ ] AC-11 Project Folder via validated launcher — Rust tests + runtime rejections PASS; real open pending (Wave 3)
- [ ] AC-12 Review Request → request-r<N>.md + clipboard — dev pre-check PASS (file + Get-Clipboard); release E2E pending
- [ ] AC-13 Human paste capture → result-r<N>.md — dev pre-check PASS; release E2E pending
- [ ] AC-14 no verdict / state auto-confirmation — domain + service + dev UI PASS; release E2E pending
- [ ] AC-15 runtime data not in Git — .gitignore + fixture hygiene PASS; full repo scan pending (Wave 3)
- [ ] AC-16 no paid API — dependencies unchanged (no OpenAI / Anthropic SDK); final diff check pending
- [ ] AC-17 malformed input isolation — Rust + TS tests PASS; app-level recovery smoke pending (Wave 3)
- [ ] AC-18 restart round-trip — tests PASS; app restart pending (Wave 3)
- [ ] AC-19 required tests / Rust checks / Windows smoke — tests / checks PASS; release smoke pending
- [ ] AC-20 final diff within Phase 1 scope — pending final review

## Completed

- Preflight, Task Packet binding
- Wave 1 (`fd733e1`): scaffold, Rust boundary, domain, persistence, fixtures, tests
- Wave 2: Review Hub UI (queue, detail, dialogs, actions, banners, toasts, empty / error states), appState reducer tests, dev launch + UI pre-check

## Current implementation state

UI complete for Phase 1 scope: `src/app/{App.tsx, App.css, appState.ts, format.ts}`, `src/components/{Banner, Dialog, StateBadge}.tsx`, `src/features/projects/ProjectForm.tsx`, `src/features/reviews/{ReviewQueue, ReviewDetail, ReviewForm, ReviewDialogs}.tsx`.

## Checks

Wave 2: tsc PASS; vitest 222/222 PASS; vite build PASS; cargo check PASS; tauri dev launch PASS; dev UI pre-check PASS. See EVIDENCE.md.

## Quality Debt

none

## Explicit unverified items

- Release (no-bundle) build and launch; app-level restart / Resume E2E; real opener calls (GitHub URL, project folder); app-level malformed-file recovery; full repository hygiene scan; Independent Verification — scheduled for Wave 3 / Final Convergence.

## Known failures

none open.

## Decisions

See DECISIONS.md (D1–D3; L-001..L-013).

## Files changed

Wave 2: src/app/*, src/components/*, src/features/*, .agent-run/** updates.

## Remaining tasks

Wave 3 convergence (README, release no-bundle build, Windows launch smoke, restart E2E, app-level malformed recovery smoke, hygiene scan, full diff review) → Final Convergence (Independent Verifier) → Draft PR.

## Next action

Start Wave 3: write README; `npm run tauri build -- --no-bundle`; run release E2E phase 1 → close → phase 2 (restart + Resume) → phase 3 (malformed recovery) with DVCC_DATA_DIR in scratch; repository hygiene scan.

## Stop conditions status

No stop condition triggered.

## Resume instructions

1. Verify RUN_MANIFEST.md identity; recompute SHA-256 of TASK_PACKET_SNAPSHOT.md (must equal 4200048dd5535f596af25e588f0c572c4ca611464aff7bf221686c5759a1124b).
2. Verify repository / branch `feat/review-hub-v0.1` / base bbffea1 / head = latest checkpoint commit / clean working tree.
3. `npm ci`, `npx vitest run`, `cargo test` (src-tauri) as targeted smoke.
4. Continue from "Next action". Any mismatch → BLOCKED and escalate to Human.
