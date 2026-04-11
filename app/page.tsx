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
const FORECAST_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000
const FORECAST_LOOKAHEAD_MS = 5 * 24 * 60 * 60 * 1000

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

type WeatherForecastRow = {
  field_id: string
  forecast_time: string
  rain_probability: number | null
  temperature: number | null
}

type WeatherSummary = {
  rainChance: number | null
  temperature: number | null
}

type WeatherByEvent = Record<string, WeatherSummary>

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
) {
  if (travelMinutes === null) {
    return { text: null, className: '', leaveTime: null }
  }

  const leaveMinutes = travelMinutes + 45
  const leaveTime = new Date(eventTime.getTime() - leaveMinutes * 60000)
  const minsUntilLeave = Math.floor((leaveTime.getTime() - now.getTime()) / 60000)

  if (minsUntilLeave < 0) return { text: '🔴 Leave now', className: 'text-red-600', leaveTime }
  if (minsUntilLeave <= 15) return { text: '🟡 Time to get ready', className: 'text-amber-600', leaveTime }

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

function getClosestForecast(eventStartsAt: string, forecasts: WeatherForecastRow[]): WeatherSummary {
  if (!forecasts.length) return { rainChance: null, temperature: null }

  const eventTime = new Date(eventStartsAt).getTime()

  const closest = forecasts.reduce((best, current) => {
    if (!best) return current

    const bestDiff = Math.abs(new Date(best.forecast_time).getTime() - eventTime)
    const currentDiff = Math.abs(new Date(current.forecast_time).getTime() - eventTime)

    return currentDiff < bestDiff ? current : best
  }, forecasts[0])

  const diff = Math.abs(new Date(closest.forecast_time).getTime() - eventTime)

  if (diff > FORECAST_MATCH_WINDOW_MS) {
    return { rainChance: null, temperature: null }
  }

  return {
    rainChance: closest.rain_probability != null ? Math.round(closest.rain_probability * 100) : null,
    temperature: closest.temperature != null ? Math.round(closest.temperature) : null
  }
}

function EventCard({ event, weather, now }: any) {
  const eventTime = new Date(event.starts_at)
  const field = getPrimaryField(event.fields)
  const address = formatAddress(field)

  return (
    <div className="rounded-3xl border p-4 bg-white">
      <h2 className="font-bold">{event.title}</h2>

      <p>{formatChicagoDateTime(eventTime)}</p>

      {/* ✅ FIXED WEATHER BLOCK */}
      {weather && (weather.rainChance !== null || weather.temperature !== null) && (
        <div className="mt-4 border p-3 rounded-xl">
          {weather.rainChance !== null && (
            weather.rainChance > 40 ? (
              <p>⚠ Rain Risk – {weather.rainChance}%</p>
            ) : (
              <p>☀ Weather Looks Good – {weather.rainChance}%</p>
            )
          )}

          {weather.temperature !== null && (
            <p>{weather.temperature}°F</p>
          )}
        </div>
      )}

      <p>{field?.name}</p>
      <p>{address}</p>
    </div>
  )
}

export default function HomePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [weatherByEvent, setWeatherByEvent] = useState<WeatherByEvent>({})
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const nowIso = new Date().toISOString()

      const { data } = await supabase
        .from('events')
        .select('*, fields(*)')
        .gte('starts_at', nowIso)
        .limit(3)

      const normalized = (data as RawEventRow[]).map(normalizeEvent)
      setEvents(normalized)

      const fieldIds = normalized
        .map(e => getPrimaryField(e.fields)?.id)
        .filter(Boolean)

      const { data: forecasts } = await supabase
        .from('weather_forecasts')
        .select('*')
        .in('field_id', fieldIds)

      const map: WeatherByEvent = {}

      normalized.forEach(event => {
        const fieldId = getPrimaryField(event.fields)?.id
        if (!fieldId) return

        const fieldForecasts = forecasts?.filter(f => f.field_id === fieldId) ?? []

        map[event.id] = getClosestForecast(event.starts_at, fieldForecasts)
      })

      setWeatherByEvent(map)
      setLoading(false)
    }

    loadData()
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <main className="p-4">
      {events.map(event => (
        <EventCard
          key={event.id}
          event={event}
          weather={weatherByEvent[event.id]}
          now={now}
        />
      ))}
    </main>
  )
}