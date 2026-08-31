import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resolveShare(token);
  if (!info) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-foreground">{info.title}</h1>
      <video controls className="mt-4 w-full rounded-xl bg-black" src={`/s/${token}/url`} />
      <p className="mt-3 text-[14px]">
        <a className="text-weak-fg hover:underline" href={`/s/${token}/url`}>
          영상 열기 / 다운로드
        </a>
      </p>
    </main>
  );
}
