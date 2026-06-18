'use client'

import { useState, useTransition } from 'react'
import { addReaction, removeReaction } from '../../app/actions/chat'
import type { ReactionSummary } from '../../app/actions/chat'
import { useActiveOrg } from '@/components/org-context'

export const AVAILABLE_EMOJIS = ['👍', '❤️', '🎉', '⚾', '🔥'] as const

type Props = {
  messageId: string
  reactions: ReactionSummary[]
  myReactions: string[]
  // Called on server error so the parent can re-fetch and reset state
  onChange?: () => void
}

export function MessageReactionBar({ messageId, reactions, myReactions, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  // Optimistic state — local copy that updates instantly. The server confirms
  // in the background; on failure we ask the parent to re-fetch.
  const [localReactions, setLocalReactions] = useState(reactions)
  const [localMyReactions, setLocalMyReactions] = useState(myReactions)

  const handleToggle = (emoji: string) => {
    const alreadyReacted = localMyReactions.includes(emoji)

    if (alreadyReacted) {
      setLocalMyReactions(prev => prev.filter(e => e !== emoji))
      setLocalReactions(prev =>
        prev
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1 } : r)
          .filter(r => r.count > 0)
      )
    } else {
      setLocalMyReactions(prev => [...prev, emoji])
      setLocalReactions(prev => {
        const existing = prev.find(r => r.emoji === emoji)
        if (existing) {
          return prev.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r)
        }
        return [...prev, { emoji, count: 1 }]
      })
    }

    setShowPicker(false)

    startTransition(async () => {
      const result = alreadyReacted
        ? await removeReaction(messageId, emoji)
        : await addReaction(messageId, emoji)
      if (!result.ok) {
        console.error('Reaction failed:', result.error)
        onChange?.()
      }
    })
  }

  const pickerOptions = AVAILABLE_EMOJIS.filter(
    e => !localReactions.some(r => r.emoji === e)
  )

  // If no reactions and the user hasn't opened the picker, render nothing visible.
  // The picker button is shown only when the user hovers/long-presses a message
  // (handled by the parent MessageBubble — picker is rendered separately there).
  if (localReactions.length === 0 && !showPicker) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {localReactions.map(r => {
        const isMine = localMyReactions.includes(r.emoji)
        return (
          <button
            key={r.emoji}
            onClick={() => handleToggle(r.emoji)}
            disabled={isPending}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
              isMine
                ? 'text-white'
                : 'border-white/10 bg-white/10 text-slate-300 hover:bg-white/15'
            }`}
            style={
              isMine
                ? {
                    backgroundColor: `${brandColor}33`,
                    borderColor: `${brandColor}66`,
                  }
                : undefined
            }
          >
            <span className="text-xs">{r.emoji}</span>
            <span className="tabular-nums">{r.count}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Standalone picker button — rendered by MessageBubble when the user
 * taps the "+" icon to react. Kept separate from MessageReactionBar
 * because chat UI shows the picker on demand, not always.
 */
export function MessageReactionPicker({
  messageId,
  myReactions,
  onClose,
  onChange,
}: {
  messageId: string
  myReactions: string[]
  onClose: () => void
  onChange?: () => void
}) {
  const [, startTransition] = useTransition()

  const handlePick = (emoji: string) => {
    const alreadyReacted = myReactions.includes(emoji)
    onClose()

    startTransition(async () => {
      const result = alreadyReacted
        ? await removeReaction(messageId, emoji)
        : await addReaction(messageId, emoji)
      if (!result.ok) {
        console.error('Reaction failed:', result.error)
        onChange?.()
      } else {
        // Tell parent to re-fetch so the new reaction shows up
        onChange?.()
      }
    })
  }

  return (
    <div className="flex gap-1 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-lg">
      {AVAILABLE_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => handlePick(emoji)}
          className="rounded-lg p-2 text-xl hover:bg-white/10 transition"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}