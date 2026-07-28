mod commands;
pub mod document;
pub mod errors;
pub mod markdown;
mod telemetry;
mod types;

use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    telemetry::init();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(document::manager::DocumentManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::document::open_document,
            commands::document::open_documents,
            commands::document::close_document,
            commands::document::reload_document,
            commands::document::get_document_metadata,
            commands::document::get_blocks,
            commands::document::get_headings,
            commands::document::search_document,
            commands::document::cancel_search,
            commands::document::load_local_asset,
            commands::document::check_document_change,
            commands::document::begin_edit,
            commands::document::get_editor_chunk,
            commands::document::apply_edit_batch,
            commands::document::preview_edit,
            commands::document::save_edit,
            commands::document::prepare_merge,
            commands::document::apply_merge_result,
            commands::document::discard_edit,
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
