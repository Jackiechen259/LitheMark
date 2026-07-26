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

console.log(`Release metadata is consistent for LitheMark ${expected}.`);
