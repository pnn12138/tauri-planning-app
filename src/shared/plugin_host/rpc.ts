import type { RpcRequest, RpcResponse } from "./types";

export type RpcError = { code: string; message: string; details?: unknown };

export function createRpcClient(options: {
  postMessage: (message: RpcRequest) => void;
  timeoutMs: number;
}) {
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (err: RpcError) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  function request<T>(method: string, params: unknown): Promise<T> {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const promise = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject({ code: "PluginTimeout", message: `RPC timeout: ${method}` });
      }, options.timeoutMs);

      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject: (err) => reject(err),
        timeout,
      });
    });

    options.postMessage({ type: "rpc_request", id, method, params });

    return promise.catch((err) => {
      if (err && typeof err === "object" && "code" in (err as any)) {
        throw err;
      }
      throw { code: "Unknown", message: String(err) } satisfies RpcError;
    });
  }

  function handleMessage(message: RpcResponse) {
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(message.id);
    if (message.ok) {
      entry.resolve(message.data);
      return;
    }
    entry.reject(message.error ?? { code: "Unknown", message: "Unknown error" });
  }

  function failAll(code: string, message: string) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timeout);
      entry.reject({ code, message });
      pending.delete(id);
    }
  }

  return { request, handleMessage, failAll };
}
