import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { teamId, subscription, userAgent } = body

    if (!teamId) {
      return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Upsert keyed on (team_id, endpoint) — if this device already subscribed
    // for this team, update the keys (they can rotate); otherwise insert new.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        team_id: teamId,
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
      return NextResponse.json({ error: 'Missing teamId or endpoint' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('team_id', teamId)
      .eq('endpoint', endpoint)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
