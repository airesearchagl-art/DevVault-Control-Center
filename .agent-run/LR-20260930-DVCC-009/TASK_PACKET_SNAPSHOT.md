# Task Packet Snapshot — LRP-20260930-DVCC-009

Verbatim copy of the Task Packet as received. Immutable after its SHA-256 was recorded in
RUN_MANIFEST.md.

---

# DevVault Control Center — Phase 4b-1.2
# Discovery Compatibility / Read-only Contract Closeout
# Implementation Task Packet

Repository:
airesearchagl-art/DevVault-Control-Center

Run ID:
LR-20260930-DVCC-009

Task Packet:
LRP-20260930-DVCC-009

Expected base:
main @ fda753d147d136f961e5c45d51c32f42cbe28bfc

Branch:
feat/session-discovery-v0.4b1.2

Mode:
FOCUSED COMPATIBILITY REPAIR

ENDURANCE:
NOT AUTHORIZED

Endpoint:
Independent FULL Review candidate.

Draft PR:
ONLY after Independent Review returns READY CANDIDATE
with Required Fixes: none.

Ready / merge / release / Production:
PROHIBITED until later Human Gate.

Phase 4b-2b:
HOLD / OUT OF SCOPE.

────────────────────────────────────────
1. Fresh Gate
────────────────────────────────────────

git fetch origin
git switch main
git pull --ff-only

Required:

HEAD =
fda753d147d136f961e5c45d51c32f42cbe28bfc

origin/main =
same exact SHA

working tree =
clean

PR #8 =
MERGED

Open PRs =
none

feat/session-discovery-v0.4b1.2 =
must not already exist

Any mismatch:
STOP.

Then create:

feat/session-discovery-v0.4b1.2

from exact main.

────────────────────────────────────────
2. Human Decisions
────────────────────────────────────────

HD-4B12-01 — DF-05

Classification:
PASS_PARTIAL

For Claude historical Project-directory binding:

Supported MVP naming:

- input path must be ASCII only
- every ASCII character outside [A-Za-z0-9]
  becomes "-"
- case is preserved by the provider but comparison remains
  case-insensitive on Windows
- if the ordinary encoded key length is <= 200:
  the key may be used as a historical candidate key

Unsupported:

- any non-ASCII Project.localRoot
- any ordinary encoded key whose length would exceed 200

For unsupported cases:

DO NOT guess Claude's truncation/hash form.

DO NOT return a normal NO_MATCH conclusion for historical
binding.

Show an explicit localized warning that historical binding
is unsupported for this workspace path.

Live exact cwd matching remains available independently.

Historical directory evidence remains AMBIGUOUS at most.

HD-4B12-02 — DF-06

Classification:
ACCEPT_AND_DOCUMENT

Canonical contract:

"DVCC does not modify provider application data. The
Codex database and WAL application data are read without
modification. When SQLite reads a live WAL database,
SQLite may update the provider-owned -shm shared-memory
coordination file, including read-mark/lock bytes and
filesystem metadata. The -shm file contains no database
content and is not required for database recovery."

Equivalent concise Japanese wording required where
user-facing.

Do NOT claim:

all provider files are byte-identical after a live WAL
read.

HD-4B12-03 — readonly_shm

OUT OF SCOPE.

Do NOT adopt:

immutable=1
nolock
readonly_shm

in this run.

Reasons:

immutable=1 / nolock are unsafe with a live writer.

readonly_shm is undocumented and can fail with
SQLITE_READONLY_CANTINIT when no suitable read-mark exists.

No reader-behavior experiment is authorized here.

────────────────────────────────────────
3. Scope
────────────────────────────────────────

Close only:

DF-05
Claude historical directory naming compatibility

DF-06
Codex SQLite WAL/-shm contract/documentation accuracy

PR #8
post-merge README reconciliation

Historical evidence
explicit errata where the general provider-file contract
was overstated

Do NOT implement:

Phase 4b-2b
actual Resume launch
Claude Resume
process launch
shell
terminal
provider CLI invocation
new persistence
new event types
new schema

────────────────────────────────────────
4. DF-05 — Pure Domain Contract
────────────────────────────────────────

Implement the exact supported ordinary naming rule.

For an ASCII Project.localRoot:

each character:

[A-Z]
[a-z]
[0-9]

→ unchanged

everything else in ASCII
→ "-"

Examples conceptually:

_
space
:
\
/
.
-
other ASCII punctuation

all map through the provider-compatible ordinary rule.

Note:
"-" replaced by "-" is visually unchanged.

Before encoding:

if any code point is non-ASCII:
UNSUPPORTED

After ordinary encoding:

if encoded length > 200:
UNSUPPORTED

Do NOT:

- attempt Unicode letter classification
- infer a hash
- truncate
- reverse-decode
- normalize a non-ASCII value into ASCII
- inspect transcript content

────────────────────────────────────────
5. Suggested Domain Shape
────────────────────────────────────────

Keep this pure.

Suggested shape:

type ClaudeHistoricalKeyResult =
  | {
      status: "supported";
      key: string;
    }
  | {
      status: "unsupported";
      reason:
        | "NON_ASCII"
        | "LONG_NAME_HASH_UNKNOWN";
    };

function claudeHistoricalProjectKey(
  localRoot: string
): ClaudeHistoricalKeyResult;

Exact names are implementation-owned.

The comparison key for supported values remains
case-insensitive.

Preferred:

supported.key.toLowerCase()

for both:

Project-side forward key
provider encoded directory key

Do not alter canonical/live path matching.

────────────────────────────────────────
6. DF-05 Binding Semantics
────────────────────────────────────────

For supported historical keys:

0 candidates
→ NO_MATCH

1 candidate
→ AMBIGUOUS

2+ candidates
→ AMBIGUOUS

Never:
MATCHED

For a Project whose historical key is unsupported:

do not manufacture a session row.

do not reverse-decode provider directories.

do not show ordinary "No match" as if the historical
search were conclusive.

Instead surface a Project-level Claude history-binding
warning.

Live Claude sessions remain evaluated normally.

Therefore a selected Project may simultaneously show:

- live MATCHED session rows
- plus a historical-binding unsupported warning

That is valid.

────────────────────────────────────────
7. UI Contract for Unsupported Claude History
────────────────────────────────────────

Add JA + EN wording semantically equivalent to:

EN:
"Historical Claude Code binding is not supported for this
workspace path. Live exact matches are unaffected."

JA:
"このワークスペースパスではClaude Codeの履歴セッションを
安全に紐付けできません。LIVEの完全一致には影響しません。"

Do not show:

- actual localRoot
- encoded path
- provider directory name

No path leakage.

The warning is informational / fail-closed.

It does not alter:

Review State
Project state
session persistence
events

────────────────────────────────────────
8. DF-05 Tests
────────────────────────────────────────

At minimum:

A.
underscore:
C:\work\project_name

uses the provider-compatible ordinary key and finds the
candidate.

Result:
AMBIGUOUS, not MATCHED.

B.
space:
C:\work\project name

→ candidate
→ AMBIGUOUS.

C.
existing punctuation cases:
:
\
/
.

remain compatible.

D.
case difference:

C:
vs
c:

remains case-insensitive.

E.
component casing differences remain case-insensitive.

F.
two distinct Project roots collapsing to one encoded key:

AMBIGUOUS.

G.
non-ASCII raw path:

unsupported.

No guessed key.

H.
ordinary encoded key >200 chars:

unsupported.

No truncation/hash guess.

I.
unsupported historical binding + no live session:

UI must NOT claim ordinary historical NO_MATCH as a
complete conclusion.

J.
unsupported historical binding + live exact session:

live MATCHED row still appears
+
unsupported-history warning appears.

K.
historical session can never become MATCHED from the
directory key alone.

────────────────────────────────────────
9. DF-06 — Product Contract
────────────────────────────────────────

Do NOT change Codex reader runtime behavior.

No SQLite mode changes.

No connection-flag changes.

No new rusqlite feature.

No dependency change.

No PRAGMA change.

No checkpoint.

No immutable.

No nolock.

No readonly_shm.

Allowed src-tauri change:

COMMENT / DOCUMENTATION ONLY in:

src-tauri/src/codex_reader.rs

Do not alter executable Rust behavior.

────────────────────────────────────────
10. DF-06 — Rust Comment Corrections
────────────────────────────────────────

Correct overly strong comments.

Important distinction:

SQLITE_OPEN_READONLY
=
the primary application-database read-only boundary.

query_only
=
defense in depth for ordinary data-changing SQL, but it is
NOT itself a complete filesystem/read-only guarantee and
does not prevent every operation such as checkpoint-related
behavior.

DVCC does not issue a checkpoint.

Also document:

when reading a live WAL database SQLite may modify the
-shm coordination file's read-mark/lock bytes or filesystem
metadata.

Do not describe this as provider application-data
modification.

────────────────────────────────────────
11. README Reconciliation
────────────────────────────────────────

Reconcile current status after PR #8.

Required facts:

Phase 4b-1:
merged via PR #6

Phase 4b-1.1:
merged via PR #7

Phase 4b-2a:
merged via PR #8

main after PR #8:
fda753d147d136f961e5c45d51c32f42cbe28bfc

Phase 4b-2b:
deferred / not implemented

DVCC:
copies Resume commands

DVCC:
does NOT execute Resume commands

Not released.
No installer published.

Change Resume Handoff wording from:

under development

to:

merged via PR #8

────────────────────────────────────────
12. README — DF-06 Boundary
────────────────────────────────────────

Add a concise current-facing contract.

Meaning must be:

DVCC does not modify provider application data.

For Codex session discovery, the database is opened
READ ONLY.

When the provider database is live in SQLite WAL mode,
SQLite may update the provider-owned -shm coordination
file while maintaining reader coordination.

-shm may have:

- read-mark / lock byte changes
- filesystem metadata changes

This is not application database content.

Do not claim the entire provider file tree is untouched.

Keep wording concise enough for README.

────────────────────────────────────────
13. Documentation Contract Test
────────────────────────────────────────

Update docsContract.test.ts to assert current facts:

- Phase 4b-2a merged via PR #8
- new main SHA
- Phase 4b-2b deferred/not implemented
- copy-only / does-not-run boundary
- stale "under development" wording absent

Add a lightweight assertion for the new Codex read-only /
-shm contract so it cannot silently regress into
"all provider files unchanged".

No docs/data-contract-v1.md change expected.

If persisted schema changes:
STOP.

────────────────────────────────────────
14. Historical Evidence Errata
────────────────────────────────────────

DO NOT silently rewrite prior historical statements.

Append clearly labelled errata.

At minimum review/update:

.agent-run/LR-20260928-DVCC-006/EVIDENCE.md
.agent-run/LR-20260928-DVCC-006/RUN_STATE.md

Clarify:

the synthetic/observed fixture at that run was unchanged,
but this does NOT establish a general invariant that every
provider-owned SQLite coordination file remains byte- or
metadata-identical during a live WAL read.

Also append an appropriate clarification to:

.agent-run/LR-20260929-DVCC-007/EVIDENCE.md

Its "Provider modification: none" observation remains a
historical observation of that run, but the general
contract is now the DF-06 contract above.

Do not modify prior Task Packet snapshots.

LR-008 already records DF-06 accurately; do not rewrite it
unless a cross-reference is useful and append-only.

────────────────────────────────────────
15. Synthetic WAL-mode Smoke
────────────────────────────────────────

Extend the session-discovery smoke with a synthetic
Codex WAL-mode scenario.

No real provider data.

Goal:

exercise the contract against an actual WAL-mode SQLite
fixture.

Fixture may use a test-only helper connection/process if
necessary to keep WAL state present.

The helper is fixture infrastructure only.
It must perform no writes during the measured discovery
window.

Before measured discovery:

stabilize fixture.

Capture:

- logical expected rows
- database file hash
- WAL file hash if present
- -shm hash/metadata if present

Run Human-triggered DVCC discovery.

Verify:

A.
expected session metadata is read correctly.

B.
database content/file hash remains unchanged.

C.
WAL content/file hash remains unchanged when present.

D.
no checkpoint/truncate/migration occurs.

E.
-shm differences are ALLOWED.

Do not fail solely because:

-shm bytes
or
-shm mtime

changed.

Record whether they changed.

F.
DVCC persisted data remains unchanged.

G.
no provider process/shell/network action introduced.

Do NOT require -shm to change.
The contract permits it; it does not promise it will.

────────────────────────────────────────
16. Existing Synthetic Smoke
────────────────────────────────────────

Correct any misleading test label such as:

"Codex fixture is byte-identical (never modified...)"

when it could be interpreted as a general live-WAL
contract.

For ordinary non-WAL fixture checks, byte-identical
assertions may remain factual.

Label them explicitly as:

this synthetic fixture

rather than a general provider invariant.

────────────────────────────────────────
17. Real-data Dogfood — DF-05
────────────────────────────────────────

After unit/synthetic verification passes:

use isolated DVCC_DATA_DIR.

Real providers:
READ ONLY.

Do not inspect transcripts.

Find the already-observed structural case containing an
ASCII character previously missed by the narrow encoder
(e.g. underscore-shaped case).

Do not record the real path.

Confirm:

before-fix shape:
would have been NO_MATCH

new behavior:
historical candidate appears as AMBIGUOUS

never MATCHED.

Report counts/booleans only.

Also confirm:

Claude live exact MATCHED behavior remains unchanged.

────────────────────────────────────────
18. Real-data Observation — DF-06
────────────────────────────────────────

Do not attempt to force a -shm write.

If Codex is running naturally:

one bounded observation window may record:

- DB content hash before/after
- WAL content hash before/after
- -shm content hash/mtime before/after

No provider content is read.

The result is observational only.

Any -shm change permitted by the new contract is not a
failure.

Database or WAL application-data change attributable to
DVCC:
STOP / BLOCKER.

Do not use immutable/nolock/readonly_shm.

────────────────────────────────────────
19. Mutations
────────────────────────────────────────

Required.

M-P4B12-01
restore old narrow Claude encoder
→ underscore/space compatibility test FAIL.

M-P4B12-02
make historical key comparison case-sensitive
→ casing test FAIL.

M-P4B12-03
guess/truncate a key for >200 ordinary encoded path
→ unsupported test FAIL.

M-P4B12-04
encode non-ASCII path instead of unsupported
→ unsupported test FAIL.

M-P4B12-05
promote historical candidate to MATCHED
→ binding safety test FAIL.

M-P4B12-06
suppress unsupported-history warning / render ordinary
No match
→ UI test FAIL.

Restore every mutation byte-identical.

No mutation of SQLite runtime flags is authorized.

────────────────────────────────────────
20. Verification
────────────────────────────────────────

Required:

npm.cmd run typecheck
npm.cmd test

cargo test --lib
cargo check

git diff --check

Confirm executable Rust delta:

NONE

A comment-only Rust diff is permitted.

No:

Cargo change
Tauri capability change
npm dependency change
schema change

────────────────────────────────────────
21. Localization
────────────────────────────────────────

JA + EN in same change.

New unsupported-history wording:
semantic parity required.

No raw provider path/session ID in wording.

Human/provider-entered values:
not translated.

────────────────────────────────────────
22. Privacy
────────────────────────────────────────

No new provider content is read.

Forbidden:

- transcript body
- prompt
- response
- title/name
- credentials
- token
- provider storage paths in UI
- raw localRoot in committed evidence
- real session IDs in committed evidence

Directory NAMES may be inspected structurally during
dogfood, but no identifying value enters repository
artifacts.

────────────────────────────────────────
23. Security / Data Integrity
────────────────────────────────────────

DF-05 fix:
pure comparison/binding logic only.

DF-06:
documentation/verification only.

No weakening of:

SQLITE_OPEN_READONLY
query timeout
MAX+1
metadata bounds
schema gate
fixed column projection

No attempt to eliminate -shm coordination at the cost of
live consistency.

────────────────────────────────────────
24. Run Artifacts
────────────────────────────────────────

Create:

.agent-run/LR-20260930-DVCC-009/

At minimum:

RUN_MANIFEST.md
RUN_STATE.md
TASK_PACKET_SNAPSHOT.md
TASK_QUEUE.md
DECISIONS.md
EVIDENCE.md
QUALITY_DEBT.md

Snapshot before implementation.
Compute SHA-256.
Immutable thereafter.

No real path.
No real session ID.
No transcript/content.
No credentials.

────────────────────────────────────────
25. Acceptance Criteria
────────────────────────────────────────

AC4B12-01
Fresh branch from exact
fda753d147d136f961e5c45d51c32f42cbe28bfc.

AC4B12-02
Official ordinary ASCII Claude naming rule implemented.

AC4B12-03
ASCII non-alphanumeric chars map to "-".

AC4B12-04
Windows historical-key comparison remains
case-insensitive.

AC4B12-05
non-ASCII Project path is explicit unsupported.

AC4B12-06
ordinary encoded key >200 is explicit unsupported.

AC4B12-07
unsupported historical binding is not presented as a
normal conclusive NO_MATCH.

AC4B12-08
live Claude exact matching unaffected.

AC4B12-09
historical evidence never becomes MATCHED from the
directory key alone.

AC4B12-10
DF-06 contract explicitly permits SQLite -shm
coordination updates.

AC4B12-11
README no longer claims all provider files remain
untouched.

AC4B12-12
no SQLite reader runtime behavior changed.

AC4B12-13
no immutable/nolock/readonly_shm adopted.

AC4B12-14
synthetic WAL-mode smoke confirms DB/WAL application data
unchanged.

AC4B12-15
-shm difference does not fail the WAL-mode smoke.

AC4B12-16
historical evidence corrections are append-only errata.

AC4B12-17
PR #8 / Phase 4b-2a README reconciliation complete.

AC4B12-18
JA/EN parity.

AC4B12-19
M-P4B12-01..06 killed and restored byte-identical.

AC4B12-20
real-data Claude structural dogfood confirms previously
missed ASCII naming case becomes AMBIGUOUS.

AC4B12-21
no false MATCHED.

AC4B12-22
no new provider content/privacy exposure.

AC4B12-23
Security / Privacy / Auth / Permission / Data integrity /
Irreversible-data safety PASS.

AC4B12-24
Phase 4b-2b remains unimplemented.

────────────────────────────────────────
26. Phase Gate
────────────────────────────────────────

At completion classify:

DF-05:
CLOSED_PARTIAL_COMPAT / OPEN / BLOCKED

DF-06:
ACCEPTED_AND_DOCUMENTED / OPEN

Phase 4b-1.2:
PASS / FINDINGS / BLOCKED

Phase 4b-2b research:
READY / HOLD

Phase 4b-2b research may become READY only if:

- DF-05 boundary is explicit and tested
- DF-06 contract is reconciled
- no false MATCHED
- no DB/WAL modification attributable to DVCC
- no new privacy/security regression

────────────────────────────────────────
27. Endpoint
────────────────────────────────────────

Proceed through:

implementation
→ unit tests
→ mutation campaign
→ full regression
→ synthetic WAL-mode smoke
→ bounded real-data dogfood
→ evidence convergence
→ commit
→ push

Then STOP for:

Independent FULL Review.

Do NOT create Draft PR until review returns:

READY CANDIDATE
Required Fixes: none

Do NOT Ready.
Do NOT merge.
Do NOT release.
Do NOT Production.
Do NOT write Vault / Notion.
Do NOT begin Phase 4b-2b.
