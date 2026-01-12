export type FileNode = {
  type: "dir" | "file";
  name: string;
  path: string;
  mtime?: number | null;
  children?: FileNode[];
};

