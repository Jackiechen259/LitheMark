use pulldown_cmark::{Options, Parser, html};

use super::sanitizer::sanitize_html;

#[must_use]
pub fn render_safe_markdown(source: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(source, options);
    let mut rendered = String::with_capacity(source.len());
    html::push_html(&mut rendered, parser);
    sanitize_html(&rendered)
}

#[must_use]
pub fn with_heading_id(html: String, level: u8, slug: &str) -> String {
    let opening = format!("<h{level}>");
    let replacement = format!("<h{level} id=\"{slug}\">");
    html.replacen(&opening, &replacement, 1)
}

#[cfg(test)]
mod tests {
    use super::render_safe_markdown;

    #[test]
    fn renders_common_markdown_and_gfm_tables() {
        let html = render_safe_markdown(
            "# Heading\n\n- item\n\n```rust\nfn main() {}\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |",
        );

        assert!(html.contains("<h1>Heading</h1>"));
        assert!(html.contains("<li>item</li>"));
        assert!(html.contains("language-rust"));
        assert!(html.contains("<table>"));
    }

    #[test]
    fn removes_scripts_handlers_and_javascript_urls() {
        let html = render_safe_markdown(
            "<script>alert('x')</script>\n\n<a onclick=\"alert(1)\" href=\"javascript:alert(2)\">bad</a>",
        );

        assert!(!html.contains("<script"));
        assert!(!html.contains("onclick"));
        assert!(!html.contains("javascript:"));
        assert!(html.contains("bad"));
    }

    #[test]
    fn keeps_safe_relative_images_and_blocks_remote_or_traversing_sources() {
        let html = render_safe_markdown(
            "![local](images/diagram.png)\n\n![tracking](https://example.com/pixel.png)\n\n![escape](../secret.png)",
        );

        assert!(html.contains(r#"<img src="images/diagram.png" alt="local">"#));
        assert!(!html.contains("https://"));
        assert!(!html.contains("pixel.png"));
        assert!(!html.contains("../secret.png"));
    }
}
