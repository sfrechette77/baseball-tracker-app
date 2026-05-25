'use client'

import { useState, useTransition } from 'react'
import { deletePost } from '../../app/actions/feed'
import type { Post } from '../../app/actions/feed'
import { ReactionBar } from './ReactionBar'

type Props = {
  post: Post
  currentMembershipId: string | null
  isOrgAdmin: boolean
  onDeleted?: () => void
  onReactionChange?: () => void
}

export function PostCard({ post, currentMembershipId, isOrgAdmin, onDeleted, onReactionChange }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [imageError, setImageError] = useState(false)

  const isAuthor = post.author_membership_id === currentMembershipId
  const canDelete = isAuthor || isOrgAdmin

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePost(post.id)
      if (result.ok) {
        onDeleted?.()
      } else {
        console.error('Delete failed:', result.error)
        setConfirming(false)
      }
    })
  }

  // Format timestamp — "2h ago", "yesterday", or absolute date if older
  const timeLabel = formatRelativeTime(post.created_at)

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      {/* Header: author + timestamp + delete */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white text-sm">
            {post.author_name ?? 'Unknown author'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{timeLabel}</p>
        </div>
        {canDelete && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-slate-500 hover:text-red-400 transition"
            aria-label="Delete post"
          >
            ⋯
          </button>
        )}
        {canDelete && confirming && (
          <div className="flex gap-2 items-center">
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition"
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <p className="mt-3 text-sm text-slate-200 whitespace-pre-wrap">
        {post.body}
      </p>

      {/* Image (if present) */}
      {post.image_url && !imageError && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image_url}
            alt=""
            className="w-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Reactions */}
      <div className="mt-3">
        <ReactionBar
          postId={post.id}
          reactions={post.reactions}
          myReactions={post.my_reactions}
          onChange={onReactionChange}
        />
      </div>
    </article>
  )
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  // Older: show date
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date)
}