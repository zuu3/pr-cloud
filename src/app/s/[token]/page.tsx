import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share";
import { IconFilm } from "@/components/ui/icons";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resolveShare(token);
  if (!info) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-6 text-[15px] font-bold text-foreground">
          <IconFilm className="size-[18px] text-primary" />
          홍보부 영상
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-foreground">{info.title}</h1>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <video controls className="aspect-video w-full bg-black" src={`/s/${token}/url`} />
        </div>
        <p className="mt-3 text-[13px]">
          <a
            className="font-medium text-primary hover:underline"
            href={`/s/${token}/url`}
          >
            새 탭에서 열기 / 다운로드
          </a>
        </p>
        <p className="mt-6 text-[12px] text-muted">이 링크로 이 영상만 볼 수 있어요.</p>
      </main>
    </div>
  );
}
