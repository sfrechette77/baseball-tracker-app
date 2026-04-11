'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { getPrimaryField, normalizeFieldRelation } from '@/lib/fieldRelation'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
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

type WeatherByField = Record<
  string,
  {
    rainChance: number | null
    temperature: number | null
  }
>

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
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatChicagoTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatChicagoShortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function getChicagoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric'
  }).formatToParts(date)

  const getPart = (type: string) =>
    parts.find(part => part.type === type)?.value ?? ''

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: Number(getPart('hour'))
  }
}

function isSameChicagoDay(a: Date, b: Date) {
  const aParts = getChicagoDateParts(a)
  const bParts = getChicagoDateParts(b)

  return (
    aParts.year === bParts.year &&
    aParts.month === bParts.month &&
    aParts.day === bParts.day
  )
}

function getUrgency(
  eventTime: Date,
  travelMinutes: number | null,
  now: Date
): { text: string | null; className: string; leaveTime: Date | null } {
  if (travelMinutes === null) {
    return { text: null, className: 'text-slate-700', leaveTime: null }
  }

  const leaveMinutes = travelMinutes + 45
  const leaveTime = new Date(eventTime.getTime() - leaveMinutes * 60000)
  const msUntilLeave = leaveTime.getTime() - now.getTime()
  const minsUntilLeave = Math.floor(msUntilLeave / 60000)

  if (minsUntilLeave < 0) {
    return { text: '🔴 Leave now', className: 'text-red-600', leaveTime }
  }

  if (minsUntilLeave <= 15) {
    return { text: '🟡 Time to get ready', className: 'text-amber-600', leaveTime }
  }

  return { text: '🟢 Plenty of time', className: 'text-green-600', leaveTime }
}

function getCountdownParts(eventTime: Date, now: Date) {
  const diff = eventTime.getTime() - now.getTime()

  return {
    days: Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24))),
    hours: Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24)),
    minutes: Math.max(0, Math.floor((diff / (1000 * 60)) % 60)),
    seconds: Math.max(0, Math.floor((diff / 1000) % 60))
  }
}

function getScoreDisplay(event: EventRow) {
  if (event.team_score === null || event.opponent_score === null) {
    return null
  }

  const scoreText = `${event.team_score}–${event.opponent_score}`

  if (event.result === 'win') return { text: `W ${scoreText}`, className: 'text-green-600' }
  if (event.result === 'loss') return { text: `L ${scoreText}`, className: 'text-red-600' }
  if (event.result === 'tie') return { text: `T ${scoreText}`, className: 'text-slate-600' }

  return { text: scoreText, className: 'text-slate-700' }
}

function EventCard({
  event,
  weather,
  now,
  featured = false
}: {
  event: EventRow
  weather?: { rainChance: number | null; temperature: number | null }
  now: Date
  featured?: boolean
}) {
  const eventTime = new Date(event.starts_at)
  const field = getPrimaryField(event.fields)
  const address = formatAddress(field)
  const directionsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : ''
  const gearList = event.gear_notes
    ? event.gear_notes.split(',').map(g => g.trim()).filter(Boolean)
    : []

  const countdown = getCountdownParts(eventTime, now)
  const urgency = getUrgency(eventTime, event.travel_minutes, now)
  const score = getScoreDisplay(event)
  const isCompleted = score !== null

  const chicagoNow = new Date()
  const isGameDay = isSameChicagoDay(eventTime, chicagoNow)
  const eventChicagoHour = getChicagoDateParts(eventTime).hour
  const isTonight = isGameDay && eventChicagoHour >= 4

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      {featured && (
        <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Next Up
        </p>
      )}

      <h2 className="text-xl font-semibold text-slate-900">
        {event.title}
      </h2>

      <p className="mt-1 text-sm text-slate-600">
        {formatChicagoDateTime(eventTime)}
      </p>

      {event.opponent && (
        <p className="mt-1 text-sm text-slate-600">
          Opponent: {event.opponent}
        </p>
      )}

      {score && (
        <p className={`mt-2 text-lg font-bold ${score.className}`}>
          {score.text}
        </p>
      )}

      {/* ❌ Hide countdown if completed */}
      {!isCompleted && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-xl font-bold">{countdown.days}</p>
            <p className="text-xs text-slate-500">Days</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-xl font-bold">{countdown.hours}</p>
            <p className="text-xs text-slate-500">Hours</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-xl font-bold">{countdown.minutes}</p>
            <p className="text-xs text-slate-500">Minutes</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-xl font-bold">{countdown.seconds}</p>
            <p className="text-xs text-slate-500">Seconds</p>
          </div>
        </div>
      )}

      {!isCompleted && event.travel_minutes !== null && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">
            🚗 {event.travel_minutes} minutes
          </p>

          {urgency.text && (
            <p className={`mt-1 text-sm font-semibold ${urgency.className}`}>
              {urgency.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [lastGame, setLastGame] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const nowIso = new Date().toISOString()

      const { data } = await supabase
        .from('events')
        .select('*')
        .gte('starts_at', nowIso)
        .order('starts_at', { ascending: true })
        .limit(3)

      setEvents((data ?? []) as EventRow[])

      const { data: last } = await supabase
        .from('events')
        .select('*')
        .not('result', 'is', null)
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (last) setLastGame(last as EventRow)

      setLoading(false)
    }

    loadData()
  }, [])

  // ✅ RECORD CALCULATION
  const record = useMemo(() => {
    const all = [...events, ...(lastGame ? [lastGame] : [])]

    return all.reduce(
      (acc, e) => {
        if (e.result === 'win') acc.wins++
        else if (e.result === 'loss') acc.losses++
        else if (e.result === 'tie') acc.ties++
        return acc
      },
      { wins: 0, losses: 0, ties: 0 }
    )
  }, [events, lastGame])

  if (loading) return <div>Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-sm">

        {/* HEADER */}
        <div className="bg-slate-900 text-white p-5 rounded-t-3xl">
          <h1 className="text-2xl font-bold">
            Chicago Elite 11U - Moore
          </h1>

          {/* 🔥 NEW RECORD */}
          <p className="mt-1 text-sm text-slate-300">
            Record: {record.wins}–{record.losses}–{record.ties}
          </p>
        </div>

        <div className="space-y-4 p-4 bg-white rounded-b-3xl">

          {/* LAST GAME */}
          {lastGame && (
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-xs text-slate-500">Last Game</p>

              <p className="text-xl font-bold">
                {getScoreDisplay(lastGame)?.text}
              </p>
            </div>
          )}

          {/* UPCOMING */}
          {events.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              now={now}
              featured={i === 0}
            />
          ))}

          <Link href="/schedule" className="block text-center">
            Schedule
          </Link>
        </div>
      </div>
    </main>
  )
}