use std::ops::Range;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag};

use super::block::RawBlock;
use super::heading::Slugger;
use super::{render_safe_markdown, with_heading_id};
use crate::types::{BlockKind, HeadingDto, MarkdownBlockDto};

const MAX_MERGED_PARAGRAPH_BYTES: usize = 32 * 1024;

pub struct ParsedMarkdown {
    pub blocks: Vec<MarkdownBlockDto>,
    pub headings: Vec<HeadingDto>,
}

struct ActiveBlock {
    block: RawBlock,
    depth: usize,
}

#[must_use]
pub fn parse_markdown_blocks(source: &str) -> ParsedMarkdown {
    let raw_blocks = collect_raw_blocks(source);
    let raw_blocks = merge_adjacent_paragraphs(source, raw_blocks);
    render_blocks(source, raw_blocks)
}

fn collect_raw_blocks(source: &str) -> Vec<RawBlock> {
    let mut blocks = Vec::new();
    let mut active: Option<ActiveBlock> = None;

    for (event, range) in Parser::new_ext(source, markdown_options()).into_offset_iter() {
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
    }

    if let Some(unclosed) = active {
        blocks.push(unclosed.block);
    }
    blocks
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

fn render_blocks(source: &str, raw_blocks: Vec<RawBlock>) -> ParsedMarkdown {
    let mut blocks = Vec::with_capacity(raw_blocks.len());
    let mut headings = Vec::new();
    let mut slugger = Slugger::default();

    for (index, raw) in raw_blocks.into_iter().enumerate() {
        let id = u64::try_from(index).unwrap_or(u64::MAX);
        let block_source = &source[raw.source_start..raw.source_end];
        let mut html = render_safe_markdown(block_source);
        let plain_text = if matches!(raw.kind, BlockKind::CodeBlock | BlockKind::Heading) {
            Some(raw.plain_text.clone())
        } else {
            None
        };

        if let Some(level) = raw.heading_level {
            let text = raw.plain_text.trim().to_owned();
            let slug = slugger.slug(&text);
            html = with_heading_id(html, level, &slug);
            headings.push(HeadingDto {
                block_id: id,
                level,
                text,
                slug,
            });
        }

        blocks.push(MarkdownBlockDto {
            id,
            kind: raw.kind,
            source_start: raw.source_start,
            source_end: raw.source_end,
            estimated_height: raw.estimated_height(source),
            html: Some(html),
            plain_text,
        });
    }

    ParsedMarkdown { blocks, headings }
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
    use super::parse_markdown_blocks;
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
}
