use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::errors::AppError;

const MAX_FULL_RENDER_BYTES: u64 = 16 * 1024 * 1024;

pub struct LoadedDocument {
    pub canonical_path: PathBuf,
    pub name: String,
    pub display_path: String,
    pub byte_size: u64,
    pub modified_at_ms: u64,
    pub encoding: String,
    pub line_count: usize,
    pub source: String,
}

pub async fn canonicalize_supported_path(path: String) -> Result<PathBuf, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath);
    }

    let canonical_path = tokio::fs::canonicalize(PathBuf::from(path))
        .await
        .map_err(classify_io_error)?;
    validate_extension(&canonical_path)?;
    Ok(canonical_path)
}

pub async fn load_canonical(canonical_path: PathBuf) -> Result<LoadedDocument, AppError> {
    let metadata = tokio::fs::metadata(&canonical_path)
        .await
        .map_err(classify_io_error)?;

    if !metadata.is_file() {
        return Err(AppError::NotAFile);
    }
    if metadata.len() > MAX_FULL_RENDER_BYTES {
        return Err(AppError::FileTooLarge);
    }

    let bytes = tokio::fs::read(&canonical_path)
        .await
        .map_err(classify_io_error)?;
    let source_bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let source = std::str::from_utf8(source_bytes)
        .map_err(|_| AppError::EncodingFailed)?
        .to_owned();
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

    Ok(LoadedDocument {
        name,
        display_path: canonical_path.display().to_string(),
        byte_size: metadata.len(),
        modified_at_ms,
        encoding: "UTF-8".to_owned(),
        line_count: source.lines().count(),
        source,
        canonical_path,
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

    use super::validate_extension;
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
}
