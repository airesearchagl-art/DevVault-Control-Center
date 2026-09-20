# Task Queue — LR-20260920-DVCC-002

Legend: [ ] pending · [~] in progress · [x] done · [!] blocked

## Wave 0 — preflight and binding

- [x] Fresh Git preflight (origin/main f557aa6, clean tree, no existing Phase 2 branch, toolchain)
- [x] Working branch `feat/evidence-freshness-v0.2` created from `origin/main`
- [x] Task Packet revision 1 snapshot + SHA-256 binding (b9ecd5c0…9dd8)
- [x] Route + project documents read read-only from the vault's current main
- [x] Architecture / internal reuse scan (delegated, read-only)
- [x] Wave 0 checkpoint (commit + push) — `ffd83c0`

## Wave 1 — Rust Git inspection boundary

- [x] `git.rs`: read-only observation (`inspect_git_repository`) reusing `validate_project_folder`
- [x] Bounded timeout + child-process model (own PID only, no shell, `GIT_OPTIONAL_LOCKS=0`)
- [x] ISO-8601 UTC `observedAt` helper (dependency-free) + tests
- [x] Status model: OK / NO_LOCAL_ROOT / NOT_A_GIT_REPOSITORY / GIT_UNAVAILABLE / TIMEOUT / ERROR
- [x] Rust tests incl. synthetic repositories and a no-mutation (before/after state) test
- [x] Targeted checks (fmt, clippy, check, test) → checkpoint

## Wave 2 — TypeScript model and Freshness derivation

- [x] `GitObservation` model + service port and Tauri adapter
- [x] HEAD comparison helper (40 = exact, 7–39 = prefix, case per schema contract)
- [x] Freshness derivation (fixed priority: WORKTREE_DIRTY > REVIEW_STALE > HEAD_CHANGED > ALIGNED > UNKNOWN) + explanations
- [x] Independent literal oracle + contract tests (pattern of `src/test/transitionContract.ts`)
- [x] Targeted checks (tsc, vitest) → checkpoint

## Wave 3 — UI integration

- [x] Git Evidence card in the review detail (status, branch, current HEAD, working tree, observed time, Refresh)
- [x] Freshness badge + explanation (expected / reviewed / current HEAD)
- [x] Queue row Freshness badge
- [x] Refresh Git State (selected) and Refresh All (sequential), busy / error states
- [x] Review State must stay unchanged; observation stays in memory only
- [x] Targeted checks → checkpoint

## Wave 4 — verification

- [ ] Scratch synthetic repositories (clean, dirty tracked, untracked, detached, not-a-repo, no localRoot, timeout, Git unavailable)
- [ ] Release build + isolated-desktop UI smoke (incl. restart → UNKNOWN)
- [ ] Phase 1 regression
- [ ] README / `docs/data-contract-v1.md` update (Phase 2 statements)
- [ ] Checkpoint

## Final

- [ ] Final Convergence (freeze, full diff review, all Required Checks, Hard Checks, Quality Debt, unverified items)
- [ ] Independent Verification (separate context)
- [ ] Draft PR → STOP
