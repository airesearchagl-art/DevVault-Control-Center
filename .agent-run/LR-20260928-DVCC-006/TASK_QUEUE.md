# Task Queue — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

- [x] Wave 0 — Fresh Gate, branch creation, Task Packet snapshot + digest, SQLite dependency gate
- [x] Wave 1 — provider-neutral domain model + binding rules (22 tests)
- [x] Wave 2 — Rust read-only Claude/Codex readers + native canonicalization boundary (11 tests)
- [x] Wave 3 — UI (`ReviewIdeSessions`), runtime state (`appState.ts`), service wiring, JA+EN
- [x] Wave 4 — mutation campaign (4/5 executed; M-P4B1-01 blocked and reported, not skipped silently),
      full regression, README reconciliation
- [x] Wave 5 — release binary rebuild, running-app smoke (`verify-session-discovery-ui.ps1`, 48/48),
      final convergence
- [ ] Independent Review of this delta (separate context; this run cannot review its own work) —
      should specifically weigh the M-P4B1-01 / AC4B1-25 gap
- [ ] Draft PR against `main` (only after Independent Review returns READY CANDIDATE, no Required Fix)
- [ ] Phase 4b-2 (Human-selected resume) — not started, out of scope for this run
- [ ] Ready / merge / release / Production — prohibited until a later, separate Human Gate
