mod commands;
pub mod document;
pub mod errors;
mod file_activation;
pub mod markdown;
mod telemetry;
mod types;

use tauri::{Emitter, Manager};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

use file_activation::{PendingOpenFiles, parse_activation_args};

/// Emitted to the webview with a `string[]` payload of absolute Markdown paths
/// whenever the OS asks the already-running app to open files.
#[cfg(desktop)]
const EXTERNAL_OPEN_FILES_EVENT: &str = "external-open-files";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    telemetry::init();

    let builder = tauri::Builder::default();

    // The single-instance plugin must be the first plugin registered: on a
    // second launch it forwards the new command line to the running instance
    // instead of letting a second long-lived process appear.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        forward_activation_to_running_instance(app, &args, &cwd);
    }));

    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(document::manager::DocumentManager::default())
        .manage(PendingOpenFiles::default())
        .setup(|app| {
            // Collect the files Explorer passed on this first launch and queue
            // them before the window exists. The webview drains the queue once
            // its listener is live, so a cold start can never lose a file to
            // the listener race.
            let startup_args: Vec<String> = std::env::args().skip(1).collect();
            let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let paths = parse_activation_args(&startup_args, &cwd);
            if !paths.is_empty() {
                app.state::<PendingOpenFiles>().queue_paths(paths);
            }
            Ok(())
        })
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
            commands::system::open_external_url,
            commands::system::open_default_apps_settings,
            commands::activation::take_pending_open_paths
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

/// A second LitheMark process asked to open files: validate the arguments,
/// queue them (so even a still-booting webview picks them up), notify the
/// frontend, and bring the existing window to the front.
#[cfg(desktop)]
fn forward_activation_to_running_instance(app: &tauri::AppHandle, args: &[String], cwd: &str) {
    let paths = parse_activation_args(args, std::path::Path::new(cwd));
    if paths.is_empty() {
        return;
    }

    // Keep a copy in the queue as the safety net for the emit/listener race:
    // whichever of the pull or the event reaches the webview first carries the
    // paths, and the frontend deduplicates the overlap.
    app.state::<PendingOpenFiles>().queue_paths(paths.clone());

    let payload: Vec<String> = paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if let Err(error) = app.emit(EXTERNAL_OPEN_FILES_EVENT, payload) {
        tracing::warn!(%error, "failed to emit {EXTERNAL_OPEN_FILES_EVENT} event");
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_name_matches_product() {
        assert_eq!(env!("CARGO_PKG_NAME"), "lithemark");
    }
}
