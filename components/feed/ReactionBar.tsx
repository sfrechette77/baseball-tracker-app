'use client'

import { useState, useTransition } from 'react'
import { addReaction, removeReaction } from '../../app/actions/feed'
import type { ReactionSummary } from '../../app/actions/feed'
import { useActiveOrg } from '@/components/org-context'

export const AVAILABLE_EMOJIS = ['👍', '❤️', '🎉', '⚾', '🔥'] as const

type Props = {
  postId: string
  reactions: ReactionSummary[]
  myReactions: string[]
  onChange?: () => void  // optional callback after a reaction is added/removed
}

export function ReactionBar({ postId, reactions, myReactions, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  // Optimistic state — local copy that updates immediately
  // (server confirms in the background)
  const [localReactions, setLocalReactions] = useState(reactions)
  const [localMyReactions, setLocalMyReactions] = useState(myReactions)

  const handleToggle = (emoji: string) => {
  const alreadyReacted = localMyReactions.includes(emoji)

    // Optimistic update
    if (alreadyReacted) {
      // Remove
      setLocalMyReactions(prev => prev.filter(e => e !== emoji))
      setLocalReactions(prev =>
        prev
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1 } : r)
          .filter(r => r.count > 0)
      )
    } else {
      // Add
      setLocalMyReactions(prev => [...prev, emoji])
      setLocalReactions(prev => {
        const existing = prev.find(r => r.emoji === emoji)
        if (existing) {
          return prev.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r)
        }
        return [...prev, { emoji, count: 1 }]
      })
    }

    // Close picker
    setShowPicker(false)

    // Server call (async, fire-and-forget — RLS handles permission)
    startTransition(async () => {
      const result = alreadyReacted
        ? await removeReaction(postId, emoji)
        : await addReaction(postId, emoji)

      if (!result.ok) {
        // If server failed, revert optimistic update by reloading from parent
        console.error('Reaction failed:', result.error)
        onChange?.()
      }
    })
  }

  // Don't render picker emojis that already have a reaction (they're already shown)
  const pickerOptions = AVAILABLE_EMOJIS.filter(
    e => !localReactions.some(r => r.emoji === e)
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {localReactions.map(r => {
        const isMine = localMyReactions.includes(r.emoji)
        return (
          <button
            key={r.emoji}
            onClick={() => handleToggle(r.emoji)}
            disabled={isPending}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              isMine
                ? 'text-white'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
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
            <span>{r.emoji}</span>
            <span className="tabular-nums">{r.count}</span>
          </button>
        )
      })}

      {pickerOptions.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowPicker(prev => !prev)}
            className="flex items-center justify-center rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10 transition"
          >
            +
          </button>
          {showPicker && (
            <div className="absolute bottom-full left-0 mb-2 z-10 flex gap-1 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-lg">
              {pickerOptions.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleToggle(emoji)}
                  className="rounded-lg p-2 text-xl hover:bg-white/10 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}