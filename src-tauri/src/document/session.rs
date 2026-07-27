use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::RwLock;
use regex::{Regex, RegexBuilder};
use ropey::Rope;
use tokio_util::sync::CancellationToken;

use super::loader::LoadedDocument;
use super::mode::{final_mode, initial_block_count, initial_mode};
use crate::errors::AppError;
use crate::markdown::block::IndexedBlock;
use crate::markdown::{parse_markdown_index, render_indexed_blocks};
use crate::types::{
    BlockBatchDto, DocumentId, DocumentIndexReadyDto, DocumentMetadataDto, DraftPreviewDto,
    EditSessionInfoDto, EditStateDto, EditorChunkDto, HeadingDto, OpenDocumentResult, RenderMode,
    SearchMatchDto, SearchOptionsDto, SearchResultDto, TextEditDto,
};

struct SessionContent {
    source: Arc<str>,
    blocks: Vec<IndexedBlock>,
    headings: Vec<HeadingDto>,
    metadata: DocumentMetadataDto,
    index_complete: bool,
    cancellation: CancellationToken,
    fingerprint: String,
    had_utf8_bom: bool,
}

struct EditSession {
    base_source: Arc<str>,
    base_fingerprint: String,
    had_utf8_bom: bool,
    draft: Rope,
    revision: u64,
    dirty: bool,
}

pub struct EditSaveSnapshot {
    pub base_fingerprint: String,
    pub had_utf8_bom: bool,
    pub draft: Rope,
    pub revision: u64,
}

pub struct MergeInputs {
    pub base: Arc<str>,
    pub draft: String,
    pub revision: u64,
}

pub struct DocumentSession {
    pub id: DocumentId,
    pub canonical_path: PathBuf,
    revision: AtomicU64,
    content: RwLock<SessionContent>,
    edit: RwLock<Option<EditSession>>,
    search_cancellation: RwLock<CancellationToken>,
}

impl DocumentSession {
    pub fn new(loaded: LoadedDocument) -> Self {
        let id = DocumentId::new();
        let mode = initial_mode(loaded.byte_size, loaded.line_count);
        let limit = match mode {
            RenderMode::Full => None,
            RenderMode::Virtualized | RenderMode::Huge => {
                Some(initial_block_count(mode, usize::MAX))
            }
        };
        let parsed = parse_markdown_index(&loaded.source, limit, None).unwrap_or_else(|_| {
            parse_markdown_index("", None, None).expect("empty Markdown always parses")
        });
        let mode = if parsed.complete {
            final_mode(loaded.byte_size, loaded.line_count, &parsed.stats)
        } else {
            mode
        };
        let metadata = metadata_from_loaded(
            id,
            1,
            mode,
            parsed.complete.then_some(parsed.blocks.len()),
            &loaded,
        );

        Self {
            id,
            canonical_path: loaded.canonical_path,
            revision: AtomicU64::new(1),
            content: RwLock::new(SessionContent {
                source: Arc::from(loaded.source),
                blocks: parsed.blocks,
                headings: parsed.headings,
                metadata,
                index_complete: parsed.complete,
                cancellation: CancellationToken::new(),
                fingerprint: loaded.fingerprint,
                had_utf8_bom: loaded.had_utf8_bom,
            }),
            edit: RwLock::new(None),
            search_cancellation: RwLock::new(CancellationToken::new()),
        }
    }

    pub fn open_result(&self, reused: bool) -> OpenDocumentResult {
        let content = self.content.read();
        let count = initial_block_count(content.metadata.mode, content.blocks.len());
        OpenDocumentResult {
            document: content.metadata.clone(),
            initial_blocks: render_indexed_blocks(&content.source, &content.blocks[..count]),
            headings: content.headings.clone(),
            index_complete: content.index_complete,
            reused,
        }
    }

    pub fn metadata(&self) -> DocumentMetadataDto {
        self.content.read().metadata.clone()
    }

    pub fn is_index_complete(&self) -> bool {
        self.content.read().index_complete
    }

    pub fn replace(&self, loaded: LoadedDocument) -> OpenDocumentResult {
        self.cancel_search();
        let revision = self.revision.fetch_add(1, Ordering::AcqRel) + 1;
        let mode = initial_mode(loaded.byte_size, loaded.line_count);
        let limit = match mode {
            RenderMode::Full => None,
            RenderMode::Virtualized | RenderMode::Huge => {
                Some(initial_block_count(mode, usize::MAX))
            }
        };
        let parsed = parse_markdown_index(&loaded.source, limit, None).unwrap_or_else(|_| {
            parse_markdown_index("", None, None).expect("empty Markdown always parses")
        });
        let mode = if parsed.complete {
            final_mode(loaded.byte_size, loaded.line_count, &parsed.stats)
        } else {
            mode
        };
        let metadata = metadata_from_loaded(
            self.id,
            revision,
            mode,
            parsed.complete.then_some(parsed.blocks.len()),
            &loaded,
        );
        let mut content = self.content.write();
        content.cancellation.cancel();
        *content = SessionContent {
            source: Arc::from(loaded.source),
            blocks: parsed.blocks,
            headings: parsed.headings,
            metadata,
            index_complete: parsed.complete,
            cancellation: CancellationToken::new(),
            fingerprint: loaded.fingerprint,
            had_utf8_bom: loaded.had_utf8_bom,
        };
        drop(content);
        *self.edit.write() = None;
        self.open_result(false)
    }

    pub fn cancel(&self) {
        self.content.read().cancellation.cancel();
        self.cancel_search();
    }

    pub async fn complete_index(
        self: Arc<Self>,
    ) -> Result<Option<DocumentIndexReadyDto>, AppError> {
        let (source, revision, token, byte_size, line_count) = {
            let content = self.content.read();
            if content.index_complete {
                return Ok(None);
            }
            (
                Arc::clone(&content.source),
                content.metadata.revision,
                content.cancellation.clone(),
                content.metadata.byte_size,
                content.metadata.line_count,
            )
        };

        let worker_token = token.clone();
        let indexed = tokio::task::spawn_blocking(move || {
            parse_markdown_index(&source, None, Some(&worker_token))
        })
        .await
        .map_err(|_| AppError::Internal)??;

        if token.is_cancelled() {
            return Ok(None);
        }

        let mut content = self.content.write();
        if content.metadata.revision != revision || content.cancellation.is_cancelled() {
            return Ok(None);
        }
        content.metadata.mode = final_mode(byte_size, line_count, &indexed.stats);
        content.metadata.block_count = Some(indexed.blocks.len());
        content.blocks = indexed.blocks;
        content.headings = indexed.headings;
        content.index_complete = true;

        Ok(Some(DocumentIndexReadyDto {
            document: content.metadata.clone(),
            headings: content.headings.clone(),
        }))
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
        let bounded_start = start.min(total);
        let end = bounded_start.saturating_add(count).min(total);
        let blocks = render_indexed_blocks(&content.source, &content.blocks[bounded_start..end]);
        Ok(BlockBatchDto {
            document_id: self.id,
            revision,
            start: bounded_start,
            total,
            blocks,
        })
    }

    pub fn headings(&self, revision: u64) -> Result<Vec<HeadingDto>, AppError> {
        let content = self.content.read();
        ensure_revision(content.metadata.revision, revision)?;
        Ok(content.headings.clone())
    }

    pub fn search(
        &self,
        query: String,
        revision: u64,
        options: SearchOptionsDto,
    ) -> Result<SearchResultDto, AppError> {
        if query.trim().is_empty() {
            return Ok(SearchResultDto {
                document_id: self.id,
                revision,
                query,
                matches: Vec::new(),
                truncated: false,
            });
        }

        let token = {
            let mut current = self.search_cancellation.write();
            current.cancel();
            *current = CancellationToken::new();
            current.clone()
        };
        let matcher = search_regex(&query, &options)?;
        let content = self.content.read();
        ensure_revision(content.metadata.revision, revision)?;
        if !content.index_complete {
            return Err(AppError::IndexingInProgress);
        }

        let result_limit = options.limit.clamp(1, 2_000);
        let mut matches = Vec::new();
        let mut truncated = false;
        let mut line_number = 1;
        let mut previous_end = 0;
        for (index, block) in content.blocks.iter().enumerate() {
            if index % 512 == 0 && token.is_cancelled() {
                return Err(AppError::SearchCancelled);
            }
            let block_source = &content.source[block.source_start..block.source_end];
            line_number += content.source[previous_end..block.source_start]
                .bytes()
                .filter(|byte| *byte == b'\n')
                .count();
            for found in matcher.find_iter(block_source) {
                if token.is_cancelled() {
                    return Err(AppError::SearchCancelled);
                }
                if matches.len() >= result_limit {
                    truncated = true;
                    break;
                }
                if options.whole_word
                    && !has_word_boundaries(block_source, found.start(), found.end())
                {
                    continue;
                }
                let (preview, preview_match_start, preview_match_end) =
                    search_preview(block_source, found.start(), found.end());
                matches.push(SearchMatchDto {
                    block_id: block.id,
                    line_number: line_number
                        + block_source[..found.start()]
                            .bytes()
                            .filter(|byte| *byte == b'\n')
                            .count(),
                    preview,
                    preview_match_start,
                    preview_match_end,
                });
            }
            if truncated {
                break;
            }
            line_number += block_source.bytes().filter(|byte| *byte == b'\n').count();
            previous_end = block.source_end;
        }

        Ok(SearchResultDto {
            document_id: self.id,
            revision,
            query,
            matches,
            truncated,
        })
    }

    pub fn cancel_search(&self) {
        self.search_cancellation.read().cancel();
    }

    pub fn begin_edit(&self, document_revision: u64) -> Result<EditSessionInfoDto, AppError> {
        let content = self.content.read();
        ensure_revision(content.metadata.revision, document_revision)?;
        let mut edit = self.edit.write();
        if edit.is_none() {
            *edit = Some(EditSession {
                base_source: Arc::clone(&content.source),
                base_fingerprint: content.fingerprint.clone(),
                had_utf8_bom: content.had_utf8_bom,
                draft: Rope::from_str(&content.source),
                revision: 1,
                dirty: false,
            });
        }
        let session = edit.as_ref().ok_or(AppError::EditNotStarted)?;
        Ok(EditSessionInfoDto {
            document_id: self.id,
            document_revision,
            draft_revision: session.revision,
            total_chars: session.draft.len_chars(),
            line_count: session.draft.len_lines(),
            dirty: session.dirty,
        })
    }

    pub fn editor_chunk(
        &self,
        start_char: usize,
        count_chars: usize,
        draft_revision: u64,
    ) -> Result<EditorChunkDto, AppError> {
        let edit = self.edit.read();
        let session = edit.as_ref().ok_or(AppError::EditNotStarted)?;
        ensure_draft_revision(session.revision, draft_revision)?;
        let total = session.draft.len_chars();
        let start = start_char.min(total);
        let end = start
            .saturating_add(count_chars.clamp(1, 1_048_576))
            .min(total);
        Ok(EditorChunkDto {
            document_id: self.id,
            draft_revision,
            start_char: start,
            next_char: end,
            total_chars: total,
            text: session.draft.slice(start..end).to_string(),
        })
    }

    pub fn apply_edit_batch(
        &self,
        base_draft_revision: u64,
        edits: Vec<TextEditDto>,
    ) -> Result<EditStateDto, AppError> {
        let mut edit_session = self.edit.write();
        let session = edit_session.as_mut().ok_or(AppError::EditNotStarted)?;
        ensure_draft_revision(session.revision, base_draft_revision)?;

        let mut resolved = edits
            .into_iter()
            .map(|edit| {
                let from =
                    position_to_char(&session.draft, edit.from.line, edit.from.utf16_column)?;
                let to = position_to_char(&session.draft, edit.to.line, edit.to.utf16_column)?;
                if from > to {
                    return Err(AppError::InvalidEditPosition);
                }
                Ok((from, to, edit.insert))
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        resolved.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));
        for (from, to, insert) in resolved {
            session.draft.remove(from..to);
            session.draft.insert(from, &insert);
        }
        if !session.dirty {
            session.dirty = true;
        }
        session.revision = session.revision.saturating_add(1);
        Ok(EditStateDto {
            document_id: self.id,
            draft_revision: session.revision,
            total_chars: session.draft.len_chars(),
            line_count: session.draft.len_lines(),
            dirty: session.dirty,
        })
    }

    pub fn draft_preview(
        &self,
        draft_revision: u64,
        start_line: Option<usize>,
        end_line: Option<usize>,
    ) -> Result<DraftPreviewDto, AppError> {
        let edit = self.edit.read();
        let session = edit.as_ref().ok_or(AppError::EditNotStarted)?;
        ensure_draft_revision(session.revision, draft_revision)?;
        let total_lines = session.draft.len_lines();
        let start = start_line.unwrap_or(0).min(total_lines);
        let end = end_line.unwrap_or(total_lines).clamp(start, total_lines);
        let start_char = session.draft.line_to_char(start);
        let end_char = if end == total_lines {
            session.draft.len_chars()
        } else {
            session.draft.line_to_char(end)
        };
        let source = session.draft.slice(start_char..end_char).to_string();
        let parsed = crate::markdown::parse_markdown_blocks(&source);
        Ok(DraftPreviewDto {
            document_id: self.id,
            draft_revision,
            start_line: start,
            end_line: end,
            blocks: parsed.blocks,
            headings: parsed.headings,
        })
    }

    pub fn edit_save_snapshot(&self, draft_revision: u64) -> Result<EditSaveSnapshot, AppError> {
        let edit = self.edit.read();
        let session = edit.as_ref().ok_or(AppError::EditNotStarted)?;
        ensure_draft_revision(session.revision, draft_revision)?;
        Ok(EditSaveSnapshot {
            base_fingerprint: session.base_fingerprint.clone(),
            had_utf8_bom: session.had_utf8_bom,
            draft: session.draft.clone(),
            revision: session.revision,
        })
    }

    pub fn merge_inputs(&self, draft_revision: u64) -> Result<MergeInputs, AppError> {
        let edit = self.edit.read();
        let session = edit.as_ref().ok_or(AppError::EditNotStarted)?;
        ensure_draft_revision(session.revision, draft_revision)?;
        Ok(MergeInputs {
            base: Arc::clone(&session.base_source),
            draft: session.draft.to_string(),
            revision: session.revision,
        })
    }

    pub fn apply_merge_result(
        &self,
        base_source: String,
        base_fingerprint: String,
        content: String,
    ) -> Result<EditStateDto, AppError> {
        let mut edit = self.edit.write();
        let session = edit.as_mut().ok_or(AppError::EditNotStarted)?;
        session.base_source = Arc::from(base_source);
        session.base_fingerprint = base_fingerprint;
        session.draft = Rope::from_str(&content);
        session.revision = session.revision.saturating_add(1);
        session.dirty = true;
        Ok(EditStateDto {
            document_id: self.id,
            draft_revision: session.revision,
            total_chars: session.draft.len_chars(),
            line_count: session.draft.len_lines(),
            dirty: true,
        })
    }

    pub fn discard_edit(&self) {
        *self.edit.write() = None;
    }
}

fn ensure_draft_revision(current: u64, requested: u64) -> Result<(), AppError> {
    if current == requested {
        Ok(())
    } else {
        Err(AppError::StaleDraftRevision)
    }
}

fn position_to_char(rope: &Rope, line: usize, utf16_column: usize) -> Result<usize, AppError> {
    if line >= rope.len_lines() {
        return Err(AppError::InvalidEditPosition);
    }
    let line_start = rope.line_to_char(line);
    let line_slice = rope.line(line);
    let mut consumed_utf16 = 0;
    let mut consumed_chars = 0;
    for character in line_slice.chars() {
        if consumed_utf16 == utf16_column {
            return Ok(line_start + consumed_chars);
        }
        consumed_utf16 += character.len_utf16();
        consumed_chars += 1;
        if consumed_utf16 > utf16_column {
            return Err(AppError::InvalidEditPosition);
        }
    }
    if consumed_utf16 == utf16_column {
        Ok(line_start + consumed_chars)
    } else {
        Err(AppError::InvalidEditPosition)
    }
}

fn search_regex(query: &str, options: &SearchOptionsDto) -> Result<Regex, AppError> {
    RegexBuilder::new(&regex::escape(query))
        .case_insensitive(!options.case_sensitive)
        .build()
        .map_err(|_| AppError::InvalidSearch)
}

fn has_word_boundaries(source: &str, start: usize, end: usize) -> bool {
    let before = source[..start].chars().next_back();
    let after = source[end..].chars().next();
    before.is_none_or(|character| !is_word_character(character))
        && after.is_none_or(|character| !is_word_character(character))
}

fn is_word_character(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

fn search_preview(source: &str, start: usize, end: usize) -> (String, usize, usize) {
    const CONTEXT_CHARS: usize = 48;
    let before = source[..start]
        .char_indices()
        .rev()
        .nth(CONTEXT_CHARS)
        .map_or(0, |(index, _)| index);
    let after = source[end..]
        .char_indices()
        .nth(CONTEXT_CHARS)
        .map_or(source.len(), |(index, _)| end + index);
    let raw = &source[before..after];
    let prefix = if before > 0 { "…" } else { "" };
    let suffix = if after < source.len() { "…" } else { "" };
    let normalized_before = source[before..start].replace(['\r', '\n'], " ");
    let normalized_match = source[start..end].replace(['\r', '\n'], " ");
    let normalized_after = source[end..after].replace(['\r', '\n'], " ");
    let preview_match_start =
        prefix.encode_utf16().count() + normalized_before.encode_utf16().count();
    let preview_match_end = preview_match_start + normalized_match.encode_utf16().count();
    let preview =
        format!("{prefix}{normalized_before}{normalized_match}{normalized_after}{suffix}");
    debug_assert!(!raw.is_empty());
    (preview, preview_match_start, preview_match_end)
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
    mode: RenderMode,
    block_count: Option<usize>,
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
        mode,
        block_count,
        revision,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::DocumentSession;
    use crate::document::loader::LoadedDocument;
    use crate::errors::AppError;
    use crate::types::{RenderMode, SearchOptionsDto, TextEditDto, TextPositionDto};

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
            had_utf8_bom: false,
            fingerprint: blake3::hash(b"# One\n\nText").to_hex().to_string(),
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
    fn returns_bounded_lazily_rendered_block_batches() {
        let session = session();
        let result = session.blocks(1, 20, 1);
        assert!(result.is_ok());
        if let Ok(batch) = result {
            assert_eq!(batch.start, 1);
            assert_eq!(batch.blocks.len(), 1);
            assert_eq!(batch.total, 2);
            assert!(batch.blocks[0].html.is_some());
        }
    }

    #[test]
    fn large_documents_start_with_a_partial_index() {
        let source = (0..50_000)
            .map(|index| format!("## Heading {index}\n\nParagraph {index}\n\n"))
            .collect::<String>();
        let session = DocumentSession::new(LoadedDocument {
            canonical_path: PathBuf::from("C:\\docs\\large.md"),
            name: "large.md".to_owned(),
            display_path: "C:\\docs\\large.md".to_owned(),
            byte_size: u64::try_from(source.len()).unwrap_or(u64::MAX),
            modified_at_ms: 0,
            encoding: "UTF-8".to_owned(),
            line_count: 200_000,
            source,
            had_utf8_bom: false,
            fingerprint: String::new(),
        });
        let result = session.open_result(false);

        assert_eq!(result.document.mode, RenderMode::Virtualized);
        assert!(!result.index_complete);
        assert!(result.initial_blocks.len() <= 120);
        assert!(result.document.block_count.is_none());
    }

    #[test]
    fn searches_blocks_with_line_numbers_and_whole_word_matching() {
        let session = DocumentSession::new(LoadedDocument {
            canonical_path: PathBuf::from("C:\\docs\\search.md"),
            name: "search.md".to_owned(),
            display_path: "C:\\docs\\search.md".to_owned(),
            byte_size: 45,
            modified_at_ms: 0,
            encoding: "UTF-8".to_owned(),
            line_count: 5,
            source: "# Rust\n\nrust is fast.\n\nrustacean and RUST".to_owned(),
            had_utf8_bom: false,
            fingerprint: String::new(),
        });
        let result = session.search(
            "rust".to_owned(),
            1,
            SearchOptionsDto {
                case_sensitive: false,
                whole_word: true,
                limit: 100,
            },
        );

        assert!(result.is_ok());
        if let Ok(result) = result {
            assert_eq!(result.matches.len(), 3);
            assert_eq!(result.matches[0].line_number, 1);
            assert_eq!(result.matches[1].line_number, 3);
            assert_eq!(result.matches[2].line_number, 5);
            assert!(result.matches.iter().all(|found| {
                found.preview[found.preview_match_start..found.preview_match_end]
                    .eq_ignore_ascii_case("rust")
            }));
        }
    }

    #[test]
    fn truncates_search_results_at_the_requested_limit() {
        let session = DocumentSession::new(LoadedDocument {
            canonical_path: PathBuf::from("C:\\docs\\many.md"),
            name: "many.md".to_owned(),
            display_path: "C:\\docs\\many.md".to_owned(),
            byte_size: 19,
            modified_at_ms: 0,
            encoding: "UTF-8".to_owned(),
            line_count: 1,
            source: "term term term term".to_owned(),
            had_utf8_bom: false,
            fingerprint: String::new(),
        });
        let result = session.search(
            "term".to_owned(),
            1,
            SearchOptionsDto {
                case_sensitive: true,
                whole_word: false,
                limit: 2,
            },
        );

        assert!(result.is_ok());
        if let Ok(result) = result {
            assert_eq!(result.matches.len(), 2);
            assert!(result.truncated);
        }
    }

    #[test]
    fn applies_utf16_editor_positions_and_streams_the_updated_draft() {
        let session = DocumentSession::new(LoadedDocument {
            canonical_path: PathBuf::from("C:\\docs\\unicode.md"),
            name: "unicode.md".to_owned(),
            display_path: "C:\\docs\\unicode.md".to_owned(),
            byte_size: 7,
            modified_at_ms: 0,
            encoding: "UTF-8".to_owned(),
            line_count: 1,
            source: "a😀b".to_owned(),
            had_utf8_bom: false,
            fingerprint: String::new(),
        });
        let started = session.begin_edit(1).expect("edit session should start");
        let state = session
            .apply_edit_batch(
                started.draft_revision,
                vec![TextEditDto {
                    from: TextPositionDto {
                        line: 0,
                        utf16_column: 1,
                    },
                    to: TextPositionDto {
                        line: 0,
                        utf16_column: 3,
                    },
                    insert: "界".to_owned(),
                }],
            )
            .expect("UTF-16 positions should map to rope character positions");
        let chunk = session
            .editor_chunk(0, 100, state.draft_revision)
            .expect("updated draft should stream");

        assert_eq!(chunk.text, "a界b");
        assert!(state.dirty);
    }

    #[test]
    fn rejects_out_of_order_editor_transactions() {
        let session = session();
        let started = session.begin_edit(1).expect("edit session should start");
        let edit = TextEditDto {
            from: TextPositionDto {
                line: 0,
                utf16_column: 0,
            },
            to: TextPositionDto {
                line: 0,
                utf16_column: 0,
            },
            insert: "!".to_owned(),
        };
        assert!(
            session
                .apply_edit_batch(started.draft_revision, vec![edit])
                .is_ok()
        );
        assert!(matches!(
            session.apply_edit_batch(started.draft_revision, Vec::new()),
            Err(AppError::StaleDraftRevision)
        ));
    }
}
