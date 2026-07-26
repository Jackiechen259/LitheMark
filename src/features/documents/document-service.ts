import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { BlockBatch, DocumentMetadata, Heading, OpenDocumentResult } from "./document-types";

export async function selectMarkdownFiles(): Promise<string[]> {
  const selected = await open({
    directory: false,
    multiple: true,
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown"],
      },
    ],
  });

  if (typeof selected === "string") return [selected];
  return Array.isArray(selected) ? selected : [];
}

export function openDocument(path: string): Promise<OpenDocumentResult> {
  return invoke<OpenDocumentResult>("open_document", { path });
}

export function closeDocument(documentId: string): Promise<void> {
  return invoke("close_document", { documentId });
}

export function reloadDocument(documentId: string): Promise<OpenDocumentResult> {
  return invoke<OpenDocumentResult>("reload_document", { documentId });
}

export function getDocumentMetadata(documentId: string): Promise<DocumentMetadata> {
  return invoke<DocumentMetadata>("get_document_metadata", { documentId });
}

export function getBlocks(
  documentId: string,
  start: number,
  count: number,
  revision: number,
): Promise<BlockBatch> {
  return invoke<BlockBatch>("get_blocks", { documentId, start, count, revision });
}

export function getHeadings(documentId: string, revision: number): Promise<Heading[]> {
  return invoke<Heading[]>("get_headings", { documentId, revision });
}

export function openExternalUrl(url: string): Promise<void> {
  return invoke("open_external_url", { url });
}
