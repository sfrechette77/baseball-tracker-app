'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
  id: string
  name: string | null
  address_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

type EventRow = {
  id: string
  title: string
  opponent: string | null
  starts_at: string
  status: string
  notes: string | null
  gear_notes: string | null
  travel_minutes: number | null
  travel_miles: number | null
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

function formatAddress(field: FieldRow | null) {
  return [
    field?.address_line,
    field?.city,
    field?.state,
    field?.postal_code
  ]
    .filter(Boolean)
    .join(', ')
}

function formatChicagoDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
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

  const team = event.team_score
  const opp = event.opponent_score
  const high = Math.max(team, opp)
  const low = Math.min(team, opp)

  if (event.result === 'win') {
    return { text: `W ${team}–${opp}`, className: 'text-green-600' }
  }

  if (event.result === 'loss') {
    return { text: `L ${high}–${low}`, className: 'text-red-600' }
  }

  if (event.result === 'tie') {
    return { text: `T ${team}–${opp}`, className: 'text-slate-600' }
  }

  return { text: `${team}–${opp}`, className: 'text-slate-700' }
}

export default function EventPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const supabase = createClient()

        const { data, error } = await supabase
          .from('events')
          .select(`
            id,
            title,
            opponent,
            starts_at,
            status,
            notes,
            gear_notes,
            travel_minutes,
            travel_miles,
            team_score,
            opponent_score,
            result,
            fields (
              id,
              name,
              address_line,
              city,
              state,
              postal_code
            )
          `)
          .eq('id', eventId)
          .single()

        if (error) {
          console.error('Error loading event:', error)
          setEvent(null)
        } else if (data) {
          setEvent(normalizeEvent(data as RawEventRow))
        }
      } catch (err) {
        console.error('Unexpected error loading event:', err)
        setEvent(null)
      } finally {
        setLoading(false)
      }
    }

    if (eventId) {
      loadEvent()
    }
  }, [eventId])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          Loading event...
        </div>
      </main>
    )
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md space-y-4">
          <Link
            href="/schedule"
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back to Schedule
          </Link>

          <div className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
            Event not found
          </div>
        </div>
      </main>
    )
  }

  const eventTime = new Date(event.starts_at)
  const field = getPrimaryField(event.fields)
  const address = formatAddress(field)
  const directionsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : ''
  const score = getScoreDisplay(event)
  const gearList = event.gear_notes
    ? event.gear_notes.split(',').map(item => item.trim()).filter(Boolean)
    : []

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex gap-3">
          <Link
            href="/schedule"
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back to Schedule
          </Link>

          <Link
            href={`/edit-event/${event.id}`}
            className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Edit Event
          </Link>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
              Event Details
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              {event.title}
            </h1>

            <p className="mt-3 text-sm text-slate-200">
              {formatChicagoDateTime(eventTime)}
            </p>
          </div>

          <div className="space-y-4 p-4">
            {score && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className={`text-3xl font-bold ${score.className}`}>
                  {score.text}
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {event.opponent ? `vs ${event.opponent}` : 'Final'}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {event.opponent && (
                    <p className="text-sm text-slate-700">
                      Opponent: {event.opponent}
                    </p>
                  )}
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(event.status)}`}
                >
                  {formatStatus(event.status)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Field
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-900">
                {field?.name ?? 'Field TBD'}
              </p>

              <p className="text-sm text-slate-600">
                {address || 'Address not available'}
              </p>

              {address && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Open Directions
                </a>
              )}
            </div>

            {event.travel_minutes !== null && !score && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Travel Time
                </p>

                <p className="mt-2 text-sm text-slate-700">
                  🚗 {event.travel_minutes} minutes
                  {event.travel_miles !== null ? ` • ${event.travel_miles} miles` : ''}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Gear Checklist
              </p>

              {gearList.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {gearList.map(item => (
                    <p key={item} className="text-sm text-slate-700">
                      ⚾ {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No gear notes added
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Notes
              </p>

              <p className="mt-2 text-sm text-slate-700">
                {event.notes || 'No notes added'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}