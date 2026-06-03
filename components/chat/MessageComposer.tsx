'use client'

import { useRef, useState, useTransition } from 'react'
import { sendMessage } from '../../app/actions/chat'
import { useActiveOrg } from '@/components/org-context'

const MAX_BODY_LENGTH = 2000
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

type Props = {
  teamId: string
  // Called after a successful send so the parent can re-fetch / scroll to bottom
  onSent?: () => void
}

export function MessageComposer({ teamId, onSent }: Props) {
  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  const canSend = (body.trim().length > 0 || imageFile !== null) && !isPending

  // Auto-resize the textarea up to a max height
  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)
    setError(null)
    requestAnimationFrame(autoResize)
  }

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Image too large (max 5MB)')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setError(null)
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = () => {
    if (!canSend) return
    setError(null)

    const formData = new FormData()
    formData.set('teamId', teamId)
    formData.set('body', body.trim())
    if (imageFile) {
      formData.set('image', imageFile)
    }

    startTransition(async () => {
      const result = await sendMessage(formData)
      if (result.ok) {
        setBody('')
        clearImage()
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
        onSent?.()
      } else {
        setError(result.error)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showCharCount = body.length > MAX_BODY_LENGTH - 200

  return (
    <div className="border-t border-white/10 bg-black px-4 py-3">
      {/* Image preview (if attached) */}
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Selected"
            className="max-h-32 rounded-xl border border-white/10"
          />
          <button
            onClick={clearImage}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-slate-800 border border-white/20 text-xs text-white hover:bg-slate-700"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Image picker */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition disabled:opacity-50"
          aria-label="Attach image"
        >
          📷
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={handleImagePick}
          className="hidden"
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          maxLength={MAX_BODY_LENGTH}
          disabled={isPending}
          className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 disabled:opacity-50"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ backgroundColor: brandColor }}
          aria-label="Send"
        >
          {isPending ? '...' : '→'}
        </button>
      </div>

      {/* Char counter (only when close to limit) */}
      {showCharCount && (
        <p className="mt-1 text-right text-[10px] text-slate-500">
          {body.length} / {MAX_BODY_LENGTH}
        </p>
      )}
    </div>
  )
}