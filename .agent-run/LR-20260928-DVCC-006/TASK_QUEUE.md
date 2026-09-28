# Task Queue — LR-20260928-DVCC-006 (Phase 4b-1 Session Discovery)

- [x] Wave 0 — Fresh Gate, branch creation, Task Packet snapshot + digest, SQLite dependency gate
- [x] Wave 1 — provider-neutral domain model + binding rules (22 tests)
- [x] Wave 2 — Rust read-only Claude/Codex readers + native canonicalization boundary (11 tests)
- [x] Wave 3 — UI (`ReviewIdeSessions`), runtime state (`appState.ts`), service wiring, JA+EN
- [x] Wave 4 — mutation campaign (4/5 executed; M-P4B1-01 blocked and reported, not skipped silently),
      full regression, README reconciliation
- [x] Wave 5 — release binary rebuild, running-app smoke (`verify-session-discovery-ui.ps1`, 48/48),
      final convergence
- [x] Independent Review of the Wave 5 head — **NOT READY** (RF-P4B1-01..04)
- [x] RF-P4B1-01..04 focused repair — stale-binding fingerprint, native metadata bounds, M-P4B1-01
      closure (5/5 mutation probes now killed), unsupported-schema smoke scenario (68/68); committed
      and pushed
- [x] Independent Review #2 of the RF-P4B1-01..04 repair — **NOT READY** (RF-P4B1-02 Final Closure)
- [x] RF-P4B1-02 Final Closure repair — pre-allocation string bounds, real Codex query deadline
      (InterruptHandle), explicit completeness signal (both providers), Codex `LIMIT MAX+1` cap
      detection, Claude cap/deadline detection, regression tests A–F, 5/5 mutation probes re-run live
      and re-confirmed, smoke extended to an incomplete-scan scenario (106/106); committed and pushed
- [ ] Focused Independent Delta Re-review of this repair (separate context; this run cannot review its
      own work)
- [ ] Draft PR against `main` (only after the re-review returns READY CANDIDATE, no Required Fix)
- [ ] Phase 4b-2 (Human-selected resume) — not started, out of scope for this run
- [ ] Ready / merge / release / Production — prohibited until a later, separate Human Gate
