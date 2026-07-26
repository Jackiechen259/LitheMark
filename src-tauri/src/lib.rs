mod commands;
pub mod errors;
mod markdown;
mod telemetry;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    telemetry::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::document::open_document,
            commands::system::open_external_url
        ])
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_name_matches_product() {
        assert_eq!(env!("CARGO_PKG_NAME"), "lithemark");
    }
}
