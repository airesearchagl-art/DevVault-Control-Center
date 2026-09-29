# Decisions — LR-20260929-DVCC-008 (Phase 4b-2a Resume Handoff)

- D-4B2A-001 — Domain module `src/domain/resumeIntent.ts` is pure (no Tauri import, no I/O).
  `ValidatedSessionId` is a branded string whose brand is a module-private `unique symbol`, so the only
  way to obtain one is `parseSessionId`. `renderResumeCommand` accepts only a `ResumeIntent`, and a
  `ResumeIntent` only comes out of `evaluateResume`, so a display label or any other raw string cannot
  reach the renderer through the types.
- D-4B2A-002 — Validator: `^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
  (the Task Packet's recommended shape). Values are rejected, never lowercased/trimmed/normalized.
  JavaScript `$` without the `m` flag matches only at the true end of input, so a trailing newline is
  rejected (covered by tests). Every accepted character is `[0-9a-f-]` and the first is a hex digit,
  so the rendered line needs no quoting and cannot be read as a flag, path, name or shell operator.
- D-4B2A-003 — Evaluation order (fixed): stale → binding (MATCHED **and** `matchedProjectId` equals the
  selected Project; otherwise NOT_MATCHED) → Claude (LIVE → ALREADY_ACTIVE; anything else →
  PROVIDER_NOT_SUPPORTED, so even an impossible MATCHED history row yields no command) → unknown
  provider (PROVIDER_NOT_SUPPORTED) → Codex archived → ID validity → ELIGIBLE. A Project-ID mismatch
  is reported as NOT_MATCHED (the row is not an exact match *for this Project*).
- D-4B2A-004 — Archived fails closed: `archived !== false` → ARCHIVED (the packet's `archived === true`
  plus the unknown/`null` case, which a Codex row never has in practice). No unarchive suggestion.
- D-4B2A-005 — Incomplete scans do not enter eligibility at all (`evaluateResume` takes no
  completeness input): a row's binding depends only on its own metadata and the full Project
  registry, so a truncated scan cannot have produced a MATCHED. The existing incomplete warning is
  rendered unchanged alongside eligible rows.
- D-4B2A-006 — UI: inline per-row `ActionButton` (existing component). Ineligible rows use its
  `disabledReason` (aria-disabled, focusable, reason tied with `aria-describedby`), so every row gets a
  control and a localized reason. A wrapper carries a language-neutral `data-resume` state for tests.
  The three UI-only notes render in a provider section only when it has at least one eligible row
  (in 4b-2a that can only be Codex). No dialog, no selected-session state.
- D-4B2A-007 — Action seam `src/app/copyResumeCommandAction.ts` mirrors Phase 4a's
  `copyIdeHandoffAction`: its only side-effecting parameters are `copy` and `notify`. `App.tsx`
  re-derives `stale` (from `state.ideSessions` + the current registry) and the selected Project ID at
  click time and passes the full `DiscoveredIdeSession`; the seam re-evaluates eligibility before
  rendering, so the disabled button is never the security boundary. Refusal → warning toast;
  clipboard failure → error toast; success → info toast. No state, persistence or event.
- D-4B2A-008 — Freshness trade-off (Task Packet §17): no new background watcher. The Project-binding
  fingerprint stays authoritative (stale → no action anywhere). A session deleted or archived after
  the last discovery makes the Human-run `codex resume` fail at run time; for a copy-only artifact that
  is acceptable and documented.
- D-4B2A-009 — Label-vs-ID mutation M-P4B2A-01 was exercised at both layers: in the action seam
  (killed by unit tests) and in the UI click handler (killed by the running-app smoke, because this
  repository has no DOM test environment and no dependency may be added for it). Structurally, any
  abbreviated label contains `…` and fails the strict parser, so a label substitution fails closed
  (nothing is copied) rather than copying a wrong ID.
- D-4B2A-010 — README contract test (`src/test/docsContract.test.ts`) updated to the new status facts
  (4b-1.1 merged via PR #7, 4b-2a under development, 4b-2b deferred / not implemented, "does not run").
  The pre-existing session-discovery smoke's "no control other than Refresh" assertion was updated to
  the new contract (Refresh + per-row Copy Resume Command only; nothing that runs a session).
- D-4B2A-011 — DF-06 (found in this run's real-data dogfood; pre-existing Phase 4b-1 behavior): a
  discovery refresh updates the last-write time of Codex's `state_5.sqlite-shm` (WAL-index) file; its
  content, the database and the WAL are unchanged. Repairing it would require changing
  `src-tauri/src/codex_reader.rs`, which this Task Packet forbids, so it is recorded and carried
  (QUALITY_DEBT.md) for a Human decision, not changed here. The 4b-2a copy action itself touches no
  provider file (measured).
