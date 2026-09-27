//! Storage boundary for DVCC runtime data.
//!
//! Rust owns path construction, atomic replacement, backups, append-only history and
//! quarantine (renaming a corrupt file aside). It does not interpret the schema; the
//! TypeScript domain layer validates content. Every path is derived from the resolved data
//! root plus a validated `StorageTarget`, so the frontend can never address arbitrary files.

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::CommandError;

pub const DATA_DIR_ENV: &str = "DVCC_DATA_DIR";
const RELEASE_DIR_NAME: &str = "DevVault-Control";
const DEBUG_DIR_NAME: &str = "DevVault-Control-dev";
const PROJECTS_FILE: &str = "projects.json";
/// Interface preferences (Localization Foundation): language only, never project or review data.
const SETTINGS_FILE: &str = "settings.json";
const REVIEWS_DIR: &str = "reviews";
const SESSION_FILE: &str = "session.json";
const CHECKPOINT_FILE: &str = "checkpoint.md";
const EVENTS_FILE: &str = "events.jsonl";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DataRootSource {
    Env,
    Default,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRoot {
    pub path: PathBuf,
    pub source: DataRootSource,
}

/// Lock file held exclusively by the process that owns a data folder.
pub const DATA_DIR_LOCK_FILE: &str = ".dvcc.lock";

/// Opens `<root>/.dvcc.lock` with no sharing, so no other process can open it while this handle
/// lives. A second DVCC process using the same data folder (for example in another Windows
/// session, or one that slipped past the single-instance guards) gets `DATA_DIR_IN_USE` and
/// never reaches the data files (F-3 / E-1).
pub fn acquire_data_dir_lock(root: &Path) -> Result<File, CommandError> {
    fs::create_dir_all(root).map_err(|error| io_error("DATA_DIR_UNAVAILABLE", root, error))?;
    let path = root.join(DATA_DIR_LOCK_FILE);
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    options.open(&path).map_err(|error| {
        // ERROR_SHARING_VIOLATION (32): another process holds the lock.
        if error.raw_os_error() == Some(32) {
            CommandError::new(
                "DATA_DIR_IN_USE",
                "another DevVault Control Center process is using this data folder; close it, then start DevVault Control Center again",
            )
        } else {
            io_error("DATA_DIR_UNAVAILABLE", &path, error)
        }
    })
}

/// Managed state: the resolved data root (or the reason it cannot be used), the exclusive
/// data-folder lock, and the lock that serializes every storage operation of this process
/// (F-3 / F-4): a read-compare-write sequence is never interleaved with another command.
pub struct DataRoot {
    resolved: Result<ResolvedRoot, CommandError>,
    lock: Mutex<()>,
    _folder_lock: Option<File>,
}

impl DataRoot {
    pub fn new(resolved: Result<ResolvedRoot, String>) -> Self {
        let (resolved, folder_lock) = match resolved {
            Err(message) => (
                Err(CommandError::new("DATA_DIR_UNAVAILABLE", message)),
                None,
            ),
            Ok(root) => match acquire_data_dir_lock(&root.path) {
                Ok(file) => (Ok(root), Some(file)),
                Err(error) => (Err(error), None),
            },
        };
        Self {
            resolved,
            lock: Mutex::new(()),
            _folder_lock: folder_lock,
        }
    }

    fn resolved(&self) -> Result<&ResolvedRoot, CommandError> {
        self.resolved.as_ref().map_err(Clone::clone)
    }

    pub fn path(&self) -> Result<&Path, CommandError> {
        Ok(&self.resolved()?.path)
    }

    /// Runs `operation` while holding the storage lock.
    pub fn exclusive<T>(
        &self,
        operation: impl FnOnce(&Path) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let root = self.path()?;
        // A poisoned lock only means an earlier operation panicked; the files themselves are
        // still protected by atomic replacement, so continue with the inner guard.
        let _guard = self
            .lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        operation(root)
    }
}

/// Optional optimistic-concurrency precondition for a write: the target must be absent, or its
/// current bytes must equal the content this process last read or wrote. A mismatch means
/// another process or an editor changed the file, and the write is refused (`CONFLICT`).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WritePrecondition {
    Absent,
    Matches { content: String },
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Unique sibling temp path (`<name>.<tag>-<pid>-<n>`): concurrent writers never share a temp
/// file, and a temp file left by a crash is never read because reads address exact names.
fn unique_temp_path(path: &Path, tag: &str) -> PathBuf {
    let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    with_suffix(path, &format!(".{tag}-{}-{n}", std::process::id()))
}

/// `DVCC_DATA_DIR` (absolute) wins; otherwise `<user data dir>/DevVault-Control[-dev]`.
pub fn resolve_data_root(
    env_override: Option<OsString>,
    base_data_dir: Option<PathBuf>,
    debug_build: bool,
) -> Result<ResolvedRoot, String> {
    if let Some(raw) = env_override.filter(|value| !value.is_empty()) {
        let path = PathBuf::from(raw);
        if !path.is_absolute() {
            return Err(format!("{DATA_DIR_ENV} must be an absolute path"));
        }
        return Ok(ResolvedRoot {
            path,
            source: DataRootSource::Env,
        });
    }
    let base = base_data_dir
        .ok_or_else(|| "could not resolve the user application data directory".to_string())?;
    let name = if debug_build {
        DEBUG_DIR_NAME
    } else {
        RELEASE_DIR_NAME
    };
    Ok(ResolvedRoot {
        path: base.join(name),
        source: DataRootSource::Default,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StorageTarget {
    Projects,
    Settings,
    Review {
        #[serde(rename = "reviewId")]
        review_id: String,
        file: String,
    },
}

/// `rv-YYYYMMDD-xxxxxx` with a lowercase alphanumeric suffix.
pub fn is_valid_review_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    bytes.len() == 18
        && id.starts_with("rv-")
        && bytes[3..11].iter().all(|c| c.is_ascii_digit())
        && bytes[11] == b'-'
        && bytes[12..]
            .iter()
            .all(|c| c.is_ascii_digit() || c.is_ascii_lowercase())
}

/// Shared limits contract (F-11): the same `contract/limits.json` the TypeScript domain uses.
const LIMITS_JSON: &str = include_str!("../../contract/limits.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Limits {
    max_review_rounds: u32,
}

pub fn max_review_rounds() -> u32 {
    static LIMITS: std::sync::OnceLock<u32> = std::sync::OnceLock::new();
    *LIMITS.get_or_init(|| {
        serde_json::from_str::<Limits>(LIMITS_JSON)
            .map(|limits| limits.max_review_rounds)
            .expect("contract/limits.json must define maxReviewRounds")
    })
}

/// A round number `1..=max_review_rounds()` written without leading zeros.
fn parse_round(digits: &str) -> Option<u32> {
    if digits.is_empty()
        || digits.len() > 10
        || digits.starts_with('0')
        || !digits.bytes().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    digits
        .parse::<u32>()
        .ok()
        .filter(|round| *round <= max_review_rounds())
}

fn is_round_artifact(file: &str, prefix: &str) -> bool {
    file.strip_prefix(prefix)
        .and_then(|rest| rest.strip_suffix(".md"))
        .and_then(parse_round)
        .is_some()
}

fn is_digits(text: &str, max_len: usize) -> bool {
    !text.is_empty() && text.len() <= max_len && text.bytes().all(|c| c.is_ascii_digit())
}

/// `<kind>-r<N>-previous-<ms>[-<n>].md`: a reviewer response replaced in the same round (F-6); the
/// optional `-<n>` (1..999, no leading zero) distinguishes texts archived for the same capture time
/// (E-2). `kind` is `result` (the Fresh Assessment) or `judgment` (the Final Judgment).
fn is_archived_response(file: &str, prefix: &str) -> bool {
    let Some(rest) = file
        .strip_prefix(prefix)
        .and_then(|rest| rest.strip_suffix(".md"))
    else {
        return false;
    };
    let Some((round, stamp)) = rest.split_once("-previous-") else {
        return false;
    };
    let valid_stamp = match stamp.split_once('-') {
        None => is_digits(stamp, 20),
        Some((millis, n)) => is_digits(millis, 20) && is_digits(n, 3) && !n.starts_with('0'),
    };
    parse_round(round).is_some() && valid_stamp
}

pub fn is_allowed_review_file(file: &str) -> bool {
    matches!(file, SESSION_FILE | CHECKPOINT_FILE | EVENTS_FILE)
        || is_round_artifact(file, "request-r")
        || is_round_artifact(file, "result-r")
        || is_round_artifact(file, "followup-r")
        || is_round_artifact(file, "judgment-r")
        || is_archived_response(file, "result-r")
        || is_archived_response(file, "judgment-r")
}

pub fn target_path(root: &Path, target: &StorageTarget) -> Result<PathBuf, CommandError> {
    match target {
        StorageTarget::Projects => Ok(root.join(PROJECTS_FILE)),
        StorageTarget::Settings => Ok(root.join(SETTINGS_FILE)),
        StorageTarget::Review { review_id, file } => {
            if !is_valid_review_id(review_id) {
                return Err(CommandError::new(
                    "INVALID_TARGET",
                    format!("invalid review id: {review_id:?}"),
                ));
            }
            if !is_allowed_review_file(file) {
                return Err(CommandError::new(
                    "INVALID_TARGET",
                    format!("invalid review file name: {file:?}"),
                ));
            }
            Ok(root.join(REVIEWS_DIR).join(review_id).join(file))
        }
    }
}

fn is_json_file(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "json")
}

fn is_events_file(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == EVENTS_FILE)
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().map(OsString::from).unwrap_or_default();
    name.push(suffix);
    path.with_file_name(name)
}

fn io_error(code: &'static str, path: &Path, error: io::Error) -> CommandError {
    CommandError::new(code, format!("{}: {error}", path.display()))
}

fn parses_as_json(bytes: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(bytes).is_ok()
}

/// Reads a UTF-8 text file. A missing file is `Ok(None)`.
pub fn read_text(path: &Path) -> Result<Option<String>, CommandError> {
    match fs::read(path) {
        Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| {
            CommandError::new(
                "INVALID_UTF8",
                format!("{}: file is not valid UTF-8", path.display()),
            )
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(io_error("READ_FAILED", path, error)),
    }
}

/// Writes and syncs a brand-new file; fails if the path already exists (temp names are unique).
fn write_synced(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file: File = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn path_exists(path: &Path) -> Result<bool, CommandError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(io_error("READ_FAILED", path, error)),
    }
}

/// Atomically replaces `path` with `content` (temp file + sync + rename).
///
/// For JSON files: new content must parse as JSON, an existing primary that does not parse
/// is never overwritten (`PRIMARY_UNREADABLE`), the previous valid primary is kept as
/// `<name>.bak`, and a missing primary whose `.bak` still exists is a recovery state
/// (`RECOVERY_REQUIRED`): a normal write must not create a new primary that would later
/// replace the only recoverable backup. `events.jsonl` is append-only and rejected here.
/// With a `precondition`, the current bytes are compared first and a mismatch is `CONFLICT`.
pub fn write_atomic(
    path: &Path,
    content: &str,
    precondition: Option<&WritePrecondition>,
) -> Result<(), CommandError> {
    if is_events_file(path) {
        return Err(CommandError::new(
            "APPEND_ONLY",
            "events.jsonl can only be appended",
        ));
    }
    let json = is_json_file(path);
    if json && !parses_as_json(content.as_bytes()) {
        return Err(CommandError::new(
            "INVALID_CONTENT",
            "refusing to write content that is not valid JSON",
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new("INVALID_TARGET", "target has no parent directory"))?;
    fs::create_dir_all(parent).map_err(|error| io_error("WRITE_FAILED", parent, error))?;

    let existing = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(io_error("READ_FAILED", path, error)),
    };
    let unchanged = match precondition {
        None => true,
        Some(WritePrecondition::Absent) => existing.is_none(),
        Some(WritePrecondition::Matches { content: expected }) => {
            existing.as_deref() == Some(expected.as_bytes())
        }
    };
    if !unchanged {
        return Err(CommandError::new(
            "CONFLICT",
            format!(
                "{}: the file changed on disk since it was loaded; nothing was overwritten",
                path.display()
            ),
        ));
    }
    if json
        && existing
            .as_deref()
            .is_some_and(|bytes| !parses_as_json(bytes))
    {
        return Err(CommandError::new(
            "PRIMARY_UNREADABLE",
            format!(
                "{}: existing file is not valid JSON and will not be overwritten; set it aside first",
                path.display()
            ),
        ));
    }
    if json && existing.is_none() && path_exists(&with_suffix(path, ".bak"))? {
        return Err(CommandError::new(
            "RECOVERY_REQUIRED",
            format!(
                "{}: the file is missing but its backup exists; restore the backup or set it aside first",
                path.display()
            ),
        ));
    }

    let tmp = unique_temp_path(path, "tmp");
    if let Err(error) = write_synced(&tmp, content.as_bytes()) {
        let _ = fs::remove_file(&tmp);
        return Err(io_error("WRITE_FAILED", &tmp, error));
    }

    if json {
        if let Some(previous) = &existing {
            let backup = with_suffix(path, ".bak");
            let backup_tmp = unique_temp_path(&backup, "tmp");
            let backup_result =
                write_synced(&backup_tmp, previous).and_then(|_| fs::rename(&backup_tmp, &backup));
            if let Err(error) = backup_result {
                let _ = fs::remove_file(&backup_tmp);
                let _ = fs::remove_file(&tmp);
                return Err(io_error("WRITE_FAILED", &backup, error));
            }
        }
    }

    if let Err(error) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(io_error("WRITE_FAILED", path, error));
    }
    Ok(())
}

/// Appends one JSON line to an `events.jsonl` file. Existing content is never rewritten; if
/// the file ends with a partial line (for example after a crash) a newline is inserted first.
pub fn append_line(path: &Path, line: &str) -> Result<(), CommandError> {
    if !is_events_file(path) {
        return Err(CommandError::new(
            "NOT_APPENDABLE",
            "only events.jsonl accepts appended lines",
        ));
    }
    if line.contains('\n') || line.contains('\r') {
        return Err(CommandError::new(
            "INVALID_CONTENT",
            "an event line must not contain line breaks",
        ));
    }
    if !parses_as_json(line.as_bytes()) {
        return Err(CommandError::new(
            "INVALID_CONTENT",
            "an event line must be valid JSON",
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new("INVALID_TARGET", "target has no parent directory"))?;
    fs::create_dir_all(parent).map_err(|error| io_error("WRITE_FAILED", parent, error))?;

    let append = || -> io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .append(true)
            .open(path)?;
        let len = file.metadata()?.len();
        let mut buffer = Vec::with_capacity(line.len() + 2);
        if len > 0 {
            let mut last = [0u8; 1];
            file.seek(SeekFrom::Start(len - 1))?;
            file.read_exact(&mut last)?;
            if last[0] != b'\n' {
                buffer.push(b'\n');
            }
        }
        buffer.extend_from_slice(line.as_bytes());
        buffer.push(b'\n');
        file.write_all(&buffer)?;
        file.sync_all()
    };
    append().map_err(|error| io_error("WRITE_FAILED", path, error))
}

/// Restores a missing JSON primary from its `.bak` (the backup itself is left untouched).
/// Refuses when the primary exists (`PRIMARY_EXISTS`), the backup is missing (`NOT_FOUND`)
/// or the backup does not parse as JSON (`BACKUP_INVALID`).
pub fn restore_backup(path: &Path) -> Result<(), CommandError> {
    if !is_json_file(path) {
        return Err(CommandError::new(
            "INVALID_TARGET",
            "backups exist only for JSON files",
        ));
    }
    if path_exists(path)? {
        return Err(CommandError::new(
            "PRIMARY_EXISTS",
            format!(
                "{}: primary exists; refusing to restore over it",
                path.display()
            ),
        ));
    }
    let backup = with_suffix(path, ".bak");
    let bytes = match fs::read(&backup) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(CommandError::new(
                "NOT_FOUND",
                format!("{}: backup does not exist", backup.display()),
            ))
        }
        Err(error) => return Err(io_error("READ_FAILED", &backup, error)),
    };
    if !parses_as_json(&bytes) {
        return Err(CommandError::new(
            "BACKUP_INVALID",
            format!("{}: backup is not valid JSON", backup.display()),
        ));
    }
    let tmp = unique_temp_path(path, "tmp");
    if let Err(error) = write_synced(&tmp, &bytes) {
        let _ = fs::remove_file(&tmp);
        return Err(io_error("WRITE_FAILED", &tmp, error));
    }
    if let Err(error) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(io_error("WRITE_FAILED", path, error));
    }
    Ok(())
}

fn quarantine_file(path: &Path, now_millis: u128) -> Result<String, CommandError> {
    if !path_exists(path)? {
        return Err(CommandError::new(
            "NOT_FOUND",
            format!("{}: file does not exist", path.display()),
        ));
    }
    let mut candidate = with_suffix(path, &format!(".corrupt-{now_millis}"));
    let mut counter = 1;
    while path_exists(&candidate)? {
        candidate = with_suffix(path, &format!(".corrupt-{now_millis}-{counter}"));
        counter += 1;
    }
    fs::rename(path, &candidate).map_err(|error| io_error("WRITE_FAILED", path, error))?;
    Ok(candidate
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default())
}

/// Renames a JSON file (or its `.bak` when `backup` is true) aside as
/// `<name>.corrupt-<millis>[-n]` and returns the new file name. The content is preserved;
/// nothing is deleted.
pub fn quarantine(path: &Path, backup: bool, now_millis: u128) -> Result<String, CommandError> {
    if !is_json_file(path) {
        return Err(CommandError::new(
            "INVALID_TARGET",
            "only JSON files can be set aside",
        ));
    }
    if backup {
        quarantine_file(&with_suffix(path, ".bak"), now_millis)
    } else {
        quarantine_file(path, now_millis)
    }
}

/// Lists review directories whose names are valid review ids. Anything else is ignored.
pub fn list_review_ids(root: &Path) -> Result<Vec<String>, CommandError> {
    let dir = root.join(REVIEWS_DIR);
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(io_error("READ_FAILED", &dir, error)),
    };
    let mut ids = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| io_error("READ_FAILED", &dir, error))?;
        let is_dir = entry
            .file_type()
            .map_err(|error| io_error("READ_FAILED", &entry.path(), error))?
            .is_dir();
        if let (true, Some(name)) = (is_dir, entry.file_name().to_str()) {
            if is_valid_review_id(name) {
                ids.push(name.to_string());
            }
        }
    }
    ids.sort();
    Ok(ids)
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    data_dir: String,
    source: DataRootSource,
    debug_build: bool,
}

#[tauri::command]
pub async fn storage_info(root: State<'_, DataRoot>) -> Result<StorageInfo, CommandError> {
    let resolved = root.resolved()?;
    root.exclusive(|path| {
        fs::create_dir_all(path.join(REVIEWS_DIR))
            .map_err(|error| io_error("DATA_DIR_UNAVAILABLE", path, error))
    })?;
    Ok(StorageInfo {
        data_dir: resolved.path.display().to_string(),
        source: resolved.source,
        debug_build: cfg!(debug_assertions),
    })
}

/// Reads a target (or its `.bak`). Shared by the command and tests.
pub fn read_target(
    root: &Path,
    target: &StorageTarget,
    backup: bool,
) -> Result<Option<String>, CommandError> {
    let path = target_path(root, target)?;
    if backup {
        if !is_json_file(&path) {
            return Err(CommandError::new(
                "INVALID_TARGET",
                "backups exist only for JSON files",
            ));
        }
        return read_text(&with_suffix(&path, ".bak"));
    }
    read_text(&path)
}

#[tauri::command]
pub async fn storage_read(
    root: State<'_, DataRoot>,
    target: StorageTarget,
    backup: Option<bool>,
) -> Result<Option<String>, CommandError> {
    root.exclusive(|path| read_target(path, &target, backup.unwrap_or(false)))
}

#[tauri::command]
pub async fn storage_write(
    root: State<'_, DataRoot>,
    target: StorageTarget,
    content: String,
    precondition: Option<WritePrecondition>,
) -> Result<(), CommandError> {
    root.exclusive(|path| {
        write_atomic(
            &target_path(path, &target)?,
            &content,
            precondition.as_ref(),
        )
    })
}

#[tauri::command]
pub async fn storage_append_line(
    root: State<'_, DataRoot>,
    target: StorageTarget,
    line: String,
) -> Result<(), CommandError> {
    root.exclusive(|path| append_line(&target_path(path, &target)?, &line))
}

#[tauri::command]
pub async fn storage_list_reviews(root: State<'_, DataRoot>) -> Result<Vec<String>, CommandError> {
    root.exclusive(list_review_ids)
}

#[tauri::command]
pub async fn storage_quarantine(
    root: State<'_, DataRoot>,
    target: StorageTarget,
    backup: Option<bool>,
) -> Result<String, CommandError> {
    root.exclusive(|path| {
        quarantine(
            &target_path(path, &target)?,
            backup.unwrap_or(false),
            unix_millis(),
        )
    })
}

#[tauri::command]
pub async fn storage_restore_backup(
    root: State<'_, DataRoot>,
    target: StorageTarget,
) -> Result<(), CommandError> {
    root.exclusive(|path| restore_backup(&target_path(path, &target)?))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    /// Unique temporary directory removed on drop (test data only).
    pub(crate) struct TempDir(pub PathBuf);

    impl TempDir {
        pub(crate) fn new() -> Self {
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!(
                "dvcc-rust-test-{}-{}-{n}",
                std::process::id(),
                unix_millis()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn review(id: &str, file: &str) -> StorageTarget {
        StorageTarget::Review {
            review_id: id.to_string(),
            file: file.to_string(),
        }
    }

    const ID: &str = "rv-20260101-alpha1";

    fn write(path: &Path, content: &str) -> Result<(), CommandError> {
        write_atomic(path, content, None)
    }

    /// True when no temp file (`<name>.tmp-<pid>-<n>`) is left next to `dir` entries.
    fn no_temp_files(dir: &Path) -> bool {
        fs::read_dir(dir)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .all(|entry| !entry.file_name().to_string_lossy().contains(".tmp-"))
            })
            .unwrap_or(true)
    }

    #[test]
    fn data_root_prefers_absolute_env_override() {
        let base = std::env::temp_dir();
        let override_dir = base.join("dvcc-override");
        let resolved = resolve_data_root(
            Some(override_dir.clone().into_os_string()),
            Some(base.clone()),
            false,
        )
        .unwrap();
        assert_eq!(resolved.path, override_dir);
        assert_eq!(resolved.source, DataRootSource::Env);
    }

    #[test]
    fn data_root_rejects_relative_env_override() {
        let result = resolve_data_root(
            Some(OsString::from("relative\\dir")),
            Some(std::env::temp_dir()),
            false,
        );
        assert!(result.is_err());
    }

    #[test]
    fn data_root_uses_release_and_debug_defaults() {
        let base = std::env::temp_dir();
        let release = resolve_data_root(Some(OsString::new()), Some(base.clone()), false).unwrap();
        assert_eq!(release.path, base.join("DevVault-Control"));
        assert_eq!(release.source, DataRootSource::Default);
        let debug = resolve_data_root(None, Some(base.clone()), true).unwrap();
        assert_eq!(debug.path, base.join("DevVault-Control-dev"));
    }

    #[test]
    fn data_root_errors_without_base_dir() {
        assert!(resolve_data_root(None, None, false).is_err());
    }
    #[test]
    fn review_id_validation() {
        assert!(is_valid_review_id("rv-20260101-alpha1"));
        assert!(is_valid_review_id("rv-20261231-0z9y8x"));
        for bad in [
            "",
            "rv-2026010-alpha1",
            "rv-20260101-Alpha1",
            "rv-20260101-alpha",
            "rv-20260101_alpha1",
            "xx-20260101-alpha1",
            "rv-20260101-alph..",
            "rv-20260101-alpha1/",
            "../20260101-alpha1",
        ] {
            assert!(!is_valid_review_id(bad), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn review_file_validation() {
        let max = max_review_rounds();
        let at_limit_request = format!("request-r{max}.md");
        let at_limit_result = format!("result-r{max}.md");
        let over_limit_result = format!("result-r{}.md", max + 1);
        let over_limit_archive = format!("result-r{}-previous-1.md", max + 1);
        for good in [
            "session.json",
            "checkpoint.md",
            "events.jsonl",
            "request-r1.md",
            "result-r12.md",
            at_limit_request.as_str(),
            at_limit_result.as_str(),
            "result-r1-previous-1767225600000.md",
            "result-r12-previous-0.md",
            "result-r1-previous-1767225600000-1.md",
            "result-r1-previous-1767225600000-999.md",
            // Phase 3: the Turn 2 request and the Final Judgment, with the same archive shape.
            "followup-r1.md",
            "followup-r12.md",
            "judgment-r1.md",
            "judgment-r12.md",
            "judgment-r1-previous-1767225600000.md",
            "judgment-r1-previous-1767225600000-1.md",
        ] {
            assert!(is_allowed_review_file(good), "{good:?} should be allowed");
        }
        for bad in [
            "",
            "request.md",
            "result.md",
            "request-r0.md",
            "request-r01.md",
            over_limit_result.as_str(),
            over_limit_archive.as_str(),
            "result-r1.txt",
            "../session.json",
            "session.json.bak",
            "Session.json",
            "notes.md",
            "result-r1.md/../../x",
            "result-r1-previous-.md",
            "result-r1-previous-12a.md",
            "request-r1-previous-1.md",
            "result-r1-previous-1.md.bak",
            "result-r1-previous-123456789012345678901.md",
            "result-r1-previous-1767225600000-0.md",
            "result-r1-previous-1767225600000-01.md",
            "result-r1-previous-1767225600000-1000.md",
            "result-r1-previous-1767225600000-.md",
            "result-r1-previous-1767225600000-1-2.md",
            // A request has no archive, and neither kind may borrow the other's prefix.
            "followup-r1-previous-1767225600000.md",
            "judgment-r0.md",
            "judgment-r1.txt",
            "judgment-r1-previous-.md",
            "judgment-r1-previous-1767225600000-0.md",
        ] {
            assert!(!is_allowed_review_file(bad), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn round_limit_comes_from_the_shared_contract_file() {
        let contract: serde_json::Value = serde_json::from_str(LIMITS_JSON).unwrap();
        assert_eq!(
            contract["maxReviewRounds"].as_u64().unwrap(),
            u64::from(max_review_rounds())
        );
        assert!(max_review_rounds() >= 1);
    }

    #[test]
    fn target_path_confines_to_data_root() {
        let root = Path::new("C:\\data-root");
        assert_eq!(
            target_path(root, &StorageTarget::Projects).unwrap(),
            root.join("projects.json")
        );
        assert_eq!(
            target_path(root, &review(ID, "session.json")).unwrap(),
            root.join("reviews").join(ID).join("session.json")
        );
        for (id, file) in [
            ("..", "session.json"),
            (ID, "..\\..\\projects.json"),
            (ID, "../projects.json"),
            ("rv-20260101-alpha1\\..", "session.json"),
        ] {
            let error = target_path(root, &review(id, file)).unwrap_err();
            assert_eq!(error.code, "INVALID_TARGET");
        }
    }

    #[test]
    fn storage_target_deserializes_from_frontend_shape() {
        let projects: StorageTarget = serde_json::from_str(r#"{"kind":"projects"}"#).unwrap();
        assert!(matches!(projects, StorageTarget::Projects));
        let target: StorageTarget = serde_json::from_str(
            r#"{"kind":"review","reviewId":"rv-20260101-alpha1","file":"session.json"}"#,
        )
        .unwrap();
        assert!(matches!(target, StorageTarget::Review { .. }));
    }

    #[test]
    fn write_atomic_creates_file_and_keeps_previous_json_as_backup() {
        let dir = TempDir::new();
        let path = target_path(&dir.0, &review(ID, "session.json")).unwrap();
        write(&path, "{\"v\":1}").unwrap();
        assert_eq!(read_text(&path).unwrap().unwrap(), "{\"v\":1}");
        assert!(!with_suffix(&path, ".bak").exists());

        write(&path, "{\"v\":2}").unwrap();
        assert_eq!(read_text(&path).unwrap().unwrap(), "{\"v\":2}");
        assert_eq!(
            read_text(&with_suffix(&path, ".bak")).unwrap().unwrap(),
            "{\"v\":1}"
        );
        assert!(no_temp_files(path.parent().unwrap()));
    }

    #[test]
    fn write_atomic_rejects_invalid_json_content() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        let error = write(&path, "{not json").unwrap_err();
        assert_eq!(error.code, "INVALID_CONTENT");
        assert!(!path.exists());
    }

    #[test]
    fn write_atomic_never_overwrites_corrupt_primary() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        fs::write(&path, "{\"projects\": [trunc").unwrap();
        let error = write(&path, "{\"schemaVersion\":1,\"projects\":[]}").unwrap_err();
        assert_eq!(error.code, "PRIMARY_UNREADABLE");
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"projects\": [trunc");
        assert!(!with_suffix(&path, ".bak").exists());
        assert!(no_temp_files(&dir.0));
    }

    #[test]
    fn write_atomic_markdown_has_no_backup_and_events_are_append_only() {
        let dir = TempDir::new();
        let md = target_path(&dir.0, &review(ID, "result-r1.md")).unwrap();
        write(&md, "first").unwrap();
        write(&md, "second").unwrap();
        assert_eq!(read_text(&md).unwrap().unwrap(), "second");
        assert!(!with_suffix(&md, ".bak").exists());

        let events = target_path(&dir.0, &review(ID, "events.jsonl")).unwrap();
        assert_eq!(write(&events, "{}").unwrap_err().code, "APPEND_ONLY");
    }

    #[test]
    fn read_text_reports_missing_and_invalid_utf8() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        assert_eq!(read_text(&path).unwrap(), None);
        fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_text(&path).unwrap_err().code, "INVALID_UTF8");
    }

    #[test]
    fn append_line_appends_and_repairs_partial_trailing_line() {
        let dir = TempDir::new();
        let path = target_path(&dir.0, &review(ID, "events.jsonl")).unwrap();
        append_line(&path, "{\"n\":1}").unwrap();
        append_line(&path, "{\"n\":2}").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"n\":1}\n{\"n\":2}\n");

        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"{\"n\":3, \"trunc").unwrap();
        drop(file);
        append_line(&path, "{\"n\":4}").unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "{\"n\":1}\n{\"n\":2}\n{\"n\":3, \"trunc\n{\"n\":4}\n"
        );
    }

    #[test]
    fn append_line_rejects_bad_input_and_non_event_files() {
        let dir = TempDir::new();
        let events = target_path(&dir.0, &review(ID, "events.jsonl")).unwrap();
        assert_eq!(
            append_line(&events, "{\"a\":1}\n{\"b\":2}")
                .unwrap_err()
                .code,
            "INVALID_CONTENT"
        );
        assert_eq!(
            append_line(&events, "not json").unwrap_err().code,
            "INVALID_CONTENT"
        );
        let session = target_path(&dir.0, &review(ID, "session.json")).unwrap();
        assert_eq!(
            append_line(&session, "{}").unwrap_err().code,
            "NOT_APPENDABLE"
        );
    }

    #[test]
    fn quarantine_renames_and_preserves_content() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        fs::write(&path, "corrupt").unwrap();
        let name = quarantine(&path, false, 42).unwrap();
        assert_eq!(name, "projects.json.corrupt-42");
        assert!(!path.exists());
        assert_eq!(fs::read_to_string(dir.0.join(&name)).unwrap(), "corrupt");

        fs::write(&path, "corrupt again").unwrap();
        let second = quarantine(&path, false, 42).unwrap();
        assert_eq!(second, "projects.json.corrupt-42-1");
        assert_eq!(
            fs::read_to_string(dir.0.join(&second)).unwrap(),
            "corrupt again"
        );

        assert_eq!(quarantine(&path, false, 43).unwrap_err().code, "NOT_FOUND");
        assert_eq!(
            quarantine(&dir.0.join("checkpoint.md"), false, 1)
                .unwrap_err()
                .code,
            "INVALID_TARGET"
        );

        fs::write(dir.0.join("projects.json.bak"), "bad backup").unwrap();
        let aside = quarantine(&path, true, 44).unwrap();
        assert_eq!(aside, "projects.json.bak.corrupt-44");
        assert!(!dir.0.join("projects.json.bak").exists());
        assert_eq!(
            fs::read_to_string(dir.0.join(&aside)).unwrap(),
            "bad backup"
        );
    }

    #[test]
    fn write_preconditions_refuse_silent_overwrite() {
        let dir = TempDir::new();
        let path = target_path(&dir.0, &review(ID, "session.json")).unwrap();
        write_atomic(&path, "{\"v\":1}", Some(&WritePrecondition::Absent)).unwrap();
        // Absent when the file exists → CONFLICT, file unchanged.
        let error = write_atomic(&path, "{\"v\":2}", Some(&WritePrecondition::Absent)).unwrap_err();
        assert_eq!(error.code, "CONFLICT");
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"v\":1}");

        // Another process / editor changes the file after this process loaded "{\"v\":1}".
        fs::write(&path, "{\"v\":\"external\"}").unwrap();
        let loaded = WritePrecondition::Matches {
            content: "{\"v\":1}".to_string(),
        };
        let error = write_atomic(&path, "{\"v\":2}", Some(&loaded)).unwrap_err();
        assert_eq!(error.code, "CONFLICT");
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"v\":\"external\"}");
        assert!(
            !with_suffix(&path, ".bak").exists(),
            "a refused write must not rotate the backup"
        );

        // Matching content → write succeeds.
        let current = WritePrecondition::Matches {
            content: "{\"v\":\"external\"}".to_string(),
        };
        write_atomic(&path, "{\"v\":3}", Some(&current)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"v\":3}");

        // Markdown artifacts use the same contract.
        let md = target_path(&dir.0, &review(ID, "result-r1.md")).unwrap();
        write_atomic(&md, "first", Some(&WritePrecondition::Absent)).unwrap();
        assert_eq!(
            write_atomic(&md, "second", Some(&WritePrecondition::Absent))
                .unwrap_err()
                .code,
            "CONFLICT"
        );
        assert!(no_temp_files(path.parent().unwrap()));
    }

    #[test]
    fn temp_paths_are_unique_and_stale_temp_files_are_ignored() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        let a = unique_temp_path(&path, "tmp");
        let b = unique_temp_path(&path, "tmp");
        assert_ne!(a, b);
        assert!(a
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("projects.json.tmp-"));

        // Leftovers from a crash (old fixed name and a unique-name temp) contain garbage.
        fs::write(with_suffix(&path, ".tmp"), "garbage").unwrap();
        fs::write(&a, "{\"stale\":true}").unwrap();
        assert_eq!(
            read_text(&path).unwrap(),
            None,
            "temp files are never read as the primary"
        );
        write(&path, "{\"v\":1}").unwrap();
        write(&path, "{\"v\":2}").unwrap();
        assert_eq!(read_text(&path).unwrap().unwrap(), "{\"v\":2}");
        assert_eq!(
            fs::read_to_string(&a).unwrap(),
            "{\"stale\":true}",
            "stale temp untouched"
        );
    }

    #[cfg(windows)]
    #[test]
    fn data_folder_lock_admits_only_one_owner_at_a_time() {
        let dir = TempDir::new();
        let resolved = || {
            Ok(ResolvedRoot {
                path: dir.0.clone(),
                source: DataRootSource::Env,
            })
        };
        let first = DataRoot::new(resolved());
        assert!(first.path().is_ok());
        assert!(dir.0.join(DATA_DIR_LOCK_FILE).exists());

        let second = DataRoot::new(resolved());
        let error = second.path().unwrap_err();
        assert_eq!(error.code, "DATA_DIR_IN_USE");
        let refused = second.exclusive(|p| write_atomic(&p.join("projects.json"), "{}", None));
        assert_eq!(refused.unwrap_err().code, "DATA_DIR_IN_USE");
        assert!(
            !dir.0.join("projects.json").exists(),
            "the second owner never reaches the data"
        );

        drop(first);
        let third = DataRoot::new(resolved());
        assert!(
            third.path().is_ok(),
            "the lock is released when the owner goes away"
        );
    }

    #[test]
    fn concurrent_writes_through_the_storage_lock_stay_consistent() {
        use std::sync::Arc;
        let dir = TempDir::new();
        let root = Arc::new(DataRoot::new(Ok(ResolvedRoot {
            path: dir.0.clone(),
            source: DataRootSource::Env,
        })));
        let target = StorageTarget::Projects;
        root.exclusive(|p| {
            write_atomic(&target_path(p, &target)?, "{\"writer\":-1,\"i\":-1}", None)
        })
        .unwrap();

        let threads: Vec<_> = (0..8)
            .map(|writer| {
                let root = Arc::clone(&root);
                std::thread::spawn(move || {
                    for i in 0..25 {
                        let content = format!("{{\"writer\":{writer},\"i\":{i}}}");
                        root.exclusive(|p| {
                            let path = target_path(p, &StorageTarget::Projects)?;
                            // read-compare-write under the lock never sees a CONFLICT
                            let current = read_text(&path)?.unwrap();
                            write_atomic(
                                &path,
                                &content,
                                Some(&WritePrecondition::Matches { content: current }),
                            )
                        })
                        .unwrap();
                    }
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        let path = dir.0.join("projects.json");
        let final_text = read_text(&path).unwrap().unwrap();
        assert!(parses_as_json(final_text.as_bytes()));
        assert!(parses_as_json(
            fs::read(with_suffix(&path, ".bak")).unwrap().as_slice()
        ));
        assert!(no_temp_files(&dir.0));
    }

    #[test]
    fn missing_primary_with_backup_requires_recovery_and_protects_backup() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        let backup = dir.0.join("projects.json.bak");
        fs::write(&backup, "{\"only\":\"copy\"}").unwrap();

        // A normal write must not start a new primary next to the only recoverable backup.
        let error = write(&path, "{\"new\":1}").unwrap_err();
        assert_eq!(error.code, "RECOVERY_REQUIRED");
        assert!(!path.exists());
        assert_eq!(fs::read_to_string(&backup).unwrap(), "{\"only\":\"copy\"}");

        // Explicit restore copies the backup to the primary and keeps the backup.
        restore_backup(&path).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"only\":\"copy\"}");
        assert_eq!(fs::read_to_string(&backup).unwrap(), "{\"only\":\"copy\"}");
        assert!(no_temp_files(&dir.0));

        // After restore, normal writes resume and the backup rotates to the restored content.
        write(&path, "{\"new\":1}").unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), "{\"only\":\"copy\"}");
        assert_eq!(restore_backup(&path).unwrap_err().code, "PRIMARY_EXISTS");
    }

    #[test]
    fn restore_backup_refuses_missing_or_invalid_backup() {
        let dir = TempDir::new();
        let path = dir.0.join("projects.json");
        assert_eq!(restore_backup(&path).unwrap_err().code, "NOT_FOUND");
        fs::write(dir.0.join("projects.json.bak"), "{truncated").unwrap();
        assert_eq!(restore_backup(&path).unwrap_err().code, "BACKUP_INVALID");
        assert!(!path.exists());
        assert_eq!(
            restore_backup(&dir.0.join("checkpoint.md"))
                .unwrap_err()
                .code,
            "INVALID_TARGET"
        );
        // Setting the invalid backup aside leaves a clean state where writes are allowed.
        quarantine(&path, true, 7).unwrap();
        write(&path, "{\"fresh\":true}").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"fresh\":true}");
    }

    #[test]
    fn list_review_ids_ignores_unexpected_entries() {
        let dir = TempDir::new();
        let reviews = dir.0.join("reviews");
        assert!(list_review_ids(&dir.0).unwrap().is_empty());
        fs::create_dir_all(reviews.join("rv-20260102-beta01")).unwrap();
        fs::create_dir_all(reviews.join(ID)).unwrap();
        fs::create_dir_all(reviews.join("not-a-review")).unwrap();
        fs::write(reviews.join("rv-20260103-gamma1"), "file, not dir").unwrap();
        assert_eq!(
            list_review_ids(&dir.0).unwrap(),
            vec![ID.to_string(), "rv-20260102-beta01".to_string()]
        );
    }

    #[test]
    fn restart_round_trip_reads_back_written_state() {
        let dir = TempDir::new();
        let projects = "{\"schemaVersion\":1,\"projects\":[{\"projectId\":\"project-alpha\"}]}";
        let session = "{\"schemaVersion\":1,\"reviewSessionId\":\"rv-20260101-alpha1\",\"reviewState\":\"SUSPENDED\"}";
        {
            write(
                &target_path(&dir.0, &StorageTarget::Projects).unwrap(),
                projects,
            )
            .unwrap();
            write(
                &target_path(&dir.0, &review(ID, "session.json")).unwrap(),
                session,
            )
            .unwrap();
            write(
                &target_path(&dir.0, &review(ID, "checkpoint.md")).unwrap(),
                "stopped here",
            )
            .unwrap();
            append_line(
                &target_path(&dir.0, &review(ID, "events.jsonl")).unwrap(),
                "{\"type\":\"suspended\"}",
            )
            .unwrap();
        }
        // "Restart": resolve everything again from disk only.
        let root = resolve_data_root(Some(dir.0.clone().into_os_string()), None, false).unwrap();
        assert_eq!(list_review_ids(&root.path).unwrap(), vec![ID.to_string()]);
        assert_eq!(
            read_text(&target_path(&root.path, &StorageTarget::Projects).unwrap())
                .unwrap()
                .unwrap(),
            projects
        );
        assert_eq!(
            read_text(&target_path(&root.path, &review(ID, "session.json")).unwrap())
                .unwrap()
                .unwrap(),
            session
        );
        assert_eq!(
            read_text(&target_path(&root.path, &review(ID, "checkpoint.md")).unwrap())
                .unwrap()
                .unwrap(),
            "stopped here"
        );
        assert_eq!(
            read_text(&target_path(&root.path, &review(ID, "events.jsonl")).unwrap())
                .unwrap()
                .unwrap(),
            "{\"type\":\"suspended\"}\n"
        );
    }
}
