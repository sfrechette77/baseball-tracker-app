'use client'

import { useState, useTransition } from 'react'
import { deleteMessage } from '../../app/actions/chat'
import type { ChatMessage } from '../../app/actions/chat'
import { MessageReactionBar, MessageReactionPicker } from './MessageReactionBar'
import { useActiveOrg } from '@/components/org-context'

type Props = {
  message: ChatMessage
  currentMembershipId: string | null
  // Should this bubble show its own avatar+name header? Set to false when
  // the previous message was from the same author within the same minute,
  // for visually grouped messages.
  showAuthor: boolean
  // Called after delete or reaction so the parent re-fetches messages
  onChanged?: () => void
}

export function MessageBubble({ message, currentMembershipId, showAuthor, onChanged }: Props) {
  const [showActions, setShowActions] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  const isOwn = message.author_membership_id === currentMembershipId
  const canDelete = isOwn

  const initials = (message.author_name ?? '?')
    .split(' ')
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const handleDelete = () => {
    setDeleteError(null)
    setShowActions(false)
    startTransition(async () => {
      const result = await deleteMessage(message.id)
      if (result.ok) {
        onChanged?.()
      } else {
        setDeleteError(result.error)
      }
    })
  }

  const timeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(message.created_at))

  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (only for other people's messages, and only when showAuthor) */}
      {!isOwn && (
        <div className="w-8 flex-shrink-0">
          {showAuthor ? (
            <div className="flex h-8 w-8 items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: brandColor }}>
              {initials}
            </div>
          ) : (
            <div className="h-8 w-8" />
          )}
        </div>
      )}

      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%]`}>
        {/* Author + time header */}
        {showAuthor && (
          <div className={`flex items-baseline gap-2 mb-0.5 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
            {!isOwn && (
              <span className="text-xs font-semibold text-slate-300">
                {message.author_name ?? 'Unknown'}
              </span>
            )}
            <span className="text-[10px] text-slate-500">{timeLabel}</span>
          </div>
        )}

        {/* Bubble */}
        <div className="relative group">
          <button
            onClick={() => setShowActions(prev => !prev)}
            className={`text-left rounded-2xl px-3 py-2 ${
              isOwn
                ? 'text-white'
                : 'bg-white/10 text-slate-100'
            }`}
            style={
              isOwn
                ? { backgroundColor: brandColor }
                : undefined
            }
          >
            {message.body && (
              <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
            )}
            {message.image_url && !imageError && (
              <div className={`overflow-hidden rounded-xl ${message.body ? 'mt-2' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.image_url}
                  alt=""
                  className="max-w-full h-auto"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
          </button>

          {/* Action menu — appears on tap */}
          {showActions && (
            <div className={`absolute z-10 mt-1 flex gap-1 ${isOwn ? 'right-0' : 'left-0'}`}>
              <button
                onClick={() => {
                  setShowActions(false)
                  setShowPicker(true)
                }}
                className="rounded-full bg-slate-800 border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700 transition"
              >
                React
              </button>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-full bg-slate-800 border border-red-500/30 px-3 py-1 text-xs text-red-400 hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {isPending ? '...' : 'Delete'}
                </button>
              )}
            </div>
          )}

          {/* Reaction picker — appears when user taps "React" */}
          {showPicker && (
            <div
              className={`absolute z-20 mt-1 ${isOwn ? 'right-0' : 'left-0'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MessageReactionPicker
                messageId={message.id}
                myReactions={message.my_reactions}
                onClose={() => setShowPicker(false)}
                onChange={onChanged}
              />
            </div>
          )}
        </div>

        {/* Reactions */}
        <MessageReactionBar
          messageId={message.id}
          reactions={message.reactions}
          myReactions={message.my_reactions}
          onChange={onChanged}
        />

        {/* Delete error */}
        {deleteError && (
          <p className="mt-1 text-[10px] text-red-400">Delete failed: {deleteError}</p>
        )}
      </div>
    </div>
  )
}