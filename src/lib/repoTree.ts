import type { StartHereFile } from "./claude";
import { getFileName } from "./pathUtils";

export interface TreeFile {
  name: string;
  fullPath: string;
  startHereOrder?: number;
  startHereReason?: string;
}

export interface TreeFolder {
  name: string;
  files: TreeFile[];
}

export function buildFolderTree(
  files: { path: string; type: string }[],
  startHere: StartHereFile[],
): TreeFolder[] {
  const startHereMap = new Map(
    startHere.map((s, i) => [s.path, { order: i + 1, reason: s.reason }]),
  );
  const folderMap = new Map<string, TreeFile[]>();

  files
    .filter((f) => f.type === "blob")
    .forEach((f) => {
      const segments = f.path.split("/");
      const folderName = segments.length > 1 ? `${segments[0]}/` : "(root)";
      const displayName =
        segments.length > 1 ? segments.slice(1).join("/") : getFileName(f.path);
      const sh = startHereMap.get(f.path);

      const file: TreeFile = {
        name: displayName,
        fullPath: f.path,
        startHereOrder: sh?.order,
        startHereReason: sh?.reason,
      };

      if (!folderMap.has(folderName)) folderMap.set(folderName, []);
      folderMap.get(folderName)!.push(file);
    });

  return Array.from(folderMap.entries()).map(([name, files]) => ({
    name,
    files,
  }));
}
