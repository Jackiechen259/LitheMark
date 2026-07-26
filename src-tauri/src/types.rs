use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedDocumentDto {
    pub name: String,
    pub display_path: String,
    pub byte_size: u64,
    pub modified_at_ms: u64,
    pub encoding: String,
    pub line_count: usize,
    pub html: String,
}
