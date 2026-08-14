//! Windows Explorer file activation.
//!
//! Windows hands LitheMark command lines like
//! `"C:\...\lithemark.exe" "D:\Notes\hello world.md"` when the user opens a
//! Markdown file from Explorer. This module owns everything Rust does with
//! those arguments: it filters out the executable itself, flags, URLs and
//! non-Markdown arguments, resolves relative paths against the working
//! directory, and keeps the pending queue that bridges cold starts (the
//! webview has not registered its listener yet) and warm activations (the
//! running instance receives a `external-open-files` event).
//!
//! Rust never opens the document itself; it only collects validated paths and
//! hands them to the frontend, which goes through the existing `loadDocument`
//! path.

use std::path::{Path, PathBuf};

use parking_lot::Mutex;

/// Extensions (without the dot) that count as Markdown, matched
/// case-insensitively.
pub const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];

/// Returns `true` when `path` ends in `.md` or `.markdown`
/// (case-insensitive).
#[must_use]
pub fn is_supported_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            MARKDOWN_EXTENSIONS
                .iter()
                .any(|candidate| ext.eq_ignore_ascii_case(candidate))
        })
}

/// Turns one raw command-line argument into an absolute Markdown file path.
///
/// Returns `None` for empty arguments, anything that looks like a URL
/// (`file://`, `https://`, ...), non-Markdown extensions, directories and
/// paths that do not exist. Relative paths are resolved against `cwd`, which
/// on Windows is the directory Explorer launched the process from.
#[must_use]
pub fn normalize_activation_path(raw: &str, cwd: &Path) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains("://") {
        return None;
    }

    let path = PathBuf::from(trimmed);
    let absolute = if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    };

    if !is_supported_markdown(&absolute) || !absolute.is_file() {
        return None;
    }
    Some(absolute)
}

/// Extracts the Markdown files from a raw argument list, preserving order and
/// dropping duplicates. The executable itself, flags, URLs and anything that
/// is not an existing Markdown file are skipped.
#[must_use]
pub fn parse_activation_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    let mut paths = Vec::new();
    for arg in args {
        if let Some(path) = normalize_activation_path(arg, cwd)
            && seen.insert(dedup_key(&path))
        {
            paths.push(path);
        }
    }
    paths
}

/// The dedup identity of a path. Windows paths compare case-insensitively, so
/// `C:\Notes\A.md` and `c:\notes\a.MD` must collapse into one entry.
fn dedup_key(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(windows)]
    {
        value.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        value.into_owned()
    }
}

/// The Rust-side queue of Explorer activations.
///
/// `take_pending_open_paths` drains it once the frontend listener is live;
/// later activations are delivered as `external-open-files` events. Keeping a
/// copy in the queue for every activation means a warm activation that fires
/// while the webview is still starting cannot be lost: whichever of the pull
/// or the event reaches the frontend first carries the paths, and the
/// frontend deduplicates the overlap.
#[derive(Default)]
pub struct PendingOpenFiles {
    paths: Mutex<Vec<PathBuf>>,
}

impl PendingOpenFiles {
    /// Appends validated paths, skipping any that are already queued.
    pub fn queue_paths(&self, paths: Vec<PathBuf>) {
        let mut pending = self.paths.lock();
        for path in paths {
            let key = dedup_key(&path);
            if !pending.iter().any(|existing| dedup_key(existing) == key) {
                pending.push(path);
            }
        }
    }

    /// Removes and returns every queued path, in arrival order.
    pub fn take_pending_paths(&self) -> Vec<PathBuf> {
        let mut pending = self.paths.lock();
        std::mem::take(&mut *pending)
    }

    #[cfg(test)]
    fn is_empty(&self) -> bool {
        self.paths.lock().is_empty()
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use tempfile::tempdir;

    use super::{
        PendingOpenFiles, is_supported_markdown, normalize_activation_path, parse_activation_args,
    };

    fn write_markdown(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, "# Test").expect("test file should be writable");
        path
    }

    fn arg(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn accepts_markdown_extensions_case_insensitively() {
        for name in ["a.md", "a.MD", "a.markdown", "a.MARKDOWN"] {
            assert!(is_supported_markdown(Path::new(name)), "{name}");
        }
        for name in ["a.txt", "a.exe", "a", "a.md.txt", "a."] {
            assert!(!is_supported_markdown(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn accepts_absolute_paths_and_preserves_order() {
        let dir = tempdir().unwrap();
        let a = write_markdown(dir.path(), "a.md");
        let b = write_markdown(dir.path(), "b.markdown");
        let c = write_markdown(dir.path(), "c.MD");

        let args = [arg(&a), "--help".to_owned(), arg(&b), arg(&c)];
        assert_eq!(
            parse_activation_args(&args, Path::new("C:\\unused")),
            vec![a, b, c]
        );
    }

    #[test]
    fn resolves_relative_paths_against_the_working_directory() {
        let dir = tempdir().unwrap();
        write_markdown(dir.path(), "relative.md");

        let paths = parse_activation_args(&["relative.md".to_owned()], dir.path());
        assert_eq!(paths, vec![dir.path().join("relative.md")]);
    }

    #[test]
    fn resolves_parent_relative_paths() {
        let dir = tempdir().unwrap();
        let notes = dir.path().join("notes");
        fs::create_dir(&notes).expect("notes directory should be creatable");
        write_markdown(&notes, "a.md");
        let cwd = dir.path().join("sub");

        let paths = parse_activation_args(&["../notes/a.md".to_owned()], &cwd);
        assert_eq!(paths.len(), 1);
        assert!(paths[0].is_file());
    }

    #[test]
    fn accepts_paths_with_spaces_and_unicode() {
        let dir = tempdir().unwrap();
        let spaced = write_markdown(dir.path(), "my notes.md");
        let unicode = write_markdown(dir.path(), "项目记录 01.md");

        let args = [arg(&spaced), arg(&unicode)];
        assert_eq!(
            parse_activation_args(&args, dir.path()),
            vec![spaced, unicode]
        );
    }

    #[test]
    fn rejects_flags_urls_other_types_and_missing_paths() {
        let dir = tempdir().unwrap();
        let real = write_markdown(dir.path(), "real.md");

        let args = [
            "notes.txt".to_owned(),
            "lithemark.exe".to_owned(),
            "--help".to_owned(),
            "https://example.com/a.md".to_owned(),
            "file:///C:/notes/a.md".to_owned(),
            "missing.md".to_owned(),
            arg(dir.path()),
        ];
        assert!(parse_activation_args(&args, dir.path()).is_empty());

        // Rejections never swallow the valid file next to them.
        let mixed = [arg(&real), "notes.txt".to_owned()];
        assert_eq!(parse_activation_args(&mixed, dir.path()), vec![real]);
    }

    #[test]
    fn rejects_arguments_that_are_not_paths() {
        let dir = tempdir().unwrap();
        assert!(normalize_activation_path("", dir.path()).is_none());
        assert!(normalize_activation_path("   ", dir.path()).is_none());
        assert!(normalize_activation_path("--help", dir.path()).is_none());
        assert!(normalize_activation_path("https://example.com/a.md", dir.path()).is_none());
        assert!(normalize_activation_path("file:///C:/notes/a.md", dir.path()).is_none());
        assert!(normalize_activation_path("ftp://host/a.md", dir.path()).is_none());
    }

    #[test]
    fn deduplicates_repeated_paths() {
        let dir = tempdir().unwrap();
        let file = write_markdown(dir.path(), "a.md");

        let args = [arg(&file), arg(&file), arg(&file)];
        assert_eq!(parse_activation_args(&args, dir.path()), vec![file]);
    }

    #[test]
    fn deduplicates_case_variants_of_the_same_file() {
        let dir = tempdir().unwrap();
        let file = write_markdown(dir.path(), "a.md");

        // On a case-insensitive file system (Windows) both spellings resolve to
        // the same file; on a case-sensitive one the variant simply does not
        // exist and is filtered out. Either way exactly one entry survives.
        let args = [arg(&file), arg(&dir.path().join("A.MD"))];
        let paths = parse_activation_args(&args, dir.path());
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], file);
    }

    #[test]
    fn pending_queue_deduplicates_and_drains_in_order() {
        let dir = tempdir().unwrap();
        let a = write_markdown(dir.path(), "a.md");
        let b = write_markdown(dir.path(), "b.md");
        let pending = PendingOpenFiles::default();

        pending.queue_paths(vec![a.clone(), a.clone(), b.clone()]);
        assert_eq!(pending.take_pending_paths(), vec![a.clone(), b]);
        assert!(pending.is_empty());
        assert_eq!(pending.take_pending_paths(), Vec::<PathBuf>::new());
    }

    #[cfg(windows)]
    #[test]
    fn pending_queue_ignores_case_variants_on_windows() {
        let dir = tempdir().unwrap();
        let a = write_markdown(dir.path(), "a.md");
        let pending = PendingOpenFiles::default();

        pending.queue_paths(vec![a.clone(), dir.path().join("A.MD")]);
        let taken = pending.take_pending_paths();
        assert_eq!(taken.len(), 1);
        assert_eq!(taken[0], a);
    }
}
