use std::collections::HashSet;

#[must_use]
pub fn sanitize_html(input: &str) -> String {
    let tags = HashSet::from([
        "a",
        "blockquote",
        "br",
        "code",
        "del",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "li",
        "ol",
        "p",
        "pre",
        "strong",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "ul",
    ]);
    let schemes = HashSet::from(["http", "https", "mailto"]);
    let mut builder = ammonia::Builder::default();

    builder
        .tags(tags)
        .url_schemes(schemes)
        .add_tag_attributes("a", ["href", "title"])
        .add_tag_attributes("code", ["class"])
        .link_rel(Some("noopener noreferrer"));

    builder.clean(input).to_string()
}
