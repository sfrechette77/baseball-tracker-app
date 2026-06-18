'use client'

import { useState, useRef, useTransition } from 'react'
import { createPost } from '../../app/actions/feed'
import { useActiveOrg } from '@/components/org-context'

type Props = {
  teamId: string
  onPosted?: () => void
}

const MAX_BODY_LENGTH = 2000
const MAX_IMAGE_SIZE_MB = 5

export function Composer({ teamId, onPosted }: Props) {
  const [body, setBody] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setImage(null)
      setImagePreview(null)
      return
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`Image too large (max ${MAX_IMAGE_SIZE_MB}MB)`)
      return
    }

    setError(null)
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleRemoveImage = () => {
    setImage(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = () => {
    const trimmed = body.trim()
    if (!trimmed) {
      setError('Post cannot be empty')
      return
    }
    if (trimmed.length > MAX_BODY_LENGTH) {
      setError(`Post too long (max ${MAX_BODY_LENGTH} chars)`)
      return
    }

    setError(null)

    const formData = new FormData()
    formData.append('teamId', teamId)
    formData.append('body', trimmed)
    if (image) formData.append('image', image)

    startTransition(async () => {
      const result = await createPost(formData)
      if (result.ok) {
        // Reset composer
        setBody('')
        handleRemoveImage()
        onPosted?.()
      } else {
        setError(result.error)
      }
    })
  }

  const charCount = body.length
  const charCountColor = charCount > MAX_BODY_LENGTH ? 'text-red-400'
    : charCount > MAX_BODY_LENGTH * 0.9 ? 'text-amber-400'
    : 'text-slate-500'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onFocus={e => {
          e.currentTarget.style.borderColor = brandColor
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = ''
        }}
        placeholder="Post an update to the team…"
        rows={3}
        disabled={isPending}
        className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
      />

      {imagePreview && (
        <div className="mt-3 relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt=""
            className="max-h-40 rounded-lg border border-white/10"
          />
          <button
            onClick={handleRemoveImage}
            disabled={isPending}
            className="absolute top-1 right-1 rounded-full bg-black/70 w-6 h-6 flex items-center justify-center text-white text-xs hover:bg-black"
            aria-label="Remove image"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handleImageChange}
              disabled={isPending}
              className="hidden"
            />
            📷 Photo
          </label>
          <span className={`text-xs tabular-nums ${charCountColor}`}>
            {charCount}/{MAX_BODY_LENGTH}
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isPending || !body.trim() || charCount > MAX_BODY_LENGTH}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
          style={{ backgroundColor: brandColor }}
        >
          {isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}