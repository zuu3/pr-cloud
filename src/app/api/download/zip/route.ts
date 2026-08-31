import { Readable } from "node:stream";
// @ts-expect-error @types/archiver ships `export =`; the default works at runtime
import archiver from "archiver";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { folderPath } from "@/lib/folders";
import { subtreeIds } from "@/lib/subtree";
import { assertRate } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";

// Streams a ZIP (stored, not compressed — video is already compressed) built
// straight from object storage. Used for "hand the whole folder to an editor".
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    assertRate(`zip:${user.email}`, 20, 60_000);
    const p = new URL(request.url).searchParams;
    const folderId = p.get("folderId");
    const ids = (p.get("ids") ?? "").split(",").filter(Boolean);

    const scope: Prisma.VideoWhereInput =
      user.role === "admin" ? {} : { uploadedBy: user.email };
    const allFolders = await prisma.folder.findMany({
      select: { id: true, name: true, parentId: true },
    });

    let where: Prisma.VideoWhereInput;
    let zipName: string;
    if (folderId) {
      where = {
        ...scope,
        status: "ready",
        deletedAt: null,
        folderId: { in: subtreeIds(allFolders, folderId) },
      };
      zipName = `${allFolders.find((f) => f.id === folderId)?.name ?? "폴더"}.zip`;
    } else if (ids.length > 0) {
      where = { ...scope, status: "ready", deletedAt: null, id: { in: ids } };
      zipName = `영상 ${ids.length}개.zip`;
    } else {
      throw new HttpError(400, "folderId 또는 ids가 필요해요");
    }

    const videos = await prisma.video.findMany({
      where,
      select: { s3Key: true, originalFilename: true, folderId: true },
    });
    if (videos.length === 0) throw new HttpError(404, "내려받을 영상이 없어요");

    const archive = archiver("zip", { store: true });
    archive.on("error", (e: unknown) => console.error("zip archive error", e));

    const used = new Set<string>();
    for (const v of videos) {
      const dir = v.folderId ? folderPath(allFolders, v.folderId).replace(/ \/ /g, "/") : "";
      let name = (dir ? `${dir}/` : "") + v.originalFilename;
      for (let i = 1; used.has(name); i++) {
        name = name.replace(/(\.[^.]+)?$/, `-${i}$1`);
      }
      used.add(name);
      const obj = await s3Internal.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: v.s3Key }),
      );
      archive.append(obj.Body as Readable, { name });
    }
    void archive.finalize();
    await logAudit(user.email, "video.download.zip", String(videos.length));

    return new Response(Readable.toWeb(archive) as ReadableStream, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      },
    });
  });
}
