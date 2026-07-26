use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::RwLock;

use super::loader::LoadedDocument;
use super::session::DocumentSession;
use crate::errors::AppError;
use crate::types::{DocumentId, DocumentMetadataDto, OpenDocumentResult};

#[derive(Default)]
struct DocumentRegistry {
    documents: HashMap<DocumentId, Arc<DocumentSession>>,
    paths: HashMap<PathBuf, DocumentId>,
}

#[derive(Default)]
pub struct DocumentManager {
    registry: RwLock<DocumentRegistry>,
}

impl DocumentManager {
    pub fn get_by_path(&self, path: &Path) -> Option<OpenDocumentResult> {
        let registry = self.registry.read();
        let id = registry.paths.get(path)?;
        registry
            .documents
            .get(id)
            .map(|session| session.open_result(true))
    }

    pub fn insert(&self, loaded: LoadedDocument) -> OpenDocumentResult {
        let mut registry = self.registry.write();
        if let Some(id) = registry.paths.get(&loaded.canonical_path)
            && let Some(session) = registry.documents.get(id)
        {
            return session.open_result(true);
        }

        let session = Arc::new(DocumentSession::new(loaded));
        let result = session.open_result(false);
        registry
            .paths
            .insert(session.canonical_path.clone(), session.id);
        registry.documents.insert(session.id, session);
        result
    }

    pub fn get(&self, id: DocumentId) -> Result<Arc<DocumentSession>, AppError> {
        self.registry
            .read()
            .documents
            .get(&id)
            .cloned()
            .ok_or(AppError::DocumentNotFound)
    }

    pub fn metadata(&self, id: DocumentId) -> Result<DocumentMetadataDto, AppError> {
        Ok(self.get(id)?.metadata())
    }

    pub fn close(&self, id: DocumentId) -> Result<(), AppError> {
        let mut registry = self.registry.write();
        let session = registry
            .documents
            .remove(&id)
            .ok_or(AppError::DocumentNotFound)?;
        session.cancel();
        registry.paths.remove(&session.canonical_path);
        Ok(())
    }

    #[cfg(test)]
    fn session_count(&self) -> usize {
        self.registry.read().documents.len()
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::DocumentManager;
    use crate::document::loader::LoadedDocument;

    fn loaded(path: &str) -> LoadedDocument {
        LoadedDocument {
            canonical_path: PathBuf::from(path),
            name: "test.md".to_owned(),
            display_path: path.to_owned(),
            byte_size: 7,
            modified_at_ms: 0,
            encoding: "UTF-8".to_owned(),
            line_count: 1,
            source: "# Test".to_owned(),
        }
    }

    #[test]
    fn deduplicates_sessions_by_canonical_path() {
        let manager = DocumentManager::default();
        let first = manager.insert(loaded("C:\\docs\\test.md"));
        let second = manager.insert(loaded("C:\\docs\\test.md"));

        assert_eq!(first.document.id, second.document.id);
        assert!(!first.reused);
        assert!(second.reused);
        assert_eq!(manager.session_count(), 1);
    }

    #[test]
    fn closing_a_document_releases_the_session() {
        let manager = DocumentManager::default();
        let opened = manager.insert(loaded("C:\\docs\\test.md"));

        assert!(manager.close(opened.document.id).is_ok());
        assert_eq!(manager.session_count(), 0);
        assert!(manager.get(opened.document.id).is_err());
    }
}
