import { pluginsSetEnabled, pluginsReadEntry, vaultReadText, vaultWriteText } from "../../features/plugins/plugins.api";
import { refreshPlugins } from "../../features/plugins/plugins.store";
import { registerCommand, unregisterCommandsByPlugin } from "../commands/commands.store";
import type { CommandContext } from "../commands/commands.model";
import { createRpcClient } from "./rpc";
import { hasPermission } from "./permissions";
import type { PluginManifest, RpcRequest, RpcResponse } from "./types";

type LoadedPlugin = {
  manifest: PluginManifest;
  worker: Worker;
  rpc: ReturnType<typeof createRpcClient>;
};

const PLUGIN_STARTUP_TIMEOUT_MS = 5000;
const PLUGIN_RPC_TIMEOUT_MS = 2000;

function workerSource() {
  return `
const pending = new Map();
function postResponse(id, ok, data, error) {
  self.postMessage({ type: "rpc_response", id, ok, data, error });
}
function postRequest(id, method, params) {
  self.postMessage({ type: "rpc_request", id, method, params });
}
function rpcRequest(method, params) {
  const id = Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    postRequest(id, method, params);
  });
}
function rpcResponse(message) {
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.ok) entry.resolve(message.data);
  else entry.reject(message.error || { code: "Unknown", message: "Unknown error" });
}

let manifest = null;
const commandHandlers = new Map();

const api = {
  registerCommand(def) {
    if (!def || typeof def !== "object") {
      throw { code: "BadRequest", message: "Invalid command definition" };
    }
    const id = String(def.id || "");
    const title = String(def.title || "");
    if (!id || !title || typeof def.handler !== "function") {
      throw { code: "BadRequest", message: "Command requires id/title/handler" };
    }
    commandHandlers.set(id, def.handler);
    return rpcRequest("host.registerCommand", { id, title });
  },
  vault: {
    readFile(path) {
      return rpcRequest("vault.readFile", { path });
    },
    writeFile(path, content) {
      return rpcRequest("vault.writeFile", { path, content });
    }
  }
};

async function handleHostRequest(method, params) {
  if (method === "plugin.init") {
    manifest = params && params.manifest ? params.manifest : null;
    const entryCode = params && typeof params.entryCode === "string" ? params.entryCode : "";
    if (!manifest || !manifest.id) {
      throw { code: "InvalidManifest", message: "Missing manifest" };
    }
    const fn = new Function("api", "manifest", entryCode);
    await fn(api, manifest);
    return true;
  }

  if (method === "command.execute") {
    const id = params && params.id ? String(params.id) : "";
    const ctx = params && params.ctx ? params.ctx : null;
    const handler = commandHandlers.get(id);
    if (!handler) {
      throw { code: "NotFound", message: "Command not found" };
    }
    return await handler(ctx);
  }

  throw { code: "NotFound", message: "Unknown method: " + method };
}

self.onmessage = async (event) => {
  const message = event && event.data ? event.data : null;
  if (!message || typeof message !== "object") return;

  if (message.type === "rpc_response") {
    rpcResponse(message);
    return;
  }

  if (message.type !== "rpc_request") return;

  const id = message.id;
  const method = message.method;
  const params = message.params;
  try {
    const data = await handleHostRequest(method, params);
    postResponse(id, true, data, null);
  } catch (error) {
    const err = error && typeof error === "object" ? error : { code: "Unknown", message: String(error) };
    postResponse(id, false, null, err);
  }
};
`;
}

export class PluginHost {
  private readonly loaded = new Map<string, LoadedPlugin>();

  async syncEnabledManifests(enabledManifests: PluginManifest[]) {
    const enabledIds = new Set(enabledManifests.map((m) => m.id));

    for (const pluginId of this.loaded.keys()) {
      if (!enabledIds.has(pluginId)) {
        this.unloadPlugin(pluginId);
      }
    }

    for (const manifest of enabledManifests) {
      if (this.loaded.has(manifest.id)) continue;
      await this.loadPlugin(manifest);
    }
  }

  unloadAll() {
    for (const pluginId of [...this.loaded.keys()]) {
      this.unloadPlugin(pluginId);
    }
  }

  private unloadPlugin(pluginId: string) {
    const loaded = this.loaded.get(pluginId);
    if (!loaded) return;
    unregisterCommandsByPlugin(pluginId);
    loaded.rpc.failAll("PluginCrashed", "Plugin unloaded");
    loaded.worker.terminate();
    this.loaded.delete(pluginId);
  }

  private async loadPlugin(manifest: PluginManifest) {
    const pluginId = manifest.id;

    const blob = new Blob([workerSource()], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);

    const rpc = createRpcClient({
      postMessage: (message) => worker.postMessage(message),
      timeoutMs: PLUGIN_RPC_TIMEOUT_MS,
    });

    const loaded: LoadedPlugin = { manifest, worker, rpc };
    this.loaded.set(pluginId, loaded);

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as RpcRequest | RpcResponse | undefined;
      if (!data || typeof data !== "object") return;

      if (data.type === "rpc_response") {
        rpc.handleMessage(data);
        return;
      }

      if (data.type === "rpc_request") {
        void this.handleWorkerRequest(loaded, data);
      }
    };

    worker.onerror = () => {
      void this.handlePluginCrashed(pluginId, "PluginCrashed");
    };
    worker.onmessageerror = () => {
      void this.handlePluginCrashed(pluginId, "PluginCrashed");
    };

    try {
      const entryCode = await pluginsReadEntry(pluginId, manifest.entry);
      await this.requestWithStartupTimeout(loaded, "plugin.init", { manifest, entryCode });
    } catch (error) {
      this.unloadPlugin(pluginId);
      await this.handlePluginCrashed(pluginId, "PluginCrashed");
      throw error;
    }
  }

  private async requestWithStartupTimeout(plugin: LoadedPlugin, method: string, params: unknown) {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject({ code: "PluginTimeout", message: "Plugin startup timed out" }), PLUGIN_STARTUP_TIMEOUT_MS);
    });
    return Promise.race([plugin.rpc.request(method, params), timeout]);
  }

  private async handleWorkerRequest(plugin: LoadedPlugin, request: RpcRequest) {
    try {
      const data = await this.dispatchHostMethod(plugin, request.method, request.params);
      plugin.worker.postMessage({ type: "rpc_response", id: request.id, ok: true, data } satisfies RpcResponse);
    } catch (error) {
      const raw = error as any;
      const err =
        raw && typeof raw === "object" && typeof raw.code === "string" && typeof raw.message === "string"
          ? raw
          : { code: "Unknown", message: String(error) };
      plugin.worker.postMessage({ type: "rpc_response", id: request.id, ok: false, error: err } satisfies RpcResponse);
    }
  }

  private async dispatchHostMethod(plugin: LoadedPlugin, method: string, params: unknown) {
    if (method === "host.registerCommand") {
      if (!hasPermission(plugin.manifest, "commands.register")) {
        throw { code: "PluginDenied", message: "Missing permission: commands.register" };
      }
      const { id, title } = (params as any) ?? {};
      const commandId = String(id || "");
      const commandTitle = String(title || "");
      if (!commandId || !commandTitle) {
        throw { code: "BadRequest", message: "Command requires id and title" };
      }
      const key = `${plugin.manifest.id}:${commandId}`;
      registerCommand({
        key,
        title: commandTitle,
        source: "plugin",
        pluginId: plugin.manifest.id,
        run: async (ctx: CommandContext) => {
          await plugin.rpc.request("command.execute", { id: commandId, ctx });
        },
      });
      return true;
    }

    if (method === "vault.readFile") {
      if (!hasPermission(plugin.manifest, "vault.read")) {
        throw { code: "PluginDenied", message: "Missing permission: vault.read" };
      }
      const path = String((params as any)?.path ?? "");
      if (!path) throw { code: "BadRequest", message: "path is required" };
      const result = await vaultReadText(path);
      return result.content;
    }

    if (method === "vault.writeFile") {
      if (!hasPermission(plugin.manifest, "vault.write")) {
        throw { code: "PluginDenied", message: "Missing permission: vault.write" };
      }
      const path = String((params as any)?.path ?? "");
      const content = String((params as any)?.content ?? "");
      if (!path) throw { code: "BadRequest", message: "path is required" };
      await vaultWriteText(path, content);
      return true;
    }

    throw { code: "NotFound", message: `Unknown host method: ${method}` };
  }

  private async handlePluginCrashed(pluginId: string, reason: string) {
    try {
      this.unloadPlugin(pluginId);
      await pluginsSetEnabled(pluginId, false, reason);
      await refreshPlugins();
    } catch (_err) {
      this.unloadPlugin(pluginId);
    }
  }
}

export const pluginHost = new PluginHost();
