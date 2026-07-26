use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DocumentId(pub Uuid);

impl DocumentId {
    #[must_use]
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for DocumentId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RenderMode {
    Full,
    Virtualized,
    Huge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Heading,
    Paragraph,
    List,
    BlockQuote,
    CodeBlock,
    Table,
    Rule,
    HtmlBlock,
    FootnoteDefinition,
    DefinitionList,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadataDto {
    pub id: DocumentId,
    pub name: String,
    pub display_path: String,
    pub byte_size: u64,
    pub modified_at_ms: u64,
    pub encoding: String,
    pub line_count: usize,
    pub mode: RenderMode,
    pub block_count: Option<usize>,
    pub revision: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownBlockDto {
    pub id: u64,
    pub kind: BlockKind,
    pub source_start: usize,
    pub source_end: usize,
    pub estimated_height: u32,
    pub html: Option<String>,
    pub plain_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadingDto {
    pub block_id: u64,
    pub level: u8,
    pub text: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenDocumentResult {
    pub document: DocumentMetadataDto,
    pub initial_blocks: Vec<MarkdownBlockDto>,
    pub headings: Vec<HeadingDto>,
    pub index_complete: bool,
    pub reused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockBatchDto {
    pub document_id: DocumentId,
    pub revision: u64,
    pub start: usize,
    pub total: usize,
    pub blocks: Vec<MarkdownBlockDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentIndexReadyDto {
    pub document: DocumentMetadataDto,
    pub headings: Vec<HeadingDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptionsDto {
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
}

fn default_search_limit() -> usize {
    500
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchDto {
    pub block_id: u64,
    pub line_number: usize,
    pub preview: String,
    pub preview_match_start: usize,
    pub preview_match_end: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultDto {
    pub document_id: DocumentId,
    pub revision: u64,
    pub query: String,
    pub matches: Vec<SearchMatchDto>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAssetDto {
    pub data_url: String,
    pub mime_type: String,
    pub byte_size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentChangeKind {
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChangeDto {
    pub document_id: DocumentId,
    pub changed: bool,
    pub kind: Option<DocumentChangeKind>,
    pub fingerprint: String,
}
