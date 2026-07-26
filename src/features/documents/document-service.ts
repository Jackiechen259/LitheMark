import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { RenderedDocument } from "./document-types";

export async function selectMarkdownFile(): Promise<string | null> {
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown"],
      },
    ],
  });

  return typeof selected === "string" ? selected : null;
}

export function openDocument(path: string): Promise<RenderedDocument> {
  return invoke<RenderedDocument>("open_document", { path });
}

export function openExternalUrl(url: string): Promise<void> {
  return invoke("open_external_url", { url });
}
