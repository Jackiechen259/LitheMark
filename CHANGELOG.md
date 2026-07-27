# Changelog

## Unreleased

- Added a split Markdown source editor and sanitized adaptive preview.
- Added syntax highlighting, folding, completion, multi-cursor editing, find/replace, and a
  command palette.
- Added versioned Rope-backed drafts, explicit save, unsaved tab protection, atomic writes, and
  three-way handling for files changed outside LitheMark.

All notable changes to LitheMark are documented in this file.

## 0.1.0 - 2026-07-26

### Added

- Native multi-document tabs, recent files, persisted window state, and light/dark themes.
- Safe CommonMark/GFM rendering with a block-based document model and generated outline.
- Full, virtualized, and huge document modes with cancellable background indexing.
- Bounded block and local-image caches.
- Case-sensitive and whole-word document search with keyboard navigation.
- Strictly scoped PNG, JPEG, GIF, and WebP loading from a document's directory.
- External file change detection with reload and deleted-file snapshot handling.
- Keyboard-accessible tabs, search, skip navigation, live status, reduced-motion support,
  and forced-color support.
- Deterministic 1–100 MiB fixture generation and repeatable Release benchmarks.

### Security

- Allowlist-based HTML sanitation and an explicit Content Security Policy.
- Remote images, SVG images, unsafe URL schemes, path traversal, symlink escape, and
  signature-spoofed image files are blocked.
