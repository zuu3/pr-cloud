import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share";
import { signGetUrl } from "@/lib/s3";
import { humanDuration } from "@/lib/format";
import { IconPlay } from "@/components/ui/icons";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 sm:px-6 text-[15px] font-bold text-foreground">
          홍보부 클라우드
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resolveShare(token);
  if (!info) notFound();

  if (info.kind === "video") {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-foreground">{info.title}</h1>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-black">
          {info.mediaKind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/s/${token}/url`}
              alt={info.title}
              className="mx-auto max-h-[75vh] w-full object-contain"
            />
          ) : (
            <video controls className="aspect-video w-full bg-black" src={`/s/${token}/url`} />
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/s/${token}/url?dl=1`}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            다운로드
          </a>
          <a
            href={`/s/${token}/url`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-xl border border-border bg-canvas px-5 text-[15px] font-medium text-body transition-colors hover:border-primary hover:text-primary"
          >
            새 탭에서 열기
          </a>
        </div>
        <p className="mt-6 text-[12px] text-muted">이 링크로 이 영상만 볼 수 있어요.</p>
      </Shell>
    );
  }

  const thumbs = await Promise.all(
    info.videos.map((v) =>
      v.thumbKey ? signGetUrl(v.thumbKey, { disposition: "inline" }) : Promise.resolve(null),
    ),
  );

  return (
    <Shell>
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-foreground">{info.title}</h1>
      <p className="mt-1.5 text-[13px] text-muted">영상 {info.videos.length}개</p>

      {info.videos.length === 0 ? (
        <p className="mt-10 text-center text-[14px] text-muted">아직 영상이 없어요.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {info.videos.map((v, i) => (
            <Link
              key={v.id}
              href={`/s/${token}/v/${v.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-canvas transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(25,31,40,0.3)]"
            >
              <div className="relative aspect-video bg-surface">
                {thumbs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[i]!} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid size-full place-items-center text-[28px] text-muted/40">
                    <IconPlay />
                  </div>
                )}
                {v.durationSec != null && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {humanDuration(v.durationSec)}
                  </span>
                )}
                {v.playableInBrowser === false && (
                  <span className="absolute left-2 top-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    다운로드 전용
                  </span>
                )}
              </div>
              <p className="truncate px-4 py-3 text-[14px] font-semibold text-foreground">
                {v.title}
              </p>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-6 text-[12px] text-muted">이 링크로 이 폴더의 영상을 볼 수 있어요.</p>
    </Shell>
  );
}
