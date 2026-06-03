// Reusable push notification sender.
//
// Sends a Web Push notification to every subscription registered for a team.
// Cleans up expired subscriptions (404/410) as it goes.
//
// Uses the Supabase service key, so it bypasses RLS. Callers are responsible
// for permission checks BEFORE calling this (e.g. RLS on team_posts has
// already verified the caller can post to this team).

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export type PushPayload = {
  title: string
  body?: string
  url?: string
  tag?: string
}

export type PushResult = {
  sent: number
  failed: number
  cleanedUp: number
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
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

/**
 * Send a push notification to every subscriber of a team.
 *
 * @param teamId  - the team whose subscribers should receive the push
 * @param payload - notification content (title required, body/url/tag optional)
 * @returns       - counts of successful sends, failures, and cleaned-up subs
 */
export async function sendPushToTeam(
  teamId: string,
  payload: PushPayload
): Promise<PushResult> {
  configureWebPush()
  const supabase = getSupabase()

  // Fetch all active subscriptions for this team, joining membership so we can
  // filter out users who have muted this team's chat.
  const { data: subs, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, membership_id, memberships ( muted_chats )')
    .eq('team_id', teamId)

  if (fetchError) {
    throw new Error(`Failed loading subscriptions: ${fetchError.message}`)
  }

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, cleanedUp: 0 }
  }

  // Filter out subscriptions whose owner has muted this team's chat.
  // Subscriptions without a membership_id (legacy / no link) pass through unfiltered.
  const filteredSubs = subs.filter((sub: any) => {
    const muted = sub.memberships?.muted_chats as string[] | undefined
    if (!muted) return true
    return !muted.includes(teamId)
  })

  if (filteredSubs.length === 0) {
    return { sent: 0, failed: 0, cleanedUp: 0 }
  }

  const payloadJson = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/',
    tag: payload.tag ?? 'broadcast',
  })

  const expiredIds: string[] = []
  let successCount = 0
  let failureCount = 0

  await Promise.all(
    filteredSubs.map(async (sub: SubscriptionRow) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadJson
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

  return {
    sent: successCount,
    failed: failureCount,
    cleanedUp: expiredIds.length,
  }
}