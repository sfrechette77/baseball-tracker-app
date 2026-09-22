'use server'

import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function invitationErrorCode(message: string): string {
  if (message.includes('email address that received')) {
    return 'email_mismatch'
  }

  if (message.includes('expired')) {
    return 'expired'
  }

  if (message.includes('revoked')) {
    return 'revoked'
  }

  if (message.includes('already been accepted')) {
    return 'already_accepted'
  }

  if (message.includes('not found')) {
    return 'not_found'
  }

  if (
    message.includes('no team assignments') ||
    message.includes('invalid team assignment')
  ) {
    return 'invalid_assignment'
  }

  return 'accept_failed'
}

function invitationPath(
  token: string,
  error?: string
): string {
  const params = new URLSearchParams({
    token,
  })

  if (error) {
    params.set('error', error)
  }

  return `/staff-invite?${params.toString()}`
}

export async function signOutStaffInvitation(
  token: string,
  _formData: FormData
): Promise<void> {
  const normalizedToken = token.trim()
  const supabase = await createClient()

  await supabase.auth.signOut()

  if (!/^[A-Za-z0-9_-]{43}$/.test(normalizedToken)) {
    redirect('/staff-invite?error=invalid_token')
  }

  redirect(invitationPath(normalizedToken))
}

export async function acceptStaffInvitation(
  token: string,
  _formData: FormData
): Promise<void> {
  const normalizedToken = token.trim()

  if (
    !normalizedToken ||
    !/^[A-Za-z0-9_-]{43}$/.test(normalizedToken)
  ) {
    redirect('/staff-invite?error=invalid_token')
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    const next = invitationPath(normalizedToken)

    redirect(
      `/login?next=${encodeURIComponent(next)}`
    )
  }

  const tokenHash = createHash('sha256')
    .update(normalizedToken)
    .digest('hex')

  const { data, error } = await supabase.rpc(
    'accept_staff_invitation',
    {
      p_token_hash: tokenHash,
    }
  )

  if (error) {
    redirect(
      invitationPath(
        normalizedToken,
        invitationErrorCode(error.message)
      )
    )
  }

  if (!data || data.length === 0) {
    redirect(
      invitationPath(
        normalizedToken,
        'accept_failed'
      )
    )
  }

  redirect('/staff-invite?accepted=1')
}
