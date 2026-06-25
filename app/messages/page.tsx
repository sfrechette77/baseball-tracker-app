'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentTeam } from '@/components/team-context'
import { useActiveOrg } from '@/components/org-context'
import { BottomNav } from '@/components/BottomNav'
import { Skeleton } from '@/components/Skeleton'
import { useOrgSeasons } from '@/lib/org/useOrgSeasons'

// Reused from Feed
import { Composer } from '@/components/feed/Composer'
import { PostCard } from '@/components/feed/PostCard'
import { getFeed } from '../actions/feed'
import type { Post } from '../actions/feed'

// New for Chat
import { MessageBubble } from '@/components/chat/MessageBubble'
import { MessageComposer } from '@/components/chat/MessageComposer'
import { getMessages, getMutedChats, toggleMuteChat } from '../actions/chat'
import type { ChatMessage } from '../actions/chat'

type SubView = 'announcements' | 'chat'

function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesPageSkeleton />}>
      <MessagesPageInner />
    </Suspense>
  )
}

function MessagesPageSkeleton() {
  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-slate-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Messages</h1>
      </div>
      <div className="mx-auto max-w-sm px-4 pt-4">
        <div className="h-9 rounded-full bg-white/5 border border-white/10" />
      </div>
      <div className="mx-auto max-w-sm space-y-3 px-4 pt-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
      <BottomNav active="messages" />
    </main>
  )
}

function MessagesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentTeam } = useCurrentTeam()
  const { membership, loading: orgLoading, org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  const viewParam = searchParams.get('view')
  const view: SubView = viewParam === 'chat' ? 'chat' : 'announcements'

  const { seasons, currentSeasonId } = useOrgSeasons()
  const selectedSeason = seasons.find(season => season.id === currentSeasonId) ?? null

  const setView = (next: SubView) => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', next)
    router.replace(url.pathname + url.search, { scroll: false })
  }

  if (orgLoading) {
    return <MessagesPageSkeleton />
  }

  if (!membership) {
    return (
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm px-4 pt-6">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">No active membership</p>
            <p className="mt-1 text-sm">
              You need to be an approved member of an organization to see messages.
            </p>
          </div>
        </div>
        <BottomNav active="messages" />
      </main>
    )
  }

  return (
    <main className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="mx-auto max-w-sm w-full px-4 pt-6 pb-2 flex-shrink-0">
        <p className="text-xl tracking-[0.1em] font-bold"
            style={{ color: brandColor }}
          >
            {selectedSeason?.name ?? 'Season'}
          </p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Messages</h1>
        <p className="text-sm text-slate-400 mt-1">{currentTeam.fullName}</p>
      </div>

      {/* Sub-view toggle */}
      <div className="mx-auto max-w-sm w-full px-4 pt-4 flex-shrink-0">
        <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-1">
          {(['announcements', 'chat'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                view === key ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
              style={view === key ? { backgroundColor: brandColor } : undefined}
            >
              {key === 'announcements' ? 'Announcements' : 'Chat'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === 'announcements' ? (
        <AnnouncementsView
          teamId={currentTeam.id}
          membershipId={membership.id}
          isOrgAdmin={membership.role === 'org_admin'}
          canPost={membership.role === 'org_admin' || membership.role === 'team_admin'}
        />
      ) : (
        <ChatView teamId={currentTeam.id} membershipId={membership.id} />
      )}

      <BottomNav active="messages" />
    </main>
  )
}

// ─── Announcements (reused Feed) ──────────────────────────────────────────

function AnnouncementsView({
  teamId,
  membershipId,
  isOrgAdmin,
  canPost,
}: {
  teamId: string
  membershipId: string
  isOrgAdmin: boolean
  canPost: boolean
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await getFeed(teamId)
      if (result.ok) {
        setPosts(result.posts)
      } else {
        setError(result.error)
      }
      setLoading(false)
    }
    load()
  }, [teamId, refreshKey])

  const refresh = () => setRefreshKey(k => k + 1)

  return (
    <div
      className="flex-1 overflow-y-auto mx-auto w-full max-w-sm space-y-4 px-4 pt-4 min-h-0"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px + 24px)' }}
    >
      {canPost && <Composer teamId={teamId} onPosted={refresh} />}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && posts.length === 0 && !error && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-slate-400 text-sm">
            {canPost ? 'No posts yet. Be the first to post an update!' : 'No posts yet.'}
          </p>
        </div>
      )}

      {!loading && posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          currentMembershipId={membershipId}
          isOrgAdmin={isOrgAdmin}
          onDeleted={refresh}
          onReactionChange={refresh}
        />
      ))}
    </div>
  )
}

// ─── Chat ─────────────────────────────────────────────────────────────────

function ChatView({ teamId, membershipId }: { teamId: string; membershipId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [muted, setMuted] = useState(false)
  const [muteToggling, setMuteToggling] = useState(false)
  const [muteLoaded, setMuteLoaded] = useState(false)

  // Load messages on team change or refresh
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await getMessages(teamId)
      if (result.ok) {
        setMessages(result.messages)
      } else {
        setError(result.error)
      }
      setLoading(false)
    }
    load()
  }, [teamId, refreshKey])

  // Load mute state for this team's chat
  useEffect(() => {
    setMuteLoaded(false)
    const loadMute = async () => {
      const result = await getMutedChats(teamId)
      if (result.ok) {
        setMuted(result.muted)
      }
      setMuteLoaded(true)
    }
    loadMute()
  }, [teamId])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Realtime subscription — listen for new messages and reactions on this team.
  // Reactions are debounced (2s) so a burst of 5 reactions only causes 1 refetch.
  useEffect(() => {
    const supabase = createBrowserSupabase()

    // Debounce timer for reaction events. Reset on each new event; refetch only
    // fires once the burst has been quiet for 2 seconds.
    let reactionTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleReactionRefresh = () => {
      if (reactionTimer) clearTimeout(reactionTimer)
      reactionTimer = setTimeout(() => {
        setRefreshKey(k => k + 1)
        reactionTimer = null
      }, 2000)
    }

    const channel = supabase
      .channel(`team_messages:${teamId}`)
      // Message INSERT — instant refetch (new messages should appear right away)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          setRefreshKey(k => k + 1)
        }
      )
      // Message DELETE — instant refetch
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'team_messages',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          setRefreshKey(k => k + 1)
        }
      )
      // Reaction INSERT — debounced refetch
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_message_reactions',
        },
        () => {
          scheduleReactionRefresh()
        }
      )
      // Reaction DELETE — debounced refetch
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'team_message_reactions',
        },
        () => {
          scheduleReactionRefresh()
        }
      )
      .subscribe()

    return () => {
      if (reactionTimer) clearTimeout(reactionTimer)
      supabase.removeChannel(channel)
    }
  }, [teamId])

  const refresh = () => setRefreshKey(k => k + 1)
  const handleToggleMute = async () => {
    if (muteToggling) return
    setMuteToggling(true)
    // Optimistic flip
    const newMuted = !muted
    setMuted(newMuted)
    const result = await toggleMuteChat(teamId)
    if (!result.ok) {
      // Revert on failure
      setMuted(!newMuted)
      console.error('Mute toggle failed:', result.error)
    } else {
      // Sync to server's actual returned state in case of any drift
      setMuted(result.muted)
    }
    setMuteToggling(false)
  }

  // Compute showAuthor for each message — suppress avatar/name when previous
  // message was from the same author within 5 minutes.
  const messagesWithGrouping = messages.map((msg, i) => {
    if (i === 0) return { msg, showAuthor: true }
    const prev = messages[i - 1]
    const sameAuthor = prev.author_membership_id === msg.author_membership_id
    const timeDiffMs = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()
    const within5Min = timeDiffMs < 5 * 60 * 1000
    return { msg, showAuthor: !(sameAuthor && within5Min) }
  })

  return (
    <div className="flex-1 flex flex-col w-full max-w-sm mx-auto overflow-hidden min-h-0">
      {/* Mute toggle bar */}
      <div className="flex items-center justify-end px-4 pt-2 pb-1 h-8">
        {muteLoaded && (
        <button
          onClick={handleToggleMute}
          disabled={muteToggling}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
            muted
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
              : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
          aria-label={muted ? 'Unmute chat notifications' : 'Mute chat notifications'}
        >
          <span>{muted ? '🔕' : '🔔'}</span>
          <span>{muted ? 'Muted' : 'Notifications on'}</span>
        </button>
        )} 
      </div>

      {/* Message scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-4 space-y-2 min-h-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px + 72px)' }}
      >
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="h-12 w-2/3 ml-auto rounded-2xl" />
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">No messages yet. Say hi!</p>
          </div>
        )}

        {!loading && messagesWithGrouping.map(({ msg, showAuthor }) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            currentMembershipId={membershipId}
            showAuthor={showAuthor}
            onChanged={refresh}
          />
        ))}
      </div>

      {/* Composer pinned above the bottom nav (fixed, like the nav itself) */}
      <div
        className="fixed left-0 right-0 z-10 bg-black"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 64px)' }}
      >
        <div className="mx-auto w-full max-w-sm">
          <MessageComposer teamId={teamId} onSent={refresh} />
        </div>
      </div>
    </div>
  )
}