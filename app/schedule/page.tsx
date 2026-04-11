'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { getPrimaryField, normalizeFieldRelation } from '@/lib/fieldRelation'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'

type FieldRow = {
  name: string | null
}

type EventRow = {
  id: string
  title: string
  opponent: string | null
  event_type: string | null
  starts_at: string
  status: string
  team_score: number | null
  opponent_score: number | null
  result: string | null
  fields: FieldRow[] | null
}

type RawEventRow = Omit<EventRow, 'fields'> & {
  fields: FieldRow | FieldRow[] | null
}

function normalizeEvent(event: RawEventRow): EventRow {
  return {
    ...event,
    fields: normalizeFieldRelation(event.fields)
  }
}

function formatChicagoDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatStatus(status: string) {
  if (!status) return 'Unknown'

  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getStatusClasses(status: string) {
  const normalized = status.toLowerCase()

  if (normalized.includes('cancel')) {
    return 'bg-red-100 text-red-700 border-red-200'
  }

  if (normalized.includes('postpon')) {
    return 'bg-amber-100 text-amber-700 border-amber-200'
  }

  if (normalized.includes('complete') || normalized.includes('final')) {
    return 'bg-green-100 text-green-700 border-green-200'
  }

  return 'bg-slate-100 text-slate-700 border-slate-200'
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

  return { text: scoreText, className: 'text-slate-700' }
}

function formatWinPct(wins: number, losses: number, ties: number) {
  const games = wins + losses + ties

  if (games === 0) {
    return '.000'
  }

  const pct = (wins + ties * 0.5) / games
  return pct.toFixed(3).replace(/^0/, '')
}

export default function SchedulePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const supabase = createClient()

        const { data, error } = await supabase
          .from('events')
          .select(`
            id,
            title,
            opponent,
            event_type,
            starts_at,
            status,
            team_score,
            opponent_score,
            result,
            fields (
              name
            )
          `)
          .order('starts_at', { ascending: true })

        if (error) {
          setErrorMessage(error.message)
        } else {
          const normalizedEvents = ((data ?? []) as RawEventRow[]).map(normalizeEvent)
          setEvents(normalizedEvents)
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [])

  const groupedEvents = useMemo(() => {
    return events.reduce<Record<string, EventRow[]>>((groups, event) => {
      const eventDate = new Date(event.starts_at)
      const dateKey = new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIME_ZONE,
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(eventDate)

      if (!groups[dateKey]) {
        groups[dateKey] = []
      }

      groups[dateKey].push(event)
      return groups
    }, {})
  }, [events])

  const record = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        if (event.result === 'win') acc.wins += 1
        else if (event.result === 'loss') acc.losses += 1
        else if (event.result === 'tie') acc.ties += 1

        return acc
      },
      { wins: 0, losses: 0, ties: 0 }
    )
  }, [events])

  const totalGames = record.wins + record.losses + record.ties
  const winPct = formatWinPct(record.wins, record.losses, record.ties)

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Loading schedule...</p>
        </div>
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md space-y-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back to Home
          </Link>

          <div className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Unable to load schedule
            </h1>
            <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back to Home
        </Link>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
              Team Schedule
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              All Events
            </h1>

            <p className="mt-3 text-sm text-slate-200">
              Full season view with results
            </p>
          </div>

          <div className="space-y-6 p-4">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Team Record
              </p>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="rounded-2xl bg-white p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{record.wins}</p>
                  <p className="text-xs text-slate-500">Wins</p>
                </div>

                <div className="rounded-2xl bg-white p-3 text-center">
                  <p className="text-xl font-bold text-red-600">{record.losses}</p>
                  <p className="text-xs text-slate-500">Losses</p>
                </div>

                <div className="rounded-2xl bg-white p-3 text-center">
                  <p className="text-xl font-bold text-slate-600">{record.ties}</p>
                  <p className="text-xs text-slate-500">Ties</p>
                </div>

                <div className="rounded-2xl bg-white p-3 text-center">
                  <p className="text-xl font-bold text-slate-900">{winPct}</p>
                  <p className="text-xs text-slate-500">Win %</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-600">
                {totalGames === 0
                  ? 'No completed results yet.'
                  : `${totalGames} scored game${totalGames === 1 ? '' : 's'} recorded`}
              </p>
            </section>

            {Object.keys(groupedEvents).length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">No scheduled events.</p>
              </div>
            ) : (
              Object.entries(groupedEvents).map(([dateLabel, dayEvents]) => (
                <section key={dateLabel} className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {dateLabel}
                  </h2>

                  {dayEvents.map(event => {
                    const eventTime = new Date(event.starts_at)
                    const field = getPrimaryField(event.fields)
                    const score = getScoreDisplay(event)

                    return (
                      <Link
                        key={event.id}
                        href={`/event/${event.id}`}
                        className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {event.title}
                            </p>

                            <p className="mt-1 text-sm text-slate-600">
                              {formatChicagoDateTime(eventTime)}
                            </p>

                            {event.opponent && (
                              <p className="mt-1 text-sm text-slate-600">
                                Opponent: {event.opponent}
                              </p>
                            )}

                            {score && (
                              <p className={`mt-1 text-sm font-semibold ${score.className}`}>
                                {score.text}
                              </p>
                            )}

                            {field?.name && (
                              <p className="mt-1 text-sm text-slate-600">
                                📍 {field.name}
                              </p>
                            )}

                            {event.event_type && (
                              <p className="mt-1 text-sm text-slate-500">
                                {event.event_type}
                              </p>
                            )}
                          </div>

                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(event.status)}`}
                          >
                            {formatStatus(event.status)}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}