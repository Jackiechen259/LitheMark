# LitheMark

A fast, lightweight, local-first Markdown reader built with Tauri 2, Rust, Svelte 5,
TypeScript, and Vite.

LitheMark is currently under active development. The first release is a read-only desktop
reader focused on startup speed, large-document stability, and safe rendering of untrusted
Markdown.

## Development

Requirements:

- Node.js 24
- pnpm 11
- Stable Rust with `rustfmt` and `clippy`
- The Tauri 2 platform prerequisites for your operating system

```shell
pnpm install
pnpm desktop:dev
```

## Validation

```shell
pnpm check
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

## License

LitheMark is licensed under the GNU General Public License v3.0 or later. See
[`LICENSE`](LICENSE).
