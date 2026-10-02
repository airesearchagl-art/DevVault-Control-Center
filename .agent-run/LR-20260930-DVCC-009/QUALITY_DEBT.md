# Quality Debt — LR-20260930-DVCC-009 (Phase 4b-1.2)

## Closed by this run

- **DF-05** — CLOSED_PARTIAL_COMPAT. Ordinary ASCII naming rule implemented; non-ASCII roots and
  >200-character encoded keys are explicitly unsupported with a localized warning.
- **DF-06** — ACCEPTED_AND_DOCUMENTED (code comments, README, docs contract test, errata, WAL smoke).

## Remaining / new

- **QD-4B12-01 (Low, by design)** — Claude history for non-ASCII or very long workspace paths is
  not bound (warning only). Supporting them would require knowing the provider's non-ASCII and
  truncation/hash forms; not to be guessed. Live exact matching covers these Projects while a
  session is running.
- **QD-4B12-02 (Low, test infrastructure)** — the WAL smoke helper is Node `node:sqlite`; it
  depends on the Node version available on the smoke host (already true for every existing Codex
  fixture in the smoke).
- QD-001, QD-002, QD-003, QD-005, QD-006, QD-007 (see `.agent-run/LR-20260921-DVCC-004/QUALITY_DEBT.md`)
  remain open and unaffected.
