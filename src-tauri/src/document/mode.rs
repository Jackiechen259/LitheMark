use crate::markdown::block::DocumentStats;
use crate::types::RenderMode;

pub const VIRTUALIZED_INITIAL_BLOCKS: usize = 120;
pub const HUGE_INITIAL_BLOCKS: usize = 60;

const VIRTUALIZED_BYTE_THRESHOLD: u64 = 2 * 1024 * 1024;
const HUGE_BYTE_THRESHOLD: u64 = 64 * 1024 * 1024;
const VIRTUALIZED_LINE_THRESHOLD: usize = 40_000;
const HUGE_LINE_THRESHOLD: usize = 800_000;
const VIRTUALIZED_BLOCK_THRESHOLD: usize = 5_000;
const HUGE_BLOCK_THRESHOLD: usize = 150_000;
const LARGE_CODE_BLOCK_BYTES: usize = 512 * 1024;
const LARGE_TABLE_ROWS: usize = 2_000;

#[must_use]
pub fn initial_mode(byte_size: u64, line_count: usize) -> RenderMode {
    if byte_size >= HUGE_BYTE_THRESHOLD || line_count >= HUGE_LINE_THRESHOLD {
        RenderMode::Huge
    } else if byte_size >= VIRTUALIZED_BYTE_THRESHOLD || line_count >= VIRTUALIZED_LINE_THRESHOLD {
        RenderMode::Virtualized
    } else {
        RenderMode::Full
    }
}

#[must_use]
pub fn final_mode(byte_size: u64, line_count: usize, stats: &DocumentStats) -> RenderMode {
    if byte_size >= HUGE_BYTE_THRESHOLD
        || line_count >= HUGE_LINE_THRESHOLD
        || stats.block_count >= HUGE_BLOCK_THRESHOLD
    {
        RenderMode::Huge
    } else if byte_size >= VIRTUALIZED_BYTE_THRESHOLD
        || line_count >= VIRTUALIZED_LINE_THRESHOLD
        || stats.block_count >= VIRTUALIZED_BLOCK_THRESHOLD
        || stats.max_code_block_bytes >= LARGE_CODE_BLOCK_BYTES
        || stats.max_table_rows >= LARGE_TABLE_ROWS
    {
        RenderMode::Virtualized
    } else {
        RenderMode::Full
    }
}

#[must_use]
pub fn initial_block_count(mode: RenderMode, total: usize) -> usize {
    match mode {
        RenderMode::Full => total,
        RenderMode::Virtualized => VIRTUALIZED_INITIAL_BLOCKS.min(total),
        RenderMode::Huge => HUGE_INITIAL_BLOCKS.min(total),
    }
}

#[cfg(test)]
mod tests {
    use super::{final_mode, initial_mode};
    use crate::markdown::block::DocumentStats;
    use crate::types::RenderMode;

    #[test]
    fn selects_modes_from_centralized_thresholds() {
        assert_eq!(initial_mode(1_024, 10), RenderMode::Full);
        assert_eq!(initial_mode(4 * 1024 * 1024, 10), RenderMode::Virtualized);
        assert_eq!(initial_mode(80 * 1024 * 1024, 10), RenderMode::Huge);

        let stats = DocumentStats {
            block_count: 6_000,
            ..DocumentStats::default()
        };
        assert_eq!(final_mode(1_024, 10, &stats), RenderMode::Virtualized);
    }
}
