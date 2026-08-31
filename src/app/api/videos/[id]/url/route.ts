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
    if (!video) throw new HttpError(404, "not found");
    if (video.status !== "ready") throw new HttpError(409, "not ready");

    const url = await signGetUrl(video.s3Key, {
      disposition,
      filename: disposition === "attachment" ? video.originalFilename : undefined,
    });
    return json({ url });
  });
}
