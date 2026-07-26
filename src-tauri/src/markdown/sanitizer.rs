use std::collections::HashSet;
use std::path::{Component, Path};

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
        "img",
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
        .add_tag_attributes("img", ["alt", "src", "title"])
        .attribute_filter(|element, attribute, value| {
            if element == "img" && attribute == "src" && !is_safe_image_reference(value) {
                None
            } else {
                Some(value.into())
            }
        })
        .link_rel(Some("noopener noreferrer"));

    builder.clean(input).to_string()
}

fn is_safe_image_reference(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && !value.contains([':', '?', '#'])
        && !value.starts_with(['/', '\\'])
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
        && path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "png" | "jpg" | "jpeg" | "gif" | "webp"
                )
            })
}
