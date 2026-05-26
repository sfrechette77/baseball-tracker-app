'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  orgSlug: string
  orgName: string
}

export function SignupForm({ orgSlug, orgName }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignUp = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          `/o/${orgSlug}/signup/complete`
        )}`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, browser is redirected to Google. No further code runs here.
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleSignUp}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 rounded-md bg-white text-black font-medium py-2.5 px-4 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
        </svg>
        {loading ? 'Redirecting…' : `Sign up with Google`}
      </button>
      <p className="text-[10px] text-slate-500 text-center">
        Signing up for {orgName}
      </p>
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  )
}