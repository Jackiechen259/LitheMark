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

Update the three version files and the changelog, then commit and tag. The `Release`
workflow ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) runs
automatically for `v*` tag pushes; no manual "Publish release" step exists.

```shell
# Update versions
#   package.json
#   src-tauri/Cargo.toml
#   src-tauri/tauri.conf.json
# Update CHANGELOG.md

git add .
git commit -m "chore(release): 0.1.2"

git tag v0.1.2
git push origin main
git push origin v0.1.2
```

The workflow then automatically:

1. verifies the tag matches all three version files (fails immediately otherwise);
2. reruns every quality gate (frontend format/type/test/build, Rust fmt/clippy/test);
3. requires `TAURI_SIGNING_PRIVATE_KEY` (the key password is only needed when the key has
   one);
4. builds and signs the Windows NSIS bundle and the portable executable;
5. generates `latest.json`, the detached `.sig`, and `SHA256SUMS.txt` and validates each
   artifact, including that `latest.json` carries the tag version and the correct installer
   URL;
6. publishes the GitHub Release (never a draft) with the changelog section, checksums, and
   the signing note attached;
7. verifies GitHub reports the release as published and non-prerelease;
8. downloads `releases/latest/download/latest.json` end to end and confirms it points at the
   new installer.

Under Tauri v2 the NSIS installer doubles as the updater artifact; the build emits a detached
`<installer>.sig` whose contents are embedded in `latest.json`, so there is no separate
`.nsis.zip`.

### Rebuilding an existing tag

Rerun a build for an existing tag from the Actions tab with the `Release` workflow's manual
trigger. Manual runs default to build-only (`publish=false`); set `publish=true` to publish
as well. If a release for the tag already exists, the workflow fails rather than overwriting
it — delete the existing release first if a re-publish is truly intended.

### After publication

- Install, launch, and uninstall the NSIS bundle on a clean Windows VM.
- Confirm the attached checksums match the downloaded assets.
- Launch an older installed build: it should detect the new version, verify the updater
  signature, install, and restart onto the new version.

The updater artifact is cryptographically signed for Tauri update verification; the Windows
executable is not currently Authenticode code-signed. A release published without its
`-setup.exe` and `latest.json` assets leaves every installed copy unable to update.
