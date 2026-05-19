import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID keys')
  }
  webpush.setVapidDetails(
    // Subject: contact info for push service operators. Convention is mailto: or https://
    'mailto:steve.frechette@gmail.com',
    publicKey,
    privateKey
  )
}

type SubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD
  const body = await req.json()
  const { password, teamId, title, message, url } = body

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!teamId) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 })
  }

  try {
    configureWebPush()

    const supabase = getSupabase()

    // Fetch all active subscriptions for this team
    const { data: subs, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('team_id', teamId)

    if (fetchError) {
      return NextResponse.json({ error: `Failed loading subscriptions: ${fetchError.message}` }, { status: 500 })
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: 'No subscribers for this team' })
    }

    const payload = JSON.stringify({
      title,
      body: message ?? '',
      url: url ?? '/',
      tag: 'broadcast',
    })

    // Send to each subscription in parallel.
    // Track which ones fail with 404/410 so we can clean them up (expired/unregistered).
    const expiredIds: string[] = []
    let successCount = 0
    let failureCount = 0

    await Promise.all(
      subs.map(async (sub: SubscriptionRow) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          successCount++
        } catch (err: any) {
          failureCount++
          // 404 = endpoint gone, 410 = subscription expired. Clean up these.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            expiredIds.push(sub.id)
          }
          console.error('Push send failed for', sub.id, err?.statusCode, err?.body ?? err?.message)
        }
      })
    )

    // Mark last_pushed_at for successful sends
    if (successCount > 0) {
      await supabase
        .from('push_subscriptions')
        .update({ last_pushed_at: new Date().toISOString() })
        .eq('team_id', teamId)
    }

    // Clean up expired subscriptions
    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds)
    }

    return NextResponse.json({
      ok: true,
      sent: successCount,
      failed: failureCount,
      cleanedUp: expiredIds.length,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
