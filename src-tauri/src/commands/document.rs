use tauri::State;

use crate::document::loader::{canonicalize_supported_path, load_canonical};
use crate::document::manager::DocumentManager;
use crate::errors::AppError;
use crate::types::{DocumentId, DocumentMetadataDto, OpenDocumentResult};

#[tauri::command]
pub async fn open_document(
    manager: State<'_, DocumentManager>,
    path: String,
) -> Result<OpenDocumentResult, AppError> {
    open_with_manager(&manager, path).await
}

#[tauri::command]
pub async fn open_documents(
    manager: State<'_, DocumentManager>,
    paths: Vec<String>,
) -> Result<Vec<OpenDocumentResult>, AppError> {
    let mut documents = Vec::with_capacity(paths.len());
    for path in paths {
        documents.push(open_with_manager(&manager, path).await?);
    }
    Ok(documents)
}

#[tauri::command]
pub fn close_document(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<(), AppError> {
    manager.close(document_id)
}

#[tauri::command]
pub async fn reload_document(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<OpenDocumentResult, AppError> {
    let session = manager.get(document_id)?;
    let loaded = load_canonical(session.canonical_path.clone()).await?;
    Ok(session.replace(loaded))
}

#[tauri::command]
pub fn get_document_metadata(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<DocumentMetadataDto, AppError> {
    manager.metadata(document_id)
}

async fn open_with_manager(
    manager: &DocumentManager,
    path: String,
) -> Result<OpenDocumentResult, AppError> {
    let canonical_path = canonicalize_supported_path(path).await?;
    if let Some(existing) = manager.get_by_path(&canonical_path) {
        return Ok(existing);
    }

    let loaded = load_canonical(canonical_path).await?;
    Ok(manager.insert(loaded))
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[test]
    fn loader_opens_utf8_markdown_and_returns_safe_html() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!("lithemark-phase2-{unique}.md"));
        let write_result = std::fs::write(
            &path,
            "# Test\n\nReadable.\n\n<script>window.compromised = true</script>",
        );
        assert!(write_result.is_ok());

        let result = tauri::async_runtime::block_on(async {
            let canonical = canonicalize_supported_path(path.display().to_string()).await?;
            load_canonical(canonical).await
        });
        let _ = std::fs::remove_file(path);

        assert!(result.is_ok());
        if let Ok(document) = result {
            assert!(document.name.starts_with("lithemark-phase2-"));
            assert!(document.html.contains("<h1>Test</h1>"));
            assert!(!document.html.contains("<script"));
            assert_eq!(document.encoding, "UTF-8");
        }
    }
}
