use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::errors::AppError;

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), AppError> {
    validate_external_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| AppError::Internal)
}

/// Opens the Windows "Default apps" settings page. The URI is hard-coded so
/// the frontend never gets to pick a `ms-settings:` target, and the generic
/// `open_external_url` allowlist (`https` / `http` / `mailto`) stays closed to
/// system URIs like `shell:`, `file:` or custom protocols.
#[tauri::command]
pub fn open_default_apps_settings(app: AppHandle) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        app.opener()
            .open_url("ms-settings:defaultapps", None::<&str>)
            .map_err(|_| AppError::Internal)
    }
    // The settings entry is only rendered on Windows; on other platforms this
    // command is unreachable and failing closed is safer than a silent no-op.
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err(AppError::Internal)
    }
}

fn validate_external_url(value: &str) -> Result<(), AppError> {
    let parsed = Url::parse(value).map_err(|_| AppError::ExternalUrlDenied)?;

    if matches!(parsed.scheme(), "https" | "http" | "mailto") {
        Ok(())
    } else {
        Err(AppError::ExternalUrlDenied)
    }
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn allows_only_web_and_email_links() {
        assert!(validate_external_url("https://example.com/docs").is_ok());
        assert!(validate_external_url("http://localhost:8080").is_ok());
        assert!(validate_external_url("mailto:reader@example.com").is_ok());
    }

    #[test]
    fn rejects_executable_and_local_schemes() {
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("file:///C:/private.txt").is_err());
        assert!(validate_external_url("data:text/html,unsafe").is_err());
    }
}
