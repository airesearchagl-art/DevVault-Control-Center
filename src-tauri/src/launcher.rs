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

/// Parses the URL and accepts only `https` URLs without credentials or explicit ports whose
/// host is exactly one of `ALLOWED_URL_HOSTS`.
pub fn validate_external_url(raw: &str) -> Result<Url, CommandError> {
    let url = Url::parse(raw.trim()).map_err(|_| url_rejected("not a valid absolute URL"))?;
    if url.scheme() != "https" {
        return Err(url_rejected("only https URLs can be opened"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(url_rejected("URLs with embedded credentials are not allowed"));
    }
    if url.port().is_some() {
        return Err(url_rejected("URLs with an explicit port are not allowed"));
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

/// Accepts only an absolute local drive path (e.g. `C:\work\project`) of an existing directory.
/// UNC, device, verbatim, drive-relative and relative paths are rejected.
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
    let is_local_drive = matches!(
        path.components().next(),
        Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::Disk(_))
    );
    if !is_local_drive || !path.is_absolute() {
        return Err(folder_rejected(
            "FOLDER_REJECTED",
            "only absolute local drive paths such as C:\\work\\project are allowed",
        ));
    }
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => Ok(path.to_path_buf()),
        Ok(_) => Err(folder_rejected("NOT_A_DIRECTORY", "path is not a directory")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Err(folder_rejected("FOLDER_NOT_FOUND", "folder does not exist"))
        }
        Err(error) => Err(folder_rejected("FOLDER_REJECTED", error.to_string())),
    }
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
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
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
            "https://github.com:443/example-org/project-alpha",
        ] {
            assert!(validate_external_url(good).is_ok(), "{good:?} should be accepted");
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

    #[test]
    fn accepts_existing_absolute_local_directory() {
        let dir = TempDir::new();
        let raw = dir.0.to_string_lossy().into_owned();
        assert_eq!(validate_project_folder(&raw).unwrap(), dir.0);
    }

    #[test]
    fn rejects_file_missing_relative_and_unc_paths() {
        let dir = TempDir::new();
        let file = dir.0.join("not-a-folder.txt");
        fs::write(&file, "x").unwrap();
        assert_eq!(
            validate_project_folder(&file.to_string_lossy()).unwrap_err().code,
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
}
