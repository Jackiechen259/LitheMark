mod commands;
mod document;
pub mod errors;
mod markdown;
mod telemetry;
mod types;

use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    telemetry::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(document::manager::DocumentManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::document::open_document,
            commands::document::open_documents,
            commands::document::close_document,
            commands::document::reload_document,
            commands::document::get_document_metadata,
            commands::document::get_blocks,
            commands::document::get_headings,
            commands::system::open_external_url
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && let Err(error) = window.app_handle().save_window_state(StateFlags::all())
            {
                tracing::warn!(%error, "failed to persist window state");
            }
        })
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_name_matches_product() {
        assert_eq!(env!("CARGO_PKG_NAME"), "lithemark");
    }
}
