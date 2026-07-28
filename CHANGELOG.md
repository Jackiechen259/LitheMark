# Changelog

All notable changes to LitheMark are documented in this file.

## 0.1.1 - 2026-07-28

### Added

- Signed automatic update checks on launch, an explicit install-and-restart prompt, a manual
  check, and a switch that disables update checking entirely.
- A split Markdown source editor and sanitized adaptive preview.
- Syntax highlighting, folding, completion, multi-cursor editing, find/replace, and a command
  palette.
- Versioned Rope-backed drafts, explicit save, unsaved tab protection, atomic writes, and
  three-way handling for files changed outside LitheMark.

### Fixed

- The window refused to close. Every close request routes through the unsaved-work guard, and
  the main capability granted neither `core:window:allow-close` nor `core:window:allow-destroy`,
  so both of the guard's exit paths were denied.

### Changed

- The outline panel scales with the window instead of holding a fixed width, its virtual and
  plain rows share one height and indent scale, and heading depth is now legible through weight,
  colour, and an indent rail.

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
