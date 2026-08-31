import { headers } from "next/headers";
import { env } from "@/lib/env";
import { Uploader } from "@/components/uploader";

type Folder = { id: string; name: string; parentId: string | null };

async function getFolders(): Promise<Folder[]> {
  const res = await fetch(`${env.NEXTAUTH_URL}/api/folders`, {
    headers: { cookie: (await headers()).get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()).folders;
}

export default async function UploadPage() {
  return <Uploader folders={await getFolders()} />;
}
