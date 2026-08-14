//! Commands that hand Explorer activations to the frontend.

use tauri::State;

use crate::file_activation::PendingOpenFiles;

/// Drains the Explorer-launched files queued before the webview listener was
/// live. The frontend calls this exactly once at startup, after registering
/// the `external-open-files` listener, so a cold-start activation is never
/// lost to the listener race.
#[tauri::command]
pub fn take_pending_open_paths(pending: State<'_, PendingOpenFiles>) -> Vec<String> {
    pending
        .take_pending_paths()
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}
