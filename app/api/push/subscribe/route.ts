import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { teamId, membershipId, subscription, userAgent } = body

    if (!teamId) {
      return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
    }

    const authSupabase = await createServerClient()

    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use the authenticated/RLS client to verify the caller can access this team
    // and derive its organization server-side.
    const { data: team, error: teamError } = await authSupabase
      .from('teams')
      .select('id, organization_id')
      .eq('id', teamId)
      .maybeSingle()

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 })
    }

    if (!team?.organization_id) {
      return NextResponse.json(
        { error: 'Team not found or not accessible' },
        { status: 403 }
      )
    }

    // Validate the membership supplied by the client instead of trusting it.
    // If no membershipId was supplied, derive one approved membership for this
    // authenticated user in the team's organization.
    const membershipQuery = authSupabase
      .from('memberships')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', team.organization_id)
      .eq('status', 'approved')

    const { data: membership, error: membershipError } = membershipId
      ? await membershipQuery.eq('id', membershipId).maybeSingle()
      : await membershipQuery.limit(1).maybeSingle()

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 500 }
      )
    }

    if (!membership) {
      return NextResponse.json(
        { error: 'No approved membership for this team organization' },
        { status: 403 }
      )
    }

    const supabase = getSupabase()

    // Upsert keyed on (team_id, endpoint) — if this device already subscribed
    // for this team, update the keys (they can rotate); otherwise insert new.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        organization_id: team.organization_id,
        team_id: teamId,
        membership_id: membership.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent ?? null,
      }, { onConflict: 'team_id,endpoint' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Optionally support DELETE for unsubscribe
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { teamId, endpoint } = body

    if (!teamId || !endpoint) {
      return NextResponse.json(
        { error: 'Missing teamId or endpoint' },
        { status: 400 }
      )
    }

    const authSupabase = await createServerClient()

    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: team, error: teamError } = await authSupabase
      .from('teams')
      .select('id, organization_id')
      .eq('id', teamId)
      .maybeSingle()

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 })
    }

    if (!team?.organization_id) {
      return NextResponse.json(
        { error: 'Team not found or not accessible' },
        { status: 403 }
      )
    }

    const { data: memberships, error: membershipError } = await authSupabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', team.organization_id)
      .eq('status', 'approved')

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 500 }
      )
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: 'No approved membership for this team organization' },
        { status: 403 }
      )
    }

    const membershipIds = memberships.map(membership => membership.id)

    const supabase = getSupabase()

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('organization_id', team.organization_id)
      .eq('team_id', teamId)
      .eq('endpoint', endpoint)
      .in('membership_id', membershipIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
