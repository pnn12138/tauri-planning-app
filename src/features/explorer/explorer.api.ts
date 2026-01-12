import { invoke } from "@tauri-apps/api/core";

export type BackendError = { code: string; message: string; details?: unknown };
export type BackendResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: BackendError };

export function isBackendError(value: unknown): value is BackendError {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.message === "string";
}

export function formatBackendError(error: unknown) {
  if (typeof error === "string") return `UnexpectedError: ${error}`;
  if (!error || typeof error !== "object") return "UnexpectedError: Unexpected error.";
  if (!isBackendError(error)) {
    try {
      return `UnexpectedError: ${JSON.stringify(error)}`;
    } catch {
      return "UnexpectedError: Unexpected error.";
    }
  }

  const details = error.details;
  const detailParts: string[] = [];
  if (details && typeof details === "object") {
    const detailRecord = details as Record<string, unknown>;
    if (typeof detailRecord.step === "string") detailParts.push(`step=${detailRecord.step}`);
    if (typeof detailRecord.path === "string") detailParts.push(`path=${detailRecord.path}`);
    if (typeof detailRecord.error === "string") detailParts.push(`error=${detailRecord.error}`);
  }
  const detailText = detailParts.length ? ` (${detailParts.join(", ")})` : "";
  return `${error.code}: ${error.message}${detailText}`;
}

export async function invokeBackend<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const response = await invoke<BackendResponse<T>>(command, args);
  if (response.ok) return response.data;
  throw response.error;
}
