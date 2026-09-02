import { headers } from "next/headers";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
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
  searchParams: Promise<{
    folderId?: string;
    q?: string;
    sort?: string;
    mine?: string;
    days?: string;
    kind?: string;
  }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.folderId) qs.set("folderId", sp.folderId);
  if (sp.q) qs.set("q", sp.q);
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.mine) qs.set("mine", sp.mine);
  if (sp.days) qs.set("days", sp.days);
  if (sp.kind) qs.set("kind", sp.kind);

  const [list, folders, session] = await Promise.all([
    api(`/api/videos?${qs}`),
    api(`/api/folders`),
    auth(),
  ]);
  const user = session?.user as { email?: string; role?: string } | undefined;
  return (
    <VideoGrid
      initial={list ?? { videos: [], nextCursor: null }}
      folders={folders?.folders ?? []}
      me={user?.email ?? ""}
      isAdmin={user?.role === "admin"}
    />
  );
}
