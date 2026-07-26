pub mod errors;
mod telemetry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    telemetry::init();

    tauri::Builder::default().run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_name_matches_product() {
        assert_eq!(env!("CARGO_PKG_NAME"), "lithemark");
    }
}
