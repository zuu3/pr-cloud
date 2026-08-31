import type { FolderNode } from "./folders";

/** ids of `rootId` plus every folder nested under it (BFS over a flat list). */
export function subtreeIds(folders: Pick<FolderNode, "id" | "parentId">[], rootId: string): string[] {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return [...out];
}
