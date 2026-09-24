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
| QD-004 | Phase 3 Wave 5 smoke | **Promoted to RF-WF-01 (Required Fix, P2) on 2026-09-24 and repaired in `7ba7bb8`; closed pending independent verification.** Original finding: **Turn 2 narrative traceability.** The Human fills items 7/8 in the *copied* Turn 2 text; `followup-r<N>.md` keeps the placeholders, so what was actually sent is not stored. The protocol holds (Turn 2 is written, the Final Judgment is stored beside the Fresh Assessment), but the narrative the reviewer answered is not traceable from DVCC's files. The domain already accepts a narrative (`buildResolutionFollowup(…, narrative)`); an input field would close it. |
| QD-005 | Phase 3 Wave 5 smoke | **The verdict dialog opens by itself after a Fresh Assessment is saved** (Phase 1 behaviour, `App.tsx` `submitCapture`). It decides nothing and can be declined, and a stale dialog cannot confirm while a Final Judgment is awaited (domain refusal), but it nudges the Human past the Turn 2 decision the canonical protocol asks them to make. |
| QD-006 | Phase 3 Wave 5 smoke | **A state-level refusal reads with internal names**: `“recordFollowupSaved” is not allowed while the review is REVIEW_PASS` (the Phase 1 `action.notAllowed` message, reused). The next step is shown after it, so the Human is not left without a way forward, but the reason names an identifier and a raw state value. |
| QD-007 | Phase 3 Wave 5 | Screen-reader behaviour was not tested; the accessible structure was checked in the running DOM only. |
| SF-WF-01 | RF-WF-01 targeted smoke (2026-09-24) | **CLOSED 2026-09-24 in `86146d1`** (classified a Verification Harness Safety Required Fix, not a product defect): the smokes no longer touch the real clipboard; DVCC's clipboard write is intercepted in the page and the old restore path is removed. See EVIDENCE "SF-WF-01". Original finding: **the workflow smoke did not leave the operator's clipboard as it found it.** Start `text, length 1132, sha256 0ED53F13…`, end `text, length 1821, sha256 74FDD438…`; the Windows clipboard sequence advanced 2391 → 2535 during the run and not at all in 60 s of idle observation afterwards. The end text matches none of the run's DVCC artifacts (LF and CRLF, with and without the final newline, compared by hash; the content was not read). No guard note was emitted. An earlier workflow run showed the same kind of change (2367 → 935, attribution unknown); the localization smoke preserved the clipboard every time it ran. Mechanism not identified. Leading hypothesis, unconfirmed: the guard treats the first sequence change after a click as DVCC's write, so a write by anything else in that window would be restored over. The workflow smoke must not be run on an operator machine again until this is resolved. |
