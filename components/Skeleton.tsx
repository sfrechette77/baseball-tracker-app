'use client'

type SkeletonProps = {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded bg-white/10 ${className}`} />
  )
}

// Composed skeleton that mirrors the EventCard shape — used on home + schedule
export function EventCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      {featured && <Skeleton className="mb-3 h-3 w-20" />}
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-1 h-4 w-2/5" />

      {featured && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      <Skeleton className="mt-4 h-16 rounded-xl" />
      <Skeleton className="mt-3 h-20 rounded-xl" />
    </div>
  )
}

// Compact row skeleton — used for past games, schedule list, roster, etc.
export function RowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3">
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-20" />
      </div>
      <Skeleton className="h-4 w-12" />
    </div>
  )
}
