export default function Loading() {
  return (
    <main className="mx-auto max-w-[1120px] animate-pulse px-4 py-10 sm:px-6 sm:py-12">
      <div className="h-8 w-40 rounded-lg bg-surface" />
      <div className="mt-4 flex gap-2">
        <div className="h-9 w-24 rounded-lg bg-surface" />
        <div className="h-9 w-28 rounded-lg bg-surface" />
        <div className="ml-auto h-9 w-40 rounded-lg bg-surface" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-[88px] w-[148px] rounded-2xl bg-surface" />
        <div className="h-[88px] w-[148px] rounded-2xl bg-surface" />
      </div>
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border">
            <div className="aspect-video bg-surface" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 rounded bg-surface" />
              <div className="h-3 w-1/2 rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
