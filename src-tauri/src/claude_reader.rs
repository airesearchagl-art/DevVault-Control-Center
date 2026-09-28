//! Phase 4b-1: read-only discovery of local Claude Code sessions from filesystem metadata only.
//!
//! Historical discovery lists directory and file *names* under `<home>/.claude/projects/` and
//! reads file *metadata* (modified time) — it never opens a `.jsonl` transcript. Live discovery
//! reads `<home>/.claude/sessions/*.json` (provider runtime metadata, not transcript content) but
//! deserializes directly into `LiveSessionFields`, which has no field for anything beyond
//! `sessionId` / `cwd` / `updatedAt` / `version`: an unlisted key in the source JSON is dropped by
//! `serde` during parsing, not merely left unused afterward.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

const CLAUDE_HOME_ENV: &str = "DVCC_CLAUDE_HOME_DIR";

/// Bounds untrusted provider input (Task Packet §18).
const MAX_PROJECT_DIRS: usize = 500;
const MAX_SESSIONS_PER_DIR: usize = 500;
const MAX_LIVE_SESSIONS: usize = 200;
/// A live session-lock file is a few hundred bytes; anything wildly larger is not one.
const MAX_LIVE_SESSION_FILE_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoricalCandidate {
    pub encoded_dir_name: String,
    pub session_id: String,
    pub updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveSessionFields {
    session_id: String,
    cwd: String,
    #[serde(default)]
    updated_at: Option<i64>,
    #[serde(default)]
    version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSession {
    pub session_id: String,
    pub cwd: String,
    pub updated_at_ms: Option<i64>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ClaudeDiscovery {
    Ok {
        historical: Vec<HistoricalCandidate>,
        live: Vec<LiveSession>,
    },
    Unavailable {
        reason: String,
    },
}

fn claude_home() -> Option<PathBuf> {
    if let Some(overridden) = std::env::var_os(CLAUDE_HOME_ENV) {
        return Some(PathBuf::from(overridden));
    }
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

/// A valid Claude Code session transcript file name: `<uuid>.jsonl`, checked by shape only (36
/// hex/hyphen characters), never opened.
fn session_id_from_jsonl_name(file_name: &str) -> Option<String> {
    let stem = file_name.strip_suffix(".jsonl")?;
    let bytes = stem.as_bytes();
    if bytes.len() != 36 {
        return None;
    }
    for (i, byte) in bytes.iter().enumerate() {
        let expected_dash = matches!(i, 8 | 13 | 18 | 23);
        if expected_dash {
            if *byte != b'-' {
                return None;
            }
        } else if !byte.is_ascii_hexdigit() {
            return None;
        }
    }
    Some(stem.to_string())
}

fn modified_ms(path: &std::path::Path) -> Option<u64> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let since_epoch = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(since_epoch.as_millis() as u64)
}

fn scan_historical(projects_dir: &std::path::Path) -> Vec<HistoricalCandidate> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(projects_dir) else {
        return out;
    };
    for entry in entries.flatten().take(MAX_PROJECT_DIRS) {
        let Ok(file_type) = entry.file_type() else { continue };
        if !file_type.is_dir() {
            continue;
        }
        let encoded_dir_name = entry.file_name().to_string_lossy().into_owned();
        let dir_path = entry.path();
        let Ok(session_files) = std::fs::read_dir(&dir_path) else { continue };
        for session_entry in session_files.flatten().take(MAX_SESSIONS_PER_DIR) {
            let Ok(session_file_type) = session_entry.file_type() else { continue };
            if !session_file_type.is_file() {
                continue;
            }
            let name = session_entry.file_name().to_string_lossy().into_owned();
            let Some(session_id) = session_id_from_jsonl_name(&name) else { continue };
            out.push(HistoricalCandidate {
                encoded_dir_name: encoded_dir_name.clone(),
                session_id,
                updated_at_ms: modified_ms(&session_entry.path()),
            });
        }
    }
    out
}

fn scan_live(sessions_dir: &std::path::Path) -> Vec<LiveSession> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(sessions_dir) else {
        return out;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_LIVE_SESSIONS {
            break;
        }
        let Ok(file_type) = entry.file_type() else { continue };
        if !file_type.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue; // skips the `.key` files alongside them
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::metadata(&path) else { continue };
        if metadata.len() > MAX_LIVE_SESSION_FILE_BYTES {
            continue; // not a plausible session-lock file; fail closed rather than read it
        }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let Ok(fields) = serde_json::from_str::<LiveSessionFields>(&text) else { continue };
        out.push(LiveSession {
            session_id: fields.session_id,
            cwd: fields.cwd,
            updated_at_ms: fields.updated_at,
            version: fields.version,
        });
    }
    out
}

fn scan(home: &std::path::Path) -> ClaudeDiscovery {
    let base = home.join(".claude");
    if !base.exists() {
        return ClaudeDiscovery::Unavailable {
            reason: "the Claude Code data directory does not exist".to_string(),
        };
    }
    let historical = scan_historical(&base.join("projects"));
    let live = scan_live(&base.join("sessions"));
    ClaudeDiscovery::Ok { historical, live }
}

#[tauri::command]
pub async fn discover_claude_sessions() -> ClaudeDiscovery {
    match claude_home() {
        Some(home) => scan(&home),
        None => ClaudeDiscovery::Unavailable {
            reason: "could not determine the user's home directory".to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    struct TempHome(PathBuf);
    impl TempHome {
        fn new() -> Self {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!("dvcc-claude-reader-test-{id}"));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn missing_claude_dir_is_unavailable() {
        let home = TempHome::new();
        let result = scan(&home.0);
        assert!(matches!(result, ClaudeDiscovery::Unavailable { .. }));
    }

    #[test]
    fn historical_discovery_lists_valid_jsonl_names_and_skips_malformed_ones() {
        let home = TempHome::new();
        let project_dir = home.0.join(".claude").join("projects").join("C--work-alpha");
        std::fs::create_dir_all(&project_dir).unwrap();
        let valid_id = "0123456789ab-cdef-0123-4567-89abcdef0123"; // wrong shape on purpose below
        // A correctly-shaped UUID-like name:
        let good_name = "104d8660-8d5f-49f7-b481-7c57dbe9d26a.jsonl";
        std::fs::write(project_dir.join(good_name), "should never be opened by the reader").unwrap();
        // Malformed names that must be ignored, not guessed at:
        std::fs::write(project_dir.join("not-a-session.jsonl"), "x").unwrap();
        std::fs::write(project_dir.join(format!("{valid_id}.jsonl")), "x").unwrap();
        std::fs::write(project_dir.join("104d8660-8d5f-49f7-b481-7c57dbe9d26a.txt"), "x").unwrap();

        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { historical, .. } = result else { panic!("expected Ok") };
        assert_eq!(historical.len(), 1, "only the well-formed jsonl name is a candidate: {historical:?}");
        assert_eq!(historical[0].session_id, "104d8660-8d5f-49f7-b481-7c57dbe9d26a");
        assert_eq!(historical[0].encoded_dir_name, "C--work-alpha");
        assert!(historical[0].updated_at_ms.is_some());
    }

    #[test]
    fn live_discovery_retains_only_approved_fields() {
        let home = TempHome::new();
        let sessions_dir = home.0.join(".claude").join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        std::fs::write(
            sessions_dir.join("12345.json"),
            r#"{"pid":12345,"sessionId":"abc-123","cwd":"C:\\work\\alpha","updatedAt":1700000000000,
               "version":"2.1.283","messagingSocketPath":"PRIVATE_SOCKET_PATH","name":"PRIVATE_NAME",
               "bridgeSessionId":"PRIVATE_BRIDGE_ID"}"#,
        )
        .unwrap();
        // A `.key` file beside it must be ignored (it is not `.json`).
        std::fs::write(sessions_dir.join("12345.deadbeef.key"), "not json").unwrap();

        let result = scan(&home.0);
        let serialized = serde_json::to_string(&result).unwrap();
        let ClaudeDiscovery::Ok { live, .. } = result else { panic!("expected Ok") };
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].session_id, "abc-123");
        assert_eq!(live[0].cwd, "C:\\work\\alpha");
        assert_eq!(live[0].version.as_deref(), Some("2.1.283"));

        assert!(!serialized.contains("PRIVATE_SOCKET_PATH"));
        assert!(!serialized.contains("PRIVATE_NAME"));
        assert!(!serialized.contains("PRIVATE_BRIDGE_ID"));
    }

    #[test]
    fn oversized_live_session_file_is_skipped() {
        let home = TempHome::new();
        let sessions_dir = home.0.join(".claude").join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        let huge_padding = "x".repeat((MAX_LIVE_SESSION_FILE_BYTES as usize) + 1);
        std::fs::write(
            sessions_dir.join("1.json"),
            format!(r#"{{"sessionId":"s","cwd":"C:\\a","_pad":"{huge_padding}"}}"#),
        )
        .unwrap();
        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { live, .. } = result else { panic!("expected Ok") };
        assert!(live.is_empty(), "an oversized file must be skipped, not parsed");
    }

    #[test]
    fn malformed_live_session_json_is_skipped_not_fatal() {
        let home = TempHome::new();
        let sessions_dir = home.0.join(".claude").join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        std::fs::write(sessions_dir.join("1.json"), "{ this is not valid json").unwrap();
        std::fs::write(sessions_dir.join("2.json"), r#"{"sessionId":"ok","cwd":"C:\\a"}"#).unwrap();
        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { live, .. } = result else { panic!("expected Ok") };
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].session_id, "ok");
    }
}
