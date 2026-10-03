# Task Queue — LR-20261002-DVCC-010

- [x] Fresh Gate
- [x] Task Packet snapshot + SHA-256 BEFORE implementation
- [x] Branch from exact main
- [x] Shared local-path boundary (`validate_local_entry`) — no weaker duplicate policy
- [x] Native executable validator (name, local boundary, PE CUI)
- [x] Native read-only launch recheck (`id`, `cwd`, `archived`)
- [x] cwd policy (exact / mismatch blocked / mirror-or-unknown warned)
- [x] Launch plan + direct spawn + CREATE_NEW_CONSOLE + std-handle fail-closed
- [x] Synthetic fixture (`test-fixtures/codex_launch_fixture.rs`)
- [x] Settings `codexExecutablePath` (backward compatible)
- [x] Frontend eligibility, action seam, confirmation dialog, configuration dialog, JA/EN
- [x] README + docsContract
- [x] Mutation campaign M-P4B2B-01..13
- [x] Full regression
- [x] Synthetic running-app smoke + regression smokes
- [x] Evidence convergence, commit, push
- [x] Independent FULL Review — READY CANDIDATE / Required Fixes: none — reviewed exact code head
      `74fa8667d0e1bdb3c99ed7caedd517c3f9203d81`
- [x] REAL_CODEX_LAUNCH_DOGFOOD_GATE — Human-authorized one real launch — PASS
- [x] Evidence Closeout (evidence-only; no product-code change)
- [ ] Draft PR — only after READY CANDIDATE (Required Fixes: none) AND the gate is resolved;
      not created in this closeout (next gate: Evidence-only Focused Re-review)
