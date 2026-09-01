import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string }> };

// Stable thumbnail URL. Lists reference /api/thumb/<id> instead of a presigned
// URL that changes every request — so the browser actually caches the image and
// the list route doesn't sign N URLs per call.
export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    const v = await prisma.video.findUnique({
      where: { id },
      select: { thumbKey: true, deletedAt: true },
    });
    if (!v?.thumbKey || v.deletedAt) return new Response("Not found", { status: 404 });

    const url = await signGetUrl(v.thumbKey, { disposition: "inline" });
    return new Response(null, {
      status: 302,
      headers: { location: url, "cache-control": "private, max-age=3600" },
    });
  });
}
