mod instance;
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
    // DVCC processes build the app one at a time (E-1): the plugin set-up inside `build` either
    // registers this process as the running instance or hands over to the one that registered
    // before and exits, before any window exists. Released right after `build`, on this thread.
    let startup =
        instance::StartupLock::acquire(instance::STARTUP_MUTEX_NAME, instance::STARTUP_WAIT);

    let app = tauri::Builder::default()
        // Must be registered first: a second DVCC process hands over to the running instance
        // (its window is focused) and exits here (F-3).
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let resolved = storage::resolve_data_root(
                std::env::var_os(storage::DATA_DIR_ENV),
                app.path().data_dir().ok(),
                cfg!(debug_assertions),
            );
            // Also takes the exclusive data-folder lock: a process that got past the start-up
            // guard anyway (e.g. another Windows session) never reaches the data.
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
        .build(tauri::generate_context!())
        .expect("error while building DevVault Control Center");

    // The plugin set-up has run: this process now owns the single-instance registration.
    drop(startup);
    app.run(|_, _| {});
}
