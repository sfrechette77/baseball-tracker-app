'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { getPrimaryField, normalizeFieldRelation } from '@/lib/fieldRelation'
import { useCurrentTeam } from '@/components/team-context'
import { useTeamSeason } from '@/lib/org/useTeamSeason'
import { BottomNav } from '@/components/BottomNav'
import { RowSkeleton } from '@/components/Skeleton'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'

type FieldRow = { name: string | null }

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
  display_status: string | null
  is_home: boolean
}

type RawEventRow = Omit<EventRow, 'fields'> & {
  fields: FieldRow | FieldRow[] | null
}

type FilterKey = 'upcoming' | 'past' | 'practices'

function normalizeEvent(event: RawEventRow): EventRow {
  return { ...event, fields: normalizeFieldRelation(event.fields) }
}

function formatChicagoDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(date)
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

function getStartOfTodayChicago(): Date {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 5, 0, 0))
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('upcoming')
  const { currentTeam } = useCurrentTeam()
  const { teamSeasonId, loading: teamSeasonLoading, notFound: teamSeasonNotFound } = useTeamSeason(currentTeam.id)

  useEffect(() => {
    // Wait until team_season is resolved — don't enter the try/finally
    // because finally would clear the loading state and flash empty UI
    if (teamSeasonLoading) {
      setLoading(true)
      return
    }
    const loadEvents = async () => {
      try {
        const supabase = createClient()
        if (teamSeasonNotFound || !teamSeasonId) {
          setEvents([])
          setLoading(false)
          return
        }
        const { data, error } = await supabase
          .from('events')
          .select(`id, title, opponent, event_type, starts_at, status,
            team_score, opponent_score, result, display_status, is_home, fields (name)`)
          .eq('team_season_id', teamSeasonId)
          .order('starts_at', { ascending: true })
        if (error) setErrorMessage(error.message)
        else setEvents(((data ?? []) as RawEventRow[]).map(normalizeEvent))
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    loadEvents()
  }, [teamSeasonId, teamSeasonLoading, teamSeasonNotFound])

  const filteredEvents = useMemo(() => {
    const startOfToday = getStartOfTodayChicago()

    if (filter === 'upcoming') {
      return events
        .filter(e => e.event_type !== 'practice')
        .filter(e => {
          const hasScore = e.team_score !== null && e.opponent_score !== null
          const isFuture = new Date(e.starts_at) >= startOfToday
          return !hasScore && isFuture
        })
    }

    if (filter === 'past') {
      return events
        .filter(e => e.event_type !== 'practice')
        .filter(e => e.team_score !== null && e.opponent_score !== null)
        .slice()
        .reverse()
    }

    return events
      .filter(e => e.event_type === 'practice')
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.starts_at).getTime()
        const bTime = new Date(b.starts_at).getTime()
        const nowMs = Date.now()
        const aFuture = aTime >= nowMs
        const bFuture = bTime >= nowMs
        if (aFuture && !bFuture) return -1
        if (!aFuture && bFuture) return 1
        return aTime - bTime
      })
  }, [events, filter])

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce<Record<string, EventRow[]>>((groups, event) => {
      const dateKey = new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric'
      }).format(new Date(event.starts_at))
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(event)
      return groups
    }, {})
  }, [filteredEvents])

  const record = useMemo(() => events.reduce(
    (acc, e) => {
      if (e.result === 'win') acc.wins++
      else if (e.result === 'loss') acc.losses++
      else if (e.result === 'tie') acc.ties++
      return acc
    },
    { wins: 0, losses: 0, ties: 0 }
  ), [events])

  const leagueRecord = useMemo(() => events
    .filter(e => e.result !== null && e.event_type !== 'tournament')
    .reduce(
      (acc, e) => {
        if (e.result === 'win') acc.wins++
        else if (e.result === 'loss') acc.losses++
        else if (e.result === 'tie') acc.ties++
        return acc
      },
      { wins: 0, losses: 0, ties: 0 }
    ), [events])

  if (loading) {
    return (
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
          <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
          <h1 className="text-3xl font-extrabold text-white mt-1">Schedule</h1>
        </div>
        <div className="mx-auto max-w-sm space-y-2 px-4 pt-4">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
        <BottomNav active="schedule" />
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-black p-4 text-white">
        <div className="mx-auto max-w-sm rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-lg font-bold">Unable to load schedule</h1>
          <p className="mt-2 text-sm text-red-400">{errorMessage}</p>
        </div>
      </main>
    )
  }

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'practices', label: 'Practices' },
  ]

  const emptyMessage = {
    upcoming: 'No upcoming games scheduled.',
    past: 'No completed games yet.',
    practices: 'No practices scheduled.',
  }[filter]

  const winPct = (() => {
    const total = record.wins + record.losses + record.ties
    if (total === 0) return '—'
    return ((record.wins + record.ties * 0.5) / total).toFixed(3).replace(/^0/, '')
  })()

  return (
    <main className="min-h-screen bg-black pb-32 text-white">

      {/* Page title with record subtitle */}
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Schedule</h1>

        <p className="mt-3 text-xs text-slate-400 tabular-nums">
          <span className="text-slate-500">PCT </span>
          <span className="text-white font-semibold">{winPct}</span>
          <span className="mx-2 text-slate-700">·</span>
          <span className="text-slate-500">Overall </span>
          <span className="text-slate-300 font-semibold">
            {record.wins}–{record.losses}{record.ties > 0 ? `–${record.ties}` : ''}
          </span>
          <span className="mx-2 text-slate-700">·</span>
          <span className="text-slate-500">League </span>
          <span className="text-slate-300 font-semibold">
            {leagueRecord.wins}–{leagueRecord.losses}{leagueRecord.ties > 0 ? `–${leagueRecord.ties}` : ''}
          </span>
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">
        {teamSeasonNotFound && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">Team not found in current season</p>
            <p className="mt-1 text-sm">
              {currentTeam.label}: no team_seasons row exists for the current season.
              Admin should create one.
            </p>
          </div>
        )}
        {/* Filter chips */}
        <div className="flex gap-2">
          {filters.map(f => {
            const isActive = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Event list */}
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">{emptyMessage}</p>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateLabel, dayEvents]) => (
            <section key={dateLabel} className="space-y-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                {dateLabel}
              </h2>
              {dayEvents.map(event => {
                const eventTime = new Date(event.starts_at)
                const field = getPrimaryField(event.fields)
                const score = getScoreDisplay(event)
                return (
                  <Link key={event.id} href={`/event/${event.id}`}
                    className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="min-w-0">
                      {event.opponent && event.event_type !== 'practice' ? (
                        <>
                          <p className="font-bold text-white truncate">{event.is_home ? 'vs' : '@'} {event.opponent}</p>
                          <p className="mt-1 text-xs text-slate-500 truncate">{event.title}</p>
                        </>
                      ) : (
                        <p className="font-bold text-white truncate">{event.title}</p>
                      )}
                      <p className="mt-1 text-sm text-slate-400">{formatChicagoDateTime(eventTime)}</p>
                      {event.display_status && (
                        <p className={`mt-1 text-xs font-bold uppercase tracking-wide ${
                          event.display_status === 'on' ? 'text-green-400' :
                          event.display_status === 'watching' ? 'text-amber-400' :
                          'text-red-400'
                        }`}>
                          {event.display_status === 'on' ? '🟢 Game On' :
                           event.display_status === 'watching' ? '🟡 Watching' :
                           '🔴 Game Off'}
                        </p>
                      )}
                      {score && (
                        <p className={`mt-1 text-sm font-bold ${score.className}`}>{score.text}</p>
                      )}
                      {field?.name && (
                        <p className="mt-1 text-xs text-slate-500">📍 {field.name}</p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </section>
          ))
        )}
      </div>

      <BottomNav active="schedule" />
    </main>
  )
}
