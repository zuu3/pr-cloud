import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share";
import { IconChevronLeft } from "@/components/ui/icons";

export default async function SharedFolderVideo({
  params,
}: {
  params: Promise<{ token: string; videoId: string }>;
}) {
  const { token, videoId } = await params;
  const info = await resolveShare(token);
  if (!info || info.kind !== "folder") notFound();

  const video = info.videos.find((v) => v.id === videoId);
  if (!video) notFound();

  const src = `/s/${token}/v/${videoId}/url`;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 sm:px-6 text-[15px] font-bold text-foreground">
          홍보부 클라우드
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link
          href={`/s/${token}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[13px] text-body hover:border-primary hover:text-primary"
        >
          <IconChevronLeft className="size-4" />
          {info.title}
        </Link>

        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.01em] text-foreground">
          {video.title}
        </h1>

        {video.mediaKind === "image" ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={video.title}
              className="mx-auto max-h-[75vh] w-full object-contain"
            />
          </div>
        ) : video.playableInBrowser === false ? (
          <div className="mt-4 grid aspect-video place-items-center rounded-2xl border border-border bg-black/90 px-6 text-center">
            <div>
              <p className="text-[14px] font-medium text-white">
                브라우저에서 재생할 수 없는 형식이에요
              </p>
              <a
                href={`${src}?dl=1`}
                className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-foreground hover:bg-white/90"
              >
                다운로드
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <video controls className="aspect-video w-full bg-black" src={src} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`${src}?dl=1`}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            다운로드
          </a>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-xl border border-border bg-canvas px-5 text-[15px] font-medium text-body transition-colors hover:border-primary hover:text-primary"
          >
            새 탭에서 열기
          </a>
        </div>
      </main>
    </div>
  );
}
