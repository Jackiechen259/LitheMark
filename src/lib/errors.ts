import type { AppErrorDto } from "../features/documents/document-types";
import { t } from "../features/i18n/i18n.svelte";
import { en, type MessageKey } from "../features/i18n/messages/en";

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

/**
 * Localize a Rust error for display. The backend sends its own English `message` alongside a
 * stable `code`; when that message matches the table entry exactly, the error came from Rust
 * and we can swap in the active locale. JavaScript-thrown errors share the `internal` code but
 * carry their own message, which we preserve rather than overwrite with a generic string.
 */
export function localizeAppError(dto: AppErrorDto): string {
  const key = `errors.${dto.code}` as MessageKey;
  if (key in en && dto.message === en[key]) return t(key);
  return dto.message;
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
