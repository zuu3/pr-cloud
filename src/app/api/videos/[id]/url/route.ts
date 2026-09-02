import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    const disposition =
      new URL(request.url).searchParams.get("disposition") === "attachment"
        ? "attachment"
        : "inline";

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video || video.deletedAt) throw new HttpError(404, "not found");
    if (video.status !== "ready") throw new HttpError(409, "not ready");

    // view counting lives on the detail page load, not here

    const key =
      disposition === "attachment" ? video.s3Key : (video.proxyKey ?? video.s3Key);
    const url = await signGetUrl(key, {
      disposition,
      filename: disposition === "attachment" ? video.originalFilename : undefined,
    });
    return json({ url });
  });
}
