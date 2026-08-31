export default function Loading() {
  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface" />
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border">
            <div className="aspect-video animate-pulse bg-surface" />
            <div className="p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
