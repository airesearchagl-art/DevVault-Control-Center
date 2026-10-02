//! Phase 4b-1: read-only discovery of local Codex sessions from Codex's own SQLite state file.
//!
//! The primary read-only boundary is the open flag: the connection is opened with
//! `SQLITE_OPEN_READ_ONLY` (no `CREATE`; a write to the application database is refused by SQLite
//! itself, not just by this code not issuing one). `query_only` is defense in depth against
//! ordinary data-changing SQL only — it is not a complete filesystem-level read-only guarantee and
//! does not by itself rule out every operation (checkpoint-related behavior among them). Every SQL
//! statement is a fixed string with an explicit column list — never `SELECT *`, never built from
//! caller input. `first_user_message` and `preview` (the two content-bearing columns Human Decision
//! HD-P4B-08 / Task Packet §8 names) are never referenced anywhere in this file.
//!
//! DVCC never creates, migrates or repairs this file, and never issues a checkpoint: it belongs to
//! Codex.
//!
//! DF-06 / HD-4B12-02 contract: DVCC does not modify provider application data — the database and
//! its WAL application data are read without modification. When SQLite reads a live WAL-mode
//! database, SQLite itself may update the provider-owned `-shm` shared-memory coordination file
//! (read-mark / lock bytes, filesystem metadata such as mtime). That file holds no database
//! content and is not needed for recovery, so such an update is reader coordination, not a
//! modification of provider application data. Do not describe every provider file as byte- or
//! metadata-identical after a live WAL read.

use rusqlite::types::ValueRef;
use rusqlite::{Connection, ErrorCode, OpenFlags, Row};
use serde::Serialize;
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Codex writes its own state as `<home>/.codex/state_5.sqlite`; test runs may point elsewhere.
const CODEX_HOME_ENV: &str = "DVCC_CODEX_HOME_DIR";
const STATE_DB_FILE: &str = "state_5.sqlite";

/// Fail closed rather than wait indefinitely on a database Codex is actively writing.
const BUSY_TIMEOUT: Duration = Duration::from_millis(2000);

/// Bounds untrusted provider input (Task Packet §18): a pathological state file cannot make
/// discovery return an unbounded amount of data. Raised from 200 by Human Decision (DF-01,
/// LRP-20260929-DVCC-007): a real installation already held 379 threads, so 200 made every normal
/// scan incomplete. It remains a hard bound, still detected via `LIMIT MAX_SESSIONS + 1`.
const MAX_SESSIONS: usize = 1000;

/// A row whose `id`, `cwd`, `cli_version` or `git_origin_url` exceeds this length is not a
/// plausible metadata value — session ids, paths and version strings are always far shorter — and
/// is dropped rather than trusted (Independent Review RF-P4B1-02). The length of every such column
/// is checked on the *borrowed* SQLite value (`Row::get_ref`, zero-copy) before any owned `String`
/// is allocated for it — an oversized value is never copied onto the heap at all, let alone
/// truncated and kept.
const MAX_METADATA_STRING_LEN: usize = 4096;

/// `busy_timeout` above only bounds waiting for a lock; it says nothing about how long a query that
/// already has the lock takes to execute (Independent Review RF-P4B1-02 §3). This bounds the whole
/// query's wall-clock execution: a background thread calls the connection's `InterruptHandle` after
/// this deadline, which aborts any statement still running on it (`SQLITE_INTERRUPT`) at SQLite's
/// next opportunity to check. `InterruptHandle` is `Send`/`Sync` and stays valid (a safe no-op) even
/// after the `Connection` it came from is dropped, so the watcher thread is never joined — it simply
/// exits once it fires, at or before the deadline.
const QUERY_TIMEOUT: Duration = Duration::from_secs(3);

/// The outcome of reading one text column with its length already checked before allocation.
enum CheckedText {
    Value(String),
    Null,
    /// Oversized, or not text at all in a column that should be — a format anomaly, never trusted.
    Rejected,
}

fn checked_text(row: &Row, idx: usize) -> rusqlite::Result<CheckedText> {
    Ok(match row.get_ref(idx)? {
        ValueRef::Null => CheckedText::Null,
        ValueRef::Text(bytes) if bytes.len() <= MAX_METADATA_STRING_LEN => {
            CheckedText::Value(String::from_utf8_lossy(bytes).into_owned())
        }
        _ => CheckedText::Rejected,
    })
}

/// `Ok(None)` means the whole row is rejected (a required field was oversized/non-text) — never a
/// row with a required field silently substituted or truncated.
fn build_row(row: &Row) -> rusqlite::Result<Option<CodexThreadRow>> {
    let id = match checked_text(row, 0)? {
        CheckedText::Value(value) => value,
        _ => return Ok(None),
    };
    let cwd = match checked_text(row, 1)? {
        CheckedText::Value(value) => value,
        _ => return Ok(None),
    };
    let created_at: i64 = row.get(2)?;
    let updated_at: i64 = row.get(3)?;
    let cli_version = match checked_text(row, 4)? {
        CheckedText::Value(value) => value,
        _ => return Ok(None),
    };
    let archived = row.get::<_, i64>(5)? != 0;
    let git_origin_url = match checked_text(row, 6)? {
        CheckedText::Value(value) => Some(value),
        CheckedText::Null => None,
        CheckedText::Rejected => return Ok(None),
    };
    Ok(Some(CodexThreadRow {
        id,
        cwd,
        created_at,
        updated_at,
        cli_version,
        archived,
        git_origin_url,
    }))
}

fn is_interrupted(error: &rusqlite::Error) -> bool {
    matches!(error, rusqlite::Error::SqliteFailure(ffi_error, _) if ffi_error.code == ErrorCode::OperationInterrupted)
}

const REQUIRED_COLUMNS: &[&str] = &[
    "id",
    "cwd",
    "created_at",
    "updated_at",
    "cli_version",
    "archived",
    "git_origin_url",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexThreadRow {
    pub id: String,
    pub cwd: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub cli_version: String,
    pub archived: bool,
    pub git_origin_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CodexDiscovery {
    Ok {
        threads: Vec<CodexThreadRow>,
        /// `false` when the session cap (`MAX_SESSIONS`) was hit — more rows exist than were
        /// returned — or the query was interrupted by `QUERY_TIMEOUT` before finishing normally
        /// (Independent Review RF-P4B1-02 §4). An empty or short `threads` list must never be
        /// read as "no more sessions exist" when this is `false`.
        complete: bool,
    },
    /// The state file does not exist, or could not be opened (locked, permission denied, corrupt).
    Unavailable { reason: String },
    /// The file opened, but the `threads` table or a required column is missing: an unrecognized
    /// Codex version, not a database to guess the shape of.
    UnsupportedFormat { reason: String },
}

fn codex_home() -> Option<PathBuf> {
    if let Some(overridden) = std::env::var_os(CODEX_HOME_ENV) {
        return Some(PathBuf::from(overridden));
    }
    dirs_home()
}

/// A minimal home-directory lookup so this module adds no new dependency beyond `rusqlite`
/// (Task Packet §9 authorizes exactly one). Windows-only, matching DVCC's own scope.
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

fn state_db_path() -> Option<PathBuf> {
    codex_home().map(|home| home.join(".codex").join(STATE_DB_FILE))
}

fn table_exists(conn: &Connection, table: &str) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Column names actually present on `threads`, via `pragma_table_info` (schema metadata only —
/// never touches a row of data).
fn threads_columns(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement = conn.prepare("SELECT name FROM pragma_table_info('threads')")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn missing_required_columns(present: &[String]) -> Vec<&'static str> {
    REQUIRED_COLUMNS
        .iter()
        .copied()
        .filter(|required| !present.iter().any(|column| column == required))
        .collect()
}

/// Opens `path` with `SQLITE_OPEN_READ_ONLY`, the primary application-database read-only
/// boundary. `query_only` is added as defense in depth against ordinary data-changing SQL (an
/// accidental `INSERT`/`UPDATE`/`DELETE`/DDL in a future change), but it is not itself a complete
/// filesystem read-only guarantee. On a live WAL database SQLite may still update the `-shm`
/// coordination file's read-mark/lock bytes or metadata (see the module docs, DF-06).
fn open_read_only(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "query_only", true)?;
    Ok(conn)
}

fn scan(path: &std::path::Path, query_timeout: Duration) -> CodexDiscovery {
    if !path.exists() {
        return CodexDiscovery::Unavailable {
            reason: "the Codex state file does not exist".to_string(),
        };
    }
    let conn = match open_read_only(path) {
        Ok(conn) => conn,
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("could not open the Codex state file read-only: {error}"),
            }
        }
    };

    match table_exists(&conn, "threads") {
        Ok(true) => {}
        Ok(false) => {
            return CodexDiscovery::UnsupportedFormat {
                reason: "the 'threads' table is not present".to_string(),
            }
        }
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("could not read schema metadata: {error}"),
            }
        }
    }

    let columns = match threads_columns(&conn) {
        Ok(columns) => columns,
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("could not read column metadata: {error}"),
            }
        }
    };
    let missing = missing_required_columns(&columns);
    if !missing.is_empty() {
        return CodexDiscovery::UnsupportedFormat {
            reason: format!("missing required column(s): {}", missing.join(", ")),
        };
    }

    // A deadline already in the past (Independent Review RF-P4B1-02 §3/§4) means the scan cannot
    // even start within budget: fail closed to incomplete rather than attempt — and possibly still
    // return — a query that has no chance of finishing in time.
    let deadline = Instant::now() + query_timeout;
    if Instant::now() >= deadline {
        return CodexDiscovery::Ok {
            threads: Vec::new(),
            complete: false,
        };
    }

    // Fixed statement, explicit column list. `LIMIT MAX_SESSIONS + 1` (never `MAX_SESSIONS`) is
    // exactly how the cap is detected (§5): if the (n+1)th row comes back, strictly more sessions
    // exist than the cap allows, and the result is truncated and marked incomplete rather than
    // silently treated as the whole set. `first_user_message` and `preview` never appear here.
    let query = format!(
        "SELECT id, cwd, created_at, updated_at, cli_version, archived, git_origin_url \
         FROM threads ORDER BY updated_at DESC LIMIT {}",
        MAX_SESSIONS + 1
    );
    let mut statement = match conn.prepare(&query) {
        Ok(statement) => statement,
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("query failed: {error}"),
            }
        }
    };

    // `InterruptHandle` is independent of `conn`'s lifetime and safe to use after it is dropped, so
    // this thread is never joined: it exits on its own once it fires, at or before `deadline`.
    let interrupt_handle = conn.get_interrupt_handle();
    let remaining = deadline.saturating_duration_since(Instant::now());
    std::thread::spawn(move || {
        std::thread::sleep(remaining);
        interrupt_handle.interrupt();
    });

    let mut rows_iter = match statement.query([]) {
        Ok(rows) => rows,
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("query failed: {error}"),
            }
        }
    };

    // Iterated manually, not `.collect()`-ed: an interrupt partway through must keep whatever rows
    // were already read, not discard them the way a `Result<Vec<_>, _>` short-circuit would.
    let mut fetched: Vec<Option<CodexThreadRow>> = Vec::new();
    let mut interrupted = false;
    loop {
        match rows_iter.next() {
            Ok(Some(row)) => match build_row(row) {
                Ok(mapped) => fetched.push(mapped),
                Err(error) => {
                    return CodexDiscovery::Unavailable {
                        reason: format!("a row could not be read: {error}"),
                    }
                }
            },
            Ok(None) => break,
            Err(error) if is_interrupted(&error) => {
                interrupted = true;
                break;
            }
            Err(error) => {
                return CodexDiscovery::Unavailable {
                    reason: format!("query failed: {error}"),
                }
            }
        }
    }

    // Whether the query itself returned more than the cap (proof strictly more data exists),
    // independent of how many of those rows individually passed the per-field bounds check below.
    let hit_cap = fetched.len() > MAX_SESSIONS;
    // A row with an implausibly long metadata string is dropped, not truncated-and-kept.
    let mut threads: Vec<CodexThreadRow> = fetched.into_iter().flatten().collect();
    if hit_cap {
        threads.truncate(MAX_SESSIONS);
    }
    CodexDiscovery::Ok {
        threads,
        complete: !hit_cap && !interrupted,
    }
}

#[tauri::command]
pub async fn discover_codex_sessions() -> CodexDiscovery {
    match state_db_path() {
        Some(path) => scan(&path, QUERY_TIMEOUT),
        None => CodexDiscovery::Unavailable {
            reason: "could not determine the user's home directory".to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    struct TempDb(PathBuf);
    impl TempDb {
        fn new() -> Self {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!("dvcc-codex-reader-test-{id}.sqlite"));
            let _ = std::fs::remove_file(&path);
            Self(path)
        }
    }
    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
            let _ = std::fs::remove_file(self.0.with_extension("sqlite-wal"));
            let _ = std::fs::remove_file(self.0.with_extension("sqlite-shm"));
        }
    }

    fn create_valid_schema(path: &std::path::Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (
                id TEXT PRIMARY KEY,
                cwd TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                cli_version TEXT NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                git_origin_url TEXT,
                first_user_message TEXT NOT NULL DEFAULT '',
                preview TEXT NOT NULL DEFAULT ''
            );",
        )
        .unwrap();
    }

    #[test]
    fn missing_file_is_unavailable() {
        let db = TempDb::new();
        let result = scan(&db.0, QUERY_TIMEOUT);
        assert!(matches!(result, CodexDiscovery::Unavailable { .. }));
    }

    #[test]
    fn missing_table_is_unsupported_format() {
        let db = TempDb::new();
        Connection::open(&db.0).unwrap();
        let result = scan(&db.0, QUERY_TIMEOUT);
        assert!(matches!(result, CodexDiscovery::UnsupportedFormat { .. }));
    }

    #[test]
    fn missing_required_column_is_unsupported_format() {
        let db = TempDb::new();
        let conn = Connection::open(&db.0).unwrap();
        // A `threads` table that is missing `git_origin_url`.
        conn.execute_batch(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL, cli_version TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);",
        )
        .unwrap();
        let result = scan(&db.0, QUERY_TIMEOUT);
        match result {
            CodexDiscovery::UnsupportedFormat { reason } => assert!(reason.contains("git_origin_url")),
            other => panic!("expected UnsupportedFormat, got {other:?}"),
        }
    }

    #[test]
    fn reads_only_the_approved_columns_and_never_the_content_columns() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url, first_user_message, preview)
             VALUES ('t-1', 'C:\\work\\alpha', 1000, 2000, '0.153.4', 0, 'https://github.com/example-org/alpha.git', 'PRIVATE_PROMPT', 'PRIVATE_PREVIEW')",
            [],
        )
        .unwrap();
        drop(conn);

        let result = scan(&db.0, QUERY_TIMEOUT);
        let serialized = serde_json::to_string(&result).unwrap();
        let CodexDiscovery::Ok { threads, .. } = result else { panic!("expected Ok, got {serialized}") };
        assert_eq!(threads.len(), 1);
        let row = &threads[0];
        assert_eq!(row.id, "t-1");
        assert_eq!(row.cwd, "C:\\work\\alpha");
        assert_eq!(row.git_origin_url.as_deref(), Some("https://github.com/example-org/alpha.git"));
        // The struct has no field for first_user_message/preview at all: there is no way for a
        // caller to observe them even if a future change added them to the SELECT by mistake,
        // short of this test itself, which inserted values distinct enough to fail loudly if
        // they ever leaked into any string field above.
        assert!(!serialized.contains("PRIVATE_PROMPT"));
        assert!(!serialized.contains("PRIVATE_PREVIEW"));
    }

    /// Inserts `count` ordinary rows in one transaction (fast enough for cap-sized fixtures).
    fn insert_ordinary_rows(path: &std::path::Path, count: usize) {
        let mut conn = Connection::open(path).unwrap();
        let tx = conn.transaction().unwrap();
        {
            let mut insert = tx
                .prepare(
                    "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
                     VALUES (?1, 'C:\\work', ?2, ?2, '0.1.0', 0, NULL)",
                )
                .unwrap();
            for i in 0..count {
                insert.execute(rusqlite::params![format!("t-{i}"), i as i64]).unwrap();
            }
        }
        tx.commit().unwrap();
    }

    fn scan_ok(path: &std::path::Path) -> (Vec<CodexThreadRow>, bool) {
        match scan(path, QUERY_TIMEOUT) {
            CodexDiscovery::Ok { threads, complete } => (threads, complete),
            other => panic!("expected Ok, got {other:?}"),
        }
    }

    #[test]
    fn the_cap_is_the_human_decided_1000() {
        assert_eq!(MAX_SESSIONS, 1000, "DF-01 Human Decision: MAX_SESSIONS 200 -> 1000");
    }

    /// DF-01 A: the real dogfood volume (379 threads) is now a complete scan.
    #[test]
    fn a_real_sized_379_row_dataset_is_complete() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        insert_ordinary_rows(&db.0, 379);
        let (threads, complete) = scan_ok(&db.0);
        assert_eq!(threads.len(), 379);
        assert!(complete, "379 rows is below the cap: the scan must be complete");
    }

    /// DF-01 B: exactly MAX_SESSIONS rows with nothing beyond them is complete (`LIMIT MAX+1`
    /// returns MAX rows, never the (MAX+1)th, so nothing proves more exist).
    #[test]
    fn exactly_the_cap_is_complete_when_no_more_rows_exist() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        insert_ordinary_rows(&db.0, MAX_SESSIONS);
        let (threads, complete) = scan_ok(&db.0);
        assert_eq!(threads.len(), MAX_SESSIONS);
        assert!(complete, "exactly the cap, with no (MAX+1)th row, must be complete");
    }

    /// DF-01 C: MAX_SESSIONS + 1 rows returns at most MAX_SESSIONS and is incomplete.
    #[test]
    fn one_row_over_the_cap_is_truncated_and_incomplete() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        insert_ordinary_rows(&db.0, MAX_SESSIONS + 1);
        let (threads, complete) = scan_ok(&db.0);
        assert_eq!(threads.len(), MAX_SESSIONS);
        assert!(!complete, "a (MAX+1)th row proves more exist: this must be incomplete");
    }

    #[test]
    fn row_count_is_bounded() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        insert_ordinary_rows(&db.0, MAX_SESSIONS + 10);
        let (threads, complete) = scan_ok(&db.0);
        assert_eq!(threads.len(), MAX_SESSIONS);
        assert!(!complete, "more rows exist than the cap: this must be marked incomplete (RF-P4B1-02 §5)");
    }

    #[test]
    fn a_scan_that_does_not_hit_any_cap_is_marked_complete() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('t-1', 'C:\\work', 0, 0, '0.1.0', 0, NULL)",
            [],
        )
        .unwrap();
        drop(conn);
        let result = scan(&db.0, QUERY_TIMEOUT);
        let CodexDiscovery::Ok { threads, complete } = result else { panic!("expected Ok, got {result:?}") };
        assert_eq!(threads.len(), 1);
        assert!(complete, "F: a complete scan with no cap hit must be marked complete");
    }

    #[test]
    fn a_row_with_an_oversized_metadata_string_is_dropped_not_truncated_and_kept() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        let oversized_cwd = "C:\\".to_string() + &"x".repeat(MAX_METADATA_STRING_LEN + 1);
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('oversized', ?1, 0, 0, '0.1.0', 0, NULL)",
            rusqlite::params![oversized_cwd],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('normal', 'C:\\work\\alpha', 0, 0, '0.1.0', 0, NULL)",
            [],
        )
        .unwrap();
        drop(conn);
        let result = scan(&db.0, QUERY_TIMEOUT);
        let CodexDiscovery::Ok { threads, complete } = result else { panic!("expected Ok, got {result:?}") };
        assert_eq!(threads.len(), 1, "the oversized row must be dropped, the normal one kept");
        assert_eq!(threads[0].id, "normal");
        assert!(complete, "dropping one anomalous row is not the same as hitting the session cap");
    }

    /// A: the length check happens on the *borrowed* SQLite value, before any owned `String` is
    /// allocated — proven here by exercising every text column (`id`, `cli_version`,
    /// `git_origin_url`, not just `cwd` as above) and confirming each oversized row is dropped
    /// whole rather than the oversized field being silently substituted or truncated.
    #[test]
    fn every_approved_text_column_is_bounds_checked_before_allocation() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        let oversized = "x".repeat(MAX_METADATA_STRING_LEN + 1);
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES (?1, 'C:\\work', 0, 0, '0.1.0', 0, NULL)",
            rusqlite::params![oversized],
        )
        .unwrap(); // oversized id
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('t-2', 'C:\\work', 0, 0, ?1, 0, NULL)",
            rusqlite::params![oversized],
        )
        .unwrap(); // oversized cli_version
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('t-3', 'C:\\work', 0, 0, '0.1.0', 0, ?1)",
            rusqlite::params![oversized],
        )
        .unwrap(); // oversized git_origin_url
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('t-4', 'C:\\work', 0, 0, '0.1.0', 0, NULL)",
            [],
        )
        .unwrap(); // the one row that should survive
        drop(conn);
        let result = scan(&db.0, QUERY_TIMEOUT);
        let CodexDiscovery::Ok { threads, .. } = result else { panic!("expected Ok, got {result:?}") };
        assert_eq!(threads.len(), 1, "only the well-formed row must survive: {threads:?}");
        assert_eq!(threads[0].id, "t-4");
    }

    /// B: a deadline that has already passed by the time the scan would run must fail closed to
    /// incomplete rather than attempt (and possibly still complete) a query with no time budget.
    #[test]
    fn a_deadline_already_in_the_past_fails_closed_to_incomplete_without_querying() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        conn.execute(
            "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
             VALUES ('t-1', 'C:\\work', 0, 0, '0.1.0', 0, NULL)",
            [],
        )
        .unwrap();
        drop(conn);
        let result = scan(&db.0, Duration::ZERO);
        let CodexDiscovery::Ok { threads, complete } = result else { panic!("expected Ok, got {result:?}") };
        assert!(!complete, "an already-past deadline must never read as a complete scan");
        assert!(threads.is_empty(), "no row is returned when the budget is exhausted before querying");
    }

    /// B (supplementary): a genuinely slow query (an unindexed `ORDER BY` over a large table) does
    /// not make the scan hang — it returns within a small bounded multiple of the configured
    /// timeout, whatever the actual outcome (interrupted or, on a very fast machine, finished
    /// first). This exercises the real `InterruptHandle` path end-to-end without asserting a
    /// specific timing-dependent outcome, which would make the test flaky.
    #[test]
    fn a_slow_query_never_makes_the_scan_wait_far_beyond_its_timeout() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        conn.execute_batch("BEGIN;").unwrap();
        {
            let mut insert = conn
                .prepare("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url) VALUES (?1, 'C:\\work', ?2, ?2, '0.1.0', 0, NULL)")
                .unwrap();
            for i in 0..50_000i64 {
                insert.execute(rusqlite::params![format!("t-{i}"), i]).unwrap();
            }
        }
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let budget = Duration::from_millis(5);
        let started = Instant::now();
        let _ = scan(&db.0, budget);
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_secs(5),
            "a slow query must not be allowed to run far past its {budget:?} budget; took {elapsed:?}"
        );
    }

    // C ("LIMIT MAX+1 marks incomplete") is exactly `row_count_is_bounded` above, which already
    // asserts `!complete` when more rows exist than the cap.

    #[test]
    fn writing_through_the_reader_connection_is_impossible() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = open_read_only(&db.0).unwrap();
        let attempt = conn.execute("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version) VALUES ('x','x',0,0,'x')", []);
        assert!(attempt.is_err(), "a read-only connection must refuse a write");
    }
}
