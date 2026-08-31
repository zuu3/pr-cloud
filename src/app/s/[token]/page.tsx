import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share";
import { IconUpload } from "@/components/ui/icons";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resolveShare(token);
  if (!info) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-6 text-[15px] font-bold text-foreground">
          홍보부 클라우드
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-foreground">{info.title}</h1>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <video controls className="aspect-video w-full bg-black" src={`/s/${token}/url`} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/s/${token}/url?dl=1`}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <IconUpload className="size-4 rotate-180" />
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
      </main>
    </div>
  );
}
