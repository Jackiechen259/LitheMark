use crate::types::BlockKind;

#[derive(Debug, Clone)]
pub struct RawBlock {
    pub kind: BlockKind,
    pub source_start: usize,
    pub source_end: usize,
    pub heading_level: Option<u8>,
    pub plain_text: String,
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
