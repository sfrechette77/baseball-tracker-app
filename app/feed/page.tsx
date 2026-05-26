'use client'

import { useEffect, useState, Suspense } from 'react'
import { useCurrentTeam } from '@/components/team-context'
import { useActiveOrg } from '@/components/org-context'
import { BottomNav } from '@/components/BottomNav'
import { PostCardSkeleton } from '@/components/Skeleton'
import { Composer } from '@/components/feed/Composer'
import { PostCard } from '@/components/feed/PostCard'
import { getFeed } from '../actions/feed'
import type { Post } from '../actions/feed'

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <FeedPageInner />
    </Suspense>
  )
}

function FeedSkeleton() {
  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Feed</h1>
      </div>
      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    </main>
  )
}

function FeedPageInner() {
  const { currentTeam } = useCurrentTeam()
  const { membership, loading: orgLoading } = useActiveOrg()

  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const canPost = membership?.role === 'org_admin' || membership?.role === 'team_admin'
  const isOrgAdmin = membership?.role === 'org_admin'

  useEffect(() => {
    if (orgLoading) return

    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await getFeed(currentTeam.id)
      if (result.ok) {
        setPosts(result.posts)
      } else {
        setError(result.error)
      }
      setLoading(false)
    }
    load()
  }, [currentTeam.id, orgLoading, refreshKey])

  const refresh = () => setRefreshKey(k => k + 1)

  if (orgLoading || loading) {
    return <FeedSkeleton />
  }

  if (!membership) {
    return (
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm px-4 pt-6">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">No active membership</p>
            <p className="mt-1 text-sm">
              You need to be an approved member of an organization to see the feed.
            </p>
          </div>
        </div>
        <BottomNav active="feed" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Feed</h1>
        <p className="text-sm text-slate-400 mt-1">{currentTeam.fullName}</p>
      </div>

      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">
        {canPost && (
          <Composer teamId={currentTeam.id} onPosted={refresh} />
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {posts.length === 0 && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">
              {canPost ? 'No posts yet. Be the first to post an update!' : 'No posts yet.'}
            </p>
          </div>
        )}

        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentMembershipId={membership.id}
            isOrgAdmin={isOrgAdmin}
            onDeleted={refresh}
            onReactionChange={refresh}
          />
        ))}
      </div>

      <BottomNav active="feed" />
    </main>
  )
}