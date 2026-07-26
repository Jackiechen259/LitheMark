use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::errors::AppError;
use crate::markdown::render_safe_markdown;
use crate::types::RenderedDocumentDto;

const MAX_PHASE_ONE_BYTES: u64 = 16 * 1024 * 1024;

#[tauri::command]
pub async fn open_document(path: String) -> Result<RenderedDocumentDto, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath);
    }

    let canonical_path = tokio::fs::canonicalize(PathBuf::from(path))
        .await
        .map_err(classify_io_error)?;
    validate_extension(&canonical_path)?;

    let metadata = tokio::fs::metadata(&canonical_path)
        .await
        .map_err(classify_io_error)?;

    if !metadata.is_file() {
        return Err(AppError::NotAFile);
    }
    if metadata.len() > MAX_PHASE_ONE_BYTES {
        return Err(AppError::FileTooLarge);
    }

    let bytes = tokio::fs::read(&canonical_path)
        .await
        .map_err(classify_io_error)?;
    let source_bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let source = std::str::from_utf8(source_bytes).map_err(|_| AppError::EncodingFailed)?;
    let html = render_safe_markdown(source);
    let name = canonical_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidPath)?
        .to_owned();
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .and_then(|value| u64::try_from(value.as_millis()).ok())
        .unwrap_or(0);

    Ok(RenderedDocumentDto {
        name,
        display_path: canonical_path.display().to_string(),
        byte_size: metadata.len(),
        modified_at_ms,
        encoding: "UTF-8".to_owned(),
        line_count: source.lines().count(),
        html,
    })
}

fn validate_extension(path: &Path) -> Result<(), AppError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or(AppError::UnsupportedExtension)?;

    if matches!(extension.as_str(), "md" | "markdown") {
        Ok(())
    } else {
        Err(AppError::UnsupportedExtension)
    }
}

fn classify_io_error(error: std::io::Error) -> AppError {
    match error.kind() {
        std::io::ErrorKind::NotFound => AppError::FileNotFound,
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied,
        _ => AppError::Io(error),
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{open_document, validate_extension};
    use crate::errors::AppError;

    #[test]
    fn accepts_supported_extensions_case_insensitively() {
        assert!(validate_extension(Path::new("README.md")).is_ok());
        assert!(validate_extension(Path::new("notes.MARKDOWN")).is_ok());
    }

    #[test]
    fn rejects_other_file_types() {
        assert!(matches!(
            validate_extension(Path::new("notes.txt")),
            Err(AppError::UnsupportedExtension)
        ));
    }

    #[test]
    fn opens_utf8_markdown_and_returns_safe_html() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!("lithemark-phase1-{unique}.md"));
        let write_result = std::fs::write(
            &path,
            "# Test\n\nReadable.\n\n<script>window.compromised = true</script>",
        );
        assert!(write_result.is_ok());

        let result = tauri::async_runtime::block_on(open_document(path.display().to_string()));
        let _ = std::fs::remove_file(path);

        assert!(result.is_ok());
        if let Ok(document) = result {
            assert!(document.name.starts_with("lithemark-phase1-"));
            assert!(document.html.contains("<h1>Test</h1>"));
            assert!(!document.html.contains("<script"));
            assert_eq!(document.encoding, "UTF-8");
        }
    }
}
