# DevVault Control Center — Review Hub

DevVault Control Center (DVCC) is a local-first development control plane that sits on top of
independent project repositories. It does not absorb their code; it keeps track of where each
project and review stands.

**Review Hub v0.1** is the first module: a lightweight Windows desktop app that externalizes the
state of up to ~8 concurrent independent reviews — project, repository, local root, PR,
expected / reviewed HEAD, ChatGPT thread, review state, resource state, previous result and next
action — so a ChatGPT review surface can be closed and any review resumed later, even after
restarting the app.

> Status: Phase 1 (Review Hub v0.1), Phase 2 (Evidence / Freshness v0.2) and the Localization
> Foundation (v0.2.1) are merged. Phase 3 (Review Workflow v0.3) is under development on
> `feat/review-workflow-v0.3`; no pull request has been opened for it yet, and it has not been
> verified in the running app. Not released; no installer is published.

## What it does

- **Project registry** — display name, stable project ID, GitHub repository URL, local root,
  development IDE label, project next action, notes.
- **Review sessions and rounds** — PR number, review type, per-round expected / reviewed HEAD
  (values you record; nothing is fetched from Git or GitHub), ChatGPT thread title / URL, next action.
- **Two independent state axes**
  - Resource state: `HOT` (working now) / `WARM` (resume soon, UI can be closed) / `COLD` (paused).
  - Review state: `NEW` → `READY_FOR_REVIEW` → `REVIEWING` → `FIX_REQUIRED` / `REVIEW_PASS` / `BLOCKED`,
    plus `SUSPENDED` and `CLOSED`. `WARM` + `FIX_REQUIRED` is a normal combination.
- **Suspend / Resume** — Suspend saves a checkpoint note, remembers the current review state and
  lets you choose `WARM` or `COLD`. Resume restores the review state and sets the resource to `HOT`.
- **Copy review prompt** — generates the round's review request, saves it as `request-r<N>.md`
  and copies it to the clipboard.
- **Capture result** — you paste the reviewer's answer (Ctrl+V); it is saved as `result-r<N>.md`.
  The review state changes only when you explicitly confirm a verdict. Replacing a saved result
  needs your confirmation and keeps the earlier text as `result-r<N>-previous-<ms>.md`
  (`-<n>` is added if that name is taken, so an interrupted capture can simply be retried).
- **Git evidence and Freshness** (Phase 2) — on request, DVCC reads the current local Git state of
  a project (branch, current HEAD, whether the working tree has uncommitted changes) and compares it
  with the HEADs you recorded. The result is shown as a separate Freshness axis:
  `ALIGNED` / `HEAD_CHANGED` (the expected HEAD is no longer current) / `REVIEW_STALE` (the reviewed
  HEAD is no longer current) / `WORKTREE_DIRTY` / `UNKNOWN`, always with one sentence saying why.
  Freshness never changes a review state, and the observed facts are never written to disk: they are
  read again only when you press **Refresh Git state** (one project) or **Refresh Git (all)**.
- **Review Workflow** (Phase 3, under development — not yet verified in the running app) — the
  canonical Fresh-Context review protocol, walked by the Human:
  - *Turn 1 / Turn 2.* **Copy review prompt** writes Turn 1 (`Stage 1 — Review Target`: Artifact,
    Contract and Material Facts; `Stage 2 — Fresh Assessment`). It never carries the implementation
    narrative (background, decisions taken, implementation history); known risks, failing tests,
    security and destructive-operation constraints, scope exclusions, unresolved issues and Human
    Gate items are asked for from the start. Once the Fresh Assessment is captured, **Copy Turn 2**
    opens a dialog for the implementation narrative (background and purpose, decisions and
    implementation history, trade-offs; each optional and kept exactly as typed), then writes
    `followup-r<N>.md` (`Stage 3 — Resolution Context`, `Stage 4 — Final Judgment`) and copies that
    same text; cancelling writes nothing, and edits made after copying are not part of the record. The
    reviewer's answer is saved as `judgment-r<N>.md` beside — never over — `result-r<N>.md`. A
    verdict waits for the Final Judgment once Turn 2 has gone out.
  - *Exact HEAD.* A Turn 1 request is an exact-head request only when the full 40-character HEAD is
    recorded; otherwise the request says in its own text that it is not one, and the workflow shows
    why and how to record the full HEAD. A locally observed HEAD is shown as a candidate only; DVCC
    never records it for you and never completes a short HEAD.
  - *Risk Tier* 0 / 1 / 2, chosen by the Human per round, with the Tier 2 subjects (security,
    privacy, credentials, production, migration) that make a lower tier refused. It is its own axis,
    independent of Review State, Resource State and Freshness.
  - *Same-head duplicate suppression.* A head that already has a substantive review is flagged, with
    the canonical rule and the two paths that need no permission; a second review goes ahead only
    once the Human records one of the canonical invalidation reasons. Nothing is skipped or closed
    automatically, and "cannot tell" is shown as undecidable, never as "no duplicate".
  - *Evidence reuse*, decided per item and bound to the head: reusable, needs re-checking or
    unavailable, each with its source, head, capture time and reason. DVCC reuses nothing by itself.
  - *Handoff.* A `FIX_REQUIRED` / `BLOCKED` verdict hands on the reviewed head, the response it was
    confirmed against, the Human's note and the next action; a new round shows its relation to the
    previous one. Earlier artifacts are shown by name and never rewritten.
  - *Timeline.* The events of a review read per round.
  - *Freshness in the workflow.* The Phase 2 Freshness is shown in the workflow with its reason, the
    recorded and observed HEADs and when they were observed; an `UNKNOWN` says which kind of unknown
    it is. It stays a derived fact: it never changes the Review State, never starts a round and never
    decides whether evidence is reusable.
  - Every refused workflow control says why, and what to do next, in both languages.
- **Japanese and English** — the interface is Japanese by default; the language selector in the top
  bar switches to English and back at once, without touching any review, project or Git state. The
  choice is remembered in `settings.json` in the data folder and restored at the next start. Both
  languages ship together: a key that exists in one dictionary and not the other does not compile.
  Stored values (review state, resource state, freshness, event type, schema field, file name, error
  code) stay language-neutral, and what you typed is never translated.
- **Open GitHub / ChatGPT / project folder** through a validated launcher.
- **Attention-ordered queue** with filter, recovery banners and a readable history (`events.jsonl`).

## Boundaries

- ChatGPT is operated by you. DVCC never logs in, sends messages, reads pages or scrapes
  conversations; it stores only the thread title / URL, the request you copy and the result you paste.
- No paid API (OpenAI / Anthropic) is used or required. No network calls besides opening URLs in your browser.
- Translation is not automatic: both dictionaries are files in this repository. No translation API,
  no network call and no model is involved in showing the interface in either language.
- The clipboard is **write-only** for DVCC (copy prompt). Results are pasted manually.
- URLs open only if they are `https` on `github.com`, `chatgpt.com` or `chat.openai.com`, without
  credentials or a non-default port (`:443`, the https default, is accepted and dropped; checked by
  URL parsing). Folders open only if they are existing absolute local directories on
  a local drive whose final target — after resolving symbolic links, junctions and mapped drives —
  is also local; UNC / network locations are never opened, and links pointing to them are refused
  before they are followed. No shell commands are executed.
- The app runs with normal user privileges (no administrator manifest).
- One DVCC process per Windows session: processes start one at a time (start-up lock), so a later
  or simultaneous launch hands over to the running instance (its window is focused) and exits
  before creating a window or touching data; the data folder is also locked (`.dvcc.lock`) while
  DVCC runs. A launch that cannot obtain the start-up lock within 15 seconds (for example while
  another launch is stuck handing over to a running instance that stopped responding), or cannot
  create it at all, exits quietly without creating a window or touching data (fail closed, exit
  code 75). Debug and release builds share this identity, so a running debug build also blocks a
  release build.
- Git observation is **read-only and local**: DVCC runs `git rev-parse`, `git symbolic-ref` and
  `git status` in your project folder (no shell, no arguments built from text you typed), with
  `GIT_OPTIONAL_LOCKS=0` so it cannot even write an index refresh. It never fetches, pulls, checks
  out, commits or contacts a remote, and a Git that does not answer is abandoned after 5 seconds,
  leaving the Freshness `UNKNOWN`. The folder is checked by the same boundary as the launcher, and
  the work tree and Git directory Git actually resolves (a `.git` file can point elsewhere) are
  checked again before any fact is used, so a repository on a network location is refused.
- What DVCC cannot control: `git status` reads **your** repository's configuration, so a clean
  filter (`.gitattributes` + `filter.*.clean`) or a file-system monitor configured in that
  repository runs as part of the observation, exactly as it would for any Git command you run
  yourself. DVCC switches the file-system monitor off for its own calls and removes the `GIT_*`
  variables that could redirect Git elsewhere, but it does not otherwise change your configuration.
- Phase 3 adds no network access and no automation: the review surface stays Human-operated, the
  prompts contain no local root, project notes or next action, and nothing the Human typed is
  translated.
- Out of scope for v0.2 / v0.3: GitHub API and any network Git operation, Claude Code / Codex session
  discovery, terminal embedding, Notion / Vault sync, SQLite, REST / MCP, authentication,
  installers and releases.

## Data location

Runtime data never lives in this repository.

| Build | Data folder |
|---|---|
| Release build | `%APPDATA%\DevVault-Control\` |
| Debug build (`npm run tauri dev`) | `%APPDATA%\DevVault-Control-dev\` |
| Override (tests, smoke, experiments) | `DVCC_DATA_DIR` (absolute path) |

The data folder also holds `settings.json` (`{"schemaVersion": 1, "locale": "ja" | "en"}`), written
only when you change the language. A missing file means Japanese; a file that cannot be read or
whose schema version is not 1 also means Japanese, is reported in the interface, and is left exactly
as it is.

The format is plain JSON / Markdown so you (or an IDE agent) can inspect it directly. Writes are
atomic with a `.bak` of the previous valid JSON and are refused (nothing overwritten) if another
program changed the file since DVCC loaded it; the regenerated notes `request-r<N>.md`,
`followup-r<N>.md` (until its Final Judgment is in) and `checkpoint.md` are latest-wins unless DVCC read them in this run. Unreadable files are never
overwritten and are only renamed aside (`.corrupt-<ms>`), never deleted; a missing file with a
valid backup is restored from the backup. Access errors (permissions, locks) are reported without offering to discard anything.
See [docs/data-contract-v1.md](docs/data-contract-v1.md).

## Development

Prerequisites (Windows): Node.js 22+ with npm, Rust stable (MSVC toolchain), Microsoft Edge WebView2 Runtime.
Git 2.36 or newer is needed for the Phase 2 Git evidence (DVCC passes `-c core.fsmonitor=false`, which
older versions treat as a hook path); without Git the Freshness simply stays `UNKNOWN`.

```powershell
npm ci

# Run the desktop app in development (uses %APPDATA%\DevVault-Control-dev unless DVCC_DATA_DIR is set)
npm run tauri dev

# Checks
npm run typecheck        # TypeScript
npm test                 # Vitest (domain, persistence, app state, fixture hygiene)
npm run build            # tsc + Vite production build
cd src-tauri; cargo check; cargo test; cd ..

# Release compile without an installer
npm run tauri build -- --no-bundle

# Evidence that a second process is refused, including simultaneous starts (isolated data folder)
.\scripts\verify-single-instance.ps1 -Exe .\src-tauri\target\release\devvault-control-center.exe -DataDir D:\scratch\dvcc-si-data
# Only the fail-closed start-up gate (held / uncreatable start-up lock; no window is expected)
.\scripts\verify-single-instance.ps1 -Exe .\src-tauri\target\release\devvault-control-center.exe -DataDir D:\scratch\dvcc-si-data -FailClosedOnly

# Both languages in the running app: Japanese by default, the switch, the restart and the review
# request in each language (hidden isolated desktop, temporary data folder, clipboard put back)
.\scripts\verify-localization-ui.ps1

# Network-drive launcher boundary (needs a temporary mapping, e.g. net use W: \\localhost\C$ /persistent:no)
$env:DVCC_TEST_MAPPED_DRIVE_DIR = "W:\Windows"; cd src-tauri; cargo test mapped_network_drive -- --ignored; cd ..
```

To keep experiments away from your real data:

```powershell
$env:DVCC_DATA_DIR = "D:\scratch\dvcc-data"
npm run tauri dev
```

## Repository layout

```text
src/
  app/          App shell, UI state reducer, formatting
  components/   Dialog, banner / toast, state badges, language selector
  features/     projects/ and reviews/ UI
  i18n/         Japanese and English dictionaries, translator, label keys for every stored enum
  domain/       Pure domain: states, limits, project, review rounds, transitions, schema v1, prompt,
                queue, Git observation model, derived Freshness, named messages
  services/     Storage port, tracked (conflict-checked) storage, persistence + recovery, use cases,
                ReviewHub (serialized operations), launcher, clipboard, Git observer, settings
  test/         In-memory / delayed storage, independent transition and Freshness contracts, fixture
                hygiene test
src-tauri/
  src/storage.rs   Data-root resolution, serialized atomic storage with preconditions, backups,
                   append-only events, recovery restore, quarantine
  src/launcher.rs  Validated URL / folder launcher (opener plugin; local final targets only)
  src/git.rs       Read-only local Git observation (bounded, no shell, no network)
  capabilities/    core:default + clipboard write only
contract/       Shared limits (limits.json) used by TypeScript and Rust
scripts/        Reproducible verification (single instance, localization UI smoke)
docs/           Data contract
fixtures/v1/    Synthetic fixtures only (Project Alpha / Beta / Gamma, example-org URLs)
.agent-run/     Long-run development campaign artifacts (task packet, state, evidence)
```

Fixtures must stay synthetic: no real repository URLs, ChatGPT thread URLs, local user paths or
secrets (enforced by `src/test/fixtureHygiene.test.ts`).

### Where words live

User-facing text belongs in `src/i18n/`, never in a component: `ja.ts` defines the key set and
`en.ts` is typed as a complete record of it, so a missing or unknown translation is a compile error.
Text produced outside React — validation, transition guards, service failures, file health, the
Freshness explanations — returns a `Message` (`src/domain/message.ts`): a key plus parameters that
the interface renders. `src/i18n/i18n.test.ts` checks parity, blanks, duplicate keys, identical
placeholders and a label for every stored enum value; `src/i18n/noHardCodedText.test.ts` scans the
rendering directories for text written straight into a component.

Not translated, on purpose: stored enum values and schema fields, file names, error codes, the
messages Git and the storage layer report (shown as detail inside a localized sentence), event notes
already written to `events.jsonl`, and anything the Human typed. A saved `request-r<N>.md` or
`followup-r<N>.md` keeps the language (and the heading layout) it was written in; only a newly
generated one follows the current language and the current prompt contract. The two prompt
languages are checked for semantic parity — the same facts in the same order, the same recorded
values and the same imperative strength — by `src/domain/promptContract.test.ts`.
