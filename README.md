# DevVault Control Center — Review Hub

DevVault Control Center (DVCC) is a local-first development control plane that sits on top of
independent project repositories. It does not absorb their code; it keeps track of where each
project and review stands.

**Review Hub v0.1** is the first module: a lightweight Windows desktop app that externalizes the
state of up to ~8 concurrent independent reviews — project, repository, local root, PR,
expected / reviewed HEAD, ChatGPT thread, review state, resource state, previous result and next
action — so a ChatGPT review surface can be closed and any review resumed later, even after
restarting the app.

> Status: Phase 1 (Review Hub v0.1) under review. Not released; no installer is published.

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
  needs your confirmation and keeps the earlier text as `result-r<N>-previous-<ms>.md`.
- **Open GitHub / ChatGPT / project folder** through a validated launcher.
- **Attention-ordered queue** with filter, recovery banners and a readable history (`events.jsonl`).

## Boundaries

- ChatGPT is operated by you. DVCC never logs in, sends messages, reads pages or scrapes
  conversations; it stores only the thread title / URL, the request you copy and the result you paste.
- No paid API (OpenAI / Anthropic) is used or required. No network calls besides opening URLs in your browser.
- The clipboard is **write-only** for DVCC (copy prompt). Results are pasted manually.
- URLs open only if they are `https` on `github.com`, `chatgpt.com` or `chat.openai.com`
  (checked by URL parsing). Folders open only if they are existing absolute local directories on
  a local drive whose final target — after resolving symbolic links, junctions and mapped drives —
  is also local; UNC / network locations are never opened. No shell commands are executed.
- The app runs with normal user privileges (no administrator manifest).
- Only one DVCC process runs at a time; starting it again focuses the running window.
- Out of scope for v0.1: Git / GitHub freshness detection, GitHub API, Claude Code / Codex session
  discovery, terminal embedding, Notion / Vault sync, SQLite, REST / MCP, authentication,
  installers and releases.

## Data location

Runtime data never lives in this repository.

| Build | Data folder |
|---|---|
| Release build | `%APPDATA%\DevVault-Control\` |
| Debug build (`npm run tauri dev`) | `%APPDATA%\DevVault-Control-dev\` |
| Override (tests, smoke, experiments) | `DVCC_DATA_DIR` (absolute path) |

The format is plain JSON / Markdown so you (or an IDE agent) can inspect it directly. Writes are
atomic with a `.bak` of the previous valid JSON and are refused (nothing overwritten) if another
program changed the file since DVCC loaded it. Unreadable files are never overwritten and are only
renamed aside (`.corrupt-<ms>`), never deleted; a missing file with a valid backup is restored from
the backup. Access errors (permissions, locks) are reported without offering to discard anything.
See [docs/data-contract-v1.md](docs/data-contract-v1.md).

## Development

Prerequisites (Windows): Node.js 22+ with npm, Rust stable (MSVC toolchain), Microsoft Edge WebView2 Runtime.

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

# Evidence that a second process is refused (uses an isolated data folder)
.\scripts\verify-single-instance.ps1 -Exe .\src-tauri\target\release\devvault-control-center.exe -DataDir D:\scratch\dvcc-si-data

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
  components/   Dialog, banner / toast, state badges
  features/     projects/ and reviews/ UI
  domain/       Pure domain: states, limits, project, review rounds, transitions, schema v1, prompt, queue
  services/     Storage port, tracked (conflict-checked) storage, persistence + recovery, use cases,
                ReviewHub (serialized operations), launcher, clipboard
  test/         In-memory / delayed storage, independent transition contract, fixture hygiene test
src-tauri/
  src/storage.rs   Data-root resolution, serialized atomic storage with preconditions, backups,
                   append-only events, recovery restore, quarantine
  src/launcher.rs  Validated URL / folder launcher (opener plugin; local final targets only)
  capabilities/    core:default + clipboard write only
contract/       Shared limits (limits.json) used by TypeScript and Rust
scripts/        Reproducible verification (single instance)
docs/           Data contract
fixtures/v1/    Synthetic fixtures only (Project Alpha / Beta / Gamma, example-org URLs)
.agent-run/     Long-run development campaign artifacts (task packet, state, evidence)
```

Fixtures must stay synthetic: no real repository URLs, ChatGPT thread URLs, local user paths or
secrets (enforced by `src/test/fixtureHygiene.test.ts`).
