mod launcher;
mod storage;

use serde::Serialize;
use tauri::Manager;

/// Error returned by every DVCC command. `code` is a stable machine value the frontend branches on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl CommandError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let resolved = storage::resolve_data_root(
                std::env::var_os(storage::DATA_DIR_ENV),
                app.path().data_dir().ok(),
                cfg!(debug_assertions),
            );
            app.manage(storage::DataRoot::new(resolved));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::storage_info,
            storage::storage_read,
            storage::storage_write,
            storage::storage_append_line,
            storage::storage_list_reviews,
            storage::storage_quarantine,
            storage::storage_restore_backup,
            launcher::open_external_url,
            launcher::open_project_folder,
            launcher::open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DevVault Control Center");
}
