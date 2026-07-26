export type Theme = "light" | "dark";
export type ViewStatus = "idle" | "loading" | "ready" | "error";

export interface RenderedDocument {
  name: string;
  displayPath: string;
  byteSize: number;
  modifiedAtMs: number;
  encoding: string;
  lineCount: number;
  html: string;
}

export interface AppErrorDto {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}
