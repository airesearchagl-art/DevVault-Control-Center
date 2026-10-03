//! Phase 4b-2b: the one semantic native action "launch a validated Codex resume" (LRP-20261002-DVCC-010).
//!
//! The frontend never names a program, an argument list, a shell string or an environment value.
//! It supplies three facts — the Human-configured executable path, the full session ID and the
//! selected Project's root — and every one is independently re-validated here, at every launch:
//!
//! - the executable through the same local-path boundary as Project folders (`launcher::
//!   validate_local_entry`), then: basename exactly `codex.exe`, a PE image with the CONSOLE
//!   subsystem. `.cmd` / `.bat` / `.ps1` / `.com` / extensionless shims are refused outright, so no
//!   command interpreter can ever be involved (HD-4B2B-02);
//! - the session ID against the same strict lowercase UUID contract as Phase 4b-2a — never trimmed,
//!   lowercased or otherwise normalized into validity;
//! - the thread itself, read again from Codex's state file (read-only, fixed SQL, bound parameter,
//!   `id` / `cwd` / `archived` only): it must exist and not be archived;
//! - the Project root through `launcher::validate_project_folder`; the canonical result is used only
//!   as the child's working directory, never as an argument;
//! - the thread's own cwd as safety metadata (HD-4B2B-07): an authoritative local workspace that is
//!   clearly different from the Project root blocks the launch; a Codex-managed mirror or a cwd that
//!   cannot be established safely allows it, with a "Codex may ask which workspace to use" warning
//!   the Human must already have seen.
//!
//! The process is then created directly (`Command::new(exe).arg("resume").arg(id)`), with
//! `CREATE_NEW_CONSOLE` and DVCC's own (null, for the release GUI build) standard handles — never
//! piped — and the `Child` is dropped at once: fire-and-forget. Success means only that Windows
//! created the process; DVCC never observes whether Codex resumed the session.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::codex_reader::{self, ThreadLaunchLookup};
use crate::launcher::{self, LocalEntryKind};
use crate::CommandError;

/// `CREATE_NEW_CONSOLE` (WinBase.h): the child gets its own new console instead of inheriting one.
pub const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// The only argument besides the session ID that DVCC ever passes.
const RESUME_SUBCOMMAND: &str = "resume";
const CODEX_EXECUTABLE_NAME: &str = "codex.exe";

fn error(code: &'static str, message: impl Into<String>) -> CommandError {
    CommandError::new(code, message)
}

// --- session ID -------------------------------------------------------------------------------

/// Lowercase RFC 9562 UUID (versions 1-8, variant 10xx): the exact contract of Phase 4b-2a's
/// `parseSessionId`. Every byte is checked; nothing is trimmed or case-folded.
pub fn is_valid_session_id(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    let hex = |b: u8| b.is_ascii_digit() || (b'a'..=b'f').contains(&b);
    for (index, &byte) in bytes.iter().enumerate() {
        let ok = match index {
            8 | 13 | 18 | 23 => byte == b'-',
            14 => (b'1'..=b'8').contains(&byte),
            19 => matches!(byte, b'8' | b'9' | b'a' | b'b'),
            _ => hex(byte),
        };
        if !ok {
            return false;
        }
    }
    true
}

// --- executable -------------------------------------------------------------------------------

const IMAGE_SUBSYSTEM_WINDOWS_CUI: u16 = 3;
/// Bounds how far into an untrusted file the PE header offset may point.
const MAX_PE_HEADER_OFFSET: u32 = 64 * 1024;

/// Reads the PE optional header's `Subsystem` field. `None` when the file is not a well-formed PE
/// image (no `MZ`, no `PE\0\0`, an unknown optional-header magic, or truncated).
pub fn pe_subsystem<R: Read + Seek>(reader: &mut R) -> Option<u16> {
    let mut mz = [0u8; 2];
    reader.seek(SeekFrom::Start(0)).ok()?;
    reader.read_exact(&mut mz).ok()?;
    if &mz != b"MZ" {
        return None;
    }
    let mut lfanew = [0u8; 4];
    reader.seek(SeekFrom::Start(0x3C)).ok()?;
    reader.read_exact(&mut lfanew).ok()?;
    let pe_offset = u32::from_le_bytes(lfanew);
    if pe_offset > MAX_PE_HEADER_OFFSET {
        return None;
    }
    let mut signature = [0u8; 4];
    reader.seek(SeekFrom::Start(u64::from(pe_offset))).ok()?;
    reader.read_exact(&mut signature).ok()?;
    if &signature != b"PE\0\0" {
        return None;
    }
    // COFF file header is 20 bytes; the optional header follows it.
    let optional = u64::from(pe_offset) + 4 + 20;
    let mut magic = [0u8; 2];
    reader.seek(SeekFrom::Start(optional)).ok()?;
    reader.read_exact(&mut magic).ok()?;
    if !matches!(u16::from_le_bytes(magic), 0x10b | 0x20b) {
        return None;
    }
    // `Subsystem` sits at offset 68 in both the PE32 and PE32+ optional headers.
    let mut subsystem = [0u8; 2];
    reader.seek(SeekFrom::Start(optional + 68)).ok()?;
    reader.read_exact(&mut subsystem).ok()?;
    Some(u16::from_le_bytes(subsystem))
}

fn file_name_lower(path: &Path) -> Option<String> {
    path.file_name().map(|name| name.to_string_lossy().to_lowercase())
}

/// The Human-configured Codex executable, re-validated from scratch (Task Packet §4/§7). Returns the
/// canonical local path that is what gets started. No process is run to validate it.
pub fn validate_codex_executable(raw: &str) -> Result<PathBuf, CommandError> {
    if raw.trim().is_empty() {
        return Err(error("CODEX_EXECUTABLE_NOT_CONFIGURED", "no Codex executable is configured"));
    }
    // Decided from the configured name before the file system is touched: a script or shim needs
    // a command interpreter, which this launcher never uses.
    let name = file_name_lower(Path::new(raw.trim())).unwrap_or_default();
    let extension = Path::new(&name).extension().map(|e| e.to_string_lossy().into_owned());
    match extension.as_deref() {
        None => return Err(error("UNSUPPORTED_CODEX_LAUNCHER", "an extensionless launcher is not a native executable")),
        Some("cmd" | "bat" | "ps1" | "com" | "js" | "vbs" | "wsf") => {
            return Err(error("UNSUPPORTED_CODEX_LAUNCHER", "script and shim launchers are not supported; configure the native codex.exe"))
        }
        Some(_) => {}
    }
    if name != CODEX_EXECUTABLE_NAME {
        return Err(error("CODEX_EXECUTABLE_UNTRUSTED", "the executable must be named codex.exe"));
    }
    let canonical = launcher::validate_local_entry(raw, LocalEntryKind::File)
        .map_err(|rejected| error("CODEX_EXECUTABLE_UNTRUSTED", format!("{}: {}", rejected.code, rejected.message)))?;
    // A link named codex.exe must also resolve to a file named codex.exe.
    if file_name_lower(&canonical).as_deref() != Some(CODEX_EXECUTABLE_NAME) {
        return Err(error("CODEX_EXECUTABLE_UNTRUSTED", "the executable's final target is not named codex.exe"));
    }
    let mut file = File::open(&canonical).map_err(|e| error("CODEX_EXECUTABLE_UNTRUSTED", format!("the executable could not be read: {e}")))?;
    match pe_subsystem(&mut file) {
        Some(IMAGE_SUBSYSTEM_WINDOWS_CUI) => Ok(canonical),
        Some(_) => Err(error("CODEX_EXECUTABLE_UNTRUSTED", "the executable is not a console (CUI) program")),
        None => Err(error("CODEX_EXECUTABLE_UNTRUSTED", "the file is not a Windows PE executable")),
    }
}

// --- project root and thread cwd --------------------------------------------------------------

pub fn validate_launch_root(raw: &str) -> Result<PathBuf, CommandError> {
    if raw.trim().is_empty() {
        return Err(error("NO_LOCAL_ROOT", "the Project has no local folder"));
    }
    launcher::validate_project_folder(raw).map_err(|rejected| error("UNSAFE_PROJECT_ROOT", rejected.code))
}

/// Same rule as the TS `isCodexManagedMirrorPath`: Codex's own sandboxed source mirror.
fn is_codex_managed_mirror(cwd: &str) -> bool {
    let lower = cwd.to_lowercase().replace('/', "\\");
    lower.contains(".codex\\project\\")
}

fn comparison_key(path: &Path) -> String {
    path.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceCheck {
    /// The thread's own workspace canonicalizes to exactly the Project root.
    Exact,
    /// No authoritative workspace identity (managed mirror, or a cwd that cannot be established
    /// safely): Codex may ask which workspace to use. The Human must have seen that warning.
    ProviderMayAsk,
}

pub fn classify_thread_cwd(thread_cwd: &str, canonical_root: &Path) -> Result<WorkspaceCheck, CommandError> {
    if is_codex_managed_mirror(thread_cwd) {
        return Ok(WorkspaceCheck::ProviderMayAsk);
    }
    // A verbatim drive path (`\\?\C:\…`) is the same local path; anything else verbatim / UNC is
    // refused by the shared validator and therefore cannot be authoritative.
    let candidate = match thread_cwd.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => rest,
        _ => thread_cwd,
    };
    match launcher::validate_project_folder(candidate) {
        Ok(canonical) if comparison_key(&canonical) == comparison_key(canonical_root) => Ok(WorkspaceCheck::Exact),
        Ok(_) => Err(error("CWD_MISMATCH", "the session's workspace is a different local folder than the Project's")),
        Err(_) => Ok(WorkspaceCheck::ProviderMayAsk),
    }
}

// --- the plan ---------------------------------------------------------------------------------

/// Everything the process creation will use, fixed by this module alone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchPlan {
    pub program: PathBuf,
    pub args: [String; 2],
    pub cwd: PathBuf,
    pub creation_flags: u32,
    pub workspace: WorkspaceCheck,
}

/// Validates every independent native fact, in a fixed order, and builds the plan. Launches nothing.
pub fn prepare_launch(executable_path: &str, session_id: &str, project_root: &str, state_db: Option<&Path>) -> Result<LaunchPlan, CommandError> {
    if !is_valid_session_id(session_id) {
        return Err(error("INVALID_SESSION_ID", "the session ID is not a full lowercase UUID"));
    }
    let program = validate_codex_executable(executable_path)?;
    let cwd = validate_launch_root(project_root)?;
    let Some(state_db) = state_db else {
        return Err(error("PROVIDER_UNAVAILABLE", "could not determine the Codex state file"));
    };
    let thread_cwd = match codex_reader::lookup_thread_for_launch(state_db, session_id) {
        ThreadLaunchLookup::Found { archived: true, .. } => return Err(error("ARCHIVED", "the session is archived")),
        ThreadLaunchLookup::Found { cwd, archived: false } => cwd,
        ThreadLaunchLookup::NotFound => return Err(error("SESSION_NOT_FOUND", "the session no longer exists in Codex's state")),
        ThreadLaunchLookup::Unavailable(reason) => return Err(error("PROVIDER_UNAVAILABLE", reason)),
    };
    let workspace = classify_thread_cwd(&thread_cwd, &cwd)?;
    Ok(LaunchPlan {
        program,
        args: [RESUME_SUBCOMMAND.to_string(), session_id.to_string()],
        cwd,
        creation_flags: CREATE_NEW_CONSOLE,
        workspace,
    })
}

/// The process exactly as planned: direct executable, argument array, working directory, creation
/// flags. Standard streams are left at their default (inherit) — never piped into DVCC.
fn build_command(plan: &LaunchPlan) -> Command {
    let mut command = Command::new(&plan.program);
    command.args(&plan.args).current_dir(&plan.cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(plan.creation_flags);
    }
    command
}

/// Creates the process and immediately drops the `Child`: DVCC does not wait for, watch, read from,
/// signal or terminate it. Dropping a `Child` does not kill the process.
fn spawn_detached(plan: &LaunchPlan) -> Result<(), CommandError> {
    build_command(plan)
        .spawn()
        .map(drop)
        .map_err(|e| error("PROCESS_LAUNCH_FAILED", format!("Windows could not start the process: {e}")))
}

// --- console safety ---------------------------------------------------------------------------

#[cfg(windows)]
mod std_handles {
    use std::ffi::c_void;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetStdHandle(std_handle: u32) -> *mut c_void;
    }

    const STD_INPUT_HANDLE: u32 = -10i32 as u32;
    const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    const STD_ERROR_HANDLE: u32 = -12i32 as u32;

    /// True when DVCC itself holds any usable standard handle (a debug console build, or a parent
    /// that redirected DVCC's streams). The child would then inherit those instead of getting its
    /// new console's own, so the launch fails closed.
    pub fn any_inherited() -> bool {
        [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE].iter().any(|&which| {
            // SAFETY: GetStdHandle only reads the process parameter block; no pointer is passed.
            let handle = unsafe { GetStdHandle(which) };
            !handle.is_null() && handle as isize != -1
        })
    }
}

#[cfg(not(windows))]
mod std_handles {
    pub fn any_inherited() -> bool {
        true
    }
}

// --- Tauri commands ---------------------------------------------------------------------------

/// Validates the Human-entered executable path for the configuration surface. Runs nothing.
#[tauri::command]
pub async fn validate_codex_executable_path(path: String) -> Result<(), CommandError> {
    validate_codex_executable(&path).map(|_| ())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumePreflight {
    /// The confirmation dialog must show "Codex may ask which workspace to use."
    pub workspace_warning: bool,
}

/// The confirmation-time recheck: every native fact the launch will check, minus process creation.
#[tauri::command]
pub async fn preflight_codex_resume(executable_path: String, session_id: String, project_root: String) -> Result<ResumePreflight, CommandError> {
    let plan = prepare_launch(&executable_path, &session_id, &project_root, codex_reader::launch_state_db_path().as_deref())?;
    Ok(ResumePreflight { workspace_warning: plan.workspace == WorkspaceCheck::ProviderMayAsk })
}

/// Checks everything again and starts exactly one Codex process. `workspace_warning_acknowledged`
/// is what the Human was shown: a launch that now needs the workspace warning, but was confirmed
/// without it, is refused rather than started.
#[tauri::command]
pub async fn launch_codex_resume(
    executable_path: String,
    session_id: String,
    project_root: String,
    workspace_warning_acknowledged: bool,
) -> Result<(), CommandError> {
    let plan = prepare_launch(&executable_path, &session_id, &project_root, codex_reader::launch_state_db_path().as_deref())?;
    launch_planned(&plan, workspace_warning_acknowledged, std_handles::any_inherited())
}

fn launch_planned(plan: &LaunchPlan, workspace_warning_acknowledged: bool, inherited_std_handles: bool) -> Result<(), CommandError> {
    if plan.workspace == WorkspaceCheck::ProviderMayAsk && !workspace_warning_acknowledged {
        return Err(error("STALE_DISCOVERY", "the workspace situation changed since confirmation; refresh and confirm again"));
    }
    if inherited_std_handles {
        return Err(error(
            "INTERACTIVE_CONSOLE_UNAVAILABLE",
            "DVCC has inherited standard handles; Codex would not get its own interactive console",
        ));
    }
    spawn_detached(plan)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::tests::TempDir;
    use rusqlite::Connection;
    use std::io::Cursor;
    use std::sync::{Mutex, OnceLock};

    const ID: &str = "019c1a2b-3c4d-7bbb-8bbb-000000000002";

    // --- session id ---

    #[test]
    fn accepts_only_the_strict_lowercase_uuid_contract() {
        assert!(is_valid_session_id(ID));
        assert!(is_valid_session_id("11111111-1111-1111-8111-111111111111"));
        for bad in [
            "",
            "019C1A2B-3C4D-7BBB-8BBB-000000000002",
            " 019c1a2b-3c4d-7bbb-8bbb-000000000002",
            "019c1a2b-3c4d-7bbb-8bbb-000000000002 ",
            "019c1a2b-3c4d-7bbb-8bbb-000000000002\n",
            "019c1a2b-3c4d-0bbb-8bbb-000000000002",
            "019c1a2b-3c4d-7bbb-cbbb-000000000002",
            "019c1a2b3c4d7bbb8bbb000000000002",
            "--last",
            "my-session-name",
            "019c1a2b-3c4d-7bbb-8bbb-00000000000g",
            "019c1a2b-3c4d-7bbb-8bbb-000000000002;calc",
        ] {
            assert!(!is_valid_session_id(bad), "{bad:?}");
        }
    }

    // --- PE parsing ---

    fn synthetic_pe(subsystem: u16, magic: u16) -> Vec<u8> {
        let mut bytes = vec![0u8; 512];
        bytes[0..2].copy_from_slice(b"MZ");
        bytes[0x3C..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes[0x80..0x84].copy_from_slice(b"PE\0\0");
        let optional = 0x80 + 4 + 20;
        bytes[optional..optional + 2].copy_from_slice(&magic.to_le_bytes());
        bytes[optional + 68..optional + 70].copy_from_slice(&subsystem.to_le_bytes());
        bytes
    }

    #[test]
    fn reads_the_pe_subsystem_and_rejects_non_pe_input() {
        assert_eq!(pe_subsystem(&mut Cursor::new(synthetic_pe(3, 0x20b))), Some(3));
        assert_eq!(pe_subsystem(&mut Cursor::new(synthetic_pe(2, 0x10b))), Some(2));
        assert_eq!(pe_subsystem(&mut Cursor::new(synthetic_pe(3, 0x999))), None);
        assert_eq!(pe_subsystem(&mut Cursor::new(b"@ECHO off\r\n".to_vec())), None);
        assert_eq!(pe_subsystem(&mut Cursor::new(Vec::new())), None);
        let mut far = synthetic_pe(3, 0x20b);
        far[0x3C..0x40].copy_from_slice(&0x0100_0000u32.to_le_bytes());
        assert_eq!(pe_subsystem(&mut Cursor::new(far)), None);
    }

    // --- executable validation ---

    fn write(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    fn code(result: Result<PathBuf, CommandError>) -> &'static str {
        result.unwrap_err().code
    }

    #[test]
    fn accepts_a_local_console_pe_named_codex_exe_case_insensitively() {
        let dir = TempDir::new();
        let exe = dir.0.join("bin").join("Codex.EXE");
        write(&exe, &synthetic_pe(3, 0x20b));
        let validated = validate_codex_executable(&exe.to_string_lossy()).unwrap();
        assert!(validated.to_string_lossy().to_lowercase().ends_with("codex.exe"));
    }

    #[test]
    fn rejects_shims_scripts_and_extensionless_launchers() {
        let dir = TempDir::new();
        for name in ["codex.cmd", "codex.ps1", "codex.bat", "codex.com", "codex", "CODEX.CMD"] {
            let path = dir.0.join(name);
            write(&path, b"@ECHO off\r\nnode codex.js %*\r\n");
            assert_eq!(code(validate_codex_executable(&path.to_string_lossy())), "UNSUPPORTED_CODEX_LAUNCHER", "{name}");
        }
    }

    #[test]
    fn rejects_untrusted_executables() {
        let dir = TempDir::new();
        let wrong_name = dir.0.join("codex2.exe");
        write(&wrong_name, &synthetic_pe(3, 0x20b));
        assert_eq!(code(validate_codex_executable(&wrong_name.to_string_lossy())), "CODEX_EXECUTABLE_UNTRUSTED");

        let gui = dir.0.join("gui").join("codex.exe");
        write(&gui, &synthetic_pe(2, 0x20b));
        assert_eq!(code(validate_codex_executable(&gui.to_string_lossy())), "CODEX_EXECUTABLE_UNTRUSTED");

        let not_pe = dir.0.join("text").join("codex.exe");
        write(&not_pe, b"not an executable");
        assert_eq!(code(validate_codex_executable(&not_pe.to_string_lossy())), "CODEX_EXECUTABLE_UNTRUSTED");

        let directory = dir.0.join("dir").join("codex.exe");
        std::fs::create_dir_all(&directory).unwrap();
        assert_eq!(code(validate_codex_executable(&directory.to_string_lossy())), "CODEX_EXECUTABLE_UNTRUSTED");

        let missing = dir.0.join("missing").join("codex.exe");
        assert_eq!(code(validate_codex_executable(&missing.to_string_lossy())), "CODEX_EXECUTABLE_UNTRUSTED");

        for bad in [r"\\server\share\codex.exe", r"\\?\C:\tools\codex.exe", r"\\.\C:\codex.exe", r"relative\codex.exe", "codex.exe"] {
            assert_eq!(code(validate_codex_executable(bad)), "CODEX_EXECUTABLE_UNTRUSTED", "{bad}");
        }
        assert_eq!(code(validate_codex_executable("   ")), "CODEX_EXECUTABLE_NOT_CONFIGURED");
    }

    #[cfg(windows)]
    #[test]
    fn rejects_a_codex_exe_behind_a_link_to_a_network_location() {
        let dir = TempDir::new();
        let link = dir.0.join("netlink");
        if let Err(e) = std::os::windows::fs::symlink_dir(r"\\dvcc-unreachable-host.invalid\share", &link) {
            eprintln!("P4B2B-EXE-NETLINK: SKIPPED (cannot create directory symlink: {e})");
            return;
        }
        let through = link.join("codex.exe");
        assert_eq!(code(validate_codex_executable(&through.to_string_lossy())), "CODEX_EXECUTABLE_UNTRUSTED");
    }

    // --- thread cwd ---

    #[test]
    fn classifies_the_thread_workspace() {
        let dir = TempDir::new();
        let root = dir.0.join("project");
        let other = dir.0.join("other");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        let canonical_root = launcher::validate_project_folder(&root.to_string_lossy()).unwrap();

        let same_upper = root.to_string_lossy().to_uppercase();
        assert_eq!(classify_thread_cwd(&same_upper, &canonical_root).unwrap(), WorkspaceCheck::Exact);
        let verbatim = format!(r"\\?\{}", root.to_string_lossy());
        assert_eq!(classify_thread_cwd(&verbatim, &canonical_root).unwrap(), WorkspaceCheck::Exact);
        assert_eq!(classify_thread_cwd(&other.to_string_lossy(), &canonical_root).unwrap_err().code, "CWD_MISMATCH");
        assert_eq!(
            classify_thread_cwd(r"C:\Users\someone\.codex\project\Alpha", &canonical_root).unwrap(),
            WorkspaceCheck::ProviderMayAsk
        );
        assert_eq!(
            classify_thread_cwd(&dir.0.join("gone").to_string_lossy(), &canonical_root).unwrap(),
            WorkspaceCheck::ProviderMayAsk
        );
        assert_eq!(classify_thread_cwd(r"\\server\share\x", &canonical_root).unwrap(), WorkspaceCheck::ProviderMayAsk);
    }

    // --- synthetic provider DB ---

    fn state_db(dir: &Path, rows: &[(&str, &str, i64)]) -> PathBuf {
        let path = dir.join("state_5.sqlite");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0,
             updated_at INTEGER NOT NULL DEFAULT 0, cli_version TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0,
             git_origin_url TEXT, first_user_message TEXT NOT NULL DEFAULT 'CONTENT_MUST_NOT_BE_READ',
             preview TEXT NOT NULL DEFAULT 'CONTENT_MUST_NOT_BE_READ');",
        )
        .unwrap();
        for (id, cwd, archived) in rows {
            conn.execute("INSERT INTO threads (id, cwd, archived) VALUES (?1, ?2, ?3)", rusqlite::params![id, cwd, archived]).unwrap();
        }
        path
    }

    struct Fixture {
        _dir: TempDir,
        exe: PathBuf,
        root: PathBuf,
        db: PathBuf,
    }

    fn fixture(thread_cwd: Option<&str>, archived: i64) -> Fixture {
        let dir = TempDir::new();
        let exe = dir.0.join("tools").join("codex.exe");
        write(&exe, &synthetic_pe(3, 0x20b));
        let root = dir.0.join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        let cwd = thread_cwd.map(str::to_string).unwrap_or_else(|| root.to_string_lossy().into_owned());
        let db = state_db(&dir.0, &[(ID, &cwd, archived)]);
        Fixture { _dir: dir, exe, root, db }
    }

    fn prepare(f: &Fixture, id: &str) -> Result<LaunchPlan, CommandError> {
        prepare_launch(&f.exe.to_string_lossy(), id, &f.root.to_string_lossy(), Some(&f.db))
    }

    #[test]
    fn the_plan_is_exactly_resume_and_the_full_id_from_the_project_root_in_a_new_console() {
        let f = fixture(None, 0);
        let plan = prepare(&f, ID).unwrap();
        assert_eq!(plan.args, ["resume".to_string(), ID.to_string()]);
        assert_eq!(plan.program, launcher::validate_local_entry(&f.exe.to_string_lossy(), LocalEntryKind::File).unwrap());
        assert_eq!(plan.cwd, launcher::validate_project_folder(&f.root.to_string_lossy()).unwrap());
        assert_eq!(plan.creation_flags, CREATE_NEW_CONSOLE);
        assert_eq!(plan.workspace, WorkspaceCheck::Exact);
        // The root is only the working directory: it never appears among the arguments.
        assert!(plan.args.iter().all(|arg| !arg.contains(&*f.root.to_string_lossy())));
    }

    #[test]
    fn native_rechecks_fail_closed() {
        let f = fixture(None, 0);
        assert_eq!(prepare(&f, "019C1A2B-3C4D-7BBB-8BBB-000000000002").unwrap_err().code, "INVALID_SESSION_ID");
        assert_eq!(prepare(&f, "11111111-1111-1111-8111-111111111111").unwrap_err().code, "SESSION_NOT_FOUND");

        let archived = fixture(None, 1);
        assert_eq!(prepare(&archived, ID).unwrap_err().code, "ARCHIVED");

        let f = fixture(None, 0);
        let no_root = prepare_launch(&f.exe.to_string_lossy(), ID, "", Some(&f.db)).unwrap_err();
        assert_eq!(no_root.code, "NO_LOCAL_ROOT");
        for unsafe_root in [r"\\server\share\project", r"relative\project"] {
            let refused = prepare_launch(&f.exe.to_string_lossy(), ID, unsafe_root, Some(&f.db)).unwrap_err();
            assert_eq!(refused.code, "UNSAFE_PROJECT_ROOT", "{unsafe_root}");
        }
        let missing_root = f.root.join("gone");
        let refused = prepare_launch(&f.exe.to_string_lossy(), ID, &missing_root.to_string_lossy(), Some(&f.db)).unwrap_err();
        assert_eq!(refused.code, "UNSAFE_PROJECT_ROOT");

        let unconfigured = prepare_launch("", ID, &f.root.to_string_lossy(), Some(&f.db)).unwrap_err();
        assert_eq!(unconfigured.code, "CODEX_EXECUTABLE_NOT_CONFIGURED");
        let shim = f.exe.with_file_name("codex.cmd");
        write(&shim, b"@ECHO off");
        assert_eq!(prepare_launch(&shim.to_string_lossy(), ID, &f.root.to_string_lossy(), Some(&f.db)).unwrap_err().code, "UNSUPPORTED_CODEX_LAUNCHER");

        let no_db = f.root.join("absent.sqlite");
        assert_eq!(prepare_launch(&f.exe.to_string_lossy(), ID, &f.root.to_string_lossy(), Some(&no_db)).unwrap_err().code, "PROVIDER_UNAVAILABLE");
    }

    #[test]
    fn cwd_policy_blocks_a_clear_mismatch_and_warns_for_a_mirror() {
        let dir = TempDir::new();
        let elsewhere = dir.0.join("elsewhere");
        std::fs::create_dir_all(&elsewhere).unwrap();
        let mismatch = fixture(Some(&elsewhere.to_string_lossy()), 0);
        assert_eq!(prepare(&mismatch, ID).unwrap_err().code, "CWD_MISMATCH");

        let mirror = fixture(Some(r"C:\Users\someone\.codex\project\Alpha"), 0);
        let plan = prepare(&mirror, ID).unwrap();
        assert_eq!(plan.workspace, WorkspaceCheck::ProviderMayAsk);
        // The mirror is never used as the working directory.
        assert_eq!(plan.cwd, launcher::validate_project_folder(&mirror.root.to_string_lossy()).unwrap());
    }

    #[test]
    fn a_warning_launch_without_acknowledgement_or_with_inherited_handles_is_refused_before_spawning() {
        let mirror = fixture(Some(r"C:\Users\someone\.codex\project\Alpha"), 0);
        let plan = prepare(&mirror, ID).unwrap();
        // The synthetic PE would fail to start; reaching PROCESS_LAUNCH_FAILED would prove a spawn.
        assert_eq!(launch_planned(&plan, false, false).unwrap_err().code, "STALE_DISCOVERY");
        assert_eq!(launch_planned(&plan, true, true).unwrap_err().code, "INTERACTIVE_CONSOLE_UNAVAILABLE");
    }

    #[test]
    fn the_launch_lookup_reads_only_id_cwd_and_archived() {
        let source = include_str!("codex_reader.rs");
        let start = source.find("pub fn lookup_thread_for_launch").unwrap();
        let end = start + source[start..].find("\n}\n").unwrap();
        let body = &source[start..end];
        assert!(body.contains("\"SELECT id, cwd, archived FROM threads WHERE id = ?1 LIMIT 2\""));
        for forbidden in ["first_user_message", "preview", "SELECT *", "format!(\"SELECT"] {
            assert!(!body.contains(forbidden), "{forbidden}");
        }
    }

    // --- real process creation against a synthetic console fixture (never Codex) ---

    /// Compiles `test-fixtures/codex_launch_fixture.rs` once with `rustc` into a temp folder as
    /// `codex.exe`. The fixture records argv / cwd / console facts / parent image and exits.
    fn compiled_fixture() -> &'static Path {
        static FIXTURE: OnceLock<PathBuf> = OnceLock::new();
        FIXTURE.get_or_init(|| {
            let out_dir = std::env::temp_dir().join(format!("dvcc-codex-fixture-{}", std::process::id()));
            std::fs::create_dir_all(&out_dir).unwrap();
            let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("test-fixtures").join("codex_launch_fixture.rs");
            let exe = out_dir.join("codex.exe");
            let status = Command::new("rustc")
                .args(["--edition", "2021", "-O", "-o"])
                .arg(&exe)
                .arg(&source)
                .status()
                .expect("rustc must be available to build the synthetic launch fixture");
            assert!(status.success(), "building the synthetic launch fixture failed");
            exe
        })
    }

    /// Serializes the tests that temporarily clear this process's standard handles.
    static STD_HANDLE_LOCK: Mutex<()> = Mutex::new(());

    #[cfg(windows)]
    mod null_std {
        use std::ffi::c_void;
        #[link(name = "kernel32")]
        extern "system" {
            fn GetStdHandle(which: u32) -> *mut c_void;
            fn SetStdHandle(which: u32, handle: *mut c_void) -> i32;
        }
        const WHICH: [u32; 3] = [-10i32 as u32, -11i32 as u32, -12i32 as u32];

        /// Makes this process look like the release GUI build (no standard handles) while held.
        pub struct Guard([*mut c_void; 3]);
        impl Guard {
            pub fn new() -> Self {
                // SAFETY: only swaps this process's standard handle table entries; restored on drop.
                unsafe {
                    let saved = WHICH.map(|which| GetStdHandle(which));
                    for which in WHICH {
                        SetStdHandle(which, std::ptr::null_mut());
                    }
                    Guard(saved)
                }
            }
        }
        impl Drop for Guard {
            fn drop(&mut self) {
                // SAFETY: restores the handles saved in `new`.
                unsafe {
                    for (which, handle) in WHICH.iter().zip(self.0) {
                        SetStdHandle(*which, handle);
                    }
                }
            }
        }
    }

    #[derive(Debug)]
    struct Record(std::collections::BTreeMap<String, String>);
    impl Record {
        fn get(&self, key: &str) -> &str {
            self.0.get(key).map(String::as_str).unwrap_or("<missing>")
        }
    }

    fn wait_for_record(path: &Path) -> Record {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            if let Ok(text) = std::fs::read_to_string(path) {
                if text.ends_with("end=1\n") {
                    let map = text.lines().filter_map(|line| line.split_once('=')).map(|(k, v)| (k.to_string(), v.to_string())).collect();
                    return Record(map);
                }
            }
            assert!(std::time::Instant::now() < deadline, "the fixture never wrote its record");
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }

    #[cfg(windows)]
    #[test]
    fn spawns_the_validated_executable_directly_with_exact_argv_cwd_and_its_own_console() {
        let _lock = STD_HANDLE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let dir = TempDir::new();
        let exe = dir.0.join("tools").join("codex.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::copy(compiled_fixture(), &exe).unwrap();
        let root = dir.0.join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        let db = state_db(&dir.0, &[(ID, &root.to_string_lossy(), 0)]);

        let plan = prepare_launch(&exe.to_string_lossy(), ID, &root.to_string_lossy(), Some(&db)).unwrap();
        {
            let _null = null_std::Guard::new();
            assert!(!std_handles::any_inherited(), "the guard must reproduce the release GUI handle state");
            launch_planned(&plan, false, std_handles::any_inherited()).unwrap();
        }
        let record = wait_for_record(&exe.with_file_name("launch-record.txt"));
        eprintln!("P4B2B-FIXTURE: {record:?}");
        assert_eq!(record.get("argc"), "2");
        assert_eq!(record.get("arg1"), "resume");
        assert_eq!(record.get("arg2"), ID);
        assert_eq!(record.get("cwd").to_lowercase(), plan.cwd.to_string_lossy().to_lowercase());
        // Its own new console: a character device for stdout (never a pipe into DVCC), and the
        // console is attached to the fixture alone (not shared with the test process).
        assert_eq!(record.get("stdout_type"), "char");
        assert_eq!(record.get("console_process_count"), "1");
        // Created directly by this process: no cmd.exe / PowerShell / terminal in between.
        assert_eq!(record.get("parent_pid"), std::process::id().to_string());
        let parent = record.get("parent_image").to_lowercase();
        for shell in ["cmd.exe", "powershell.exe", "pwsh.exe", "bash.exe", "wt.exe", "conhost.exe"] {
            assert_ne!(parent, shell);
        }
    }
}
