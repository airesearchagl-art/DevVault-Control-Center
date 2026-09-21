# Quality Debt — LR-20260921-DVCC-004

Nothing new is open yet. Carried forward from the merged phases, and out of scope for Phase 3 unless
a Phase 3 feature makes one of them worse:

| ID | From | What it is |
|---|---|---|
| QD-001 | Phase 2 (PR #2) | After a bounded Git observation times out, the reader threads are detached rather than joined. |
| QD-002 | Phase 2 (PR #2) | `git status` runs the filters configured in the observed repository; DVCC passes `-c core.fsmonitor=false` and `GIT_OPTIONAL_LOCKS=0` but cannot stop a configured filter from running. |
| QD-003 | Localization (PR #3) | The hard-coded-text gate is a regular-expression scan, not an AST walk: it skips a sentence carrying code punctuation and reads only the three rendering directories. Named as a known limit inside the test. |

Phase 3 additions will be recorded here as they are found.
