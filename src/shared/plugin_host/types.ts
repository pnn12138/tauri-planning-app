export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  entry: string;
  description: string;
  author: string;
  minAppVersion: string;
  permissions: string[];
};

export type RpcRequest = {
  type: "rpc_request";
  id: string;
  method: string;
  params: unknown;
};

export type RpcResponse = {
  type: "rpc_response";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

