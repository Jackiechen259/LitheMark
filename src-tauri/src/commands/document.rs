use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Emitter, State};

use crate::document::asset::load_local_asset as load_document_asset;
use crate::document::loader::{canonicalize_supported_path, load_canonical};
use crate::document::manager::DocumentManager;
use crate::document::session::DocumentSession;
use crate::errors::AppError;
use crate::types::{
    BlockBatchDto, DocumentChangeDto, DocumentChangeKind, DocumentId, DocumentMetadataDto,
    HeadingDto, LocalAssetDto, OpenDocumentResult, SearchOptionsDto, SearchResultDto,
};

#[tauri::command]
pub async fn open_document(
    app: AppHandle,
    manager: State<'_, DocumentManager>,
    path: String,
) -> Result<OpenDocumentResult, AppError> {
    open_with_manager(&app, &manager, path).await
}

#[tauri::command]
pub async fn open_documents(
    app: AppHandle,
    manager: State<'_, DocumentManager>,
    paths: Vec<String>,
) -> Result<Vec<OpenDocumentResult>, AppError> {
    let mut documents = Vec::with_capacity(paths.len());
    for path in paths {
        documents.push(open_with_manager(&app, &manager, path).await?);
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
    app: AppHandle,
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<OpenDocumentResult, AppError> {
    let session = manager.get(document_id)?;
    let loaded = load_canonical(session.canonical_path.clone()).await?;
    let result = session.replace(loaded);
    schedule_index(app, session);
    Ok(result)
}

#[tauri::command]
pub fn get_document_metadata(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<DocumentMetadataDto, AppError> {
    manager.metadata(document_id)
}

#[tauri::command]
pub fn get_blocks(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    start: usize,
    count: usize,
    revision: u64,
) -> Result<BlockBatchDto, AppError> {
    manager
        .get(document_id)?
        .blocks(start, count.min(200), revision)
}

#[tauri::command]
pub fn get_headings(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    revision: u64,
) -> Result<Vec<HeadingDto>, AppError> {
    manager.get(document_id)?.headings(revision)
}

#[tauri::command]
pub async fn search_document(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    query: String,
    revision: u64,
    options: SearchOptionsDto,
) -> Result<SearchResultDto, AppError> {
    let session = manager.get(document_id)?;
    tokio::task::spawn_blocking(move || session.search(query, revision, options))
        .await
        .map_err(|_| AppError::Internal)?
}

#[tauri::command]
pub fn cancel_search(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<(), AppError> {
    manager.get(document_id)?.cancel_search();
    Ok(())
}

#[tauri::command]
pub async fn load_local_asset(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    reference: String,
) -> Result<LocalAssetDto, AppError> {
    let session = manager.get(document_id)?;
    load_document_asset(&session.canonical_path, &reference).await
}

#[tauri::command]
pub async fn check_document_change(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<DocumentChangeDto, AppError> {
    let session = manager.get(document_id)?;
    let known = session.metadata();
    let current = match tokio::fs::metadata(&session.canonical_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DocumentChangeDto {
                document_id,
                changed: true,
                kind: Some(DocumentChangeKind::Deleted),
                fingerprint: "deleted".to_owned(),
            });
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Err(AppError::PermissionDenied);
        }
        Err(error) => return Err(AppError::Io(error)),
    };
    let modified_at_ms = current
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .and_then(|value| u64::try_from(value.as_millis()).ok())
        .unwrap_or(0);
    let changed = current.len() != known.byte_size || modified_at_ms != known.modified_at_ms;

    Ok(DocumentChangeDto {
        document_id,
        changed,
        kind: changed.then_some(DocumentChangeKind::Modified),
        fingerprint: format!("{}:{modified_at_ms}", current.len()),
    })
}

async fn open_with_manager(
    app: &AppHandle,
    manager: &DocumentManager,
    path: String,
) -> Result<OpenDocumentResult, AppError> {
    let started = Instant::now();
    let canonical_path = canonicalize_supported_path(path).await?;
    if let Some(existing) = manager.get_by_path(&canonical_path) {
        return Ok(existing);
    }

    let loaded = load_canonical(canonical_path).await?;
    let result = manager.insert(loaded);
    let session = manager.get(result.document.id)?;
    schedule_index(app.clone(), session);
    tracing::info!(
        document_id = %result.document.id.0,
        byte_size = result.document.byte_size,
        mode = ?result.document.mode,
        elapsed_ms = started.elapsed().as_millis(),
        "opened Markdown document"
    );
    Ok(result)
}

fn schedule_index(app: AppHandle, session: Arc<DocumentSession>) {
    if session.is_index_complete() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        match session.complete_index().await {
            Ok(Some(payload)) => {
                if let Err(error) = app.emit("document-index-ready", payload) {
                    tracing::warn!(%error, "failed to emit completed document index");
                }
            }
            Ok(None) | Err(AppError::SearchCancelled) => {}
            Err(error) => {
                tracing::error!(%error, "background document indexing failed");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::markdown::parse_markdown_blocks;

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
            let parsed = parse_markdown_blocks(&document.source);
            assert!(
                parsed.blocks[0]
                    .html
                    .as_deref()
                    .is_some_and(|html| html.contains("<h1 id=\"test\">Test</h1>"))
            );
            assert!(parsed.blocks.iter().all(|block| {
                block
                    .html
                    .as_deref()
                    .is_none_or(|html| !html.contains("<script"))
            }));
            assert_eq!(document.encoding, "UTF-8");
        }
    }
}
