# Decisions — LR-20260917-DVCC-001

## Human-approved (from Task Packet revision 1)

- **D1** Per-round artifacts `request-r<N>.md` / `result-r<N>.md`; `checkpoint.md` = latest resume state.
- **D2** Suspend → `reviewState = SUSPENDED`, prior state in `suspendedFrom`, Human picks WARM / COLD; Resume → `reviewState = suspendedFrom`, Resource → HOT.
- **D3** Wave 1 → CP → Wave 2 → CP → Wave 3 → Final Convergence → push → Draft PR → STOP.
- Architecture: Hybrid, Tauri 2 + React 19 + TypeScript strict + Vite; Rust limited to storage / launcher / data-dir.
- Reuse: HybridGauge reference_pattern + adopt tauri-plugin-opener; persistence build_custom; AgentDeck / Taurus defer.

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
| L-010 | Dropped a `tauri::test::mock_app` data-dir test: enabling tauri `test` feature made the Windows test binary fail to start (exit 0xC0000139, entry point not found; custom manifest work would be needed). Verified instead by dependency source inspection (tauri-2.11.5 `src/path/desktop.rs:74-76`: `data_dir()` → `dirs::data_dir()` → `{FOLDERID_RoamingAppData}`) plus unit tests of the join logic. | Optional test; one attempt, then alternative verification (no blind retry). Real data dirs stay untouched. |
