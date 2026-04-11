'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type EventRow = {
  id: string
  title: string
  opponent: string | null
  starts_at: string
  status: string
  notes: string | null
  team_score: number | null
  opponent_score: number | null
  result: string | null
}

function getScoreDisplay(event: EventRow) {
  if (event.team_score === null || event.opponent_score === null) {
    return null
  }

  const scoreText = `${event.team_score}–${event.opponent_score}`

  if (event.result === 'win') {
    return { text: `W ${scoreText}`, className: 'text-green-600' }
  }

  if (event.result === 'loss') {
    return { text: `L ${scoreText}`, className: 'text-red-600' }
  }

  if (event.result === 'tie') {
    return { text: `T ${scoreText}`, className: 'text-slate-600' }
  }

  return { text: scoreText, className: 'text-slate-900' }
}

export default function EventPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadEvent = async () => {
      const supabase = createClient()

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      setEvent(data)
      setLoading(false)
    }

    if (eventId) loadEvent()
  }, [eventId])

  if (loading) {
    return <div>Loading...</div>
  }

  if (!event) {
    return <div>Event not found</div>
  }

  const score = getScoreDisplay(event)
  const eventDate = new Date(event.starts_at)

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">

        <Link
          href="/schedule"
          className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
        >
          ← Back to Schedule
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl">

          {/* HEADER */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
              Event Details
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              {event.title}
            </h1>
          </div>

          <div className="p-4 space-y-4">

            {/* 🔥 SCORE BLOCK */}
            {score && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className={`text-3xl font-bold ${score.className}`}>
                  {score.text}
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {event.opponent
                    ? `vs ${event.opponent}`
                    : 'Game'}
                </p>
              </div>
            )}

            {/* BASIC INFO */}
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-600">
                {eventDate.toLocaleString()}
              </p>

              {event.opponent && (
                <p className="mt-1 text-sm text-slate-600">
                  Opponent: {event.opponent}
                </p>
              )}

              <p className="mt-1 text-sm text-slate-600">
                Status: {event.status}
              </p>
            </div>

            {/* NOTES */}
            {event.notes && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Notes
                </p>

                <p className="mt-2 text-sm text-slate-700">
                  {event.notes}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  )
}