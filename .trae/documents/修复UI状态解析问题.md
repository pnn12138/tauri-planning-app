## 问题分析

`planning_get_ui_state` 从后端返回一个 `Option<String>` (JSON)，但在前端的 `planningGetUiState` 函数中，它被直接返回为 `Record<string, any>` 而没有进行 `JSON.parse`，导致 `loadUIState` 函数将字符串展开为 `{0:'{',1:'"',...}` 而不是恢复过滤器/布局。

## 解决方案

在前端的 `planningGetUiState` 函数中，对返回的字符串进行 `JSON.parse` 解析，并添加以下改进：

1. 使用 `result != null` 而不是 `if (result)` 来判断结果是否存在，避免空字符串被跳过
2. 添加形状校验，确保解析后的数据是一个对象
3. 在日志中带上 `vaultId`，方便定位问题

## 修复步骤

修改 `src/features/planning/planning.api.ts` 文件中的 `planningGetUiState` 函数，添加 `JSON.parse` 解析逻辑和相关改进。

## 代码变更

```typescript
// 原代码
export async function planningGetUiState(vaultId: string): Promise<Record<string, any> | null> {
  const result = await invokeApi<Record<string, any> | null>("planning_get_ui_state", { vault_id: vaultId });
  return result;
}

// 修改后的代码
export async function planningGetUiState(
  vaultId: string
): Promise<Record<string, any> | null> {
  const result = await invokeApi<string | null>("planning_get_ui_state", { 
    vault_id: vaultId 
  });

  if (result == null) return null;

  try {
    const parsed: unknown = JSON.parse(result);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }

    console.warn("[planningGetUiState] Parsed UI state is not an object:", { vaultId, parsed });
    return null;
  } catch (error) {
    console.error("[planningGetUiState] Failed to parse UI state:", { vaultId, error, result });
    return null;
  }
}
```

