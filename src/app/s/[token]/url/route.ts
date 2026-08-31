import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { shareLinkDead } from "@/lib/share";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: { video: true },
    });
    if (!link || shareLinkDead(link)) return new Response("Not found", { status: 404 });

    const url = await signGetUrl(link!.video.s3Key, { disposition: "inline" });
    return new Response(null, { status: 302, headers: { location: url } });
  });
}
