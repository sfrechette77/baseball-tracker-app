import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  acceptStaffInvitation,
  signOutStaffInvitation,
} from './actions'

type Props = {
  searchParams: Promise<{
    token?: string
    error?: string
    accepted?: string
  }>
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: 'This invitation link is invalid.',
  email_mismatch:
    'Sign in with the email address that received this invitation.',
  expired: 'This invitation has expired. Ask the organization admin to resend it.',
  revoked: 'This invitation has been revoked.',
  already_accepted: 'This invitation has already been accepted.',
  not_found: 'This invitation could not be found.',
  invalid_assignment:
    'This invitation has an invalid team assignment. Contact the organization admin.',
  accept_failed:
    'The invitation could not be accepted. Please try again.',
}

export default async function StaffInvitePage({
  searchParams,
}: Props) {
  const query = await searchParams

  if (query.accepted === '1') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <h1 className="text-2xl font-extrabold">
            Staff access added
          </h1>
          <p className="mt-3 text-sm text-emerald-100">
            Your team staff invitation was accepted successfully.
          </p>
          <a
            href="/admin"
            className="mt-6 inline-block rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black"
          >
            Open team admin
          </a>
        </div>
      </main>
    )
  }

  const token = query.token?.trim() ?? ''

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <h1 className="text-xl font-extrabold">
            Invitation unavailable
          </h1>
          <p className="mt-3 text-sm text-red-200">
            {ERROR_MESSAGES.invalid_token}
          </p>
        </div>
      </main>
    )
  }

  const tokenHash = createHash('sha256')
    .update(token)
    .digest('hex')

  const admin = createServiceClient()

  const { data: invitation } = await admin
    .from('staff_invitations')
    .select(
      'id, organization_id, email, staff_title, expires_at, accepted_at, revoked_at'
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <h1 className="text-xl font-extrabold">
            Invitation unavailable
          </h1>
          <p className="mt-3 text-sm text-red-200">
            {ERROR_MESSAGES.not_found}
          </p>
        </div>
      </main>
    )
  }

  const [
    { data: organization },
    { data: invitationTeams },
  ] = await Promise.all([
    admin
      .from('organizations')
      .select('name, primary_color')
      .eq('id', invitation.organization_id)
      .maybeSingle(),

    admin
      .from('staff_invitation_teams')
      .select('team_id')
      .eq('invitation_id', invitation.id),
  ])

  const teamIds =
    invitationTeams?.map(row => row.team_id) ?? []

  const { data: teams } = teamIds.length
    ? await admin
        .from('teams')
        .select('id, name')
        .eq('organization_id', invitation.organization_id)
        .eq('is_opponent', false)
        .in('id', teamIds)
        .order('name')
    : { data: [] }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userEmail = user?.email?.trim().toLowerCase() ?? null
  const invitationExpired =
    new Date(invitation.expires_at).getTime() <= Date.now()

  let statusError = query.error ?? null

  if (!statusError && invitation.accepted_at) {
    statusError = 'already_accepted'
  } else if (!statusError && invitation.revoked_at) {
    statusError = 'revoked'
  } else if (!statusError && invitationExpired) {
    statusError = 'expired'
  }

  const emailMismatch =
    Boolean(userEmail) &&
    userEmail !== invitation.email

  const nextPath =
    `/staff-invite?token=${encodeURIComponent(token)}`

  const acceptAction =
    acceptStaffInvitation.bind(null, token)

  const signOutAction =
    signOutStaffInvitation.bind(null, token)

  const brandColor =
    organization?.primary_color ?? '#2563eb'

  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <p
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: brandColor }}
        >
          On Deck Staff Invitation
        </p>

        <h1 className="mt-2 text-2xl font-extrabold">
          Join {organization?.name ?? 'the organization'} team staff
        </h1>

        <div className="mt-5 rounded-xl bg-black/30 p-4 text-sm">
          <p>
            <span className="text-slate-400">Role:</span>{' '}
            {invitation.staff_title || 'Coach / Team Staff'}
          </p>
          <p className="mt-2">
            <span className="text-slate-400">Teams:</span>{' '}
            {teams && teams.length > 0
              ? teams.map(team => team.name).join(', ')
              : 'No teams listed'}
          </p>
          <p className="mt-2">
            <span className="text-slate-400">Invited email:</span>{' '}
            {invitation.email}
          </p>
        </div>

        {statusError && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {ERROR_MESSAGES[statusError] ??
              ERROR_MESSAGES.accept_failed}
          </p>
        )}

        {!statusError && !user && (
          <a
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="mt-5 block w-full rounded-xl py-3 text-center text-sm font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            Sign in with Google to accept
          </a>
        )}

        {!statusError && user && emailMismatch && (
          <div className="mt-5">
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              You are signed in as {userEmail}. Sign in as {invitation.email} to accept this invitation.
            </p>

            <form
              action={signOutAction}
              className="mt-3"
            >
              <button
                type="submit"
                className="w-full rounded-xl border border-white/15 py-3 text-sm font-bold"
              >
                Sign out
              </button>
            </form>
          </div>
        )}

        {!statusError && user && !emailMismatch && (
          <form action={acceptAction} className="mt-5">
            <p className="mb-3 text-xs text-slate-400">
              Signed in as {userEmail}
            </p>
            <button
              type="submit"
              className="w-full rounded-xl py-3 text-sm font-bold text-white"
              style={{ backgroundColor: brandColor }}
            >
              Accept staff invitation
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
