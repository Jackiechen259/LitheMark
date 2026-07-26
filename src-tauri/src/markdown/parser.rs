use std::ops::Range;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag};
use tokio_util::sync::CancellationToken;

use super::block::{DocumentStats, IndexedBlock, RawBlock};
use super::heading::Slugger;
use super::{render_safe_markdown, with_heading_id};
use crate::errors::AppError;
use crate::types::{BlockKind, HeadingDto, MarkdownBlockDto};

const MAX_MERGED_PARAGRAPH_BYTES: usize = 32 * 1024;
const INITIAL_INDEX_SCAN_BYTES: usize = 512 * 1024;

pub struct ParsedMarkdown {
    pub blocks: Vec<MarkdownBlockDto>,
    pub headings: Vec<HeadingDto>,
}

pub struct IndexedMarkdown {
    pub blocks: Vec<IndexedBlock>,
    pub headings: Vec<HeadingDto>,
    pub stats: DocumentStats,
    pub complete: bool,
}

struct ActiveBlock {
    block: RawBlock,
    depth: usize,
}

#[must_use]
pub fn parse_markdown_blocks(source: &str) -> ParsedMarkdown {
    match parse_markdown_index(source, None, None) {
        Ok(index) => ParsedMarkdown {
            blocks: render_indexed_blocks(source, &index.blocks),
            headings: index.headings,
        },
        Err(_) => ParsedMarkdown {
            blocks: Vec::new(),
            headings: Vec::new(),
        },
    }
}

pub fn parse_markdown_index(
    source: &str,
    limit: Option<usize>,
    cancellation: Option<&CancellationToken>,
) -> Result<IndexedMarkdown, AppError> {
    let scan_end = if limit.is_some() && source.len() > INITIAL_INDEX_SCAN_BYTES {
        floor_char_boundary(source, INITIAL_INDEX_SCAN_BYTES)
    } else {
        source.len()
    };
    let scan_source = &source[..scan_end];
    let (raw_blocks, parser_complete) = collect_raw_blocks(scan_source, limit, cancellation)?;
    let raw_blocks = merge_adjacent_paragraphs(source, raw_blocks);
    Ok(index_blocks(
        source,
        raw_blocks,
        parser_complete && scan_end == source.len(),
    ))
}

fn floor_char_boundary(source: &str, index: usize) -> usize {
    let mut boundary = index.min(source.len());
    while boundary > 0 && !source.is_char_boundary(boundary) {
        boundary -= 1;
    }
    boundary
}

#[must_use]
pub fn render_indexed_blocks(source: &str, blocks: &[IndexedBlock]) -> Vec<MarkdownBlockDto> {
    blocks
        .iter()
        .map(|block| {
            let block_source = &source[block.source_start..block.source_end];
            let mut html = render_safe_markdown(block_source);
            if let Some(heading) = &block.heading {
                html = with_heading_id(html, heading.level, &heading.slug);
            }
            MarkdownBlockDto {
                id: block.id,
                kind: block.kind,
                source_start: block.source_start,
                source_end: block.source_end,
                estimated_height: block.estimated_height,
                html: Some(html),
                plain_text: block.plain_text.clone(),
            }
        })
        .collect()
}

fn collect_raw_blocks(
    source: &str,
    limit: Option<usize>,
    cancellation: Option<&CancellationToken>,
) -> Result<(Vec<RawBlock>, bool), AppError> {
    let mut blocks = Vec::new();
    let mut active: Option<ActiveBlock> = None;
    let mut complete = true;

    for (event_index, (event, range)) in Parser::new_ext(source, markdown_options())
        .into_offset_iter()
        .enumerate()
    {
        if event_index % 1_024 == 0 && cancellation.is_some_and(CancellationToken::is_cancelled) {
            return Err(AppError::SearchCancelled);
        }

        if let Some(current) = active.as_mut() {
            current.block.source_end = current.block.source_end.max(range.end);
            collect_plain_text(&mut current.block.plain_text, &event);
            match event {
                Event::Start(_) => current.depth += 1,
                Event::End(_) => {
                    current.depth = current.depth.saturating_sub(1);
                    if current.depth == 0
                        && let Some(completed) = active.take()
                    {
                        blocks.push(completed.block);
                        if limit.is_some_and(|value| blocks.len() >= value) {
                            complete = false;
                            break;
                        }
                    }
                }
                _ => {}
            }
            continue;
        }

        match event {
            Event::Start(tag) => {
                if let Some((kind, heading_level)) = block_kind(&tag) {
                    active = Some(ActiveBlock {
                        block: RawBlock {
                            kind,
                            source_start: range.start,
                            source_end: range.end,
                            heading_level,
                            plain_text: String::new(),
                        },
                        depth: 1,
                    });
                }
            }
            Event::Rule => blocks.push(single_event_block(BlockKind::Rule, range)),
            Event::DisplayMath(text) => {
                let mut block = single_event_block(BlockKind::Paragraph, range);
                block.plain_text = text.into_string();
                blocks.push(block);
            }
            Event::Html(text) | Event::InlineHtml(text) => {
                let mut block = single_event_block(BlockKind::HtmlBlock, range);
                block.plain_text = text.into_string();
                blocks.push(block);
            }
            _ => {}
        }

        if limit.is_some_and(|value| blocks.len() >= value) {
            complete = false;
            break;
        }
    }

    if let Some(unclosed) = active {
        blocks.push(unclosed.block);
    }
    Ok((blocks, complete))
}

fn single_event_block(kind: BlockKind, range: Range<usize>) -> RawBlock {
    RawBlock {
        kind,
        source_start: range.start,
        source_end: range.end,
        heading_level: None,
        plain_text: String::new(),
    }
}

fn block_kind(tag: &Tag<'_>) -> Option<(BlockKind, Option<u8>)> {
    match tag {
        Tag::Paragraph => Some((BlockKind::Paragraph, None)),
        Tag::Heading { level, .. } => {
            Some((BlockKind::Heading, Some(heading_level_number(*level))))
        }
        Tag::BlockQuote(_) => Some((BlockKind::BlockQuote, None)),
        Tag::CodeBlock(_) => Some((BlockKind::CodeBlock, None)),
        Tag::HtmlBlock => Some((BlockKind::HtmlBlock, None)),
        Tag::List(_) => Some((BlockKind::List, None)),
        Tag::FootnoteDefinition(_) => Some((BlockKind::FootnoteDefinition, None)),
        Tag::DefinitionList => Some((BlockKind::DefinitionList, None)),
        Tag::Table(_) => Some((BlockKind::Table, None)),
        Tag::Item
        | Tag::DefinitionListTitle
        | Tag::DefinitionListDefinition
        | Tag::TableHead
        | Tag::TableRow
        | Tag::TableCell
        | Tag::Emphasis
        | Tag::Strong
        | Tag::Strikethrough
        | Tag::Superscript
        | Tag::Subscript
        | Tag::Link { .. }
        | Tag::Image { .. }
        | Tag::MetadataBlock(_) => None,
    }
}

fn heading_level_number(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn collect_plain_text(output: &mut String, event: &Event<'_>) {
    match event {
        Event::Text(text) | Event::Code(text) => output.push_str(text),
        Event::SoftBreak | Event::HardBreak => output.push(' '),
        _ => {}
    }
}

fn merge_adjacent_paragraphs(source: &str, blocks: Vec<RawBlock>) -> Vec<RawBlock> {
    let mut merged: Vec<RawBlock> = Vec::with_capacity(blocks.len());
    for block in blocks {
        let can_merge = merged.last().is_some_and(|previous| {
            previous.kind == BlockKind::Paragraph
                && block.kind == BlockKind::Paragraph
                && block.source_end.saturating_sub(previous.source_start)
                    <= MAX_MERGED_PARAGRAPH_BYTES
                && source[previous.source_end..block.source_start]
                    .chars()
                    .all(char::is_whitespace)
        });

        if can_merge {
            if let Some(previous) = merged.last_mut() {
                previous.source_end = block.source_end;
                if !previous.plain_text.is_empty() && !block.plain_text.is_empty() {
                    previous.plain_text.push(' ');
                }
                previous.plain_text.push_str(&block.plain_text);
            }
        } else {
            merged.push(block);
        }
    }
    merged
}

fn index_blocks(source: &str, raw_blocks: Vec<RawBlock>, complete: bool) -> IndexedMarkdown {
    let mut blocks = Vec::with_capacity(raw_blocks.len());
    let mut headings = Vec::new();
    let mut slugger = Slugger::default();
    let mut stats = DocumentStats::default();

    for (index, raw) in raw_blocks.into_iter().enumerate() {
        let id = u64::try_from(index).unwrap_or(u64::MAX);
        let heading = raw.heading_level.map(|level| {
            let text = raw.plain_text.trim().to_owned();
            HeadingDto {
                block_id: id,
                level,
                slug: slugger.slug(&text),
                text,
            }
        });
        if let Some(heading) = &heading {
            headings.push(heading.clone());
        }

        let byte_length = raw.source_end.saturating_sub(raw.source_start);
        match raw.kind {
            BlockKind::CodeBlock => {
                stats.max_code_block_bytes = stats.max_code_block_bytes.max(byte_length);
            }
            BlockKind::Table => {
                stats.max_table_rows = stats
                    .max_table_rows
                    .max(source[raw.source_start..raw.source_end].lines().count());
            }
            BlockKind::HtmlBlock => stats.html_block_count += 1,
            _ => {}
        }
        stats.estimated_dom_nodes = stats
            .estimated_dom_nodes
            .saturating_add(raw.plain_text.split_whitespace().count().max(1));

        blocks.push(IndexedBlock {
            id,
            kind: raw.kind,
            source_start: raw.source_start,
            source_end: raw.source_end,
            estimated_height: raw.estimated_height(source),
            plain_text: if matches!(raw.kind, BlockKind::CodeBlock | BlockKind::Heading) {
                Some(raw.plain_text)
            } else {
                None
            },
            heading,
        });
    }
    stats.block_count = blocks.len();

    IndexedMarkdown {
        blocks,
        headings,
        stats,
        complete,
    }
}

fn markdown_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);
    options.insert(Options::ENABLE_DEFINITION_LIST);
    options
}

#[cfg(test)]
mod tests {
    use super::{parse_markdown_blocks, parse_markdown_index};
    use crate::types::BlockKind;

    #[test]
    fn keeps_nested_lists_code_blocks_and_tables_intact() {
        let source = "- parent\n  - child\n\n```rust\nfn main() {}\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n";
        let parsed = parse_markdown_blocks(source);

        assert_eq!(parsed.blocks.len(), 3);
        assert_eq!(parsed.blocks[0].kind, BlockKind::List);
        assert_eq!(parsed.blocks[1].kind, BlockKind::CodeBlock);
        assert_eq!(parsed.blocks[2].kind, BlockKind::Table);
        for block in &parsed.blocks {
            assert_eq!(
                source[block.source_start..block.source_end].trim_end(),
                match block.kind {
                    BlockKind::List => "- parent\n  - child",
                    BlockKind::CodeBlock => "```rust\nfn main() {}\n```",
                    BlockKind::Table => "| A | B |\n| - | - |\n| 1 | 2 |",
                    _ => "",
                }
            );
        }
    }

    #[test]
    fn merges_adjacent_paragraphs_but_keeps_headings_separate() {
        let parsed = parse_markdown_blocks("first\n\nsecond\n\n## Heading\n\nthird");
        assert_eq!(parsed.blocks.len(), 3);
        assert_eq!(parsed.blocks[0].kind, BlockKind::Paragraph);
        assert_eq!(parsed.blocks[1].kind, BlockKind::Heading);
        assert_eq!(parsed.blocks[2].kind, BlockKind::Paragraph);
    }

    #[test]
    fn creates_unique_heading_slugs_and_matching_html_ids() {
        let parsed = parse_markdown_blocks("# Same\n\n## Same\n\n# 中文 标题");
        let slugs: Vec<&str> = parsed
            .headings
            .iter()
            .map(|heading| heading.slug.as_str())
            .collect();
        assert_eq!(slugs, ["same", "same-2", "中文-标题"]);
        assert!(
            parsed.blocks[1]
                .html
                .as_deref()
                .is_some_and(|html| html.contains("id=\"same-2\""))
        );
    }

    #[test]
    fn can_stop_after_initial_blocks_without_scanning_the_full_document() {
        let source = (0..1_000)
            .map(|index| format!("## Heading {index}\n\nParagraph {index}\n\n---\n\n"))
            .collect::<String>();
        let index = parse_markdown_index(&source, Some(25), None);
        assert!(index.is_ok());
        if let Ok(index) = index {
            assert!(!index.complete);
            assert!(index.blocks.len() <= 25);
        }
    }

    #[test]
    fn initial_index_prefix_ends_on_a_utf8_boundary() {
        let source = format!("{}\n\n# Later", "界".repeat(200_000));
        let index = parse_markdown_index(&source, Some(25), None);

        assert!(index.is_ok());
        if let Ok(index) = index {
            assert!(!index.complete);
            assert_eq!(index.blocks.len(), 1);
            assert!(source.is_char_boundary(index.blocks[0].source_end));
        }
    }
}
