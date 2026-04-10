'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  id?: string
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatAddress(field: FieldRow | null | undefined) {
  if (!field) return ''

  return [
    field.address_line,
    field.city,
    field.state,
    field.postal_code
  ]
    .filter(Boolean)
    .join(', ')
}

function formatStatus(status: string) {
  if (!status) return 'Unknown'

  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getStatusBadgeClasses(status: string) {
  const normalized = status.toLowerCase()

  if (normalized.includes('cancel')) {
    return 'bg-red-100 text-red-700 border border-red-200'
  }

  if (normalized.includes('postpon')) {
    return 'bg-amber-100 text-amber-700 border border-amber-200'
  }

  if (normalized.includes('complete') || normalized.includes('final')) {
    return 'bg-green-100 text-green-700 border border-green-200'
  }

  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

function DetailCard({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

export default function EventPage() {
  const params = useParams()
  const eventId = params?.id as string

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

        if (error || !data) {
          console.error('Error loading event:', error)
          setEvent(null)
          setLoading(false)
          return
        }

        setEvent(normalizeEvent(data as RawEventRow))
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

  const eventTime = useMemo(
    () => (event ? new Date(event.starts_at) : null),
    [event]
  )

  const field = useMemo(
    () => getPrimaryField(event?.fields),
    [event]
  )

  const address = useMemo(
    () => formatAddress(field),
    [field]
  )

  const directionsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : ''

  const gearList = event?.gear_notes
    ? event.gear_notes
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Loading event...</p>
          </div>
        </div>
      </main>
    )
  }

  if (!event || !eventTime) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md space-y-4">
          <Link
            href="/schedule"
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            ← Back to Schedule
          </Link>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Event not found
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              This event may have been removed or the link may be incorrect.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <Link
          href="/schedule"
          className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back to Schedule
        </Link>

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

            {event.opponent && (
              <p className="mt-1 text-sm text-slate-200">
                vs {event.opponent}
              </p>
            )}

            <div className="mt-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(event.status)}`}
              >
                {formatStatus(event.status)}
              </span>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link

              {directionsUrl ? (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Open Directions
                </a>
              ) : (
                <div className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-400">
                  Directions Unavailable
                </div>
              )}
            </div>

            <DetailCard label="Game Info">
              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Date & Time:</span>{' '}
                  {formatChicagoDateTime(eventTime)}
                </p>

                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Opponent:</span>{' '}
                  {event.opponent || 'Not listed'}
                </p>

                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Status:</span>{' '}
                  {formatStatus(event.status)}
                </p>
              </div>
            </DetailCard>

            <DetailCard label="Field">
              <p className="text-base font-semibold text-slate-900">
                {field?.name || 'Field TBD'}
              </p>

              <p className="mt-1 text-sm text-slate-600">
                {address || 'Address not available'}
              </p>

              {directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Open in Maps
                </a>
              )}
            </DetailCard>

            <DetailCard label="Notes">
              <p className="text-sm text-slate-700">
                {event.notes?.trim() || 'No notes added'}
              </p>
            </DetailCard>

            <DetailCard label="Gear Checklist">
              {gearList.length > 0 ? (
                <div className="space-y-2">
                  {gearList.map(item => (
                    <p key={item} className="text-sm text-slate-700">
                      ⚾ {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No gear notes added
                </p>
              )}
            </DetailCard>
          </div>
        </div>
      </div>
    </main>
  )
}