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
}

type RawEventRow = Omit<EventRow, 'fields'> & {
  fields: FieldRow | FieldRow[] | null
}

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

function formatStatus(status: string) {
  if (!status) return 'Unknown'
  return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getStatusClasses(status: string) {
  const n = status.toLowerCase()
  if (n.includes('cancel')) return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (n.includes('postpon')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  if (n.includes('complete') || n.includes('final')) return 'bg-green-500/20 text-green-400 border-green-500/30'
  return 'bg-white/10 text-slate-300 border-white/20'
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('events')
          .select(`id, title, opponent, event_type, starts_at, status,
            team_score, opponent_score, result, fields (name)`)
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
  }, [])

  const groupedEvents = useMemo(() => {
    const now = new Date()
    return events
      .filter(event => {
        const isPractice = event.event_type === 'practice'
        const isPast = new Date(event.starts_at) < now
        return !(isPractice && isPast)
      })
      .reduce<Record<string, EventRow[]>>((groups, event) => {
        const dateKey = new Intl.DateTimeFormat('en-US', {
          timeZone: APP_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric'
        }).format(new Date(event.starts_at))
        if (!groups[dateKey]) groups[dateKey] = []
        groups[dateKey].push(event)
        return groups
      }, {})
  }, [events])

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
      <main className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading schedule...</p>
        </div>
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-slate-900 p-4 text-white">
        <div className="mx-auto max-w-sm rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-lg font-bold">Unable to load schedule</h1>
          <p className="mt-2 text-sm text-red-400">{errorMessage}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 pb-24 text-white">

      {/* Header — logo and title only */}
      <div className="relative overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 px-4 pt-8 pb-6">
        <div className="pointer-events-none absolute inset-0 opacity-5"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />
        <div className="relative mx-auto max-w-sm">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0">
              <Image src="/Elite.png" alt="Elite Baseball" fill className="object-contain drop-shadow-lg" priority />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">Season 2026</p>
              <h1 className="text-xl font-extrabold leading-tight text-white">Full Schedule</h1>
              <p className="text-sm text-slate-400">Chicago Elite 11U · Moore</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">

        {/* Record bar */}
        <div className="rounded-xl bg-white/10 border border-white/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Overall</p>
              <p className="text-2xl font-extrabold text-slate-300 tabular-nums">
                {record.wins}–{record.losses}–{record.ties}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">League</p>
              <p className="text-2xl font-extrabold text-slate-300 tabular-nums">
                {leagueRecord.wins}–{leagueRecord.losses}–{leagueRecord.ties}
              </p>
            </div>
          </div>
        </div>

        {/* Event list */}
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">No scheduled events.</p>
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{event.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{formatChicagoDateTime(eventTime)}</p>
                        {event.opponent && event.event_type !== 'practice' && (
                          <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>
                        )}
                        {score && (
                          <p className={`mt-1 text-sm font-bold ${score.className}`}>{score.text}</p>
                        )}
                        {field?.name && (
                          <p className="mt-1 text-xs text-slate-500">📍 {field.name}</p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(event.status)}`}>
                        {formatStatus(event.status)}
                      </span>
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
