import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { shareLinkDead } from "@/lib/share";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const dl = new URL(request.url).searchParams.get("dl") === "1";
    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: { video: true, folder: true },
    });
    if (!link || shareLinkDead(link) || !link.video) {
      return new Response("Not found", { status: 404 });
    }

    const url = await signGetUrl(dl ? link.video.s3Key : (link.video.proxyKey ?? link.video.s3Key), {
      disposition: dl ? "attachment" : "inline",
      filename: dl ? link.video.originalFilename : undefined,
    });
    return new Response(null, { status: 302, headers: { location: url } });
  });
}
