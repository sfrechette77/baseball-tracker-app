'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { getPrimaryField, normalizeFieldRelation } from '@/lib/fieldRelation'
import { EmptyState } from '@/components/EmptyState'
import { useCurrentTeam } from '@/components/team-context'
import { useTeamSeason } from '@/lib/org/useTeamSeason'
import { PushSubscribeButton } from '@/components/push-subscribe-button'
import { BottomNav } from '@/components/BottomNav'
import { EventCardSkeleton, RowSkeleton } from '@/components/Skeleton'
import { useActiveOrg } from '@/components/org-context'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'
const FORECAST_MATCH_WINDOW_MS = 9 * 60 * 60 * 1000
const FORECAST_LOOKAHEAD_MS = 5 * 24 * 60 * 60 * 1000

function getDirectionsUrl(address: string): string {
  if (typeof window === 'undefined') return ''
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isIOS) {
    return `comgooglemaps://?q=${encodeURIComponent(address)}&directionsmode=driving`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

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
  event_type: string | null
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
  display_status: string | null
  status_message: string | null
  status_updated_at: string | null
  arrival_buffer_minutes: number | null
}

type RawEventRow = Omit<EventRow, 'fields' | 'arrival_buffer_minutes'> & {
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

function normalizeEvent(event: RawEventRow, arrivalBufferMinutes: number | null): EventRow {
  return {
    ...event,
    fields: normalizeFieldRelation(event.fields),
    arrival_buffer_minutes: arrivalBufferMinutes
  }
}

function formatAddress(field: FieldRow | null) {
  return [field?.address_line, field?.city, field?.state, field?.postal_code]
    .filter(Boolean).join(', ')
}

function formatChicagoDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(date)
}

function formatChicagoTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE, hour: 'numeric', minute: '2-digit'
  }).format(date)
}

function formatChicagoShortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE, month: 'short', day: 'numeric'
  }).format(date)
}

function getChicagoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric'
  }).formatToParts(date)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    year: getPart('year'), month: getPart('month'),
    day: getPart('day'), hour: Number(getPart('hour'))
  }
}

function isSameChicagoDay(a: Date, b: Date) {
  const ap = getChicagoDateParts(a)
  const bp = getChicagoDateParts(b)
  return ap.year === bp.year && ap.month === bp.month && ap.day === bp.day
}

function getUrgency(eventTime: Date, travelMinutes: number | null, arrivalBufferMinutes: number | null, now: Date) {
  if (travelMinutes === null) return { text: null, className: 'text-slate-700', leaveTime: null }
  const buffer = arrivalBufferMinutes ?? 45
  const leaveMinutes = travelMinutes + buffer
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

function getScoreDisplay(event: EventRow) {
  if (event.team_score === null || event.opponent_score === null) return null
  const team = event.team_score
  const opp = event.opponent_score
  const high = Math.max(team, opp)
  const low = Math.min(team, opp)
  if (event.result === 'win') return { text: `W ${team}–${opp}`, className: 'text-green-500' }
  if (event.result === 'loss') return { text: `L ${high}–${low}`, className: 'text-red-400' }
  if (event.result === 'tie') return { text: `T ${team}–${opp}`, className: 'text-slate-400' }
  return { text: `${team}–${opp}`, className: 'text-slate-300' }
}

function getClosestForecast(eventStartsAt: string, forecasts: WeatherForecastRow[]): WeatherSummary {
  if (!forecasts.length) return { rainChance: null, temperature: null }
  const eventTime = new Date(eventStartsAt).getTime()
  const closest = forecasts.reduce<WeatherForecastRow | null>((best, cur) => {
    if (!best) return cur
    const curDiff = Math.abs(new Date(cur.forecast_time).getTime() - eventTime)
    const bestDiff = Math.abs(new Date(best.forecast_time).getTime() - eventTime)
    return curDiff < bestDiff ? cur : best
  }, null)
  if (!closest) return { rainChance: null, temperature: null }
  if (Math.abs(new Date(closest.forecast_time).getTime() - eventTime) > FORECAST_MATCH_WINDOW_MS)
    return { rainChance: null, temperature: null }
  return {
    rainChance: typeof closest.rain_probability === 'number' ? Math.round(closest.rain_probability * 100) : null,
    temperature: typeof closest.temperature === 'number' ? Math.round(closest.temperature) : null
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

// ─── Status Banner ────────────────────────────────────────────────────────────

function StatusBanner({ event }: { event: EventRow }) {
  if (!event.display_status) return null

  const eventTypeLabel =
  event.event_type === 'practice' ? 'Practice'
  : event.event_type === 'tournament' ? 'Tournament'
  : 'Game'

const config = {
  on: {
    label: `🟢 ${eventTypeLabel} On`,
    cls: 'border-green-500/40 bg-green-500/10 text-green-400',
  },
  watching: {
    label: `🟡 Watching ${eventTypeLabel}`,
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  },
  off: {
    label: `🔴 ${eventTypeLabel} Off`,
    cls: 'border-red-500/40 bg-red-500/10 text-red-400',
  },
}[event.display_status as 'on' | 'watching' | 'off']

  if (!config) return null

  return (
    <div className={`rounded-2xl border-2 p-4 ${config.cls.split(' ').slice(0, 2).join(' ')}`}>
      <p className={`font-bold ${config.cls.split(' ').slice(2).join(' ')}`}>{config.label}</p>
      {event.status_message && (
        <p className="mt-1 text-sm text-slate-300">{event.status_message}</p>
      )}
      {event.status_updated_at && (
        <p className="mt-2 text-xs text-slate-500">
          Updated {formatRelativeTime(new Date(event.status_updated_at))}
        </p>
      )}
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, weather, now, featured = false, brandColor = '#dc2626' }: {
  event: EventRow; weather?: WeatherSummary; now: Date; featured?: boolean; brandColor?: string
}) {
  const eventTime = new Date(event.starts_at)
  const field = getPrimaryField(event.fields)
  const address = formatAddress(field)
  const directionsUrl = address ? getDirectionsUrl(address) : ''
  const gearList = event.gear_notes
    ? event.gear_notes.split(',').map(g => g.trim()).filter(Boolean)
    : []
  const countdown = getCountdownParts(eventTime, now)
  const urgency = getUrgency(eventTime, event.travel_minutes, event.arrival_buffer_minutes, now)
  const score = getScoreDisplay(event)
  const isCompleted = score !== null
  const isGameDay = isSameChicagoDay(eventTime, new Date())
  const isGame = event.event_type === 'game' || event.event_type === 'tournament'
  const isPractice = event.event_type === 'practice'
  const isOff = event.display_status === 'off'
  const eventTypeLabel =
    isPractice ? 'Practice'
    : event.event_type === 'tournament' ? 'Tournament'
    : 'Game'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {featured && (
        <p className="mb-2 text-[10px] uppercase tracking-[0.25em] font-semibold"
          style={{ color: brandColor}}
          >
          ⚾ Next Up
        </p>
      )}

      {featured && isGameDay && isGame ? (
        <div className="rounded-xl bg-white/10 border border-white/20 p-4">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold"
          style={{ color: brandColor }}
          >
            {event.event_type === 'tournament' ? '🏆 Tournament Day' : '⚾ Game Day'}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">Today&apos;s Game</h2>
          <p className="mt-1 text-sm text-slate-300">
            {formatChicagoTime(eventTime)}{event.opponent ? ` vs ${event.opponent}` : ''}
          </p>
          <p className="mt-1 text-sm text-slate-400">{event.title}</p>
          {score && <p className={`mt-2 text-xl font-bold ${score.className}`}>{score.text}</p>}
        </div>
      ) : featured && isGameDay && isPractice ? (
        <div className={`rounded-xl border p-4 ${
          isOff
            ? 'bg-red-500/10 border-red-500/40'
            : 'bg-blue-600/20 border-blue-500/30'
        }`}>
          <p className={`text-xs uppercase tracking-[0.2em] font-semibold ${
            isOff ? 'text-red-300' : 'text-blue-300'
          }`}>
            {isOff ? '🔴 Practice Off' : '🏋️ Practice Day'}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {isOff ? 'Practice Canceled' : 'Practice Today'}
          </h2>
          <p className="mt-1 text-sm text-slate-300">{formatChicagoTime(eventTime)}</p>
          <p className="mt-1 text-sm text-slate-400">
            {isOff && event.status_message ? event.status_message : event.title}
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-white">{event.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{formatChicagoDateTime(eventTime)}</p>
          {event.opponent && !isPractice && <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>}
          {score && <p className={`mt-2 text-lg font-bold ${score.className}`}>{score.text}</p>}
        </>
      )}

      {!isCompleted && !isOff && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { val: countdown.days, label: 'Days' },
            { val: countdown.hours, label: 'Hrs' },
            { val: countdown.minutes, label: 'Min' },
            { val: countdown.seconds, label: 'Sec' },
          ].map(({ val, label }) => (
            <div key={label} className="rounded-xl bg-white/10 p-3 text-center">
              <p className="text-xl font-bold text-white tabular-nums">{val}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Weather</p>
        {weather && (weather.rainChance !== null || weather.temperature !== null) ? (
          <>
            {weather.rainChance !== null && (
              weather.rainChance > 40
                ? <p className="mt-1 text-sm text-amber-400">⚠ Rain Risk — {weather.rainChance}%</p>
                : <p className="mt-1 text-sm text-green-400">☀ Looks Good — {weather.rainChance}% rain</p>
            )}
            {weather.temperature !== null && (
              <p className="mt-1 text-sm text-slate-300">🌡 {weather.temperature}°F</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Forecast not yet available</p>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Field</p>
        <p className="mt-1 text-sm font-semibold text-white">{field?.name ?? 'TBD'}</p>
        <p className="text-sm text-slate-400">{address || 'Address not available'}</p>
        {address && (
          <a href={directionsUrl} target="_blank" rel="noreferrer"
            className="mt-2 inline-block rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition"
            style={{ backgroundColor: brandColor }}
            >
            Directions ↗
          </a>
        )}
      </div>

      {gearList.length > 0 && (
        <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Gear</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {gearList.map(g => (
              <span key={g} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">⚾ {g}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Past Game Row ─────────────────────────────────────────────────────────────

function PastGameRow({ event }: { event: EventRow }) {
  const score = getScoreDisplay(event)
  const eventTime = new Date(event.starts_at)
  return (
    <Link href={`/event/${event.id}`}>
      <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3 hover:bg-white/10 transition">
        <div>
          <p className="text-sm font-semibold text-white">
            {event.opponent ? `vs ${event.opponent}` : event.title}
          </p>
          <p className="text-xs text-slate-500">{formatChicagoShortDate(eventTime)}</p>
        </div>
        {score && (
          <span className={`text-sm font-bold ${score.className}`}>{score.text}</span>
        )}
      </div>
    </Link>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [pastGames, setPastGames] = useState<EventRow[]>([])
  const [weatherByEvent, setWeatherByEvent] = useState<WeatherByEvent>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const { currentTeam } = useCurrentTeam()
  const { teamSeasonId, arrivalBufferMinutes, loading: teamSeasonLoading, notFound: teamSeasonNotFound } = useTeamSeason(currentTeam.id)
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // Wait until team_season is resolved — don't enter the try/finally
    // because finally would clear the loading state and flash empty UI
    if (teamSeasonLoading) {
      setLoading(true)
      return
    }
    const loadData = async () => {
      try {
        setError(null)
        const supabase = createClient()
        const nowIso = new Date().toISOString()
        if (teamSeasonNotFound || !teamSeasonId) {
          setEvents([])
          setPastGames([])
          setLoading(false)
          return
        }

        const { data, error: fetchError } = await supabase
          .from('events')
          .select(`id, title, opponent, event_type, starts_at, status, notes, gear_notes,
            travel_minutes, travel_miles, team_score, opponent_score, result,
            display_status, status_message, status_updated_at,
            fields (id, name, address_line, city, state, postal_code)`)
          .eq('team_season_id', teamSeasonId)
          .gte('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(3)

        if (fetchError) {
          setError("Couldn't load your schedule.")
          setLoading(false)
          return
        }
        if (!data) { setLoading(false); return }

        const normalizedEvents = (data as RawEventRow[]).map(e => normalizeEvent(e, arrivalBufferMinutes))
        setEvents(normalizedEvents)

        const { data: pastData } = await supabase
          .from('events')
          .select(`id, title, opponent, event_type, starts_at, status, notes, gear_notes,
            travel_minutes, travel_miles, team_score, opponent_score, result,
            display_status, status_message, status_updated_at,
            fields (id, name, address_line, city, state, postal_code)`)
          .eq('team_season_id', teamSeasonId)
          .lt('starts_at', nowIso)
          .neq('event_type', 'practice')
          .order('starts_at', { ascending: false })
          .limit(5)

        if (pastData) setPastGames((pastData as RawEventRow[]).map(e => normalizeEvent(e, arrivalBufferMinutes)))

        // Weather
        const uniqueFieldIds = Array.from(new Set(
          normalizedEvents
            .map(e => getPrimaryField(e.fields)?.id)
            .filter((id): id is string => Boolean(id))
        ))

        const weatherMap: WeatherByEvent = {}

        if (uniqueFieldIds.length > 0) {
          const forecastWindowEndIso = new Date(Date.now() + FORECAST_LOOKAHEAD_MS).toISOString()
          const { data: forecasts, error: forecastError } = await supabase
            .from('weather_forecasts')
            .select('field_id, forecast_time, rain_probability, temperature')
            .in('field_id', uniqueFieldIds)
            .gte('forecast_time', nowIso)
            .lte('forecast_time', forecastWindowEndIso)
            .order('forecast_time', { ascending: true })

          if (!forecastError && forecasts) {
            const forecastsByField: Record<string, WeatherForecastRow[]> = {}
            for (const f of forecasts as WeatherForecastRow[]) {
              if (!forecastsByField[f.field_id]) forecastsByField[f.field_id] = []
              forecastsByField[f.field_id].push(f)
            }
            const forecastWindowEnd = Date.now() + FORECAST_LOOKAHEAD_MS
            for (const event of normalizedEvents) {
              const fieldId = getPrimaryField(event.fields)?.id
              if (!fieldId || new Date(event.starts_at).getTime() > forecastWindowEnd) {
                weatherMap[event.id] = { rainChance: null, temperature: null }
                continue
              }
              weatherMap[event.id] = getClosestForecast(event.starts_at, forecastsByField[fieldId] ?? [])
            }
          }
        }

        setWeatherByEvent(weatherMap)
      } catch (err) {
        console.error('Unexpected error:', err)
        setError('Something went wrong loading the schedule.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [teamSeasonId])

  const featuredEvent = useMemo(() => events[0] ?? null, [events])
  const otherEvents = useMemo(() => events.slice(1), [events])

  if (loading) {
    return (
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm space-y-4 px-4 pt-6">
          <EventCardSkeleton featured />
          <div className="space-y-2">
            <RowSkeleton />
            <RowSkeleton />
          </div>
        </div>
        <BottomNav active="home" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white">

      {/* Content */}
      <div className="mx-auto max-w-sm space-y-4 px-4 pt-6">

      {/* Push notification subscribe button */}
        <PushSubscribeButton />  

        {/* Status banner — appears only if a broadcast has been set */}
        {featuredEvent && <StatusBanner event={featuredEvent} />}

        {/* Next Up */}
        {teamSeasonNotFound && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">Team not found in current season</p>
            <p className="mt-1 text-sm">
              {currentTeam.label}: no team_seasons row exists for the current season.
              Admin should create one.
            </p>
          </div>
        )}
        {featuredEvent ? (
  <section>
    <EventCard
      event={featuredEvent}
      weather={weatherByEvent[featuredEvent.id]}
      now={now}
      featured
      brandColor={brandColor}
    />
  </section>
) : error ? (
  <EmptyState
    variant="error"
    icon="⚠️"
    title={error}
    description="Pull down to refresh, or check back in a minute."
    action={
      <button
        onClick={() => window.location.reload()}
        className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
      >
        Try again
      </button>
    }
  />
) : (
  <EmptyState
    icon="⚾"
    title="No upcoming events"
    description="Check back soon — new games and practices will appear here once they're scheduled."
  />
)}


        {/* Coming Up */}
        {otherEvents.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Coming Up</p>
            <div className="space-y-2">
              {otherEvents.map(event => {
                const eventTime = new Date(event.starts_at)
                const field = getPrimaryField(event.fields)
                const score = getScoreDisplay(event)
                const address = formatAddress(field)
                const weather = weatherByEvent[event.id]
                return (
                  <div key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-bold text-white">{event.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{formatChicagoDateTime(eventTime)}</p>
                    {event.opponent && event.event_type !== 'practice' && (
                      <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>
                    )}
                    {score && <p className={`mt-1 text-sm font-bold ${score.className}`}>{score.text}</p>}
                    {field?.name && <p className="mt-1 text-sm text-slate-400">📍 {field.name}</p>}
                    {address && <p className="mt-0.5 text-xs text-slate-500">{address}</p>}
                    <div className="mt-2 flex gap-3">
                      {weather?.rainChance !== null && weather?.rainChance !== undefined ? (
                        <span className="text-xs text-slate-400">🌧 {weather.rainChance}% rain</span>
                      ) : (
                        <span className="text-xs text-slate-600">No forecast yet</span>
                      )}
                      {weather?.temperature !== null && weather?.temperature !== undefined && (
                        <span className="text-xs text-slate-400">🌡 {weather.temperature}°F</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Past Games */}
        {pastGames.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Recent Games</p>
            <div className="space-y-2">
              {pastGames.map(event => <PastGameRow key={event.id} event={event} />)}
            </div>
          </section>
        )}

      </div>

      <BottomNav active="home" />
    </main>
  )
}
