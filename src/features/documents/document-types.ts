export type Theme = "light" | "dark";
export type TabStatus = "opening" | "ready" | "reloading" | "error";

export interface DocumentMetadata {
  id: string;
  name: string;
  displayPath: string;
  byteSize: number;
  modifiedAtMs: number;
  encoding: string;
  lineCount: number;
  mode: "full";
  blockCount?: number;
  revision: number;
}

export type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "block_quote"
  | "code_block"
  | "table"
  | "rule"
  | "html_block"
  | "footnote_definition"
  | "definition_list";

export interface MarkdownBlock {
  id: number;
  kind: BlockKind;
  sourceStart: number;
  sourceEnd: number;
  estimatedHeight: number;
  html?: string;
  plainText?: string;
}

export interface Heading {
  blockId: number;
  level: number;
  text: string;
  slug: string;
}

export interface OpenDocumentResult {
  document: DocumentMetadata;
  initialBlocks: MarkdownBlock[];
  headings: Heading[];
  indexComplete: boolean;
  reused: boolean;
}

export interface BlockBatch {
  documentId: string;
  revision: number;
  start: number;
  total: number;
  blocks: MarkdownBlock[];
}

export interface DocumentTab {
  documentId: string;
  metadata: DocumentMetadata;
  blocks: MarkdownBlock[];
  headings: Heading[];
  indexComplete: boolean;
  status: TabStatus;
  scrollTop: number;
  outlineExpanded: boolean;
}

export interface RecentFile {
  path: string;
  name: string;
  lastOpenedMs: number;
}

export interface AppPreferences {
  theme: Theme;
  recentFiles: RecentFile[];
}

export interface AppErrorDto {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}
