import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const cargoManifest = readFileSync("src-tauri/Cargo.toml", "utf8");
const changelog = readFileSync("CHANGELOG.md", "utf8");
const cargoVersion = cargoManifest.match(/^version = "([^"]+)"$/m)?.[1];
const versions = new Map([
  ["package.json", packageJson.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", cargoVersion],
]);
const expected = packageJson.version;
const mismatches = [...versions].filter(([, version]) => version !== expected);

if (mismatches.length) {
  throw new Error(
    `Release version mismatch: ${[...versions]
      .map(([file, version]) => `${file}=${String(version)}`)
      .join(", ")}`,
  );
}
if (!changelog.includes(`## ${expected} -`)) {
  throw new Error(`CHANGELOG.md has no ${expected} release entry.`);
}
if (String(tauriConfig.identifier).endsWith(".app")) {
  throw new Error("The Tauri bundle identifier must not end with .app.");
}

const updater = tauriConfig.plugins?.updater;

if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
  throw new Error(
    "bundle.createUpdaterArtifacts must be true so releases can be updated in place.",
  );
}
if (!updater?.pubkey) {
  throw new Error(
    "plugins.updater.pubkey is empty. Generate a key pair with `pnpm tauri signer generate`, " +
      "commit the public key, and store the private key as the TAURI_SIGNING_PRIVATE_KEY secret.",
  );
}
if (!Array.isArray(updater.endpoints) || updater.endpoints.length === 0) {
  throw new Error("plugins.updater.endpoints must list at least one update manifest URL.");
}

console.log(`Release metadata is consistent for LitheMark ${expected}.`);
