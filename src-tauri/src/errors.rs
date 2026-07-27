use serde::Serialize;
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("The supplied path is invalid.")]
    InvalidPath,
    #[error("The file could not be found.")]
    FileNotFound,
    #[error("The selected path is not a file.")]
    NotAFile,
    #[error("This file type is not supported.")]
    UnsupportedExtension,
    #[error("LitheMark does not have permission to read this file.")]
    PermissionDenied,
    #[error("The file is too large to open safely.")]
    FileTooLarge,
    #[error("The document encoding could not be decoded.")]
    EncodingFailed,
    #[error("The Markdown document could not be parsed.")]
    ParseFailed,
    #[error("The document is no longer open.")]
    DocumentNotFound,
    #[error("The document changed while this request was running.")]
    StaleRevision,
    #[error("The editor draft changed while this request was running.")]
    StaleDraftRevision,
    #[error("Editing has not been started for this document.")]
    EditNotStarted,
    #[error("The file changed on disk. Review and merge the changes before saving.")]
    SaveConflict,
    #[error("The requested editor position is invalid.")]
    InvalidEditPosition,
    #[error("Access to this local resource was denied.")]
    ResourceDenied,
    #[error("The search was cancelled.")]
    SearchCancelled,
    #[error("The document is still being indexed. Try searching again in a moment.")]
    IndexingInProgress,
    #[error("The search query is invalid.")]
    InvalidSearch,
    #[error("This external URL is not allowed.")]
    ExternalUrlDenied,
    #[error("A file system operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("An internal application error occurred.")]
    Internal,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorDto {
    pub code: &'static str,
    pub message: String,
    pub recoverable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl AppError {
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidPath => "invalid_path",
            Self::FileNotFound => "file_not_found",
            Self::NotAFile => "not_a_file",
            Self::UnsupportedExtension => "unsupported_extension",
            Self::PermissionDenied => "permission_denied",
            Self::FileTooLarge => "file_too_large",
            Self::EncodingFailed => "encoding_failed",
            Self::ParseFailed => "parse_failed",
            Self::DocumentNotFound => "document_not_found",
            Self::StaleRevision => "stale_revision",
            Self::StaleDraftRevision => "stale_draft_revision",
            Self::EditNotStarted => "edit_not_started",
            Self::SaveConflict => "save_conflict",
            Self::InvalidEditPosition => "invalid_edit_position",
            Self::ResourceDenied => "resource_denied",
            Self::SearchCancelled => "search_cancelled",
            Self::IndexingInProgress => "indexing_in_progress",
            Self::InvalidSearch => "invalid_search",
            Self::ExternalUrlDenied => "external_url_denied",
            Self::Io(_) => "io",
            Self::Internal => "internal",
        }
    }

    #[must_use]
    pub fn recoverable(&self) -> bool {
        !matches!(self, Self::Internal)
    }

    #[must_use]
    pub fn to_dto(&self) -> AppErrorDto {
        AppErrorDto {
            code: self.code(),
            message: self.to_string(),
            recoverable: self.recoverable(),
            details: None,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_dto().serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn serializes_a_stable_user_facing_error() {
        let json = serde_json::to_value(AppError::UnsupportedExtension)
            .expect("serializing a static error should succeed");

        assert_eq!(json["code"], "unsupported_extension");
        assert_eq!(json["recoverable"], true);
        assert!(
            json["message"]
                .as_str()
                .is_some_and(|value| !value.is_empty())
        );
        assert!(json.get("details").is_none());
    }
}
