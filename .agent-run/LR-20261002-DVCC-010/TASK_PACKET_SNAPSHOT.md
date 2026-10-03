# Task Packet Snapshot — LRP-20261002-DVCC-010

Verbatim copy of the Task Packet as received. Captured BEFORE any implementation edit. Immutable
after its SHA-256 was recorded in RUN_MANIFEST.md.

---

# DevVault Control Center — Phase 4b-2b
# Actual Resume Launcher v0.4b2b
# Implementation Task Packet

Repository:
airesearchagl-art/DevVault-Control-Center

Run ID:
LR-20261002-DVCC-010

Task Packet:
LRP-20261002-DVCC-010

Expected base:
main @ a54a77e12d2b144027d4dec96c1f14236f3715fd

Branch:
feat/session-resume-launcher-v0.4b2b

Mode:
SECURITY-SENSITIVE FOCUSED IMPLEMENTATION

ENDURANCE:
NOT AUTHORIZED

Endpoint:
Independent FULL Review candidate.

Draft PR:
ONLY after Independent Review returns READY CANDIDATE
with Required Fixes: none
AND the later real-launch Human Gate has been resolved.

Ready / merge / release / Production:
PROHIBITED until later Human Gate.

────────────────────────────────────────
1. Fresh Gate
────────────────────────────────────────

IMPORTANT:
Task Packet snapshot MUST be created before the first
implementation edit.

git fetch origin
git switch main
git pull --ff-only

Required:

HEAD =
a54a77e12d2b144027d4dec96c1f14236f3715fd

origin/main =
same exact SHA

working tree =
clean

PR #9 =
MERGED

Open PRs =
none

feat/session-resume-launcher-v0.4b2b =
must not already exist

Any mismatch:
STOP.

Create:

.agent-run/LR-20261002-DVCC-010/
TASK_PACKET_SNAPSHOT.md

from this packet verbatim.

Compute SHA-256.

Only AFTER snapshot/hash:
create branch and begin implementation.

────────────────────────────────────────
2. Current Safety Baseline
────────────────────────────────────────

Already merged:

Phase 4b-1.x:
session discovery / binding

Phase 4b-2a:
copy-only Resume Handoff

Standing eligibility:

- provider CODEX
- current discovery not stale
- MATCHED to selected Project
- archived === false
- strict full lowercase UUID
- full sessionId only
- display label is presentation only

Do not weaken any of these.

Claude Resume:
OUT OF SCOPE.

────────────────────────────────────────
3. Human Decisions
────────────────────────────────────────

HD-4B2B-01 — Launch mechanism

ADOPT:

Dedicated Rust native launcher.

Direct native executable.

CREATE_NEW_CONSOLE.

NO:

cmd.exe
PowerShell
pwsh
bash
Windows Terminal launcher
shell plugin
generic process API exposed to frontend
PTY / ConPTY

────────────────────────────────────────
4. HD-4B2B-02 — Executable Trust
────────────────────────────────────────

Do NOT launch:

codex
codex.cmd
codex.ps1
PATH-resolved shim

Do NOT invoke:

where.exe
npm
node
shell lookup

for the launch itself.

The Human explicitly configures one absolute native
`codex.exe` path.

Persist it locally as an optional settings value.

Native launch boundary MUST independently validate it at
every launch.

Requirements:

- absolute Windows drive path
- existing regular file
- basename exactly codex.exe, case-insensitive
- extension .exe
- final resolved target is local
- UNC rejected
- mapped network drive rejected
- device/volume path rejected
- symlink/junction resolving to network rejected
- PE executable
- PE subsystem = CONSOLE

Do NOT accept:

.cmd
.ps1
.bat
.com
extensionless shim
directory
network file

Human-configured absolute path is the MVP trust root.

Authenticode verification is NOT required for v0.4b2b MVP.
Record signature verification as optional hardening debt.

Do not infer a vendored executable from a .cmd shim in this
run.

────────────────────────────────────────
5. Settings Contract
────────────────────────────────────────

Extend the existing local settings model with:

codexExecutablePath?: string | null

This is local-machine configuration only.

Keep settings schema backward compatible.

Existing v1 files containing only locale must remain valid.

Missing codexExecutablePath:
normal / not configured.

Locale changes MUST preserve codexExecutablePath.

Saving/changing the Codex path MUST preserve locale.

Existing protections remain:

- unreadable settings are not overwritten
- invalid/unsupported settings are not overwritten
- write preconditions / conflict refusal remain

Add tests for:

- legacy locale-only file
- locale + codex path
- locale save preserves codex path
- codex path save preserves locale
- invalid settings remain untouched
- write conflict fails closed

Do not place this path in:
projects.json
review session
events
run evidence

────────────────────────────────────────
6. Codex Executable Configuration UI
────────────────────────────────────────

Add a small Human configuration surface.

No file-picker dependency is required.

Minimum:

Codex executable
[ absolute-path input ]

[ Validate and save ]

State:

Not configured
Configured / valid
Invalid

Do not auto-detect in this MVP.

Do not automatically modify the setting.

The full path may be visible only in this dedicated
Human-edit configuration surface.

Do NOT show it:

- in IDE Sessions rows
- confirmation dialog
- toast
- event
- evidence
- Resume command preview

JA + EN required.

────────────────────────────────────────
7. Native Executable Validator
────────────────────────────────────────

Implement a narrow Rust validator.

Prefer reuse/refactor of existing local path/network/link
security helpers in launcher.rs.

Do not duplicate a weaker path policy.

Suggested:

validate_local_executable(raw)
→ canonical local PathBuf

Then validate:

- file
- codex.exe name
- PE CONSOLE subsystem

No shell execution is used to validate.

No provider invocation is required to validate.

Do NOT run `<exe> --version` automatically in MVP.

────────────────────────────────────────
8. Native Resume Command
────────────────────────────────────────

Add exactly one semantic native action.

Suggested:

launch_codex_resume(
  executable_path,
  session_id,
  project_root
)

Exact shape implementation-owned.

It MUST NOT accept:

- arbitrary argument array
- arbitrary command
- shell string
- extra provider args
- environment assignments

Native side MUST reconstruct the command itself:

arg 1:
literal "resume"

arg 2:
validated UUID

No other argument.

────────────────────────────────────────
9. Native Session ID Validation
────────────────────────────────────────

Frontend validation is not sufficient.

Rust must revalidate session_id independently.

Accept only the same lowercase UUID contract as Phase
4b-2a.

No trim.
No lowercase normalization.
No session name.
No flag.
No arbitrary string.

Failure:
INVALID_SESSION_ID

────────────────────────────────────────
10. Native Session Recheck
────────────────────────────────────────

Immediately before process creation, read Codex metadata
again.

Use provider DB READ ONLY.

Fixed SQL.
Bound parameter.

Read only approved metadata needed for launch recheck:

id
cwd
archived

No content columns.

Confirm:

session ID exists
archived == false

Failures:

SESSION_NOT_FOUND
ARCHIVED

Do NOT unarchive.

Do NOT modify provider data.

Existing live-WAL/-shm contract remains applicable.

────────────────────────────────────────
11. Project Root Validation
────────────────────────────────────────

At confirmation time, then again at native launch boundary:

Project.localRoot must exist.

Native side must run the existing hardened local-folder
validation again.

Reuse:

validate_project_folder

or the exact shared boundary extracted from it.

Reject:

null
missing
relative
UNC
device
mapped network drive
link/junction to network
non-directory

Errors:

NO_LOCAL_ROOT
UNSAFE_PROJECT_ROOT

Canonical final root is used ONLY as:

child current_dir

Never as a command-line argument.

────────────────────────────────────────
12. HD-4B2B-07 — cwd Policy
────────────────────────────────────────

Use Codex thread cwd only as launch-safety metadata.

If thread cwd:

A.
is a normal non-Codex-managed local workspace path
AND canonicalizes safely

then compare against canonical Project.localRoot.

If clearly different:

CWD_MISMATCH
→ BLOCK launch.

B.
is under Codex-managed mirror storage
OR cannot safely establish an authoritative external
workspace identity

do NOT use it as current_dir.

Allow launch using canonical Project.localRoot,
but confirmation UI MUST say:

"Codex may ask which workspace to use."

Equivalent JA required.

No provider internal path is displayed.

────────────────────────────────────────
13. Project / Binding Recheck
────────────────────────────────────────

At button click and confirmation:

re-evaluate frontend state:

- same selected Project
- discovery loaded
- fingerprint not stale
- session still MATCHED to selected Project
- provider CODEX
- archived false
- full UUID valid

Do not trust the previously rendered enabled state.

At native boundary:

re-check the independent native facts defined above.

Frontend MATCHED semantics remain in TS.
Do not duplicate the full Project registry binding engine
in Rust.

────────────────────────────────────────
14. Already-open Session
────────────────────────────────────────

There is no reliable supported active-session signal.

Do not pretend to detect one.

HD-4B2B-03:

ALLOW_WITH_EXPLICIT_WARNING.

Confirmation dialog includes:

"DVCC cannot determine whether this Codex session is
already open. Opening the same session in more than one
client may cause conflicts."

JA semantic equivalent required.

Add an explicit acknowledgement checkbox:

"I understand and want to open a new Codex process."

Confirm button remains disabled until checked.

Do not persist this acknowledgement.

────────────────────────────────────────
15. Two-step Human Confirmation
────────────────────────────────────────

HD-4B2B-04:
REQUIRED.

Flow:

eligible row
→ Resume in Codex
→ confirmation dialog
→ Human acknowledgement
→ Resume in Codex confirm
→ launch

Dialog shows only:

Provider:
Codex

Project:
displayName

Session:
collision-safe abbreviated label

Action:
Open a new Codex process for this session

Warnings:
- already-open uncertainty
- workspace confirmation warning when applicable
- DVCC only knows whether process creation succeeds

Do NOT show:

full local path
configured executable path
full session UUID
provider storage path
repository URL

No auto-launch from:

startup
Refresh
row selection
language change
Project selection
session discovery

────────────────────────────────────────
16. Process Creation
────────────────────────────────────────

Windows only.

Use direct std/native process API.

Required:

Command::new(validated_executable)
.arg("resume")
.arg(validated_session_id)
.current_dir(canonical_project_root)
.creation_flags(CREATE_NEW_CONSOLE)

No shell.

No generic launcher.

No command string concatenation.

Do NOT use:

CREATE_NO_WINDOW
DETACHED_PROCESS
cmd /C
powershell
wt.exe

────────────────────────────────────────
17. Interactive Console Safety
────────────────────────────────────────

Before spawning, check the DVCC process std handles.

For release GUI launch, expected:
no inherited console std handles.

If usable/inherited stdin/stdout/stderr handles would cause
the child to inherit DVCC/debug/redirection handles:

fail closed:

INTERACTIVE_CONSOLE_UNAVAILABLE

Do not pipe:

stdin
stdout
stderr

DVCC must not receive provider output.

If the Rust implementation requires explicit Win32
STARTUPINFO/CreateProcessW to guarantee this boundary,
STOP and report before expanding FFI scope beyond the
approved design.

Prefer Rust Command + CREATE_NEW_CONSOLE if the tests
confirm it behaves correctly.

────────────────────────────────────────
18. Child Lifetime
────────────────────────────────────────

Fire-and-forget.

After successful spawn:

drop Child handle.

DVCC does not:

- monitor stdout
- parse output
- wait for conversation
- auto-restart
- attach
- kill
- suspend
- track completion

A launched provider process is no longer DVCC-owned
workflow state.

Check `IsProcessInJob` during smoke.

If DVCC is inside a Job that implies child termination on
parent exit:
BLOCK and report.

────────────────────────────────────────
19. Launch Result Semantics
────────────────────────────────────────

Success means ONLY:

Windows process creation succeeded.

It does NOT mean:

Codex opened successfully
session resumed successfully
provider accepted the ID
workspace choice succeeded

Success toast semantic:

"Codex process started. Confirm the resume result in
Codex."

JA equivalent required.

No misleading:
"Session resumed successfully."

────────────────────────────────────────
20. Persistence / Event
────────────────────────────────────────

HD-4B2B-05:
TOAST ONLY.

No:

resume event
last-launched session
launch history
new Review State
resource-state mutation
Project mutation

The only new persisted value is:

configured codexExecutablePath

────────────────────────────────────────
21. Tauri Authority
────────────────────────────────────────

Expose only the dedicated semantic command.

Do NOT add:

shell plugin
shell:allow-execute
generic spawn
generic executable/args command

Register only the dedicated launcher command in the invoke
handler.

If the current Tauri custom-command permission mechanism
can restrict this command to the `main` window without
adding broad authority, do so.

If that requires unrelated architectural expansion:
record it for review rather than adding a generic
capability.

The semantic narrowness of the Rust command is mandatory.

────────────────────────────────────────
22. Error Taxonomy
────────────────────────────────────────

Implement stable errors at minimum:

STALE_DISCOVERY
NOT_MATCHED
ARCHIVED
INVALID_SESSION_ID

NO_LOCAL_ROOT
UNSAFE_PROJECT_ROOT

CODEX_EXECUTABLE_NOT_CONFIGURED
CODEX_EXECUTABLE_UNTRUSTED
UNSUPPORTED_CODEX_LAUNCHER

SESSION_NOT_FOUND

CWD_MISMATCH
INTERACTIVE_CONSOLE_UNAVAILABLE

PROCESS_LAUNCH_FAILED

Do not represent provider-side post-spawn failure as a
DVCC success/failure code because DVCC does not observe it.

────────────────────────────────────────
23. Native Tests
────────────────────────────────────────

Do NOT launch real Codex.

Create a synthetic local console `.exe` fixture for tests.

Fixture behavior:

- records argv
- records cwd
- optionally records process/console facts
- exits
- contains no provider behavior

Tests prove:

argv exactly:
["resume", "<FULL UUID>"]

cwd:
exact canonical synthetic Project root

No additional args.

No shell parent/intermediate process.

Reject:

invalid UUID
missing session
archived session
missing root
UNC root
network/mapped root where testable
unsafe link target
.cmd
.ps1
extensionless file
directory
non-console PE
wrong basename

Provider DB fixture:
synthetic only.

No content columns.

────────────────────────────────────────
24. Test Fixture Authority
────────────────────────────────────────

Do not create a release-runtime environment-variable
escape hatch capable of launching arbitrary test exe.

Test substitution must be compile/test scoped.

Prefer:

cfg(test)
trait/injected internal launcher
or an explicitly smoke-only build feature

Any smoke-only feature must:

- be absent from normal release
- be impossible to activate from user/runtime input
- be documented in evidence

If this cannot be done cleanly:
STOP.

────────────────────────────────────────
25. Settings Tests
────────────────────────────────────────

Required:

legacy locale-only settings load

settings with codexExecutablePath load

missing path = normal unconfigured state

locale save preserves path

path save preserves locale

invalid settings untouched

unreadable settings untouched

conflicting write refused

no Project/review/event mutation

No user path in committed fixture:
use synthetic paths only.

────────────────────────────────────────
26. Frontend Tests
────────────────────────────────────────

Cover:

- eligible Codex row gets Resume in Codex
- copy-only action remains available independently
- ineligible rows do not get launch
- stale refuses
- archived refuses
- invalid ID refuses
- Claude refuses
- no localRoot refuses
- executable not configured refuses
- confirmation required
- acknowledgement checkbox required
- label shown / full ID not shown
- already-open warning
- workspace-warning conditional behavior
- click-time revalidation
- process-start toast wording
- launch error wording
- JA/EN parity

No path shown in confirmation.

────────────────────────────────────────
27. Mutation Campaign
────────────────────────────────────────

Required.

At minimum:

M-P4B2B-01
bypass UUID validation
→ FAIL

M-P4B2B-02
use one shell command string
→ FAIL

M-P4B2B-03
allow .cmd
→ FAIL

M-P4B2B-04
remove CREATE_NEW_CONSOLE
→ FAIL

M-P4B2B-05
omit current_dir
→ FAIL

M-P4B2B-06
skip archived native recheck
→ FAIL

M-P4B2B-07
skip session-exists native recheck
→ FAIL

M-P4B2B-08
skip Project folder revalidation
→ FAIL

M-P4B2B-09
ignore stale at confirmation
→ FAIL

M-P4B2B-10
bypass Human confirmation
→ FAIL

M-P4B2B-11
remove already-open acknowledgement
→ FAIL

M-P4B2B-12
pipe stdout/stderr into DVCC
→ FAIL

M-P4B2B-13
permit clearly authoritative cwd mismatch
→ FAIL

Restore every mutation byte-identical.

────────────────────────────────────────
28. Running-App Smoke
────────────────────────────────────────

SYNTHETIC ONLY.

No real Codex process.

Hidden isolated desktop.

Isolated DVCC_DATA_DIR.

Synthetic:

- Project
- Codex DB
- console executable fixture
- settings

JA + EN.

Human flow:

Refresh IDE Sessions
→ eligible row
→ Resume in Codex
→ confirmation dialog
→ acknowledgement
→ confirm

Verify:

fixture receives:

argv:
resume
FULL UUID

cwd:
canonical Project root

visible session label:
abbreviated

dialog:
no full UUID
no root path
no executable path

process lineage contains NO:

cmd.exe
powershell.exe
pwsh.exe
bash.exe
wt.exe

No provider executable.

No stdout captured.

No persistence/event beyond the intentional executable
configuration setting.

No Review/Project mutation.

Operator clipboard untouched.

`IsProcessInJob` / child survival assumptions recorded.

────────────────────────────────────────
29. cwd Smoke Cases
────────────────────────────────────────

A.
thread cwd canonical real workspace == Project.localRoot

→ launch allowed

B.
thread cwd canonical real workspace differs

→ CWD_MISMATCH
→ no process

C.
thread cwd is Codex-managed mirror

→ launch allowed from Project.localRoot
→ confirmation contains workspace-choice warning
→ no provider internal path displayed

────────────────────────────────────────
30. Real Provider Gate
────────────────────────────────────────

HD-4B2B-06:

Automated verification:
SYNTHETIC ONLY.

Do NOT launch real Codex during this implementation run.

After:

implementation PASS
+ synthetic smoke PASS
+ Independent FULL Review READY CANDIDATE

STOP for a distinct:

REAL_CODEX_LAUNCH_DOGFOOD_GATE

At that later gate Human may:

A.
authorize exactly one real Codex resume launch

or

B.
explicitly waive real-launch dogfood and proceed based on
synthetic/native evidence

Do not infer authorization.

Do not create Draft PR before this gate is resolved.

────────────────────────────────────────
31. Real Launch Gate Design
────────────────────────────────────────

If later authorized:

- exactly one Human-selected session
- MATCHED
- non-archived
- known Project
- Human confirms already-open warning
- no prompt/message automatically sent after resume
- no provider output captured
- observe process creation / console only
- Human visually confirms whether Codex resumed

Any provider-side state change caused by Codex itself is
expected provider behavior and must be reported, not
interpreted as a DVCC write.

No second attempt without new Human authorization if the
first behaves unexpectedly.

────────────────────────────────────────
32. README / Documentation
────────────────────────────────────────

README status during branch:

Phase 4b-1.2:
merged via PR #9

Phase 4b-2a:
merged via PR #8

Phase 4b-2b:
under development

Explicit boundary:

- Resume in Codex launches one native Codex process only
  after Human confirmation
- no shell
- no provider output capture
- copy-only action remains available
- provider resume success is not observed by DVCC

Do not claim released.

Documentation Sync Trigger:
YES

Standing Authorization:
NO

Do NOT write Vault / Notion.

────────────────────────────────────────
33. Run Artifacts
────────────────────────────────────────

Create before implementation:

.agent-run/LR-20261002-DVCC-010/

RUN_MANIFEST.md
RUN_STATE.md
TASK_PACKET_SNAPSHOT.md
TASK_QUEUE.md
DECISIONS.md
EVIDENCE.md
QUALITY_DEBT.md

CRITICAL:
TASK_PACKET_SNAPSHOT.md + SHA-256 FIRST.

Only then implementation.

No real path.
No real session ID.
No executable absolute path in committed evidence.
No provider content.

────────────────────────────────────────
34. Hard Checks
────────────────────────────────────────

Security:
PASS required

Privacy:
PASS required

Auth:
PASS required

Permission:
PASS required

Data integrity:
PASS required

Irreversible-data safety:
PASS required

No generic shell capability.

No arbitrary executable launcher.

No provider output capture.

No real provider launch before separate Human Gate.

────────────────────────────────────────
35. Acceptance Criteria
────────────────────────────────────────

AC4B2B-01
Task Packet snapshot before implementation.

AC4B2B-02
branch from exact main a54a77e...

AC4B2B-03
Codex executable explicitly configured by Human.

AC4B2B-04
only native local codex.exe accepted.

AC4B2B-05
.cmd/.ps1/shim rejected.

AC4B2B-06
frontend + native full UUID validation.

AC4B2B-07
native existence + archived recheck.

AC4B2B-08
Project root freshly native-validated.

AC4B2B-09
root used only as current_dir.

AC4B2B-10
direct process argument array.

AC4B2B-11
CREATE_NEW_CONSOLE.

AC4B2B-12
no shell/intermediate terminal launcher.

AC4B2B-13
no stdout/stderr/provider output capture.

AC4B2B-14
fire-and-forget child.

AC4B2B-15
stale/MATCHED eligibility rechecked at confirmation.

AC4B2B-16
two-step Human confirmation.

AC4B2B-17
already-open uncertainty acknowledgement required.

AC4B2B-18
authoritative cwd mismatch blocked.

AC4B2B-19
managed-mirror cwd allowed with warning.

AC4B2B-20
no path/full ID/exe path in confirmation UI.

AC4B2B-21
success means process started only.

AC4B2B-22
toast only; no launch event/state.

AC4B2B-23
settings backward compatibility preserved.

AC4B2B-24
JA/EN parity.

AC4B2B-25
M-P4B2B-01..13 killed / byte-identical restore.

AC4B2B-26
native synthetic tests PASS.

AC4B2B-27
running-app synthetic smoke PASS.

AC4B2B-28
real Codex NOT launched during implementation run.

AC4B2B-29
copy-only 4b-2a remains functional.

AC4B2B-30
Claude launcher remains absent.

AC4B2B-31
Security / Privacy / Data integrity hard checks PASS.

────────────────────────────────────────
36. Endpoint
────────────────────────────────────────

Proceed through:

implementation
→ unit/native tests
→ mutation campaign
→ full regression
→ synthetic running-app smoke
→ evidence convergence
→ commit
→ push

Then STOP for:

Independent FULL Review.

Do NOT:

create Draft PR
Ready
merge
release
Production
Vault write
Notion write
real Codex launch

until the subsequent gates authorize them.

Final report must include:

Exact head
changed files
settings change
native authority delta
tests
mutations
smoke
process lineage
cwd cases
unverified items
REAL_CODEX_LAUNCH_DOGFOOD_GATE:
PENDING

STOP.
