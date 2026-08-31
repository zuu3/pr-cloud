import { headers } from "next/headers";
import { env } from "@/lib/env";
import { VideoGrid } from "@/components/video-grid";

async function api(path: string) {
  const res = await fetch(`${env.NEXTAUTH_URL}${path}`, {
    headers: { cookie: (await headers()).get("cookie") ?? "" },
    cache: "no-store",
  });
  return res.ok ? res.json() : null;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string; q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.folderId) qs.set("folderId", sp.folderId);
  if (sp.q) qs.set("q", sp.q);
  if (sp.sort) qs.set("sort", sp.sort);

  const [list, folders] = await Promise.all([api(`/api/videos?${qs}`), api(`/api/folders`)]);
  return (
    <VideoGrid
      initial={list ?? { videos: [], nextCursor: null }}
      folders={folders?.folders ?? []}
    />
  );
}
