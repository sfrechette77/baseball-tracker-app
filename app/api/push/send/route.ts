import { NextRequest, NextResponse } from 'next/server'
import { sendPushToTeam } from '@/lib/push/send'

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