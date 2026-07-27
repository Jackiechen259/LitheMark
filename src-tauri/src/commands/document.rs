use std::io::Write;
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
    DraftPreviewDto, EditSessionInfoDto, EditStateDto, EditorChunkDto, HeadingDto, LocalAssetDto,
    MergeResultDto, OpenDocumentResult, SaveEditResultDto, SearchOptionsDto, SearchResultDto,
    TextEditDto,
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

#[tauri::command]
pub fn begin_edit(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    document_revision: u64,
) -> Result<EditSessionInfoDto, AppError> {
    manager.get(document_id)?.begin_edit(document_revision)
}

#[tauri::command]
pub fn get_editor_chunk(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    start_char: usize,
    count_chars: usize,
    draft_revision: u64,
) -> Result<EditorChunkDto, AppError> {
    manager
        .get(document_id)?
        .editor_chunk(start_char, count_chars, draft_revision)
}

#[tauri::command]
pub fn apply_edit_batch(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    base_draft_revision: u64,
    edits: Vec<TextEditDto>,
) -> Result<EditStateDto, AppError> {
    manager
        .get(document_id)?
        .apply_edit_batch(base_draft_revision, edits)
}

#[tauri::command]
pub fn preview_edit(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    draft_revision: u64,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<DraftPreviewDto, AppError> {
    manager
        .get(document_id)?
        .draft_preview(draft_revision, start_line, end_line)
}

#[tauri::command]
pub async fn save_edit(
    app: AppHandle,
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    draft_revision: u64,
) -> Result<SaveEditResultDto, AppError> {
    let session = manager.get(document_id)?;
    let snapshot = session.edit_save_snapshot(draft_revision)?;
    let current = match tokio::fs::read(&session.canonical_path).await {
        Ok(bytes) => bytes,
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound
                && snapshot.base_fingerprint == "deleted" =>
        {
            Vec::new()
        }
        Err(error) => {
            return Err(match error.kind() {
                std::io::ErrorKind::NotFound => AppError::SaveConflict,
                std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied,
                _ => AppError::Io(error),
            });
        }
    };
    if snapshot.base_fingerprint != "deleted"
        && blake3::hash(&current).to_hex().as_str() != snapshot.base_fingerprint
    {
        return Err(AppError::SaveConflict);
    }

    let path = session.canonical_path.clone();
    let write_path = path.clone();
    tokio::task::spawn_blocking(move || write_draft_atomically(&write_path, snapshot))
        .await
        .map_err(|_| AppError::Internal)??;
    let loaded = load_canonical(path).await?;
    let document = session.replace(loaded);
    let edit = session.begin_edit(document.document.revision)?;
    schedule_index(app, Arc::clone(&session));
    Ok(SaveEditResultDto { document, edit })
}

#[tauri::command]
pub async fn prepare_merge(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    draft_revision: u64,
) -> Result<MergeResultDto, AppError> {
    let session = manager.get(document_id)?;
    let inputs = session.merge_inputs(draft_revision)?;
    let (bytes, fingerprint) = match tokio::fs::read(&session.canonical_path).await {
        Ok(bytes) => {
            let fingerprint = blake3::hash(&bytes).to_hex().to_string();
            (bytes, fingerprint)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            (Vec::new(), "deleted".to_owned())
        }
        Err(error) => {
            return Err(match error.kind() {
                std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied,
                _ => AppError::Io(error),
            });
        }
    };
    let disk_bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let disk = std::str::from_utf8(disk_bytes)
        .map_err(|_| AppError::EncodingFailed)?
        .to_owned();
    let base = inputs.base.to_string();
    let draft = inputs.draft;
    let (content, has_conflicts) =
        tokio::task::spawn_blocking(move || match diffy::merge(&base, &draft, &disk) {
            Ok(merged) => (merged, false),
            Err(conflicted) => (conflicted, true),
        })
        .await
        .map_err(|_| AppError::Internal)?;
    Ok(MergeResultDto {
        document_id,
        draft_revision: inputs.revision,
        content,
        has_conflicts,
        disk_fingerprint: fingerprint,
    })
}

#[tauri::command]
pub async fn apply_merge_result(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
    content: String,
    disk_fingerprint: String,
) -> Result<EditStateDto, AppError> {
    let session = manager.get(document_id)?;
    let (bytes, current_fingerprint) = match tokio::fs::read(&session.canonical_path).await {
        Ok(bytes) => {
            let fingerprint = blake3::hash(&bytes).to_hex().to_string();
            (bytes, fingerprint)
        }
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound && disk_fingerprint == "deleted" =>
        {
            (Vec::new(), "deleted".to_owned())
        }
        Err(_) => return Err(AppError::SaveConflict),
    };
    if current_fingerprint != disk_fingerprint {
        return Err(AppError::SaveConflict);
    }
    let disk_bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let disk = std::str::from_utf8(disk_bytes)
        .map_err(|_| AppError::EncodingFailed)?
        .to_owned();
    session.apply_merge_result(disk, current_fingerprint, content)
}

#[tauri::command]
pub fn discard_edit(
    manager: State<'_, DocumentManager>,
    document_id: DocumentId,
) -> Result<(), AppError> {
    manager.get(document_id)?.discard_edit();
    Ok(())
}

fn write_draft_atomically(
    path: &std::path::Path,
    snapshot: crate::document::session::EditSaveSnapshot,
) -> Result<(), AppError> {
    let parent = path.parent().ok_or(AppError::InvalidPath)?;
    let permissions = std::fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut temporary = tempfile::Builder::new()
        .prefix(".lithemark-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(AppError::Io)?;
    if snapshot.had_utf8_bom {
        temporary.write_all(&[0xef, 0xbb, 0xbf])?;
    }
    for chunk in snapshot.draft.chunks() {
        temporary.write_all(chunk.as_bytes())?;
    }
    temporary.as_file().sync_all()?;
    let target_unchanged = if snapshot.base_fingerprint == "deleted" {
        !path.exists()
    } else {
        let current = std::fs::read(path).map_err(AppError::Io)?;
        blake3::hash(&current).to_hex().as_str() == snapshot.base_fingerprint
    };
    if !target_unchanged {
        return Err(AppError::SaveConflict);
    }
    if let Some(permissions) = permissions {
        temporary.as_file().set_permissions(permissions)?;
    }
    temporary
        .persist(path)
        .map_err(|error| AppError::Io(error.error))?;
    Ok(())
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
    use crate::document::session::EditSaveSnapshot;
    use crate::markdown::parse_markdown_blocks;
    use ropey::Rope;

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

    #[test]
    fn atomically_saves_rope_chunks_and_preserves_utf8_bom() {
        let directory = tempfile::tempdir().expect("temporary directory should be available");
        let path = directory.path().join("edited.md");
        std::fs::write(&path, b"old").expect("fixture should be writable");
        let snapshot = EditSaveSnapshot {
            base_fingerprint: blake3::hash(b"old").to_hex().to_string(),
            had_utf8_bom: true,
            draft: Rope::from_str("# Edited\n\nUnicode: 😀\n"),
            revision: 2,
        };

        write_draft_atomically(&path, snapshot).expect("atomic save should succeed");
        let bytes = std::fs::read(path).expect("saved file should be readable");

        assert!(bytes.starts_with(&[0xef, 0xbb, 0xbf]));
        assert_eq!(
            std::str::from_utf8(&bytes[3..]).expect("saved text should remain UTF-8"),
            "# Edited\n\nUnicode: 😀\n"
        );
    }

    #[test]
    fn atomic_save_refuses_to_replace_a_changed_target() {
        let directory = tempfile::tempdir().expect("temporary directory should be available");
        let path = directory.path().join("conflict.md");
        std::fs::write(&path, b"changed elsewhere").expect("fixture should be writable");
        let snapshot = EditSaveSnapshot {
            base_fingerprint: blake3::hash(b"original").to_hex().to_string(),
            had_utf8_bom: false,
            draft: Rope::from_str("our draft"),
            revision: 2,
        };

        assert!(matches!(
            write_draft_atomically(&path, snapshot),
            Err(AppError::SaveConflict)
        ));
        assert_eq!(
            std::fs::read_to_string(path).expect("conflicted file should remain readable"),
            "changed elsewhere"
        );
    }
}
