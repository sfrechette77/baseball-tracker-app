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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Parent signup must continue to its org-scoped completion route.
      // All other brand-new users with no memberships enter organization setup.
      const isOrgSignupNext =
        /^\/o\/[^/]+\/signup(\/|$)/.test(next)

      const isStaffInvitationNext =
        /^\/staff-invite(?:\?|$)/.test(next)

      if (
        data.user &&
        !isOrgSignupNext &&
        !isStaffInvitationNext
      ) {
        const { data: memberships, error: membershipError } = await supabase
          .from('memberships')
          .select('id')
          .eq('user_id', data.user.id)
          .limit(1)

        if (
          !membershipError &&
          (!memberships || memberships.length === 0)
        ) {
          return NextResponse.redirect(`${publicOrigin}/setup`)
        }
      }

      return NextResponse.redirect(`${publicOrigin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${publicOrigin}/login?error=auth_failed`
  )
}
