import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only allow same-origin relative paths. Rejects:
//   - Anything not starting with '/'
//   - Protocol-relative URLs ('//evil.com')
//   - Backslash tricks ('/\evil.com')
function safeNext(value: string | null): string {
  if (!value) return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — bounce to login with error context
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
