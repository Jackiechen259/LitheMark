# Release checklist

## Version and source

- Confirm `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` use the same
  version.
- Update `CHANGELOG.md`.
- Confirm `AGENT_PLAN_LitheMark.md`, generated fixtures, `dist`, and `src-tauri/target` remain
  ignored.
- Confirm the working tree contains only intended source and documentation changes.

## Quality gates

```shell
pnpm install --frozen-lockfile
pnpm validate
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features
```

Regenerate the ignored 1, 10, and 50 MiB fixtures and compare the Release benchmark against
`benchmarks/latest.json`. Investigate material regressions in initial indexing or first-batch
rendering before release.

## Manual smoke test

- Open one small and one 50 MiB Markdown document.
- Confirm tabs, outline navigation, search, local images, external links, and theme switching.
- Modify and delete a copy of an open document; confirm reload and snapshot messaging.
- Restart at a non-default size and position; confirm window state restoration.
- Test at 100%, 150%, and 200% display scaling.
- Navigate tabs and search without a mouse and inspect focus visibility.

## Update signing (one time)

The updater only accepts archives signed with the key whose public half is in
`src-tauri/tauri.conf.json`.

```shell
pnpm tauri signer generate -w "$HOME/.tauri/lithemark.key"
```

- Commit the printed public key as `plugins.updater.pubkey`.
- Store the private key as the `TAURI_SIGNING_PRIVATE_KEY` repository secret and its password
  as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Back up the private key offline. Losing it means shipped versions can no longer update
  themselves; every user has to reinstall manually.
- `pnpm release:check` fails while the public key is missing.

## Windows bundle

```shell
pnpm desktop:bundle:windows
```

The validated 0.1.0 development-host outputs were:

- `src-tauri/target/release/lithemark.exe` — 13.12 MiB
- `src-tauri/target/release/bundle/nsis/LitheMark_0.1.0_x64-setup.exe` — 2.86 MiB

Generate and publish SHA-256 checksums from the final clean source revision. Install, launch,
and uninstall the NSIS bundle on a clean Windows VM before attaching it to a release.

The WiX MSI linker failed on the development host, while the application binary and NSIS
bundle succeeded. `pnpm desktop:build` intentionally builds the portable application without
bundling; use the explicit Windows bundle command above for the validated installer. Treat
MSI as unvalidated until it passes on a clean release runner.

## Publication

Tag the reviewed commit as `v<version>` and push the tag. The `Release` workflow
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) then reruns the quality
gates, confirms the tag matches `package.json`, builds and signs the Windows NSIS bundle and
portable executable, and opens a **draft** release with SHA-256 checksums, `latest.json`, and
the matching changelog section. Under Tauri v2 the NSIS installer doubles as the updater
artifact; the build emits a detached `<installer>.sig` whose contents are embedded in
`latest.json`, so there is no separate `.nsis.zip`.

```shell
git tag v<version>
git push origin v<version>
```

Rerun a build for an existing tag from the Actions tab with the `Release` workflow's manual
trigger.

Before publishing the draft:

- Install, launch, and uninstall the NSIS bundle on a clean Windows VM.
- Confirm the attached checksums match the downloaded assets.
- Confirm `latest.json` carries the new version and a `windows-x86_64` URL that points at this
  tag's `-setup.exe`.
- Clearly mark unsigned development builds; production releases should use platform signing.

Publishing the draft is what ships the update: installed copies read
`releases/latest/download/latest.json`, which resolves only for a published, non-prerelease
release. After publishing, verify the rollout from an older installed build — it should offer
the new version, install it, and restart. A release published without its `-setup.exe` and
`latest.json` assets leaves every installed copy unable to update.
