use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::RwLock;

use super::loader::LoadedDocument;
use crate::types::{DocumentId, DocumentMetadataDto, OpenDocumentResult, RenderMode};

struct SessionContent {
    source: String,
    html: String,
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
        let metadata = metadata_from_loaded(id, 1, &loaded);
        Self {
            id,
            canonical_path: loaded.canonical_path,
            revision: AtomicU64::new(1),
            content: RwLock::new(SessionContent {
                source: loaded.source,
                html: loaded.html,
                metadata,
            }),
        }
    }

    pub fn open_result(&self, reused: bool) -> OpenDocumentResult {
        let content = self.content.read();
        debug_assert_eq!(content.source.lines().count(), content.metadata.line_count);
        OpenDocumentResult {
            document: content.metadata.clone(),
            html: content.html.clone(),
            reused,
        }
    }

    pub fn metadata(&self) -> DocumentMetadataDto {
        self.content.read().metadata.clone()
    }

    pub fn replace(&self, loaded: LoadedDocument) -> OpenDocumentResult {
        let revision = self.revision.fetch_add(1, Ordering::AcqRel) + 1;
        let metadata = metadata_from_loaded(self.id, revision, &loaded);
        *self.content.write() = SessionContent {
            source: loaded.source,
            html: loaded.html,
            metadata,
        };
        self.open_result(false)
    }
}

fn metadata_from_loaded(
    id: DocumentId,
    revision: u64,
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
        revision,
    }
}
