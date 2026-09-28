//! Phase 4b-1: read-only discovery of local Codex sessions from Codex's own SQLite state file.
//!
//! Everything here is defense-in-depth read-only: the connection is opened with
//! `SQLITE_OPEN_READ_ONLY` (no `CREATE`; any write is refused by SQLite itself, not just by this
//! code not issuing one), `query_only` is set as a second, independent guard, and every SQL
//! statement is a fixed string with an explicit column list — never `SELECT *`, never built from
//! caller input. `first_user_message` and `preview` (the two content-bearing columns Human Decision
//! HD-P4B-08 / Task Packet §8 names) are never referenced anywhere in this file.
//!
//! DVCC never creates, migrates or repairs this file: it belongs to Codex.

use rusqlite::{Connection, Error as SqliteError, OpenFlags};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

/// Codex writes its own state as `<home>/.codex/state_5.sqlite`; test runs may point elsewhere.
const CODEX_HOME_ENV: &str = "DVCC_CODEX_HOME_DIR";
const STATE_DB_FILE: &str = "state_5.sqlite";

/// Fail closed rather than wait indefinitely on a database Codex is actively writing.
const BUSY_TIMEOUT: Duration = Duration::from_millis(2000);

/// Bounds untrusted provider input (Task Packet §18): a pathological state file cannot make
/// discovery return an unbounded amount of data.
const MAX_SESSIONS: usize = 200;

/// A row whose `id`, `cwd`, `cli_version` or `git_origin_url` exceeds this length is not a
/// plausible metadata value — session ids, paths and version strings are always far shorter — and
/// is dropped rather than trusted (Independent Review RF-P4B1-02). No provider string is ever
/// truncated and kept: a value this large is treated as a format anomaly, not partial data.
const MAX_METADATA_STRING_LEN: usize = 4096;

fn within_bounds(row: &CodexThreadRow) -> bool {
    row.id.len() <= MAX_METADATA_STRING_LEN
        && row.cwd.len() <= MAX_METADATA_STRING_LEN
        && row.cli_version.len() <= MAX_METADATA_STRING_LEN
        && row.git_origin_url.as_ref().is_none_or(|url| url.len() <= MAX_METADATA_STRING_LEN)
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
    Ok { threads: Vec<CodexThreadRow> },
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

/// Opens `path` strictly read-only. `query_only` is a second, independent guard on top of the
/// open flag: even a future code change that somehow issued a write would still be refused by
/// SQLite itself, not merely by this function not calling one.
fn open_read_only(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "query_only", true)?;
    Ok(conn)
}

fn scan(path: &std::path::Path) -> CodexDiscovery {
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

    // Fixed statement, explicit column list, bounded row count. `first_user_message` and
    // `preview` never appear here.
    let query = format!(
        "SELECT id, cwd, created_at, updated_at, cli_version, archived, git_origin_url \
         FROM threads ORDER BY updated_at DESC LIMIT {MAX_SESSIONS}"
    );
    let mut statement = match conn.prepare(&query) {
        Ok(statement) => statement,
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("query failed: {error}"),
            }
        }
    };
    let rows = statement.query_map([], |row| {
        Ok(CodexThreadRow {
            id: row.get(0)?,
            cwd: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            cli_version: row.get(4)?,
            archived: row.get::<_, i64>(5)? != 0,
            git_origin_url: row.get(6)?,
        })
    });
    let rows: Result<Vec<CodexThreadRow>, SqliteError> = match rows {
        Ok(mapped) => mapped.collect(),
        Err(error) => {
            return CodexDiscovery::Unavailable {
                reason: format!("query failed: {error}"),
            }
        }
    };
    match rows {
        // A row with an implausibly long metadata string is dropped, not truncated-and-kept: the
        // rest of the (bounded, well-formed) result is still returned rather than failing closed
        // for the whole scan over one anomalous row.
        Ok(threads) => CodexDiscovery::Ok {
            threads: threads.into_iter().filter(within_bounds).collect(),
        },
        Err(error) => CodexDiscovery::Unavailable {
            reason: format!("a row could not be read: {error}"),
        },
    }
}

#[tauri::command]
pub async fn discover_codex_sessions() -> CodexDiscovery {
    match state_db_path() {
        Some(path) => scan(&path),
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
        let result = scan(&db.0);
        assert!(matches!(result, CodexDiscovery::Unavailable { .. }));
    }

    #[test]
    fn missing_table_is_unsupported_format() {
        let db = TempDb::new();
        Connection::open(&db.0).unwrap();
        let result = scan(&db.0);
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
        let result = scan(&db.0);
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

        let result = scan(&db.0);
        let serialized = serde_json::to_string(&result).unwrap();
        let CodexDiscovery::Ok { threads } = result else { panic!("expected Ok, got {serialized}") };
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

    #[test]
    fn row_count_is_bounded() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = Connection::open(&db.0).unwrap();
        for i in 0..(MAX_SESSIONS + 10) {
            conn.execute(
                "INSERT INTO threads (id, cwd, created_at, updated_at, cli_version, archived, git_origin_url)
                 VALUES (?1, 'C:\\work', ?2, ?2, '0.1.0', 0, NULL)",
                rusqlite::params![format!("t-{i}"), i as i64],
            )
            .unwrap();
        }
        drop(conn);
        let result = scan(&db.0);
        let CodexDiscovery::Ok { threads } = result else { panic!("expected Ok, got {result:?}") };
        assert_eq!(threads.len(), MAX_SESSIONS);
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
        let result = scan(&db.0);
        let CodexDiscovery::Ok { threads } = result else { panic!("expected Ok, got {result:?}") };
        assert_eq!(threads.len(), 1, "the oversized row must be dropped, the normal one kept");
        assert_eq!(threads[0].id, "normal");
    }

    #[test]
    fn writing_through_the_reader_connection_is_impossible() {
        let db = TempDb::new();
        create_valid_schema(&db.0);
        let conn = open_read_only(&db.0).unwrap();
        let attempt = conn.execute("INSERT INTO threads (id, cwd, created_at, updated_at, cli_version) VALUES ('x','x',0,0,'x')", []);
        assert!(attempt.is_err(), "a read-only connection must refuse a write");
    }
}
