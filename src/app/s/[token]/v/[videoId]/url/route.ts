import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { shareAllowsVideo } from "@/lib/share";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ token: string; videoId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { token, videoId } = await params;
    if (!(await shareAllowsVideo(token, videoId))) {
      return new Response("Not found", { status: 404 });
    }
    const dl = new URL(request.url).searchParams.get("dl") === "1";
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const url = await signGetUrl(dl ? v.s3Key : (v.proxyKey ?? v.s3Key), {
      disposition: dl ? "attachment" : "inline",
      filename: dl ? v.originalFilename : undefined,
    });
    return new Response(null, { status: 302, headers: { location: url } });
  });
}
