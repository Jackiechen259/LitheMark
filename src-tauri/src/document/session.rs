use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::RwLock;

use super::loader::LoadedDocument;
use crate::errors::AppError;
use crate::markdown::parse_markdown_blocks;
use crate::types::{
    BlockBatchDto, DocumentId, DocumentMetadataDto, HeadingDto, MarkdownBlockDto,
    OpenDocumentResult, RenderMode,
};

struct SessionContent {
    source: String,
    blocks: Vec<MarkdownBlockDto>,
    headings: Vec<HeadingDto>,
    metadata: DocumentMetadataDto,
}

pub struct DocumentSession {
    pub id: DocumentId,
    pub canonical_path: PathBuf,
    revision: AtomicU64,
    content: RwLock<SessionContent>,
}

impl DocumentSession {
    pub fn new(loaded: LoadedDocument) -> Self {
        let id = DocumentId::new();
        let parsed = parse_markdown_blocks(&loaded.source);
        let metadata = metadata_from_loaded(id, 1, parsed.blocks.len(), &loaded);
        Self {
            id,
            canonical_path: loaded.canonical_path,
            revision: AtomicU64::new(1),
            content: RwLock::new(SessionContent {
                source: loaded.source,
                blocks: parsed.blocks,
                headings: parsed.headings,
                metadata,
            }),
        }
    }

    pub fn open_result(&self, reused: bool) -> OpenDocumentResult {
        let content = self.content.read();
        debug_assert_eq!(content.source.lines().count(), content.metadata.line_count);
        OpenDocumentResult {
            document: content.metadata.clone(),
            initial_blocks: content.blocks.clone(),
            headings: content.headings.clone(),
            index_complete: true,
            reused,
        }
    }

    pub fn metadata(&self) -> DocumentMetadataDto {
        self.content.read().metadata.clone()
    }

    pub fn replace(&self, loaded: LoadedDocument) -> OpenDocumentResult {
        let revision = self.revision.fetch_add(1, Ordering::AcqRel) + 1;
        let parsed = parse_markdown_blocks(&loaded.source);
        let metadata = metadata_from_loaded(self.id, revision, parsed.blocks.len(), &loaded);
        *self.content.write() = SessionContent {
            source: loaded.source,
            blocks: parsed.blocks,
            headings: parsed.headings,
            metadata,
        };
        self.open_result(false)
    }

    pub fn blocks(
        &self,
        start: usize,
        count: usize,
        revision: u64,
    ) -> Result<BlockBatchDto, AppError> {
        let content = self.content.read();
        ensure_revision(content.metadata.revision, revision)?;
        let total = content.blocks.len();
        let end = start.saturating_add(count).min(total);
        let blocks = content
            .blocks
            .get(start.min(total)..end)
            .unwrap_or_default()
            .to_vec();
        Ok(BlockBatchDto {
            document_id: self.id,
            revision,
            start: start.min(total),
            total,
            blocks,
        })
    }

    pub fn headings(&self, revision: u64) -> Result<Vec<HeadingDto>, AppError> {
        let content = self.content.read();
        ensure_revision(content.metadata.revision, revision)?;
        Ok(content.headings.clone())
    }
}

fn ensure_revision(current: u64, requested: u64) -> Result<(), AppError> {
    if current == requested {
        Ok(())
    } else {
        Err(AppError::StaleRevision)
    }
}

fn metadata_from_loaded(
    id: DocumentId,
    revision: u64,
    block_count: usize,
    loaded: &LoadedDocument,
) -> DocumentMetadataDto {
    DocumentMetadataDto {
        id,
        name: loaded.name.clone(),
        display_path: loaded.display_path.clone(),
        byte_size: loaded.byte_size,
        modified_at_ms: loaded.modified_at_ms,
        encoding: loaded.encoding.clone(),
        line_count: loaded.line_count,
        mode: RenderMode::Full,
        block_count: Some(block_count),
        revision,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::DocumentSession;
    use crate::document::loader::LoadedDocument;
    use crate::errors::AppError;

    fn session() -> DocumentSession {
        DocumentSession::new(LoadedDocument {
            canonical_path: PathBuf::from("C:\\docs\\test.md"),
            name: "test.md".to_owned(),
            display_path: "C:\\docs\\test.md".to_owned(),
            byte_size: 14,
            modified_at_ms: 0,
            encoding: "UTF-8".to_owned(),
            line_count: 3,
            source: "# One\n\nText".to_owned(),
        })
    }

    #[test]
    fn rejects_block_requests_for_stale_revisions() {
        let session = session();
        assert!(matches!(
            session.blocks(0, 10, 999),
            Err(AppError::StaleRevision)
        ));
    }

    #[test]
    fn returns_bounded_block_batches() {
        let session = session();
        let result = session.blocks(1, 20, 1);
        assert!(result.is_ok());
        if let Ok(batch) = result {
            assert_eq!(batch.start, 1);
            assert_eq!(batch.blocks.len(), 1);
            assert_eq!(batch.total, 2);
        }
    }
}
