# LitheMark

LitheMark is a fast, lightweight, local-first Markdown reader and editor built with Tauri 2, Rust,
Svelte 5, TypeScript, and Vite.

It renders untrusted Markdown through a strict sanitizer and keeps
large documents responsive with cancellable background indexing and virtualized block
rendering.

## Features

- Open one or many `.md` and `.markdown` files in native tabs.
- Edit Markdown in a resizable source/preview workspace with syntax highlighting, folding,
  multi-cursor editing, completion, find/replace, and a command palette.
- Save atomically with unsaved-change protection and three-way conflict merging.
- Render headings, lists, tables, task lists, footnotes, code blocks, and safe inline HTML.
- Navigate a generated outline, including headings in virtualized documents.
- Search with case-sensitive and whole-word modes using `Ctrl/Cmd+F`.
- Preserve per-tab scroll positions and the native window position and size.
- Detect files changed or deleted on disk and offer a non-destructive reload.
- Load PNG, JPEG, GIF, and WebP images from within the document directory.
- Switch between light and dark themes.
- Open only `http`, `https`, and `mailto` links through the system handler.

## Large documents

Documents are assigned to full, virtualized, or huge rendering modes from centralized
thresholds. Large files synchronously index at most a 512 KiB prefix; the complete index is
built in a cancellable worker. HTML is generated only for requested block batches and both
document and outline DOM nodes are virtualized.

The deterministic benchmark and its latest results are in
[`benchmarks/latest.md`](benchmarks/latest.md). On the recorded Windows x64 run, a 50 MiB
fixture took 33.81 ms to read, 10.59 ms to build its initial index, and 1.46 ms to render the
first 48 blocks. Full background indexing took 1.83 s.

## Security model

- Markdown HTML is allowlisted and sanitized; scripts, handlers, dangerous URLs, frames,
  objects, and styles are removed.
- Remote images and SVG images are disabled.
- Local image references reject absolute paths, parent traversal, symlink escape, files over
  20 MiB, unsupported extensions, and mismatched file signatures.
- Local assets use bounded in-memory caching and data URLs rather than broad file-protocol
  permissions.
- The application CSP blocks objects, frames, base URL changes, remote scripts, and remote
  images.
- Files are written only after an explicit save. Saves verify the on-disk baseline before an
  atomic replacement; externally changed files enter a three-way merge flow instead of being
  overwritten.

See [`SECURITY.md`](SECURITY.md) for reporting instructions.

## Keyboard shortcuts

| Action                      | Shortcut                             |
| --------------------------- | ------------------------------------ |
| Open files                  | `Ctrl/Cmd+O`                         |
| Find in document            | `Ctrl/Cmd+F`                         |
| Save edited document        | `Ctrl/Cmd+S`                         |
| Open editor command palette | `Ctrl/Cmd+Shift+P`, `F1`             |
| Close active tab            | `Ctrl/Cmd+W`                         |
| Next/previous tab           | `Ctrl/Cmd+Tab`, `Ctrl/Cmd+Shift+Tab` |
| Move between focused tabs   | `Left`, `Right`, `Home`, `End`       |
| Close focused tab           | `Delete`                             |
| Next/previous search result | `Enter`, `Shift+Enter`               |
| Close search                | `Escape`                             |

## Development

Requirements:

- Node.js 24
- pnpm 11
- Stable Rust with `rustfmt` and `clippy`
- The [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

```shell
pnpm install
pnpm desktop:dev
```

Run the complete frontend quality gate:

```shell
pnpm validate
```

Run the Rust quality gate:

```shell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features
```

Regenerate ignored large-document fixtures and rerun the Release benchmark:

```shell
pnpm fixtures:large -- --sizes=1,10,50
cargo run --release --manifest-path src-tauri/Cargo.toml --example benchmark_open -- fixtures/generated/large-1mb.md fixtures/generated/large-10mb.md fixtures/generated/large-50mb.md
```

## Packaging

Build the optimized application without a platform installer:

```shell
pnpm desktop:build
```

On Windows, the validated release path is the NSIS bundle:

```shell
pnpm desktop:bundle:windows
```

See [`docs/release-checklist.md`](docs/release-checklist.md) for release verification.

## License

LitheMark is licensed under the GNU General Public License v3.0 or later. See
[`LICENSE`](LICENSE).
