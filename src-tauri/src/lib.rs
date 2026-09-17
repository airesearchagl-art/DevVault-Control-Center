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
    // Decided before anything else so that of two processes started at the same moment exactly
    // one continues (E-1). The mutex handle lives until this process exits.
    let another_instance = instance::another_instance_running(instance::INSTANCE_MUTEX_NAME);

    tauri::Builder::default()
        // Must be registered first: when the running instance already has its window, a second
        // DVCC process hands over to it (window is focused) and exits here (F-3).
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(move |app| {
            if another_instance {
                // The other process exists but has no window yet (the plugin could not hand over).
                // Exit before touching any data instead of running a second writer.
                app.handle().cleanup_before_exit();
                std::process::exit(0);
            }
            let resolved = storage::resolve_data_root(
                std::env::var_os(storage::DATA_DIR_ENV),
                app.path().data_dir().ok(),
                cfg!(debug_assertions),
            );
            // Also takes the exclusive data-folder lock (defense in depth across sessions).
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
