use crate::types::{BlockKind, HeadingDto};

#[derive(Debug, Clone)]
pub struct RawBlock {
    pub kind: BlockKind,
    pub source_start: usize,
    pub source_end: usize,
    pub heading_level: Option<u8>,
    pub plain_text: String,
}

#[derive(Debug, Clone)]
pub struct IndexedBlock {
    pub id: u64,
    pub kind: BlockKind,
    pub source_start: usize,
    pub source_end: usize,
    pub estimated_height: u32,
    pub plain_text: Option<String>,
    pub heading: Option<HeadingDto>,
}

impl RawBlock {
    #[must_use]
    pub fn estimated_height(&self, source: &str) -> u32 {
        let line_count = source[self.source_start..self.source_end].lines().count();
        let line_count = u32::try_from(line_count).unwrap_or(u32::MAX);
        match self.kind {
            BlockKind::Heading => 64,
            BlockKind::Rule => 32,
            BlockKind::CodeBlock => line_count.saturating_mul(22).clamp(80, 1_200),
            BlockKind::Table => line_count.saturating_mul(34).clamp(80, 1_200),
            _ => line_count.saturating_mul(28).clamp(36, 900),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct DocumentStats {
    pub block_count: usize,
    pub max_code_block_bytes: usize,
    pub max_table_rows: usize,
    pub html_block_count: usize,
    pub estimated_dom_nodes: usize,
}
