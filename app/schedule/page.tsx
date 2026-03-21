'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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
  event_type: 'game' | 'practice' | 'event'
  starts_at: string
  status: string
  fields: {
    name: string | null
  } | null
}

function formatEventDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStatusClasses(status: string) {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-100 text-emerald-700'
    case 'delayed':
      return 'bg-amber-100 text-amber-700'
    case 'canceled':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getTypeClasses(eventType: string) {
  switch (eventType) {
    case 'game':
      return 'bg-blue-100 text-blue-700'
    case 'practice':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export default function SchedulePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState<'all' | 'game' | 'practice'>('all')

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
            fields (
              name
            )
          `)
          .order('starts_at', { ascending: true })

        if (error) {
          setErrorMessage(error.message)
        } else {
          setEvents((data as EventRow[]) ?? [])
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [])

  const filteredEvents =
    filter === 'all'
      ? events
      : events.filter((event) => event.event_type === filter)

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Schedule
          </p>
          <h1 className="mt-2 text-2xl font-bold">Upcoming Events</h1>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              All
            </button>

            <button
              onClick={() => setFilter('game')}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === 'game'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Games
            </button>

            <button
              onClick={() => setFilter('practice')}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === 'practice'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Practices
            </button>
          </div>
        </div>

        {loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Loading schedule...</p>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">Something went wrong</p>
            <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
          </div>
        )}

        {!loading && !errorMessage && filteredEvents.length === 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">No events found.</p>
          </div>
        )}

        {!loading && !errorMessage && filteredEvents.length > 0 && (
          <div className="space-y-3">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{event.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatEventDate(event.starts_at)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                      event.status
                    )}`}
                  >
                    {event.status}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getTypeClasses(
                      event.event_type
                    )}`}
                  >
                    {event.event_type}
                  </span>

                  {event.opponent && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      vs {event.opponent}
                    </span>
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Field
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {event.fields?.name ?? 'No field assigned'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-sm grid-cols-3 gap-2 p-3">
          <Link
            href="/"
            className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700"
          >
            Home
          </Link>
          <Link
            href="/schedule"
            className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Schedule
          </Link>
          <Link
  href="/add-event"
  className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700"
>
  Add Event
</Link>
        </div>
      </nav>
    </main>
  )
}