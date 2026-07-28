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
  mode: "full" | "virtualized" | "huge";
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

export interface DocumentIndexReady {
  document: DocumentMetadata;
  headings: Heading[];
}

export interface HeadingJump {
  documentId: string;
  blockId: number;
  slug: string;
  nonce: number;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  limit: number;
}

export interface SearchMatch {
  blockId: number;
  lineNumber: number;
  preview: string;
  previewMatchStart: number;
  previewMatchEnd: number;
}

export interface SearchResult {
  documentId: string;
  revision: number;
  query: string;
  matches: SearchMatch[];
  truncated: boolean;
}

export interface LocalAsset {
  dataUrl: string;
  mimeType: string;
  byteSize: number;
}

export interface DocumentChange {
  documentId: string;
  changed: boolean;
  kind?: "modified" | "deleted";
  fingerprint: string;
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
  externalChange?: DocumentChange;
  ignoredChangeFingerprint?: string;
  editing?: boolean;
  dirty?: boolean;
  draftRevision?: number;
  editStatus?: "loading" | "ready" | "saving" | "conflict" | "error";
}

export interface RecentFile {
  path: string;
  name: string;
  lastOpenedMs: number;
}

export interface AppPreferences {
  theme: Theme;
  recentFiles: RecentFile[];
  updateChecksEnabled: boolean;
}

export interface AppErrorDto {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface EditSessionInfo {
  documentId: string;
  documentRevision: number;
  draftRevision: number;
  totalChars: number;
  lineCount: number;
  dirty: boolean;
}

export interface EditorChunk {
  documentId: string;
  draftRevision: number;
  startChar: number;
  nextChar: number;
  totalChars: number;
  text: string;
}

export interface TextPosition {
  line: number;
  utf16Column: number;
}

export interface TextEdit {
  from: TextPosition;
  to: TextPosition;
  insert: string;
}

export interface EditState {
  documentId: string;
  draftRevision: number;
  totalChars: number;
  lineCount: number;
  dirty: boolean;
}

export interface DraftPreview {
  documentId: string;
  draftRevision: number;
  startLine: number;
  endLine: number;
  blocks: MarkdownBlock[];
  headings: Heading[];
}

export interface SaveEditResult {
  document: OpenDocumentResult;
  edit: EditSessionInfo;
}

export interface MergeResult {
  documentId: string;
  draftRevision: number;
  content: string;
  hasConflicts: boolean;
  diskFingerprint: string;
}
