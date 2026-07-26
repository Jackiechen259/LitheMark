import type { AppErrorDto } from "../features/documents/document-types";

const fallbackError: AppErrorDto = {
  code: "internal",
  message: "LitheMark encountered an unexpected error. Please try again.",
  recoverable: true,
};

export function normalizeAppError(error: unknown): AppErrorDto {
  if (isAppError(error)) return error;

  if (typeof error === "string") {
    try {
      const parsed: unknown = JSON.parse(error);
      if (isAppError(parsed)) return parsed;
    } catch {
      return { ...fallbackError, message: error };
    }
  }

  if (error instanceof Error && error.message) {
    return { ...fallbackError, message: error.message };
  }

  return fallbackError;
}

function isAppError(value: unknown): value is AppErrorDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppErrorDto>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.recoverable === "boolean"
  );
}
