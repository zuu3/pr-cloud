import { GridCardsSkeleton } from "@/components/grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 sm:py-12">
      <div className="animate-pulse">
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
      </div>
      <GridCardsSkeleton />
    </main>
  );
}
