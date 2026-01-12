export type ExplorerContextTarget =
  | { type: "blank"; parentPath: string }
  | { type: "file"; path: string; name: string }
  | { type: "dir"; path: string; name: string };

export type ExplorerMenuItemSchema = {
  id: "create_file" | "create_dir" | "rename" | "delete";
  label: string;
  danger?: boolean;
  disabled?: boolean;
};

export function getExplorerContextMenuSchema(
  target: ExplorerContextTarget
): ExplorerMenuItemSchema[] {
  if (target.type === "blank") {
    return [
      { id: "create_file", label: "新建文件" },
      { id: "create_dir", label: "新建文件夹" },
    ];
  }

  if (target.type === "dir") {
    return [
      { id: "create_file", label: "新建文件" },
      { id: "create_dir", label: "新建文件夹" },
      { id: "rename", label: "重命名" },
      { id: "delete", label: "删除", danger: true },
    ];
  }

  return [
    { id: "rename", label: "重命名" },
    { id: "delete", label: "删除", danger: true },
  ];
}

