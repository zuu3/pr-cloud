export type FolderNode = { id: string; name: string; parentId: string | null };

/** Safety rail only — not a product limit. Guards against pathological deep
 *  paths (breadcrumb blow-up, runaway webkitdirectory imports). Nobody nesting
 *  video folders by hand gets near this. */
export const MAX_FOLDER_DEPTH = 30;

/** depth of a folder within the tree (root folder = 1). */
export function depthOf(folders: FolderNode[], id: string): number {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let d = 0;
  let cur: FolderNode | undefined = byId.get(id);
  while (cur && d < 50) {
    d++;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return d;
}

/** "테스트 / 테스트 내부 테스트" — full path label for a folder. */
export function folderPath(folders: FolderNode[], id: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 50) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

/** folders as flat options ordered by path, each labelled with its full path. */
export function folderOptions(folders: FolderNode[]): { value: string; label: string }[] {
  return folders
    .map((f) => ({ value: f.id, label: folderPath(folders, f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

/** folders flattened in tree (DFS) order with a depth for indentation. */
export function folderTree(folders: FolderNode[]): { id: string; name: string; depth: number }[] {
  const children = new Map<string | null, FolderNode[]>();
  for (const f of folders) {
    const k = f.parentId ?? null;
    (children.get(k) ?? children.set(k, []).get(k)!).push(f);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      out.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
