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
