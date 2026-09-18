import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToTeam } from '@/lib/push/send'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { teamId, title, message, url } = body

  if (!teamId) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  }

  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 })
  }

  const authSupabase = await createServerClient()

  const {
    data: { user },
    error: userError,
  } = await authSupabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient()

  const { data: team, error: teamError } = await admin
    .from('teams')
    .select('id, organization_id')
    .eq('id', teamId)
    .maybeSingle()

  if (teamError || !team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('organization_id', team.organization_id)
    .eq('status', 'approved')
    .in('role', ['org_admin', 'team_admin'])
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: 'You do not have access to this organization' },
      { status: 403 }
    )
  }

  if (membership.role === 'team_admin') {
    const { data: teamAdmin, error: teamAdminError } = await admin
      .from('team_admins')
      .select('id')
      .eq('membership_id', membership.id)
      .eq('team_id', teamId)
      .maybeSingle()

    if (teamAdminError || !teamAdmin) {
      return NextResponse.json(
        { error: 'You do not have access to this team' },
        { status: 403 }
      )
    }
  }

  try {
    const result = await sendPushToTeam(teamId, {
      title,
      body: message,
      url,
      tag: 'broadcast',
    })

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      cleanedUp: result.cleanedUp,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
