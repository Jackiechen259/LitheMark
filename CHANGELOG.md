# Changelog

All notable changes to LitheMark are documented in this file.

## Unreleased

## 0.1.3 - 2026-08-15

### Added

- Windows Explorer integration: opening a `.md` or `.markdown` file from Explorer opens it in
  LitheMark. When LitheMark is already running, the second launch forwards the files to the
  existing window and brings it to the front instead of starting a duplicate process; on a cold
  start the files are queued before the window exists, so no activation is ever lost to the
  listener race.
- An "Open with LitheMark" entry on the context menu of every Markdown file, registered by the
  installer and removed on uninstall. It never overrides the user's chosen default application.
- A Windows Integration settings section with an "Open Windows Default Apps" button, so
  LitheMark can be made the default handler for Markdown files.
- A launch that arrives with Explorer-opened files activates the tab already showing each file
  instead of reopening it, and skips restoring the previous session's tabs so the files the user
  asked for win.

## 0.1.2 - 2026-08-10

### Added

- LitheMark's own context menu, with commands scoped to the surface under the pointer: tabs,
  the rendered document and its links, the source editor, the outline, text fields, and the
  application itself. It is keyboard reachable, clamped to the window, and dismissed by
  `Escape`, scrolling, or a click elsewhere.

### Changed

- The webview's built-in context menu no longer appears anywhere in the application.
- The window, taskbar, installer, and webview icons are now LitheMark's own mark, an `M` whose
  right leg resolves into a downward arrow, drawn in the application's accent gradient. Every
  size is generated from [`app-icon.svg`](app-icon.svg), which replaces the default Tauri logo.
- Tagged releases are now published automatically by the `Release` workflow instead of being
  opened as drafts, so installed copies can update as soon as the tag is pushed.

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
