//! Read-only observation of a local Git repository (Phase 2 — Evidence / Freshness).
//!
//! The app never changes a repository and never touches the network: only `rev-parse`,
//! `symbolic-ref` and `status` are run, always through `std::process::Command` (no shell, no
//! generic executor), always inside the folder that the Phase 1 local-path boundary
//! ([`crate::launcher::validate_project_folder`], F-9) already accepted and canonicalized. The
//! observed path is passed as the child's working directory, so no caller-supplied text ever
//! reaches a command line.
//!
//! Every failure — no recorded folder, a rejected path, a missing Git, a folder that is not a
//! repository, a timeout, an unexpected error — is reported as a status rather than as an app
//! error, and unknown fields stay `null` instead of being guessed. The derived Freshness in the
//! frontend turns each of those into `UNKNOWN` (fail closed).

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::launcher::validate_project_folder;

/// The Git executable. Resolved through `PATH` by the OS; never invoked through a shell.
pub const GIT_PROGRAM: &str = "git";

/// Upper bound on captured output per Git invocation. `git status` output is only inspected for
/// emptiness, so the rest is drained and discarded (the pipe must keep draining or the child
/// would block on a full buffer).
const MAX_CAPTURED_BYTES: usize = 8 * 1024;

/// Shared limits contract: the same `contract/limits.json` the TypeScript side reads.
const LIMITS_JSON: &str = include_str!("../../contract/limits.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Limits {
    git_observation_timeout_ms: u64,
}

/// Bound for one whole observation (all Git invocations of a single call share it).
pub fn git_observation_timeout() -> Duration {
    static TIMEOUT: std::sync::OnceLock<Duration> = std::sync::OnceLock::new();
    *TIMEOUT.get_or_init(|| {
        let millis = serde_json::from_str::<Limits>(LIMITS_JSON)
            .map(|limits| limits.git_observation_timeout_ms)
            .expect("contract/limits.json must define gitObservationTimeoutMs");
        Duration::from_millis(millis)
    })
}

/// Outcome of an observation. Anything other than `Ok` leaves the facts unknown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GitStatus {
    /// The repository was observed; the fields below are facts.
    Ok,
    /// The project has no recorded local root.
    NoLocalRoot,
    /// The folder exists and is local, but is not inside a Git work tree.
    NotAGitRepository,
    /// No Git executable could be started.
    GitUnavailable,
    /// The observation did not finish within the bound.
    Timeout,
    /// Anything else, including a path the local-folder boundary refused.
    Error,
}

/// Machine-observed Git facts. Mirrored by `GitObservation` in `src/domain/git.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitObservation {
    pub status: GitStatus,
    /// Full 40-character commit SHA, or `null` when it is not known (e.g. a repository without
    /// any commit).
    pub head: Option<String>,
    /// Current branch name, or `null` when detached or unknown.
    pub branch: Option<String>,
    pub detached: Option<bool>,
    /// Whether the working tree has uncommitted changes, including untracked files.
    pub dirty: Option<bool>,
    /// When the observation was taken (ISO-8601 UTC, millisecond precision).
    pub observed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

impl GitObservation {
    fn unknown(status: GitStatus, observed_at: String) -> Self {
        Self {
            status,
            head: None,
            branch: None,
            detached: None,
            dirty: None,
            observed_at,
            error_code: None,
            error_message: None,
        }
    }

    fn failed(
        status: GitStatus,
        observed_at: String,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            error_code: Some(code.into()),
            error_message: Some(message.into()),
            ..Self::unknown(status, observed_at)
        }
    }
}

/// Observes the local repository of a project, read-only. Never fails: the outcome is the status.
#[tauri::command]
pub async fn inspect_git_repository(local_root: Option<String>) -> GitObservation {
    let timeout = git_observation_timeout();
    // Git invocations block; keep them off the async runtime's worker threads.
    tauri::async_runtime::spawn_blocking(move || {
        observe(GIT_PROGRAM, local_root.as_deref(), timeout)
    })
    .await
    .unwrap_or_else(|error| {
        GitObservation::failed(
            GitStatus::Error,
            iso8601_utc(SystemTime::now()),
            "OBSERVATION_FAILED",
            error.to_string(),
        )
    })
}

/// The whole observation, without Tauri: path boundary first, then the Git facts.
pub(crate) fn observe(
    program: &str,
    local_root: Option<&str>,
    timeout: Duration,
) -> GitObservation {
    let observed_at = iso8601_utc(SystemTime::now());
    let raw = match local_root.map(str::trim) {
        Some(value) if !value.is_empty() => value,
        _ => return GitObservation::unknown(GitStatus::NoLocalRoot, observed_at),
    };
    // Reuses the Phase 1 boundary (F-9): UNC, network drives and link targets that leave the
    // local drive are refused here, before any Git process exists.
    let folder = match validate_project_folder(raw) {
        Ok(folder) => folder,
        Err(error) => {
            return GitObservation::failed(
                GitStatus::Error,
                observed_at,
                error.code,
                error.message.clone(),
            )
        }
    };
    observe_repository(program, &folder, timeout, observed_at)
}

fn observe_repository(
    program: &str,
    folder: &Path,
    timeout: Duration,
    observed_at: String,
) -> GitObservation {
    let deadline = Instant::now() + timeout;

    let inside_work_tree = match run_git(
        program,
        folder,
        &["rev-parse", "--is-inside-work-tree"],
        deadline,
    ) {
        GitRun::Completed {
            success, stdout, ..
        } => success && stdout.trim() == "true",
        GitRun::Timeout => return timed_out(observed_at, "rev-parse --is-inside-work-tree"),
        GitRun::Unavailable => {
            return GitObservation::failed(
                GitStatus::GitUnavailable,
                observed_at,
                "GIT_UNAVAILABLE",
                "no Git executable could be started",
            )
        }
        GitRun::Failed(message) => {
            return GitObservation::failed(GitStatus::Error, observed_at, "GIT_FAILED", message)
        }
    };
    if !inside_work_tree {
        return GitObservation::unknown(GitStatus::NotAGitRepository, observed_at);
    }

    // A repository without any commit has no HEAD: that stays `null` instead of being guessed.
    let head = match run_git(
        program,
        folder,
        &["rev-parse", "--verify", "--quiet", "HEAD"],
        deadline,
    ) {
        GitRun::Completed {
            success, stdout, ..
        } => {
            let value = stdout.trim().to_ascii_lowercase();
            (success && is_full_sha(&value)).then_some(value)
        }
        GitRun::Timeout => return timed_out(observed_at, "rev-parse HEAD"),
        GitRun::Unavailable | GitRun::Failed(_) => {
            return GitObservation::failed(
                GitStatus::Error,
                observed_at,
                "GIT_FAILED",
                "reading the current HEAD failed",
            )
        }
    };

    let (branch, detached) = match run_git(
        program,
        folder,
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
        deadline,
    ) {
        GitRun::Completed {
            success, stdout, ..
        } => {
            let name = stdout.trim().to_owned();
            if success && !name.is_empty() {
                (Some(name), Some(false))
            } else {
                (None, Some(true))
            }
        }
        GitRun::Timeout => return timed_out(observed_at, "symbolic-ref HEAD"),
        GitRun::Unavailable | GitRun::Failed(_) => {
            return GitObservation::failed(
                GitStatus::Error,
                observed_at,
                "GIT_FAILED",
                "reading the current branch failed",
            )
        }
    };

    let dirty = match run_git(program, folder, &["status", "--porcelain=v1"], deadline) {
        GitRun::Completed {
            success,
            stdout,
            stderr,
        } => {
            if !success {
                return GitObservation::failed(
                    GitStatus::Error,
                    observed_at,
                    "GIT_FAILED",
                    first_line(&stderr, "reading the working tree state failed"),
                );
            }
            Some(!stdout.trim().is_empty())
        }
        GitRun::Timeout => return timed_out(observed_at, "status --porcelain"),
        GitRun::Unavailable | GitRun::Failed(_) => {
            return GitObservation::failed(
                GitStatus::Error,
                observed_at,
                "GIT_FAILED",
                "reading the working tree state failed",
            )
        }
    };

    GitObservation {
        status: GitStatus::Ok,
        head,
        branch,
        detached,
        dirty,
        observed_at,
        error_code: None,
        error_message: None,
    }
}

fn timed_out(observed_at: String, step: &str) -> GitObservation {
    GitObservation::failed(
        GitStatus::Timeout,
        observed_at,
        "GIT_TIMEOUT",
        format!("`git {step}` did not finish within the observation bound"),
    )
}

fn is_full_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn first_line(text: &str, fallback: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

/// Result of one Git invocation.
enum GitRun {
    Completed {
        success: bool,
        stdout: String,
        stderr: String,
    },
    /// The deadline passed; the child this call started was killed.
    Timeout,
    /// The executable could not be started at all.
    Unavailable,
    Failed(String),
}

/// Runs one read-only Git command in `folder` with a deadline.
///
/// No shell is involved, nothing is inherited from a caller-built command line, and the child is
/// given no stdin. `GIT_OPTIONAL_LOCKS=0` keeps Git from taking `index.lock` (so `status` cannot
/// write a refreshed index) and `GIT_TERMINAL_PROMPT=0` makes sure nothing can ever wait for
/// credentials. Both pipes are drained by their own threads while the parent polls, because a
/// full pipe buffer would otherwise block the child forever.
fn run_git(program: &str, folder: &Path, args: &[&str], deadline: Instant) -> GitRun {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(folder)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        /// CREATE_NO_WINDOW: never flash a console window on the operator's desktop.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return GitRun::Unavailable,
        Err(error) => return GitRun::Failed(error.to_string()),
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_reader = std::thread::spawn(move || read_capped(stdout));
    let stderr_reader = std::thread::spawn(move || read_capped(stderr));

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    // Only the child this call started is terminated — never a kill by name.
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return GitRun::Timeout;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return GitRun::Failed(error.to_string());
            }
        }
    };

    GitRun::Completed {
        success: status.success(),
        stdout: stdout_reader.join().unwrap_or_default(),
        stderr: stderr_reader.join().unwrap_or_default(),
    }
}

/// Drains a pipe completely but keeps at most `MAX_CAPTURED_BYTES`.
fn read_capped(source: Option<impl Read>) -> String {
    let Some(mut source) = source else {
        return String::new();
    };
    let mut kept: Vec<u8> = Vec::new();
    let mut buffer = [0u8; 4096];
    loop {
        match source.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                if kept.len() < MAX_CAPTURED_BYTES {
                    let room = MAX_CAPTURED_BYTES - kept.len();
                    kept.extend_from_slice(&buffer[..read.min(room)]);
                }
            }
        }
    }
    String::from_utf8_lossy(&kept).into_owned()
}

/// ISO-8601 UTC with millisecond precision, e.g. `2026-09-20T01:23:45.678Z`; the shape the
/// TypeScript side validates with `isIsoTimestamp`.
pub(crate) fn iso8601_utc(time: SystemTime) -> String {
    let since_epoch = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    let seconds = since_epoch.as_secs() as i64;
    let millis = since_epoch.subsec_millis();
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let second_of_day = seconds.rem_euclid(86_400);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        second_of_day / 3600,
        (second_of_day % 3600) / 60,
        second_of_day % 60
    )
}

/// Civil date from a day count since 1970-01-01 (Howard Hinnant's `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_position = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_position + 2) / 5 + 1;
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    };
    (
        if month <= 2 { year + 1 } else { year },
        month as u32,
        day as u32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::tests::TempDir;
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::PathBuf;

    const TIMEOUT: Duration = Duration::from_secs(30);

    /// Runs a Git command for the test fixtures with a configuration of its own: the user's global
    /// and system configuration is ignored and nothing is ever written outside the fixture.
    fn git(folder: &Path, args: &[&str]) {
        let mut command = Command::new(GIT_PROGRAM);
        let output = command
            .args(args)
            .current_dir(folder)
            .env("GIT_CONFIG_GLOBAL", folder.join("dvcc-no-global-config"))
            .env("GIT_CONFIG_SYSTEM", folder.join("dvcc-no-system-config"))
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_AUTHOR_NAME", "DVCC-Test")
            .env("GIT_AUTHOR_EMAIL", "dvcc-test@example.invalid")
            .env("GIT_COMMITTER_NAME", "DVCC-Test")
            .env("GIT_COMMITTER_EMAIL", "dvcc-test@example.invalid")
            .output()
            .expect("git must be available for these tests");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// A synthetic repository with one commit on branch `dvcc-test-main`.
    fn repository_with_commit() -> (TempDir, PathBuf) {
        let dir = TempDir::new();
        let root = dir.0.clone();
        fs::create_dir_all(&root).unwrap();
        git(&root, &["init", "--initial-branch=dvcc-test-main"]);
        fs::write(root.join("tracked.txt"), "first\n").unwrap();
        git(&root, &["add", "tracked.txt"]);
        git(&root, &["commit", "--no-gpg-sign", "-m", "initial"]);
        (dir, root)
    }

    fn observed(root: &Path) -> GitObservation {
        observe(GIT_PROGRAM, Some(&root.to_string_lossy()), TIMEOUT)
    }

    #[test]
    fn observes_a_clean_repository() {
        let (_dir, root) = repository_with_commit();
        let observation = observed(&root);
        assert_eq!(observation.status, GitStatus::Ok);
        let head = observation.head.expect("a committed repository has a HEAD");
        assert!(is_full_sha(&head), "full 40-character SHA, got {head:?}");
        assert_eq!(observation.branch.as_deref(), Some("dvcc-test-main"));
        assert_eq!(observation.detached, Some(false));
        assert_eq!(observation.dirty, Some(false));
        assert!(observation.observed_at.ends_with('Z'));
        assert_eq!(observation.error_code, None);
    }

    #[test]
    fn a_modified_tracked_file_makes_the_working_tree_dirty() {
        let (_dir, root) = repository_with_commit();
        fs::write(root.join("tracked.txt"), "changed\n").unwrap();
        let observation = observed(&root);
        assert_eq!(observation.status, GitStatus::Ok);
        assert_eq!(observation.dirty, Some(true));
    }

    #[test]
    fn an_untracked_file_makes_the_working_tree_dirty() {
        let (_dir, root) = repository_with_commit();
        fs::write(root.join("untracked.txt"), "new\n").unwrap();
        let observation = observed(&root);
        assert_eq!(observation.status, GitStatus::Ok);
        assert_eq!(observation.dirty, Some(true));
    }

    #[test]
    fn a_detached_head_is_reported_without_a_branch() {
        let (_dir, root) = repository_with_commit();
        let before = observed(&root);
        let head = before.head.clone().unwrap();
        git(&root, &["checkout", "--detach", "HEAD"]);
        let observation = observed(&root);
        assert_eq!(observation.status, GitStatus::Ok);
        assert_eq!(observation.detached, Some(true));
        assert_eq!(observation.branch, None);
        assert_eq!(observation.head, Some(head));
    }

    #[test]
    fn a_folder_without_a_repository_is_not_a_git_repository() {
        let dir = TempDir::new();
        fs::create_dir_all(&dir.0).unwrap();
        let observation = observed(&dir.0);
        assert_eq!(observation.status, GitStatus::NotAGitRepository);
        assert_eq!(observation.head, None);
        assert_eq!(observation.branch, None);
        assert_eq!(observation.detached, None);
        assert_eq!(observation.dirty, None);
    }

    #[test]
    fn a_missing_local_root_is_reported_without_running_git() {
        for value in [None, Some(""), Some("   ")] {
            let observation = observe(GIT_PROGRAM, value, TIMEOUT);
            assert_eq!(observation.status, GitStatus::NoLocalRoot, "{value:?}");
            assert_eq!(observation.head, None);
            assert_eq!(observation.error_code, None);
        }
    }

    #[test]
    fn the_local_folder_boundary_refuses_network_and_invalid_paths() {
        for (raw, code) in [
            (r"\\server\share\project", "FOLDER_REJECTED"),
            (r"//server/share/project", "FOLDER_REJECTED"),
            ("relative\\folder", "FOLDER_REJECTED"),
        ] {
            let observation = observe(GIT_PROGRAM, Some(raw), TIMEOUT);
            assert_eq!(observation.status, GitStatus::Error, "{raw:?}");
            assert_eq!(observation.error_code.as_deref(), Some(code), "{raw:?}");
            assert_eq!(observation.head, None);
            assert_eq!(observation.dirty, None);
        }
    }

    #[test]
    fn a_missing_git_executable_fails_closed() {
        let (_dir, root) = repository_with_commit();
        let observation = observe(
            "dvcc-no-such-git-executable",
            Some(&root.to_string_lossy()),
            TIMEOUT,
        );
        assert_eq!(observation.status, GitStatus::GitUnavailable);
        assert_eq!(observation.error_code.as_deref(), Some("GIT_UNAVAILABLE"));
        assert_eq!(observation.head, None);
        assert_eq!(observation.dirty, None);
    }

    #[test]
    fn an_expired_bound_fails_closed_as_a_timeout() {
        let (_dir, root) = repository_with_commit();
        let observation = observe(GIT_PROGRAM, Some(&root.to_string_lossy()), Duration::ZERO);
        assert_eq!(observation.status, GitStatus::Timeout);
        assert_eq!(observation.error_code.as_deref(), Some("GIT_TIMEOUT"));
        assert_eq!(observation.head, None);
        assert_eq!(observation.branch, None);
        assert_eq!(observation.detached, None);
        assert_eq!(observation.dirty, None);
    }

    /// Every file under the repository with a content hash, so an observation that wrote anything
    /// (index refresh, config, refs, logs) would change the snapshot.
    fn snapshot(root: &Path) -> BTreeMap<String, (u64, u64)> {
        fn walk(dir: &Path, root: &Path, into: &mut BTreeMap<String, (u64, u64)>) {
            let Ok(entries) = fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, root, into);
                } else if let Ok(bytes) = fs::read(&path) {
                    use std::hash::{Hash, Hasher};
                    let mut hasher = std::collections::hash_map::DefaultHasher::new();
                    bytes.hash(&mut hasher);
                    let relative = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .into_owned();
                    into.insert(relative, (bytes.len() as u64, hasher.finish()));
                }
            }
        }
        let mut files = BTreeMap::new();
        walk(root, root, &mut files);
        files
    }

    #[test]
    fn observing_does_not_modify_the_repository() {
        let (_dir, root) = repository_with_commit();
        fs::write(root.join("untracked.txt"), "new\n").unwrap();
        // Rewrite a tracked file with the same content a second later: its stat information no
        // longer matches the index, which is exactly when `git status` would refresh (and rewrite)
        // `.git/index` — unless it runs without optional locks, as the observation does.
        let tracked = root.join("tracked.txt");
        let content = fs::read(&tracked).unwrap();
        std::thread::sleep(Duration::from_millis(1100));
        fs::write(&tracked, &content).unwrap();
        let before = snapshot(&root);
        assert!(
            before.keys().any(|path| path.contains(".git")),
            "the snapshot must cover the .git directory"
        );

        for _ in 0..3 {
            let observation = observed(&root);
            assert_eq!(observation.status, GitStatus::Ok);
        }

        let after = snapshot(&root);
        assert_eq!(
            before.len(),
            after.len(),
            "no file may be added or removed by an observation"
        );
        for (path, state) in &before {
            assert_eq!(
                after.get(path),
                Some(state),
                "{path} changed during a read-only observation"
            );
        }
    }

    #[test]
    fn observed_at_is_iso8601_utc_with_milliseconds() {
        for (seconds, millis, expected) in [
            (0u64, 0u32, "1970-01-01T00:00:00.000Z"),
            (1_600_000_000, 123, "2020-09-13T12:26:40.123Z"),
            (1_709_164_800, 0, "2024-02-29T00:00:00.000Z"),
            (1_758_326_400, 999, "2025-09-20T00:00:00.999Z"),
            (4_102_444_799, 0, "2099-12-31T23:59:59.000Z"),
        ] {
            let time =
                UNIX_EPOCH + Duration::from_secs(seconds) + Duration::from_millis(millis as u64);
            assert_eq!(iso8601_utc(time), expected);
        }
    }

    #[test]
    fn the_observation_timeout_comes_from_the_shared_limits_contract() {
        let limits: serde_json::Value = serde_json::from_str(LIMITS_JSON).unwrap();
        let millis = limits["gitObservationTimeoutMs"].as_u64().unwrap();
        assert_eq!(git_observation_timeout(), Duration::from_millis(millis));
        assert!(millis > 0 && millis <= 30_000, "a sane bound: {millis} ms");
    }

    #[test]
    fn the_status_vocabulary_is_the_contracted_wire_format() {
        for (status, wire) in [
            (GitStatus::Ok, "\"OK\""),
            (GitStatus::NoLocalRoot, "\"NO_LOCAL_ROOT\""),
            (GitStatus::NotAGitRepository, "\"NOT_A_GIT_REPOSITORY\""),
            (GitStatus::GitUnavailable, "\"GIT_UNAVAILABLE\""),
            (GitStatus::Timeout, "\"TIMEOUT\""),
            (GitStatus::Error, "\"ERROR\""),
        ] {
            assert_eq!(serde_json::to_string(&status).unwrap(), wire);
        }
    }

    #[test]
    fn an_observation_serializes_with_the_contracted_field_names() {
        let observation = GitObservation {
            status: GitStatus::Ok,
            head: Some("0123456789abcdef0123456789abcdef01234567".into()),
            branch: Some("main".into()),
            detached: Some(false),
            dirty: Some(true),
            observed_at: "2026-09-20T00:00:00.000Z".into(),
            error_code: None,
            error_message: None,
        };
        let json = serde_json::to_string(&observation).unwrap();
        assert_eq!(
            json,
            r#"{"status":"OK","head":"0123456789abcdef0123456789abcdef01234567","branch":"main","detached":false,"dirty":true,"observedAt":"2026-09-20T00:00:00.000Z"}"#
        );
    }
}
