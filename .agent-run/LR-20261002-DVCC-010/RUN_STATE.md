# Run State — LR-20261002-DVCC-010

Status: implementation, tests, mutations, full regression and synthetic running-app smoke
complete; committed and pushed to `feat/session-resume-launcher-v0.4b2b`. **STOPPED for
Independent FULL Review.** No Draft PR. Real Codex never launched.

Task Packet snapshot timing: compliant — snapshot + SHA-256 first, on `main`, before the branch
and before any implementation edit.

## Acceptance criteria

- [x] AC4B2B-01 snapshot before implementation
- [x] AC4B2B-02 branch from exact `a54a77e12d2b144027d4dec96c1f14236f3715fd`
- [x] AC4B2B-03 executable explicitly configured by the Human (no auto-detect)
- [x] AC4B2B-04 only a native local console `codex.exe`
- [x] AC4B2B-05 `.cmd` / `.ps1` / shim rejected (M-03)
- [x] AC4B2B-06 frontend + native UUID validation (M-01)
- [x] AC4B2B-07 native existence + archived recheck (M-06/07; smoke archive-between-steps)
- [x] AC4B2B-08 Project root freshly native-validated (M-08)
- [x] AC4B2B-09 root only as `current_dir` (plan test; fixture cwd; M-05)
- [x] AC4B2B-10 direct argument array (M-02)
- [x] AC4B2B-11 `CREATE_NEW_CONSOLE` (M-04)
- [x] AC4B2B-12 no shell / intermediate launcher (fixture parent = DVCC; lineage check)
- [x] AC4B2B-13 no stdout/stderr capture (fixture stdout = console; M-12)
- [x] AC4B2B-14 fire-and-forget (Child dropped; survived DVCC termination; not in a job)
- [x] AC4B2B-15 stale/MATCHED rechecked at confirmation (M-09)
- [x] AC4B2B-16 two-step confirmation (M-10)
- [x] AC4B2B-17 acknowledgement required (M-11a/b)
- [x] AC4B2B-18 authoritative cwd mismatch blocked (M-13; smoke case B)
- [x] AC4B2B-19 managed-mirror cwd allowed with warning (smoke case C)
- [x] AC4B2B-20 no path / full ID / exe path in confirmation (unit + smoke)
- [x] AC4B2B-21 success = process started only (wording tests)
- [x] AC4B2B-22 toast only; no event / state (smoke data tree)
- [x] AC4B2B-23 settings backward compatibility (settings tests + smoke)
- [x] AC4B2B-24 JA/EN parity (i18n parity test; JA+EN unit and smoke)
- [x] AC4B2B-25 M-P4B2B-01..13 killed, restored byte-identical
- [x] AC4B2B-26 native synthetic tests PASS
- [x] AC4B2B-27 running-app synthetic smoke PASS (75/75)
- [x] AC4B2B-28 real Codex NOT launched
- [x] AC4B2B-29 copy-only 4b-2a still functional (resume-handoff smoke 63/63)
- [x] AC4B2B-30 no Claude launcher
- [x] AC4B2B-31 hard checks PASS

REAL_CODEX_LAUNCH_DOGFOOD_GATE: **PENDING**
