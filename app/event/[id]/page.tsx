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
    throw new Error('Missing Supabase env vars')
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
  ].filter(Boolean).join(', ')
}

function formatStatus(status: string) {
  if (!status) return 'Unknown'
  return status
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function getStatusBadgeClasses(status: string) {
  const s = status.toLowerCase()
  if (s.includes('cancel')) return 'bg-red-100 text-red-700 border border-red-200'
  if (s.includes('postpon')) return 'bg-amber-100 text-amber-700 border border-amber-200'
  if (s.includes('complete') || s.includes('final'))
    return 'bg-green-100 text-green-700 border border-green-200'
  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

function DetailCard({ label, children }: { label: string; children: React.ReactNode }) {
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
      const supabase = createClient()

      const { data } = await supabase
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

      if (data) {
        setEvent(normalizeEvent(data as RawEventRow))
      }

      setLoading(false)
    }

    if (eventId) loadEvent()
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
    ? event.gear_notes.split(',').map(i => i.trim()).filter(Boolean)
    : []

  if (loading) {
    return <main className="p-4">Loading...</main>
  }

  if (!event || !eventTime) {
    return <main className="p-4">Event not found</main>
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24">
      <div className="mx-auto max-w-md space-y-4">

        <Link href="/schedule" className="text-sm">
          ← Back to Schedule
        </Link>

        <div className="bg-white rounded-3xl shadow p-4 space-y-4">

          <div>
            <h1 className="text-xl font-bold">{event.title}</h1>
            <p>{formatChicagoDateTime(eventTime)}</p>
          </div>

          {/* NO EDIT BUTTON */}

          {directionsUrl && (
            <a href={directionsUrl} target="_blank">
              Open Directions
            </a>
          )}

          <DetailCard label="Field">
            <p>{field?.name}</p>
            <p>{address}</p>
          </DetailCard>

          <DetailCard label="Notes">
            <p>{event.notes || 'None'}</p>
          </DetailCard>

          <DetailCard label="Gear">
            {gearList.map(g => <p key={g}>{g}</p>)}
          </DetailCard>

        </div>
      </div>
    </main>
  )
}