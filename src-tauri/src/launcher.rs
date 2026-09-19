//! Safe launcher: opens validated https URLs and validated local project folders through the
//! opener plugin's Rust API. No shell command is executed and no arguments are passed.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf, Prefix};

use tauri::{AppHandle, State, Url};
use tauri_plugin_opener::OpenerExt;

use crate::storage::DataRoot;
use crate::CommandError;

pub const ALLOWED_URL_HOSTS: [&str; 3] = ["github.com", "chatgpt.com", "chat.openai.com"];

fn url_rejected(message: &str) -> CommandError {
    CommandError::new("URL_REJECTED", message)
}

/// Parses the URL and accepts only `https` URLs without credentials or a non-default port whose
/// host is exactly one of `ALLOWED_URL_HOSTS`. An explicit `:443` is the https default: the parser
/// normalizes it away (`port()` is `None`), so it is accepted and opened without it.
pub fn validate_external_url(raw: &str) -> Result<Url, CommandError> {
    let url = Url::parse(raw.trim()).map_err(|_| url_rejected("not a valid absolute URL"))?;
    if url.scheme() != "https" {
        return Err(url_rejected("only https URLs can be opened"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(url_rejected(
            "URLs with embedded credentials are not allowed",
        ));
    }
    if url.port().is_some() {
        return Err(url_rejected("URLs with a non-default port are not allowed"));
    }
    match url.host_str() {
        Some(host) if ALLOWED_URL_HOSTS.contains(&host) => Ok(url),
        _ => Err(url_rejected(
            "host is not allowed (allowed: github.com, chatgpt.com, chat.openai.com)",
        )),
    }
}

fn folder_rejected(code: &'static str, message: impl Into<String>) -> CommandError {
    CommandError::new(code, message)
}

fn network_target(message: &str) -> CommandError {
    CommandError::new("NETWORK_TARGET", message)
}

#[cfg(windows)]
mod drive {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDriveTypeW(root_path_name: *const u16) -> u32;
    }

    pub const DRIVE_UNKNOWN: u32 = 0;
    pub const DRIVE_NO_ROOT_DIR: u32 = 1;
    pub const DRIVE_REMOTE: u32 = 4;

    /// `GetDriveTypeW` for a root such as `C:\`.
    pub fn drive_type(root: &str) -> u32 {
        let wide: Vec<u16> = OsStr::new(root)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        // SAFETY: `wide` is a NUL-terminated UTF-16 string that outlives the call; the API only reads it.
        unsafe { GetDriveTypeW(wide.as_ptr()) }
    }
}

/// Rejects drive letters that Windows reports as network (mapped) or unusable drives.
#[cfg(windows)]
fn ensure_local_drive(letter: u8) -> Result<(), CommandError> {
    match drive::drive_type(&format!("{}:\\", letter as char)) {
        drive::DRIVE_REMOTE => Err(network_target(
            "the folder is on a network drive; network locations are not opened",
        )),
        drive::DRIVE_UNKNOWN | drive::DRIVE_NO_ROOT_DIR => Err(folder_rejected(
            "FOLDER_REJECTED",
            "the folder's drive type could not be confirmed as local",
        )),
        _ => Ok(()),
    }
}

#[cfg(not(windows))]
fn ensure_local_drive(_letter: u8) -> Result<(), CommandError> {
    Ok(())
}

/// Accepts a canonical (final, reparse-point-resolved) path only if it is on a local drive and
/// returns it in plain `C:\…` form. UNC / network results are `NETWORK_TARGET` (F-9).
pub fn local_final_target(canonical: &Path) -> Result<PathBuf, CommandError> {
    let letter = match canonical.components().next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::VerbatimDisk(letter) | Prefix::Disk(letter) => letter,
            Prefix::VerbatimUNC(..) | Prefix::UNC(..) => return Err(network_target(
                "the folder resolves to a network (UNC) location; network locations are not opened",
            )),
            _ => {
                return Err(folder_rejected(
                    "FOLDER_REJECTED",
                    "the folder resolves to a device or volume path",
                ))
            }
        },
        _ => {
            return Err(folder_rejected(
                "FOLDER_REJECTED",
                "the folder does not resolve to an absolute drive path",
            ))
        }
    };
    ensure_local_drive(letter)?;
    let text = canonical.to_string_lossy();
    Ok(PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text)))
}

const MAX_LINK_DEPTH: u32 = 32;

/// Checks a link target *as text* (without opening it): UNC / verbatim-UNC targets are network,
/// device / volume targets are rejected, drive-letter targets must be on a local drive.
fn check_link_target(target: &Path) -> Result<(), CommandError> {
    const NETWORK_LINK: &str =
        "a link inside the folder path points to a network (UNC) location; network locations are not opened";
    match target.components().next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(letter) | Prefix::VerbatimDisk(letter) => ensure_local_drive(letter),
            Prefix::UNC(..) | Prefix::VerbatimUNC(..) => Err(network_target(NETWORK_LINK)),
            _ => Err(folder_rejected(
                "FOLDER_REJECTED",
                "a link inside the folder path points to a device or volume path",
            )),
        },
        _ => {
            // Relative or drive-less rooted targets are resolved against the link's folder; a
            // leading double separator that was not parsed as a prefix is still a network form.
            let text = target.to_string_lossy();
            if text.starts_with("\\\\") || text.starts_with("//") {
                Err(network_target(NETWORK_LINK))
            } else {
                Ok(())
            }
        }
    }
}

/// Walks `path` component by component and, for every symbolic link or junction, reads its target
/// without following it (E-5). A network target is rejected before the file system ever resolves
/// it, so validating a planted link cannot trigger a connection to a remote host. Targets are
/// followed textually (relative targets against the link's folder) up to `MAX_LINK_DEPTH` links.
fn reject_network_links(path: &Path, depth: u32) -> Result<(), CommandError> {
    if depth > MAX_LINK_DEPTH {
        return Err(folder_rejected(
            "FOLDER_REJECTED",
            "the folder path contains too many links",
        ));
    }
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if !matches!(component, Component::Normal(_)) {
            continue;
        }
        let metadata = match fs::symlink_metadata(&current) {
            Ok(metadata) => metadata,
            // Missing / inaccessible parts are reported by the regular checks that follow.
            Err(_) => return Ok(()),
        };
        if !metadata.file_type().is_symlink() {
            continue;
        }
        let target = fs::read_link(&current).map_err(|error| {
            folder_rejected(
                "FOLDER_REJECTED",
                format!("a link inside the folder path could not be read: {error}"),
            )
        })?;
        check_link_target(&target)?;
        let absolute = if target.is_absolute()
            || matches!(target.components().next(), Some(Component::Prefix(_)))
        {
            target
        } else {
            current
                .parent()
                .map(|parent| parent.join(&target))
                .unwrap_or(target)
        };
        return reject_network_links(
            &absolute.join(path.strip_prefix(&current).unwrap_or(Path::new(""))),
            depth + 1,
        );
    }
    Ok(())
}

/// Accepts only an absolute local drive path (e.g. `C:\work\project`) of an existing directory.
/// UNC, device, verbatim, drive-relative and relative paths are rejected by form; link targets
/// inside the path are checked without following them (E-5); then symbolic links, junctions and
/// mapped drives are resolved to the final target, which must also be on a local drive (F-9).
/// The resolved local path is returned and is what gets opened.
pub fn validate_project_folder(raw: &str) -> Result<PathBuf, CommandError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(folder_rejected("FOLDER_REJECTED", "folder path is empty"));
    }
    if trimmed.starts_with("\\\\") || trimmed.starts_with("//") {
        return Err(folder_rejected(
            "FOLDER_REJECTED",
            "UNC, network and device paths are not allowed",
        ));
    }
    let path = Path::new(trimmed);
    let drive_letter = match path.components().next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(letter) => Some(letter),
            _ => None,
        },
        _ => None,
    };
    let Some(letter) = drive_letter.filter(|_| path.is_absolute()) else {
        return Err(folder_rejected(
            "FOLDER_REJECTED",
            "only absolute local drive paths such as C:\\work\\project are allowed",
        ));
    };
    // A mapped network drive looks like a local path: check the drive before touching it.
    ensure_local_drive(letter)?;
    // Links pointing to network locations are rejected before anything follows them (E-5).
    reject_network_links(path, 0)?;
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => {
            return Err(folder_rejected(
                "NOT_A_DIRECTORY",
                "path is not a directory",
            ))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(folder_rejected("FOLDER_NOT_FOUND", "folder does not exist"))
        }
        Err(error) => return Err(folder_rejected("FOLDER_REJECTED", error.to_string())),
    }
    let canonical = fs::canonicalize(path).map_err(|error| {
        folder_rejected(
            "FOLDER_REJECTED",
            format!("the folder's final location could not be resolved: {error}"),
        )
    })?;
    local_final_target(&canonical)
}

fn open_failed(error: impl std::fmt::Display) -> CommandError {
    CommandError::new("OPEN_FAILED", error.to_string())
}

#[tauri::command]
pub async fn open_external_url(app: AppHandle, url: String) -> Result<(), CommandError> {
    let validated = validate_external_url(&url)?;
    app.opener()
        .open_url(validated.as_str(), None::<&str>)
        .map_err(open_failed)
}

#[tauri::command]
pub async fn open_project_folder(app: AppHandle, path: String) -> Result<(), CommandError> {
    let folder = validate_project_folder(&path)?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(open_failed)
}

#[tauri::command]
pub async fn open_data_dir(app: AppHandle, root: State<'_, DataRoot>) -> Result<(), CommandError> {
    let path = root.path()?;
    fs::create_dir_all(path).map_err(open_failed)?;
    // Same boundary as project folders: the resolved folder must be local (F-9).
    let folder = validate_project_folder(&path.to_string_lossy())?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(open_failed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::tests::TempDir;

    #[test]
    fn accepts_https_urls_on_allowed_hosts() {
        for good in [
            "https://github.com/example-org/project-alpha",
            "https://github.com/example-org/project-alpha/pull/45",
            "https://chatgpt.com/c/example-thread-alpha",
            "https://chat.openai.com/c/example-thread-beta",
            "  https://GitHub.com/example-org/project-alpha  ",
        ] {
            assert!(
                validate_external_url(good).is_ok(),
                "{good:?} should be accepted"
            );
        }
    }

    #[test]
    fn accepts_the_https_default_port_443_as_canonical() {
        for (input, canonical) in [
            (
                "https://github.com:443/example-org/project-alpha",
                "https://github.com/example-org/project-alpha",
            ),
            (
                "https://chatgpt.com:443/c/example-thread-alpha",
                "https://chatgpt.com/c/example-thread-alpha",
            ),
        ] {
            let url = validate_external_url(input).unwrap();
            assert_eq!(url.port(), None, "{input:?}");
            assert_eq!(url.as_str(), canonical);
        }
    }

    #[test]
    fn rejects_a_non_default_explicit_port() {
        for bad in [
            "https://github.com:8443/example-org/project-alpha",
            "https://github.com:80/example-org/project-alpha",
            "https://chatgpt.com:444/c/example-thread-alpha",
            "https://github.com:0/example-org/project-alpha",
        ] {
            let error = validate_external_url(bad).unwrap_err();
            assert_eq!(error.code, "URL_REJECTED", "{bad:?} should be rejected");
        }
    }

    #[test]
    fn rejects_unsafe_or_disallowed_urls() {
        for bad in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/calc.exe",
            "http://github.com/example-org/project-alpha",
            "https://github.com@evil.example/",
            "https://user:pass@github.com/example-org/project-alpha",
            "https://evil.example/github.com",
            "https://github.com.evil.example/",
            "https://api.github.com/repos/example-org/project-alpha",
            "https://github.com:8443/example-org/project-alpha",
            "https://chatgpt.com.evil.example/c/x",
            "github.com/example-org/project-alpha",
            "ms-settings:privacy",
            "",
        ] {
            let error = validate_external_url(bad).unwrap_err();
            assert_eq!(error.code, "URL_REJECTED", "{bad:?} should be rejected");
        }
    }

    fn plain(path: PathBuf) -> PathBuf {
        let text = path.to_string_lossy().into_owned();
        PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
    }

    #[test]
    fn accepts_existing_absolute_local_directory() {
        let dir = TempDir::new();
        let raw = dir.0.to_string_lossy().into_owned();
        assert_eq!(
            validate_project_folder(&raw).unwrap(),
            plain(fs::canonicalize(&dir.0).unwrap())
        );
        // Drive root and forward slashes are local too.
        assert!(validate_project_folder("C:\\").is_ok());
        assert!(validate_project_folder(&raw.replace('\\', "/")).is_ok());
    }

    #[test]
    fn classifies_final_targets() {
        for network in [r"\\?\UNC\server\share\project", r"\\server\share\project"] {
            assert_eq!(
                local_final_target(Path::new(network)).unwrap_err().code,
                "NETWORK_TARGET",
                "{network}"
            );
        }
        for device in [
            r"\\?\Volume{00000000-0000-0000-0000-000000000000}\x",
            r"\\.\PIPE\x",
            r"\\?\GLOBALROOT\Device\x",
            "relative",
        ] {
            assert_eq!(
                local_final_target(Path::new(device)).unwrap_err().code,
                "FOLDER_REJECTED",
                "{device}"
            );
        }
        assert_eq!(
            local_final_target(Path::new(r"\\?\C:\Windows")).unwrap(),
            PathBuf::from(r"C:\Windows")
        );
    }

    #[cfg(windows)]
    #[test]
    fn junction_to_local_directory_opens_its_resolved_local_target() {
        let dir = TempDir::new();
        let target = dir.0.join("real-target");
        fs::create_dir_all(&target).unwrap();
        let link = dir.0.join("junction-to-local");
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&target)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "mklink /J failed: {}",
            String::from_utf8_lossy(&output.stdout)
        );
        let resolved = validate_project_folder(&link.to_string_lossy()).unwrap();
        eprintln!(
            "F9-JUNCTION-LOCAL: EXECUTED link={} resolved={}",
            link.display(),
            resolved.display()
        );
        assert_eq!(resolved, plain(fs::canonicalize(&target).unwrap()));
    }

    #[cfg(windows)]
    #[test]
    fn directory_symlink_to_local_directory_is_accepted() {
        let dir = TempDir::new();
        let target = dir.0.join("real-target");
        fs::create_dir_all(&target).unwrap();
        let link = dir.0.join("symlink-to-local");
        if let Err(error) = std::os::windows::fs::symlink_dir(&target, &link) {
            eprintln!("F9-SYMLINK-LOCAL: SKIPPED (cannot create directory symlink: {error})");
            return;
        }
        let resolved = validate_project_folder(&link.to_string_lossy()).unwrap();
        eprintln!("F9-SYMLINK-LOCAL: EXECUTED resolved={}", resolved.display());
        assert_eq!(resolved, plain(fs::canonicalize(&target).unwrap()));
    }

    #[test]
    fn rejects_file_missing_relative_and_unc_paths() {
        let dir = TempDir::new();
        let file = dir.0.join("not-a-folder.txt");
        fs::write(&file, "x").unwrap();
        assert_eq!(
            validate_project_folder(&file.to_string_lossy())
                .unwrap_err()
                .code,
            "NOT_A_DIRECTORY"
        );
        assert_eq!(
            validate_project_folder(&dir.0.join("missing").to_string_lossy())
                .unwrap_err()
                .code,
            "FOLDER_NOT_FOUND"
        );
        for bad in [
            "",
            "   ",
            "relative\\folder",
            ".\\folder",
            "C:relative",
            "\\Windows",
            "\\\\server\\share\\project",
            "//server/share/project",
            "\\\\?\\C:\\Windows",
            "\\\\.\\C:\\Windows",
        ] {
            assert_eq!(
                validate_project_folder(bad).unwrap_err().code,
                "FOLDER_REJECTED",
                "{bad:?} should be rejected"
            );
        }
    }

    /// Loopback administrative share used as a network (UNC) target without leaving the machine.
    #[cfg(windows)]
    fn loopback_unc_target() -> Option<PathBuf> {
        let path = PathBuf::from(r"\\localhost\C$\Windows");
        path.is_dir().then_some(path)
    }

    /// Creates a directory symlink (dangling targets allowed); returns false when the environment
    /// cannot create symlinks (no Developer Mode / privilege), in which case the test is reported.
    #[cfg(windows)]
    fn try_symlink_dir(target: &Path, link: &Path, label: &str) -> bool {
        match std::os::windows::fs::symlink_dir(target, link) {
            Ok(()) => true,
            Err(error) => {
                eprintln!("{label}: SKIPPED (cannot create directory symlink: {error})");
                false
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn rejects_link_to_unreachable_network_host_without_resolving_it() {
        // The host does not exist: following the link would fail with a not-found / network error.
        // NETWORK_TARGET proves the decision was made from the link text alone (E-5).
        let dir = TempDir::new();
        let unreachable = PathBuf::from(r"\\dvcc-unreachable-host.invalid\share\project");
        let link = dir.0.join("link-to-unreachable-unc");
        if !try_symlink_dir(&unreachable, &link, "E5-UNREACHABLE") {
            return;
        }
        let started = std::time::Instant::now();
        let result = validate_project_folder(&link.to_string_lossy());
        eprintln!(
            "E5-UNREACHABLE: EXECUTED result={result:?} elapsed={:?}",
            started.elapsed()
        );
        assert_eq!(result.unwrap_err().code, "NETWORK_TARGET");

        // A sub folder below the link is rejected the same way.
        let below = link.join("sub");
        assert_eq!(
            validate_project_folder(&below.to_string_lossy())
                .unwrap_err()
                .code,
            "NETWORK_TARGET"
        );

        // A chain of local links ending at the network target is followed textually and rejected.
        let chain = dir.0.join("chain-to-link");
        if try_symlink_dir(&link, &chain, "E5-CHAIN") {
            assert_eq!(
                validate_project_folder(&chain.to_string_lossy())
                    .unwrap_err()
                    .code,
                "NETWORK_TARGET"
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn relative_symlink_to_local_directory_is_accepted() {
        let dir = TempDir::new();
        let target = dir.0.join("real-target");
        fs::create_dir_all(target.join("inner")).unwrap();
        let link = dir.0.join("relative-link");
        if !try_symlink_dir(Path::new("real-target"), &link, "E5-RELATIVE") {
            return;
        }
        let resolved = validate_project_folder(&link.join("inner").to_string_lossy()).unwrap();
        assert_eq!(
            resolved,
            plain(fs::canonicalize(target.join("inner")).unwrap())
        );
    }

    #[test]
    fn classifies_link_targets_without_opening_them() {
        for network in [r"\\server\share", r"\\?\UNC\server\share\x"] {
            assert_eq!(
                check_link_target(Path::new(network)).unwrap_err().code,
                "NETWORK_TARGET",
                "{network}"
            );
        }
        for device in [
            r"\\.\PIPE\x",
            r"\\?\Volume{00000000-0000-0000-0000-000000000000}\x",
        ] {
            assert_eq!(
                check_link_target(Path::new(device)).unwrap_err().code,
                "FOLDER_REJECTED",
                "{device}"
            );
        }
        for local in [
            r"C:\Windows",
            r"\\?\C:\Windows",
            r"relative\target",
            r"..\sibling",
        ] {
            assert!(check_link_target(Path::new(local)).is_ok(), "{local}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn rejects_directory_symlink_to_unc_target() {
        let Some(target) = loopback_unc_target() else {
            eprintln!("F9-SYMLINK-UNC: SKIPPED (loopback admin share not reachable)");
            return;
        };
        let dir = TempDir::new();
        let link = dir.0.join("link-to-unc");
        if let Err(error) = std::os::windows::fs::symlink_dir(&target, &link) {
            eprintln!("F9-SYMLINK-UNC: SKIPPED (cannot create directory symlink: {error})");
            return;
        }
        assert!(
            link.is_dir(),
            "the local-looking link resolves to a network directory"
        );
        let result = validate_project_folder(&link.to_string_lossy());
        eprintln!(
            "F9-SYMLINK-UNC: EXECUTED link={} result={result:?}",
            link.display()
        );
        assert_eq!(result.unwrap_err().code, "NETWORK_TARGET");
    }

    #[cfg(windows)]
    #[test]
    fn junction_to_unc_is_refused_by_windows_or_rejected() {
        let Some(target) = loopback_unc_target() else {
            eprintln!("F9-JUNCTION-UNC: SKIPPED (loopback admin share not reachable)");
            return;
        };
        let dir = TempDir::new();
        let link = dir.0.join("junction-to-unc");
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&target)
            .output()
            .unwrap();
        if !output.status.success() {
            eprintln!(
                "F9-JUNCTION-UNC: EXECUTED creation refused by Windows: {}{}",
                String::from_utf8_lossy(&output.stdout).trim(),
                String::from_utf8_lossy(&output.stderr).trim()
            );
            assert!(!link.exists());
            return;
        }
        let result = validate_project_folder(&link.to_string_lossy());
        eprintln!("F9-JUNCTION-UNC: EXECUTED junction created; result={result:?}");
        assert_eq!(result.unwrap_err().code, "NETWORK_TARGET");
    }

    /// Run with a temporary mapping, e.g. `net use W: \\localhost\C$ /persistent:no`, then
    /// `$env:DVCC_TEST_MAPPED_DRIVE_DIR = "W:\Windows"; cargo test mapped_network_drive -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore = "requires a temporary network drive mapping (see doc comment)"]
    fn rejects_mapped_network_drive_directory() {
        let raw =
            std::env::var("DVCC_TEST_MAPPED_DRIVE_DIR").expect("set DVCC_TEST_MAPPED_DRIVE_DIR");
        assert!(
            Path::new(&raw).is_dir(),
            "{raw} must be an existing directory on a mapped network drive"
        );
        let result = validate_project_folder(&raw);
        eprintln!("F9-MAPPED-DRIVE: EXECUTED path={raw} result={result:?}");
        assert_eq!(result.unwrap_err().code, "NETWORK_TARGET");
    }
}
