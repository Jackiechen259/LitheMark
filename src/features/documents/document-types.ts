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
  revision: number;
}

export interface OpenDocumentResult {
  document: DocumentMetadata;
  html: string;
  reused: boolean;
}

export interface DocumentTab {
  documentId: string;
  metadata: DocumentMetadata;
  html: string;
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
