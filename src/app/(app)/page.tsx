import { Suspense } from "react";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
import { VideoGrid } from "@/components/video-grid";
import { GridCardsSkeleton } from "@/components/grid-skeleton";

async function api(path: string) {
  const res = await fetch(`${env.NEXTAUTH_URL}${path}`, {
    headers: { cookie: (await headers()).get("cookie") ?? "" },
    cache: "no-store",
  });
  return res.ok ? res.json() : null;
}

type SP = {
  folderId?: string;
  q?: string;
  sort?: string;
  mine?: string;
  days?: string;
  kind?: string;
};

async function Grid({ sp }: { sp: SP }) {
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
      key={sp.folderId ?? "root"}
      initial={list ?? { videos: [], nextCursor: null }}
      folders={folders?.folders ?? []}
      me={user?.email ?? ""}
      isAdmin={user?.role === "admin"}
    />
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  return (
    <Suspense
      key={sp.folderId ?? "root"}
      fallback={
        <main className="mx-auto max-w-[1120px] px-4 sm:px-6 py-10 pb-24 sm:py-12">
          <GridCardsSkeleton />
        </main>
      }
    >
      <Grid sp={sp} />
    </Suspense>
  );
}
