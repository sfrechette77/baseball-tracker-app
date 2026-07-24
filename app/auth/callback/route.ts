import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeNext(value: string | null): string {
  if (!value) return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null
}

function getPublicOrigin(request: Request): string {
  const requestUrl = new URL(request.url)

  const forwardedHost = firstHeaderValue(
    request.headers.get('x-forwarded-host')
  )

  const forwardedProto = firstHeaderValue(
    request.headers.get('x-forwarded-proto')
  )

  const host =
    forwardedHost ??
    firstHeaderValue(request.headers.get('host'))

  if (!host) {
    return requestUrl.origin
  }

  const protocol =
    forwardedProto ??
    requestUrl.protocol.replace(':', '')

  return `${protocol}://${host}`
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const publicOrigin = getPublicOrigin(request)

  const code = requestUrl.searchParams.get('code')
  const next = safeNext(requestUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${publicOrigin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${publicOrigin}/login?error=auth_failed`
  )
}
