# Quality Debt — LR-20260921-DVCC-004

Nothing new is open yet. Carried forward from the merged phases, and out of scope for Phase 3 unless
a Phase 3 feature makes one of them worse:

| ID | From | What it is |
|---|---|---|
| QD-001 | Phase 2 (PR #2) | After a bounded Git observation times out, the reader threads are detached rather than joined. |
| QD-002 | Phase 2 (PR #2) | `git status` runs the filters configured in the observed repository; DVCC passes `-c core.fsmonitor=false` and `GIT_OPTIONAL_LOCKS=0` but cannot stop a configured filter from running. |
| QD-003 | Localization (PR #3) | The hard-coded-text gate is a regular-expression scan, not an AST walk: it skips a sentence carrying code punctuation and reads only the three rendering directories. Named as a known limit inside the test. |

Phase 3 additions (found in Wave 5; none is a product-contract violation — each is for the Human to
decide whether it becomes a Focused Repair before the Draft PR):

| ID | From | What it is |
|---|---|---|
| QD-004 | Phase 3 Wave 5 smoke | **Turn 2 narrative traceability.** The Human fills items 7/8 in the *copied* Turn 2 text; `followup-r<N>.md` keeps the placeholders, so what was actually sent is not stored. The protocol holds (Turn 2 is written, the Final Judgment is stored beside the Fresh Assessment), but the narrative the reviewer answered is not traceable from DVCC's files. The domain already accepts a narrative (`buildResolutionFollowup(…, narrative)`); an input field would close it. |
| QD-005 | Phase 3 Wave 5 smoke | **The verdict dialog opens by itself after a Fresh Assessment is saved** (Phase 1 behaviour, `App.tsx` `submitCapture`). It decides nothing and can be declined, and a stale dialog cannot confirm while a Final Judgment is awaited (domain refusal), but it nudges the Human past the Turn 2 decision the canonical protocol asks them to make. |
| QD-006 | Phase 3 Wave 5 smoke | **A state-level refusal reads with internal names**: `“recordFollowupSaved” is not allowed while the review is REVIEW_PASS` (the Phase 1 `action.notAllowed` message, reused). The next step is shown after it, so the Human is not left without a way forward, but the reason names an identifier and a raw state value. |
| QD-007 | Phase 3 Wave 5 | Screen-reader behaviour was not tested; the accessible structure was checked in the running DOM only. |
