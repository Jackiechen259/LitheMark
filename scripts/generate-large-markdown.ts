import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { resolve } from "node:path";

const MEBIBYTE = 1024 * 1024;
const requestedSizes = process.argv
  .find((argument) => argument.startsWith("--sizes="))
  ?.slice("--sizes=".length)
  .split(",")
  .map(Number)
  .filter((size) => Number.isInteger(size) && size > 0);
const sizes = requestedSizes?.length ? requestedSizes : [1, 10, 50, 100];
const outputDirectory = resolve("fixtures/generated");

mkdirSync(outputDirectory, { recursive: true });

function sourceChunk() {
  let result = "";
  for (let index = 0; index < 256; index += 1) {
    result += `## Deterministic section ${index}

This paragraph exercises **strong text**, _emphasis_, [safe links](https://example.com/${index}), and inline \`code_${index}\`.

- item ${index}.1
- item ${index}.2
  - nested ${index}.2.1

| Key | Value | State |
| --- | ---: | :---: |
| row-${index} | ${index * 17} | ready |

\`\`\`ts
export const generated_${index} = ${index};
\`\`\`

`;
  }
  return Buffer.from(result, "utf8");
}

const chunk = sourceChunk();
const manifest = [];

for (const sizeMiB of sizes) {
  const targetBytes = sizeMiB * MEBIBYTE;
  const fileName = `large-${sizeMiB}mb.md`;
  const path = resolve(outputDirectory, fileName);
  const descriptor = openSync(path, "w");
  const hash = createHash("sha256");
  let written = 0;

  try {
    while (written < targetBytes) {
      const bytes = Math.min(chunk.length, targetBytes - written);
      const slice = chunk.subarray(0, bytes);
      writeSync(descriptor, slice);
      hash.update(slice);
      written += bytes;
    }
  } finally {
    closeSync(descriptor);
  }

  manifest.push({
    file: fileName,
    bytes: targetBytes,
    sha256: hash.digest("hex"),
  });
}

console.log(JSON.stringify({ outputDirectory, files: manifest }, null, 2));
