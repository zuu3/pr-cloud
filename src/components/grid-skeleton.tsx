export function GridCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-7 grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border">
          <div className="aspect-video bg-surface" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 rounded bg-surface" />
            <div className="h-3 w-1/2 rounded bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
