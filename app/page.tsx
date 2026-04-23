'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { getPrimaryField, normalizeFieldRelation } from '@/lib/fieldRelation'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'
const FORECAST_MATCH_WINDOW_MS = 9 * 60 * 60 * 1000
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

type ScoredGameRow = {
  id: string
  result: string | null
  event_type: string | null
}

function normalizeEvent(event: RawEventRow): EventRow {
  return { ...event, fields: normalizeFieldRelation(event.fields) }
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

function getUrgency(eventTime: Date, travelMinutes: number | null, now: Date) {
  if (travelMinutes === null) return { text: null, className: 'text-slate-700', leaveTime: null }
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
    return Math.abs(new Date(cur.forecast_time).getTime() - eventTime) <
      Math.abs(new Date(best.forecast_time).getTime() - eventTime) ? cur : best
  }, null)
  if (!closest) return { rainChance: null, temperature: null }
  if (Math.abs(new Date(closest.forecast_time).getTime() - eventTime) > FORECAST_MATCH_WINDOW_MS)
    return { rainChance: null, temperature: null }
  return {
    rainChance: typeof closest.rain_probability === 'number' ? Math.round(closest.rain_probability * 100) : null,
    temperature: typeof closest.temperature === 'number' ? Math.round(closest.temperature) : null
  }
}

// ─── Nav Icons ────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15v-5.25a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75V21H3.75A.75.75 0 013 21V9.75z" />
    </svg>
  )
}

function CalendarIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function ChartIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l5.25-5.25 4.5 4.5L18 6.75M21 21H3M21 21V3" />
    </svg>
  )
}

function RosterIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, weather, now, featured = false }: {
  event: EventRow; weather?: WeatherSummary; now: Date; featured?: boolean
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
  const isGameDay = isSameChicagoDay(eventTime, new Date())
  const isGame = event.event_type === 'game' || event.event_type === 'tournament'
  const isPractice = event.event_type === 'practice'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {featured && (
        <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">
          ⚾ Next Up
        </p>
      )}

      {featured && isGameDay && isGame ? (
        <div className="rounded-xl bg-red-600/20 border border-red-500/30 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-red-300 font-semibold">
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
        <div className="rounded-xl bg-blue-600/20 border border-blue-500/30 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-300 font-semibold">🏋️ Practice Day</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Practice Today</h2>
          <p className="mt-1 text-sm text-slate-300">{formatChicagoTime(eventTime)}</p>
          <p className="mt-1 text-sm text-slate-400">{event.title}</p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-white">{event.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{formatChicagoDateTime(eventTime)}</p>
          {event.opponent && <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>}
          {score && <p className={`mt-2 text-lg font-bold ${score.className}`}>{score.text}</p>}
        </>
      )}

      {!isCompleted && (
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

      {!isCompleted && event.travel_minutes !== null && (
        <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Travel</p>
          <p className="mt-1 text-sm text-slate-300">
            🚗 {event.travel_minutes} min{event.travel_miles !== null ? ` • ${event.travel_miles} mi` : ''}
          </p>
          {urgency.leaveTime && (
            <>
              <p className="text-sm font-semibold text-white">🕒 Leave by {formatChicagoTime(urgency.leaveTime)}</p>
              {urgency.text && <p className={`mt-1 text-sm font-semibold ${urgency.className}`}>{urgency.text}</p>}
            </>
          )}
        </div>
      )}

      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Field</p>
        <p className="mt-1 text-sm font-semibold text-white">{field?.name ?? 'TBD'}</p>
        <p className="text-sm text-slate-400">{address || 'Address not available'}</p>
        {address && (
          <a href={directionsUrl} target="_blank" rel="noreferrer"
            className="mt-2 inline-block rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition">
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

// ─── Bottom Nav ────────────────────────────────────────────────────────────────

function StandingsIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
    </svg>
  )
}

function BottomNav({ active }: { active: 'home' | 'schedule' | 'standings' | 'stats' | 'roster' }) {
  const links = [
    { href: '/', label: 'Home', key: 'home', Icon: HomeIcon },
    { href: '/schedule', label: 'Schedule', key: 'schedule', Icon: CalendarIcon },
    { href: '/standings', label: 'Standings', key: 'standings', Icon: StandingsIcon },
    { href: '/stats', label: 'Stats', key: 'stats', Icon: ChartIcon },
    { href: '/roster', label: 'Roster', key: 'roster', Icon: RosterIcon },
  ] as const

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-slate-900/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-sm grid-cols-5">
        {links.map(({ href, label, key, Icon }) => {
          const isActive = active === key
          return (
            <Link key={key} href={href}
              className={`flex flex-col items-center gap-1 py-3 transition ${isActive ? 'text-red-500' : 'text-slate-500 hover:text-slate-300'}`}>
              <Icon active={isActive} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [pastGames, setPastGames] = useState<EventRow[]>([])
  const [scoredGames, setScoredGames] = useState<ScoredGameRow[]>([])
  const [weatherByEvent, setWeatherByEvent] = useState<WeatherByEvent>({})
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClient()
        const nowIso = new Date().toISOString()

        const { data, error } = await supabase
          .from('events')
          .select(`id, title, opponent, event_type, starts_at, status, notes, gear_notes,
            travel_minutes, travel_miles, team_score, opponent_score, result,
            fields (id, name, address_line, city, state, postal_code)`)
          .gte('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(3)

        if (error || !data) { setLoading(false); return }

        const normalizedEvents = (data as RawEventRow[]).map(normalizeEvent)
        setEvents(normalizedEvents)

        // Past games with scores
        const { data: pastData } = await supabase
          .from('events')
          .select(`id, title, opponent, event_type, starts_at, status, notes, gear_notes,
            travel_minutes, travel_miles, team_score, opponent_score, result,
            fields (id, name, address_line, city, state, postal_code)`)
          .lt('starts_at', nowIso)
          .order('starts_at', { ascending: false })
          .limit(5)

        if (pastData) setPastGames((pastData as RawEventRow[]).map(normalizeEvent))

        const { data: scoredGamesData } = await supabase
          .from('events')
          .select('id, result, event_type')
          .not('result', 'is', null)

        setScoredGames((scoredGamesData ?? []) as ScoredGameRow[])

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
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const record = useMemo(() => scoredGames.reduce(
    (acc, g) => {
      if (g.result === 'win') acc.wins++
      else if (g.result === 'loss') acc.losses++
      else if (g.result === 'tie') acc.ties++
      return acc
    },
    { wins: 0, losses: 0, ties: 0 }
  ), [scoredGames])

  const leagueRecord = useMemo(() => scoredGames
    .filter(g => g.event_type !== 'tournament')
    .reduce(
      (acc, g) => {
        if (g.result === 'win') acc.wins++
        else if (g.result === 'loss') acc.losses++
        else if (g.result === 'tie') acc.ties++
        return acc
      },
      { wins: 0, losses: 0, ties: 0 }
    ), [scoredGames])

  const featuredEvent = useMemo(() => events[0] ?? null, [events])
  const otherEvents = useMemo(() => events.slice(1), [events])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 pb-24 text-white">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 px-4 pt-8 pb-6">
        {/* Background texture */}
        <div className="pointer-events-none absolute inset-0 opacity-5"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />

        <div className="relative mx-auto max-w-sm">
          {/* Logo + Team Name */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0">
              <Image
                src="/Elite.png"
                alt="Elite Baseball"
                fill
                className="object-contain drop-shadow-lg"
                priority
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">Season 2026</p>
              <h1 className="text-xl font-extrabold leading-tight text-white">
                Chicago Elite 11U
              </h1>
              <p className="text-sm text-slate-400">Moore</p>
            </div>
          </div>

          {/* Season Record */}
          <div className="mt-5 rounded-xl bg-white/10 border border-white/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Overall</p>
                <p className="text-2xl font-extrabold text-white tabular-nums">
                  {record.wins}–{record.losses}–{record.ties}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">League</p>
                <p className="text-2xl font-extrabold text-red-400 tabular-nums">
                  {leagueRecord.wins}–{leagueRecord.losses}–{leagueRecord.ties}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">

        {/* Next Up */}
        {featuredEvent ? (
          <section>
            <EventCard
              event={featuredEvent}
              weather={weatherByEvent[featuredEvent.id]}
              now={now}
              featured
            />
          </section>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">No upcoming events scheduled.</p>
          </div>
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
                    {event.opponent && <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>}
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
                    {event.travel_minutes !== null && score === null && (
                      <p className="mt-1 text-xs text-slate-400">
                        🚗 {event.travel_minutes} min{event.travel_miles !== null ? ` • ${event.travel_miles} mi` : ''}
                      </p>
                    )}
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
