use std::collections::HashMap;

#[derive(Default)]
pub struct Slugger {
    counts: HashMap<String, usize>,
}

impl Slugger {
    pub fn slug(&mut self, text: &str) -> String {
        let base = slug_base(text);
        let count = self.counts.entry(base.clone()).or_default();
        *count += 1;
        if *count == 1 {
            base
        } else {
            format!("{base}-{count}")
        }
    }
}

fn slug_base(text: &str) -> String {
    let mut slug = String::with_capacity(text.len());
    let mut separator_pending = false;

    for character in text.chars() {
        if character.is_alphanumeric() {
            if separator_pending && !slug.is_empty() {
                slug.push('-');
            }
            separator_pending = false;
            for lowercase in character.to_lowercase() {
                slug.push(lowercase);
            }
        } else if character.is_whitespace() || matches!(character, '-' | '_') {
            separator_pending = true;
        }
    }

    if slug.is_empty() {
        "section".to_owned()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::Slugger;

    #[test]
    fn creates_stable_unicode_slugs_and_deduplicates_them() {
        let mut slugger = Slugger::default();
        assert_eq!(slugger.slug("Hello, World!"), "hello-world");
        assert_eq!(slugger.slug("Hello World"), "hello-world-2");
        assert_eq!(slugger.slug("中文 标题"), "中文-标题");
        assert_eq!(slugger.slug("!!!"), "section");
    }
}
