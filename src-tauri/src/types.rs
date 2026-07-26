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
