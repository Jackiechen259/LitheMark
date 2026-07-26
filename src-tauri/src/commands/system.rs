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
