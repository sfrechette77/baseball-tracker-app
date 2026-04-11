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
): { text: string | null; className: string; leaveTime: Date | null } {
  if (travelMinutes === null) {
    return {
      text: null,
      className: 'text-slate-700',
      leaveTime: null
    }
  }

  const leaveMinutes = travelMinutes + 45
  const leaveTime = new Date(eventTime.getTime() - leaveMinutes * 60000)
  const msUntilLeave = leaveTime.getTime() - now.getTime()
  const minsUntilLeave = Math.floor(msUntilLeave / 60000)

  if (minsUntilLeave < 0) {
    return {
      text: '🔴 Leave now',
      className: 'text-red-600',
      leaveTime
    }
  }

  if (minsUntilLeave <= 15) {
    return {
      text: '🟡 Time to get ready',
      className: 'text-amber-600',
      leaveTime
    }
  }

  return {
    text: '🟢 Plenty of time',
    className: 'text-green-600',
    leaveTime
  }
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

function getClosestForecast(
  eventStartsAt: string,
  forecasts: WeatherForecastRow[]
): WeatherSummary {
  if (!forecasts.length) {
    return {
      rainChance: null,
      temperature: null
    }
  }

  const eventTime = new Date(eventStartsAt).getTime()

  const closest = forecasts.reduce<WeatherForecastRow | null>((best, current) => {
    if (!best) return current

    const bestDiff = Math.abs(
      new Date(best.forecast_time).getTime() - eventTime
    )
    const currentDiff = Math.abs(
      new Date(current.forecast_time).getTime() - eventTime
    )

    return currentDiff < bestDiff ? current : best
  }, null)

  if (!closest) {
    return {
      rainChance: null,
      temperature: null
    }
  }

  const diff = Math.abs(
    new Date(closest.forecast_time).getTime() - eventTime
  )

  if (diff > FORECAST_MATCH_WINDOW_MS) {
    return {
      rainChance: null,
      temperature: null
    }
  }

  return {
    rainChance:
      typeof closest.rain_probability === 'number'
        ? Math.round(closest.rain_probability * 100)
        : null,
    temperature:
      typeof closest.temperature === 'number'
        ? Math.round(closest.temperature)
        : null
  }
}

function EventCard({
  event,
  weather,
  now,
  featured = false
}: {
  event: EventRow
  weather?: WeatherSummary
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

      {featured && isGameDay ? (
        <div className="rounded-2xl bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
            ⚾ Game Day
          </p>

          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            {isTonight ? "Tonight's Game" : 'Game Today'}
          </h2>

          <p className="mt-1 text-sm text-slate-700">
            {formatChicagoTime(eventTime)}
            {event.opponent ? ` vs ${event.opponent}` : ''}
          </p>

          <p className="mt-1 text-sm text-slate-600">
            {event.title}
          </p>

          {score && (
            <p className={`mt-2 text-lg font-bold ${score.className}`}>
              {score.text}
            </p>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}

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

      {(weather?.rainChance !== null || weather?.temperature !== null) && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Weather Forecast
          </p>

          {weather?.rainChance !== null && (
            weather.rainChance > 40 ? (
              <p className="mt-2 text-amber-700">
                ⚠ Rain Risk – {weather.rainChance}%
              </p>
            ) : (
              <p className="mt-2 text-green-700">
                ☀ Weather Looks Good – {weather.rainChance}%
              </p>
            )
          )}

          {weather?.temperature !== null && weather?.temperature !== undefined && (
            <p className="mt-1 text-sm text-slate-700">
              Expected temperature: {weather.temperature}°F
            </p>
          )}
        </div>
      )}

      {!isCompleted && event.travel_minutes !== null && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Travel Time
          </p>

          <p className="mt-2 text-sm text-slate-700">
            🚗 {event.travel_minutes} minutes
            {event.travel_miles !== null ? ` • ${event.travel_miles} miles` : ''}
          </p>

          {urgency.leaveTime && (
            <>
              <p className="text-sm font-semibold text-slate-900">
                🕒 Leave by {formatChicagoTime(urgency.leaveTime)}
              </p>

              {urgency.text && (
                <p className={`mt-1 text-sm font-semibold ${urgency.className}`}>
                  {urgency.text}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-slate-200 p-4">
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

      <div className="mt-4 rounded-2xl border border-slate-200 p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Gear Checklist
        </p>

        {gearList.length > 0 ? (
          <div className="mt-2 space-y-1">
            {gearList.map(g => (
              <p key={g} className="text-sm text-slate-700">
                ⚾ {g}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No gear notes added
          </p>
        )}
      </div>
    </div>
  )
}

export default function HomePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [lastGame, setLastGame] = useState<EventRow | null>(null)
  const [weatherByEvent, setWeatherByEvent] = useState<WeatherByEvent>({})
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClient()
        const nowIso = new Date().toISOString()

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
          .gte('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(3)

        if (error || !data) {
          console.error('Error loading events:', error)
          setLoading(false)
          return
        }

        const normalizedEvents = (data as RawEventRow[]).map(normalizeEvent)
        setEvents(normalizedEvents)

        const { data: lastGameData, error: lastGameError } = await supabase
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
          .not('result', 'is', null)
          .order('starts_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!lastGameError && lastGameData) {
          setLastGame(normalizeEvent(lastGameData as RawEventRow))
        }

        const uniqueFieldIds = Array.from(
          new Set(
            normalizedEvents
              .map(event => getPrimaryField(event.fields)?.id)
              .filter((id): id is string => Boolean(id))
          )
        )

        const weatherMap: WeatherByEvent = {}

        if (uniqueFieldIds.length > 0) {
          const forecastWindowEndIso = new Date(
            Date.now() + FORECAST_LOOKAHEAD_MS
          ).toISOString()

          const { data: forecasts, error: forecastError } = await supabase
            .from('weather_forecasts')
            .select('field_id, forecast_time, rain_probability, temperature')
            .in('field_id', uniqueFieldIds)
            .gte('forecast_time', nowIso)
            .lte('forecast_time', forecastWindowEndIso)
            .order('forecast_time', { ascending: true })

          if (forecastError) {
            console.error('Error loading weather forecasts:', forecastError)
          } else if (forecasts) {
            const forecastsByField: Record<string, WeatherForecastRow[]> = {}

            for (const forecast of forecasts as WeatherForecastRow[]) {
              if (!forecastsByField[forecast.field_id]) {
                forecastsByField[forecast.field_id] = []
              }

              forecastsByField[forecast.field_id].push(forecast)
            }

            for (const event of normalizedEvents) {
              const fieldId = getPrimaryField(event.fields)?.id

              if (!fieldId) {
                weatherMap[event.id] = {
                  rainChance: null,
                  temperature: null
                }
                continue
              }

              const eventTime = new Date(event.starts_at).getTime()
              const forecastWindowEnd = Date.now() + FORECAST_LOOKAHEAD_MS

              if (eventTime > forecastWindowEnd) {
                weatherMap[event.id] = {
                  rainChance: null,
                  temperature: null
                }
                continue
              }

              const fieldForecasts = forecastsByField[fieldId] ?? []
              weatherMap[event.id] = getClosestForecast(
                event.starts_at,
                fieldForecasts
              )
            }
          }
        }

        setWeatherByEvent(weatherMap)
      } catch (err) {
        console.error('Unexpected error loading homepage data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const record = useMemo(() => {
    const winsFromUpcoming = events.filter(e => e.result === 'win').length
    const lossesFromUpcoming = events.filter(e => e.result === 'loss').length
    const tiesFromUpcoming = events.filter(e => e.result === 'tie').length

    const wins = winsFromUpcoming + (lastGame?.result === 'win' ? 1 : 0)
    const losses = lossesFromUpcoming + (lastGame?.result === 'loss' ? 1 : 0)
    const ties = tiesFromUpcoming + (lastGame?.result === 'tie' ? 1 : 0)

    return { wins, losses, ties }
  }, [events, lastGame])

  const featuredEvent = useMemo(() => events[0] ?? null, [events])
  const otherEvents = useMemo(() => events.slice(1), [events])
  const lastGameScore = lastGame ? getScoreDisplay(lastGame) : null

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
        Loading events...
      </main>
    )
  }

  if (events.length === 0 && !lastGame) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
        No upcoming events
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-sm">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
              Game Day Dashboard
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              Chicago Elite 11U - Moore
            </h1>

            <p className="mt-2 text-sm font-semibold text-slate-200">
              Record: {record.wins}–{record.losses}–{record.ties}
            </p>

            <p className="mt-3 text-sm text-slate-200">
              Next 3 upcoming events
            </p>
          </div>

          <div className="space-y-4 p-4">
            {lastGame && lastGameScore && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Last Game
                </p>

                <div className="mt-3 rounded-2xl bg-white p-4">
                  <p className={`text-2xl font-bold ${lastGameScore.className}`}>
                    {lastGameScore.text}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {lastGame.opponent
                      ? `vs ${lastGame.opponent}`
                      : lastGame.title}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {formatChicagoShortDate(new Date(lastGame.starts_at))}
                  </p>
                </div>
              </div>
            )}

            {featuredEvent && (
              <EventCard
                event={featuredEvent}
                weather={weatherByEvent[featuredEvent.id]}
                now={now}
                featured
              />
            )}

            {!featuredEvent && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">No upcoming events scheduled.</p>
              </div>
            )}

            {otherEvents.length > 0 && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Coming Up
                </p>

                <div className="mt-3 space-y-3">
                  {otherEvents.map(event => {
                    const eventTime = new Date(event.starts_at)
                    const field = getPrimaryField(event.fields)
                    const score = getScoreDisplay(event)
                    const address = formatAddress(field)
                    const weather = weatherByEvent[event.id]

                    return (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
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

                        {address && (
                          <p className="mt-1 text-sm text-slate-600">
                            {address}
                          </p>
                        )}

                        {weather &&
                          (weather.rainChance !== null ||
                            weather.temperature !== null) && (
                            <div className="mt-3 rounded-xl bg-slate-50 p-3">
                              {weather.rainChance !== null && (
                                <p className="text-sm text-slate-700">
                                  🌧 {weather.rainChance}% rain
                                </p>
                              )}

                              {weather.temperature !== null && (
                                <p className="text-sm text-slate-700">
                                  🌡 {weather.temperature}°F
                                </p>
                              )}
                            </div>
                          )}

                        {event.travel_minutes !== null && score === null && (
                          <p className="mt-1 text-sm text-slate-600">
                            🚗 {event.travel_minutes} min
                            {event.travel_miles !== null
                              ? ` • ${event.travel_miles} mi`
                              : ''}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-sm grid-cols-2 gap-2 p-3">
          <Link
            href="/schedule"
            className="col-span-2 mx-auto block w-fit rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Schedule
          </Link>
        </div>
      </nav>
    </main>
  )
}