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
use std::time::{Duration, Instant, UNIX_EPOCH};

const CLAUDE_HOME_ENV: &str = "DVCC_CLAUDE_HOME_DIR";

/// Bounds untrusted provider input (Task Packet §18 / Independent Review RF-P4B1-02).
const MAX_PROJECT_DIRS: usize = 500;
const MAX_SESSIONS_PER_DIR: usize = 500;
/// A global ceiling on top of the per-directory one above: `MAX_PROJECT_DIRS *
/// MAX_SESSIONS_PER_DIR` alone would still allow up to 250,000 candidates, which is not a
/// "practical" cap. Historical scanning stops the instant this many candidates are collected,
/// across every directory combined.
const MAX_HISTORICAL_CANDIDATES: usize = 500;
const MAX_LIVE_SESSIONS: usize = 200;
/// A live session-lock file is a few hundred bytes; anything wildly larger is not one.
const MAX_LIVE_SESSION_FILE_BYTES: u64 = 64 * 1024;
/// A session id, cwd or version string this long is not plausible metadata; the session it came
/// from is dropped rather than trusted (mirrors `codex_reader.rs`'s `MAX_METADATA_STRING_LEN`).
const MAX_METADATA_STRING_LEN: usize = 4096;
/// Discovery cannot wait indefinitely on a pathological filesystem (Task Packet §18): both the
/// historical and the live walk are bounded by this wall-clock deadline, checked between
/// directory entries, and return whatever was collected so far rather than hang.
const SCAN_TIMEOUT: Duration = Duration::from_secs(5);

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
        /// `false` when `MAX_PROJECT_DIRS`, `MAX_SESSIONS_PER_DIR`, `MAX_HISTORICAL_CANDIDATES`,
        /// `MAX_LIVE_SESSIONS` or `SCAN_TIMEOUT` stopped enumeration early (Independent Review
        /// RF-P4B1-02 §6): an apparently-empty or short result must never be read as "no more
        /// sessions exist" when this is `false`.
        complete: bool,
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

/// Returns the candidates found and whether enumeration ran to completion. `.take(N)` alone cannot
/// answer that (it silently stops, indistinguishable from "there were exactly N"), so directory and
/// per-directory session counts are tracked manually instead (Independent Review RF-P4B1-02 §6).
fn scan_historical(projects_dir: &std::path::Path) -> (Vec<HistoricalCandidate>, bool) {
    let mut out = Vec::new();
    let mut complete = true;
    let Ok(entries) = std::fs::read_dir(projects_dir) else {
        return (out, complete);
    };
    let deadline = Instant::now() + SCAN_TIMEOUT;
    let mut dir_index = 0usize;
    'directories: for entry in entries.flatten() {
        if Instant::now() >= deadline {
            complete = false;
            break;
        }
        if dir_index >= MAX_PROJECT_DIRS {
            complete = false;
            break;
        }
        dir_index += 1;
        let Ok(file_type) = entry.file_type() else { continue };
        if !file_type.is_dir() {
            continue;
        }
        let encoded_dir_name = entry.file_name().to_string_lossy().into_owned();
        if encoded_dir_name.len() > MAX_METADATA_STRING_LEN {
            continue; // not a plausible encoded workspace directory name
        }
        let dir_path = entry.path();
        let Ok(session_files) = std::fs::read_dir(&dir_path) else { continue };
        let mut session_index = 0usize;
        for session_entry in session_files.flatten() {
            if out.len() >= MAX_HISTORICAL_CANDIDATES || Instant::now() >= deadline {
                complete = false;
                break 'directories;
            }
            if session_index >= MAX_SESSIONS_PER_DIR {
                complete = false;
                break; // just this directory's remainder; other directories are still scanned
            }
            session_index += 1;
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
    (out, complete)
}

/// A parsed live session is only kept if every string field is a plausible length
/// (Independent Review RF-P4B1-02) — never truncated and kept, dropped entirely instead.
fn live_fields_within_bounds(fields: &LiveSessionFields) -> bool {
    fields.session_id.len() <= MAX_METADATA_STRING_LEN
        && fields.cwd.len() <= MAX_METADATA_STRING_LEN
        && fields.version.as_ref().is_none_or(|version| version.len() <= MAX_METADATA_STRING_LEN)
}

fn scan_live(sessions_dir: &std::path::Path) -> (Vec<LiveSession>, bool) {
    let mut out = Vec::new();
    let mut complete = true;
    let Ok(entries) = std::fs::read_dir(sessions_dir) else {
        return (out, complete);
    };
    let deadline = Instant::now() + SCAN_TIMEOUT;
    for entry in entries.flatten() {
        if out.len() >= MAX_LIVE_SESSIONS || Instant::now() >= deadline {
            complete = false;
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
        if !live_fields_within_bounds(&fields) {
            continue;
        }
        out.push(LiveSession {
            session_id: fields.session_id,
            cwd: fields.cwd,
            updated_at_ms: fields.updated_at,
            version: fields.version,
        });
    }
    (out, complete)
}

fn scan(home: &std::path::Path) -> ClaudeDiscovery {
    let base = home.join(".claude");
    if !base.exists() {
        return ClaudeDiscovery::Unavailable {
            reason: "the Claude Code data directory does not exist".to_string(),
        };
    }
    let (historical, historical_complete) = scan_historical(&base.join("projects"));
    let (live, live_complete) = scan_live(&base.join("sessions"));
    ClaudeDiscovery::Ok {
        historical,
        live,
        complete: historical_complete && live_complete,
    }
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
    fn a_live_session_with_an_implausibly_long_cwd_is_dropped_not_truncated_and_kept() {
        let home = TempHome::new();
        let sessions_dir = home.0.join(".claude").join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        // Well under MAX_LIVE_SESSION_FILE_BYTES (64 KiB) as a whole file, but the cwd field alone
        // exceeds MAX_METADATA_STRING_LEN (4096) — this exercises the per-field bound, not the
        // whole-file size bound already covered above.
        let oversized_cwd = "C:\\".to_string() + &"a".repeat(MAX_METADATA_STRING_LEN + 1);
        std::fs::write(
            sessions_dir.join("1.json"),
            format!(r#"{{"sessionId":"oversized","cwd":"{oversized_cwd}"}}"#),
        )
        .unwrap();
        std::fs::write(sessions_dir.join("2.json"), r#"{"sessionId":"normal","cwd":"C:\\a"}"#).unwrap();
        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { live, .. } = result else { panic!("expected Ok") };
        assert_eq!(live.len(), 1, "the oversized session must be dropped, the normal one kept");
        assert_eq!(live[0].session_id, "normal");
    }

    #[test]
    fn historical_discovery_is_bounded_by_a_global_cap_across_all_directories() {
        let home = TempHome::new();
        let projects_dir = home.0.join(".claude").join("projects");
        // MAX_HISTORICAL_CANDIDATES (500) split across several directories, plus enough extra to
        // prove the cap is global, not merely per-directory.
        let per_dir = 50;
        let dir_count = (MAX_HISTORICAL_CANDIDATES / per_dir) + 3;
        'outer: for d in 0..dir_count {
            let dir = projects_dir.join(format!("dir-{d}"));
            std::fs::create_dir_all(&dir).unwrap();
            for s in 0..per_dir {
                let uuid = format!("{:08x}-0000-0000-0000-{:012x}", d, s);
                std::fs::write(dir.join(format!("{uuid}.jsonl")), "never opened").unwrap();
                if d * per_dir + s + 1 >= MAX_HISTORICAL_CANDIDATES + per_dir {
                    break 'outer;
                }
            }
        }
        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { historical, complete, .. } = result else { panic!("expected Ok") };
        assert!(
            historical.len() <= MAX_HISTORICAL_CANDIDATES,
            "expected at most {MAX_HISTORICAL_CANDIDATES}, got {}",
            historical.len()
        );
        assert!(!complete, "D: hitting the global historical cap must mark the scan incomplete");
    }

    #[test]
    fn live_discovery_marks_incomplete_when_the_live_session_cap_is_hit() {
        let home = TempHome::new();
        let sessions_dir = home.0.join(".claude").join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        for i in 0..(MAX_LIVE_SESSIONS + 5) {
            std::fs::write(
                sessions_dir.join(format!("{i}.json")),
                format!(r#"{{"sessionId":"s-{i}","cwd":"C:\\a"}}"#),
            )
            .unwrap();
        }
        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { live, complete, .. } = result else { panic!("expected Ok") };
        assert_eq!(live.len(), MAX_LIVE_SESSIONS);
        assert!(!complete, "D: hitting the live-session cap must mark the scan incomplete");
    }

    #[test]
    fn a_scan_with_no_cap_hit_is_marked_complete() {
        let home = TempHome::new();
        let sessions_dir = home.0.join(".claude").join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        std::fs::write(sessions_dir.join("1.json"), r#"{"sessionId":"s-1","cwd":"C:\\a"}"#).unwrap();
        let result = scan(&home.0);
        let ClaudeDiscovery::Ok { complete, .. } = result else { panic!("expected Ok") };
        assert!(complete, "F: a scan that hits no cap must be marked complete");
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
