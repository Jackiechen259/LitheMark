import { readFileSync } from "node:fs";

const version = process.argv[2];

if (!version) {
  throw new Error("Usage: node scripts/release-notes.ts <version>");
}

const changelog = readFileSync("CHANGELOG.md", "utf8");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const start = changelog.search(new RegExp("^## " + escaped + " -.*$", "m"));

if (start < 0) {
  throw new Error(`CHANGELOG.md has no ${version} release entry.`);
}

const rest = changelog.slice(start);
const nextHeading = rest.slice(1).search(/^## /m);
const section = (nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1)).trim();

process.stdout.write(`${section}\n`);
