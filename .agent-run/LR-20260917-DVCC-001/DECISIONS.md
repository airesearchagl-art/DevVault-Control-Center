# Decisions — LR-20260917-DVCC-001

## Human-approved (from Task Packet revision 1)

- **D1** Per-round artifacts `request-r<N>.md` / `result-r<N>.md`; `checkpoint.md` = latest resume state.
- **D2** Suspend → `reviewState = SUSPENDED`, prior state in `suspendedFrom`, Human picks WARM / COLD; Resume → `reviewState = suspendedFrom`, Resource → HOT.
- **D3** Wave 1 → CP → Wave 2 → CP → Wave 3 → Final Convergence → push → Draft PR → STOP.
- Architecture: Hybrid, Tauri 2 + React 19 + TypeScript strict + Vite; Rust limited to storage / launcher / data-dir.
- Reuse: HybridGauge reference_pattern + adopt tauri-plugin-opener; persistence build_custom; AgentDeck / Taurus defer.

## Human-approved — Task Packet revision 2 (repair)

Binding: `TASK_PACKET_SNAPSHOT.rev2.md`, SHA-256 `624ef4d3716e7490d035e2b5dc599fb3c3d59cacb60d0827f298dbc7a391567b` (revision 1 snapshot / digest retained).

- **R2-D1** Repair Wave AUTHORIZED. Required: F-1, F-2, F-3, F-5. Same wave: F-4, F-6, F-8, F-11. Debt allowed: F-7, F-10. F-9: defer prohibited (mandatory verification; fix if reproduced; INCONCLUSIVE + BLOCKED if undecidable).
- **R2-D2** `tauri-plugin-single-instance` adopted (`adopt_dependency`); F-3 also requires unique temp names, serialized storage mutations and evidence-based multi-instance verification.
- **R2-D3** Draft PR only after Repair + Full Convergence + Independent Verification and only if F-1 / F-2 / F-3 resolved, F-9 PASS, Data integrity + Irreversible-data safety PASS and required checks PASS; otherwise BLOCKED without Draft PR.

## Lead decisions during the run (within approved scope)

| ID | Decision | Rationale |
|---|---|---|
| L-001 | Add `.gitattributes` (`* text=auto eol=lf`; snapshot `-text`). | System git config has `core.autocrlf=true`; Task Packet digest must stay byte-stable across checkout. |
| L-002 | No user-specific absolute paths in any tracked file, including run artifacts (local root recorded as placeholder). | Repository visibility is PUBLIC (`gh repo view` 2026-09-17). |
| L-003 | Run artifacts are committed on the feature branch. | Route: Run Artifact retained until COMPLETE_VERIFIED / Human closeout; checkpoint_commit / checkpoint_push = true. |
| L-004 | Scaffold from `create-tauri-app` `react-ts` (generated in scratchpad, selectively copied): vite 8.3, @vitejs/plugin-react 6.1, TypeScript 6.0.3, React 19.3, Vitest 5.0.1; Tauri 2.11.5, tauri-plugin-opener 2.5.5, tauri-plugin-clipboard-manager 2.3.3. Default Tauri icons kept for v0.1. | Official template versions; custom icon deferred. |
| L-005 | Identifier `com.devvault.controlcenter`; `bundle.active: false` (no installer); explicit CSP; capability = `core:default` + `clipboard-manager:allow-write-text`; no custom manifest (asInvoker). | Approved plan / Permission hard check. |
| L-006 | Rust storage returns raw text; schema validation lives in TypeScript. Rust additionally refuses to overwrite a primary JSON that does not parse (`PRIMARY_UNREADABLE`) and only writes JSON that parses. | Defense in depth for the "never silently overwrite corrupt file" contract. |
| L-007 | HEAD values are kept only in `rounds[]` (current round = last) instead of duplicating top-level `expectedHead` / `reviewedHead`. | Single source of truth; per-round history (D1). Displayed as "recorded" values, never inferred. |
| L-008 | Event types extend the plan's candidate list with `review_cancelled`, `request_saved`, `blocked`, `resource_changed`, `next_action_updated`, `metadata_updated`; `fix_required` is represented as `verdict_confirmed` with `to = FIX_REQUIRED`. | Complete audit trail without duplicate events. |
| L-009 | Verdict-bearing actions require the literal `confirmedByHuman: true` (type-level and runtime check); capture never changes Review State. | AC-14. |
| L-011 | UI text is English (matches the approved action names: Resume, Suspend, Capture Result…); the generated Review Request keeps the Japanese DevVault prompt wording. | Consistency with the Task Packet vocabulary and existing AI Review Request Prompt. |
| L-012 | UI elements carry `data-testid` attributes; E2E / launch smoke drive the real WebView2 window over the Chrome DevTools Protocol (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`, localhost, smoke runs only) with a small Node script kept in the scratchpad (not committed). | No heavy E2E framework (Task Packet: lightweight); the committed app has no debugging switch. Committing the harness is deferred. |
| L-013 | Unreadable review sessions are shown as read-only error rows with "Open data folder" / "Reload"; no in-app set-aside for sessions (only for projects.json, which blocks project editing). | Never discard data automatically; a broken review does not block other work. |
| L-014 | Accepted Independent Verifier findings F-1, F-2, F-3 as real Hard Check failures (Data integrity / Irreversible-data safety) after confirming them against the code; transitioned to BLOCKED instead of repairing autonomously; no Draft PR created. | Task Packet §7 / §12 and Long-Run Route: hard-gate real FAIL → immediate BLOCKED, no Quality Debt, no Repair Wave or independent continuation until Human escalation. |
| L-015 | (rev 2) `tauri-plugin-single-instance` 2.4.4 registered as the first plugin; the callback focuses the existing `main` window. | R2-D2; plugin docs require first registration. |
| L-016 | (rev 2) Beyond A / B / C, writes carry optimistic preconditions (`absent` / `matches`) derived by `TrackedStorage`; mismatch → `CONFLICT`, nothing overwritten. | "No cross-process silent overwrite" must also hold for editors / other programs, not only a second DVCC process. |
| L-017 | (rev 2) `ReviewHub` owns committed state; one serial queue for every operation (projects and reviews); UI fed by commit snapshots. | F-4 contract: operation order == disk commit order; UI == disk. |
| L-018 | (rev 2) Recovery table extended (missing primary + valid / invalid / newer backup); `restore_backup` and backup quarantine commands; `io_error` state distinct from `unreadable`; set-aside renames only unusable parts. | F-2 / F-8 required behaviour; backup protection enforced in Rust too. |
| L-019 | (rev 2) Round limit `maxReviewRounds = 999` in `contract/limits.json`, embedded in Rust with `include_str!`, imported by TypeScript. | 999 equals the pre-repair file-name bound, so no existing data becomes invalid; single definition across layers. |
| L-020 | (rev 2) Replaced results archived as `result-r<N>-previous-<capture time ms>.md` (write-if-absent), recorded in `rounds[].archivedResults`; orphan result files archived under the current time. | Deterministic, collision-checked, canonical latest stays `result-r<N>.md`. |
| L-021 | (rev 2) F-9 fix: `GetDriveTypeW` on the input drive + `fs::canonicalize` final target must be a local drive; the resolved local path is opened; applied to Open data folder too. | Reproduced bypass via symlink → UNC and mapped network drive; Windows API + std decide it safely (no INCONCLUSIVE needed). |
| L-022 | (rev 2) Mutation probe and CDP smoke harness remain scratch-only (not committed); the single-instance verification script is committed. | Human asked for reproducible multi-instance verification; other harnesses are evidence tools. |
| L-010 | Dropped a `tauri::test::mock_app` data-dir test: enabling tauri `test` feature made the Windows test binary fail to start (exit 0xC0000139, entry point not found; custom manifest work would be needed). Verified instead by dependency source inspection (tauri-2.11.5 `src/path/desktop.rs:74-76`: `data_dir()` → `dirs::data_dir()` → `{FOLDERID_RoamingAppData}`) plus unit tests of the join logic. | Optional test; one attempt, then alternative verification (no blind retry). Real data dirs stay untouched. |
