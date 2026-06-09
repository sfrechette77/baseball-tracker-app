'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { getPrimaryField, normalizeFieldRelation } from '@/lib/fieldRelation'
import { PICKABLE_TEAMS } from '@/lib/teams'
import { Skeleton } from '@/components/Skeleton'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'
const INNINGS = [1, 2, 3, 4, 5, 6, 7]

// Get the short team label for box score display.
// Falls back to the team's actual name if not in PICKABLE_TEAMS.
function getTeamLabel(team: { id: string; name: string } | null): string {
  if (!team) return 'Elite'
  const pickable = PICKABLE_TEAMS.find(t => t.id === team.id)
  return pickable?.label ?? team.name
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
  is_home: boolean | null
  team_id: string | null
  team_season_id: string | null
  team: { id: string; name: string } | null
  fields: FieldRow[] | null
  display_status: string | null
  status_message: string | null
  status_updated_at: string | null
}
type RawEventRow = Omit<EventRow, 'fields' | 'team'> & {
  fields: FieldRow | FieldRow[] | null
  team_season: { id: string; teams: { id: string; name: string } | { id: string; name: string }[] } | { id: string; teams: { id: string; name: string } | { id: string; name: string }[] }[] | null
}
type BoxScoreRow = {
  team_id: string | null
  team_season_id: string | null
  inning_1: number
  inning_2: number
  inning_3: number
  inning_4: number
  inning_5: number
  inning_6: number
  inning_7: number
}

type PlayerStatRow = {
  player_id: string
  at_bats: number
  hits: number
  rbi: number
  runs: number
  walks: number
  strikeouts: number
  pitch_count: number
  innings_pitched: number
  hits_allowed: number
  earned_runs: number
  strikeouts_pitching: number
  walks_allowed: number
  batting_order_position: number | null
  players: {
    name: string
    jersey_number: string | null
  } | null
}

function normalizeEvent(event: RawEventRow): EventRow {
  // Unwrap nested: event.team_season → team_season.teams → { id, name }
  const ts = Array.isArray(event.team_season) ? event.team_season[0] : event.team_season
  const teamRaw = ts?.teams
  const team = teamRaw
    ? (Array.isArray(teamRaw) ? teamRaw[0] : teamRaw)
    : null
  return {
    ...event,
    team,
    fields: normalizeFieldRelation(event.fields),
  }
}

function formatAddress(field: FieldRow | null) {
  return [field?.address_line, field?.city, field?.state, field?.postal_code]
    .filter(Boolean).join(', ')
}

function getDirectionsUrl(address: string): string {
  if (typeof window === 'undefined') return ''
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isIOS) {
    return `comgooglemaps://?q=${encodeURIComponent(address)}&directionsmode=driving`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function formatChicagoDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date)
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
  if (event.result === 'win') return { text: `W ${team}–${opp}`, className: 'text-green-400' }
  if (event.result === 'loss') return { text: `L ${high}–${low}`, className: 'text-red-400' }
  if (event.result === 'tie') return { text: `T ${team}–${opp}`, className: 'text-slate-400' }
  return { text: `${team}–${opp}`, className: 'text-slate-300' }
}

function calcAvg(hits: number, atBats: number): string {
  if (atBats === 0) return '.000'
  const avg = hits / atBats
  return avg >= 1 ? '1.000' : '.' + avg.toFixed(3).split('.')[1]
}

function getInningRuns(row: BoxScoreRow, inning: number): number {
  return row[`inning_${inning}` as keyof BoxScoreRow] as number ?? 0
}

function getTotalRuns(row: BoxScoreRow): number {
  return INNINGS.reduce((sum, i) => sum + getInningRuns(row, i), 0)
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
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/95 backdrop-blur-md">
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

export default function EventPage() {
  const params = useParams()
  const eventId = params.id as string
  const [event, setEvent] = useState<EventRow | null>(null)
  const [boxScores, setBoxScores] = useState<BoxScoreRow[]>([])
  const [playerStats, setPlayerStats] = useState<PlayerStatRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const supabase = createClient()
        const [{ data: eventData, error }, { data: boxData }, { data: statsData }] = await Promise.all([
          supabase.from('events').select(`
            id, title, opponent, event_type, starts_at, status,
            notes, gear_notes, travel_minutes, travel_miles,
            team_score, opponent_score, result, is_home,
            display_status, status_message, status_updated_at,
            team_id,
            team_season_id,
            team_season:team_season_id (
              id,
              teams:team_id ( id, name )
            ),
            fields (id, name, address_line, city, state, postal_code)
          `).eq('id', eventId).single(),
          supabase.from('box_scores').select('*').eq('event_id', eventId),
          supabase.from('player_stats').select(`
            player_id, at_bats, hits, rbi, runs, walks, strikeouts,
            pitch_count, innings_pitched, hits_allowed, earned_runs,
            strikeouts_pitching, walks_allowed, batting_order_position,
            players (name, jersey_number)
          `).eq('event_id', eventId)
        ])

        if (error) { setEvent(null) }
        else if (eventData) { setEvent(normalizeEvent(eventData as RawEventRow)) }
        setBoxScores((boxData ?? []) as BoxScoreRow[])
        setPlayerStats((statsData ?? []) as unknown as PlayerStatRow[])
      } catch (err) {
        console.error('Unexpected error loading event:', err)
        setEvent(null)
      } finally {
        setLoading(false)
      }
    }
    if (eventId) loadEvent()
  }, [eventId])

  if (loading) {
    return (
      <main className="min-h-screen bg-black pb-24 text-white">
        {/* Header skeleton */}
        <div className="px-4 pt-8 pb-6">
          <div className="mx-auto max-w-sm">
            <Skeleton className="h-4 w-24 mb-5" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        </div>
        {/* Content panel skeletons */}
        <div className="mx-auto max-w-sm space-y-3 px-4 pt-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-3 h-7 w-24 rounded-full" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        </div>
        <BottomNav active="schedule" />
      </main>
    )
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-white font-bold">Event not found</p>
          <Link href="/schedule" className="mt-3 inline-block text-sm text-red-400 hover:text-red-300">
            ← Back to Schedule
          </Link>
        </div>
      </main>
    )
  }

  const isPractice = event.event_type === 'practice'
  const isGame = event.event_type === 'game' || event.event_type === 'tournament'
  const eventTime = new Date(event.starts_at)
  const field = getPrimaryField(event.fields)
  const address = formatAddress(field)
  const directionsUrl = address ? getDirectionsUrl(address) : ''
  const score = getScoreDisplay(event)
  const gearList = event.gear_notes
    ? event.gear_notes.split(',').map(g => g.trim()).filter(Boolean)
    : []

 // Elite's row matches event.team_id. The opponent is the other row.
  // For league games, opponent has a different team_id. For tournaments,
  // opponent has team_id=null (they're not in our teams table). So opponent
  // is simply "the row that isn't Elite's".
  const usRow = boxScores.find(r => r.team_id === event.team_id)
  const themRow = boxScores.find(r => r !== usRow)
  const hasBoxScore = usRow || themRow

  const playersWithStats = playerStats.filter(s => s.at_bats > 0 || (s.pitch_count ?? 0) > 0)
  const pitchers = playerStats.filter(s => (s.pitch_count ?? 0) > 0)

  const battingRows = playerStats
    .filter(s => s.batting_order_position !== null)
    .sort((a, b) => {
      const ao = a.batting_order_position
      const bo = b.batting_order_position
      if (ao != null && bo != null) return ao - bo
      if (ao != null) return -1
      if (bo != null) return 1
      const aj = a.players?.jersey_number ? parseInt(a.players.jersey_number, 10) : Infinity
      const bj = b.players?.jersey_number ? parseInt(b.players.jersey_number, 10) : Infinity
      if (aj !== bj) return aj - bj
      return (a.players?.name ?? '').localeCompare(b.players?.name ?? '')
    })

  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      {/* Header */}
      <div className="relative overflow-hidden bg-black px-4 pt-8 pb-6">
        <div className="relative mx-auto max-w-sm">
          <div className="flex items-center justify-between mb-5">
            <Link href="/schedule"
              className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition">
              ← Schedule
            </Link>
          </div>

          <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">
            {isPractice ? '🏋️ Practice' : event.event_type === 'tournament' ? '🏆 Tournament' : '⚾ Game'}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-white leading-tight">{event.title}</h1>
          {!isPractice && event.opponent && (
            <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>
          )}

          {!isPractice && score && (
            <div className="mt-4 rounded-xl bg-white/10 border border-white/10 p-4 text-center">
              <p className={`text-4xl font-extrabold tabular-nums ${score.className}`}>{score.text}</p>
              {event.opponent && (
                <p className="mt-1 text-sm text-slate-400">vs {event.opponent}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-sm space-y-3 px-4 pt-4">

        {/* Broadcast status banner — shown when set */}
        {event.display_status && (() => {
          const eventTypeLabel =
            event.event_type === 'practice'
              ? 'Practice'
              : event.event_type === 'tournament'
                ? 'Tournament'
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
              <p className={`font-bold ${config.cls.split(' ').slice(2).join(' ')}`}>
                {config.label}
              </p>

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
        })()}

        {/* Box Score */}
        {isGame && hasBoxScore && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Box Score</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pl-4 pr-2 text-left text-[10px] uppercase tracking-wide text-slate-500 font-semibold w-20">Team</th>
                    {INNINGS.map(i => (
                      <th key={i} className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{i}</th>
                    ))}
                    <th className="py-2 px-3 text-center text-[10px] uppercase tracking-wide text-slate-300 font-bold">R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(() => {
                    // Home team always on bottom (baseball convention)
                    const usIsHome = event.is_home === true
                    const topRow = usIsHome ? themRow : usRow
                    const bottomRow = usIsHome ? usRow : themRow
                    const topIsUs = !usIsHome
                    const bottomIsUs = usIsHome

                    return (
                      <>
                        {topRow && (
                          <tr className={topIsUs ? 'bg-red-600/5' : ''}>
                            <td className="py-3 pl-4 pr-2 text-xs truncate max-w-[180px]">
                              {topIsUs
                                ? <span className="font-bold text-white">{getTeamLabel(event.team)}</span>
                                : <span className="font-semibold text-slate-400">{event.opponent ?? 'Opp'}</span>}
                            </td>
                            {INNINGS.map(i => (
                              <td key={i} className={`py-3 px-2 text-center tabular-nums ${topIsUs ? 'text-slate-300' : 'text-slate-400'}`}>
                                {getInningRuns(topRow, i)}
                              </td>
                            ))}
                            <td className={`py-3 px-3 text-center tabular-nums font-bold ${topIsUs ? 'text-white' : 'text-slate-300'}`}>
                              {getTotalRuns(topRow)}
                            </td>
                          </tr>
                        )}
                        {bottomRow && (
                          <tr className={bottomIsUs ? 'bg-red-600/5' : ''}>
                            <td className="py-3 pl-4 pr-2 text-xs truncate max-w-[180px]">
                              {bottomIsUs
                                ? <span className="font-bold text-white">{getTeamLabel(event.team)}</span>
                                : <span className="font-semibold text-slate-400">{event.opponent ?? 'Opp'}</span>}
                            </td>
                            {INNINGS.map(i => (
                              <td key={i} className={`py-3 px-2 text-center tabular-nums ${bottomIsUs ? 'text-slate-300' : 'text-slate-400'}`}>
                                {getInningRuns(bottomRow, i)}
                              </td>
                            ))}
                            <td className={`py-3 px-3 text-center tabular-nums font-bold ${bottomIsUs ? 'text-white' : 'text-slate-300'}`}>
                              {getTotalRuns(bottomRow)}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Player Batting Stats */}
        {isGame && playersWithStats.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Batting</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[340px] text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pl-4 pr-2 text-left text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Player</th>
                    {['AB', 'H', 'RBI', 'R', 'BB', 'K'].map(h => (
                      <th key={h} className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {battingRows.map(s => (
                    <tr key={s.player_id}>
                      <td className="py-3 pl-4 pr-2">
                        <p className="text-xs font-semibold text-white whitespace-nowrap">
                          {s.players?.name ?? '—'}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.at_bats}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.hits}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.rbi}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.runs}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.walks ?? 0}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.strikeouts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pitching Stats */}
        {isGame && pitchers.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Pitching</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px] text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pl-4 pr-2 text-left text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Player</th>
                    {['P', 'IP', 'K', 'BB'].map(h => (
                      <th key={h} className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pitchers.map(s => (
                    <tr key={s.player_id}>
                      <td className="py-3 pl-4 pr-2">
                        <p className="text-xs font-semibold text-white whitespace-nowrap">
                          {s.players?.jersey_number ? `#${s.players.jersey_number} ` : ''}{s.players?.name ?? '—'}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-300 font-semibold">{s.pitch_count}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.innings_pitched}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.strikeouts_pitching}</td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.walks_allowed ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Date & Status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Date & Time</p>
          <p className="mt-2 text-sm font-semibold text-white">{formatChicagoDateTime(eventTime)}</p>
          <div className="mt-2">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(event.status)}`}>
              {formatStatus(event.status)}
            </span>
          </div>
        </div>

        {/* Field */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Field</p>
          <p className="mt-2 text-sm font-semibold text-white">{field?.name ?? 'TBD'}</p>
          <p className="text-sm text-slate-400">{address || 'Address not available'}</p>
          {address && (
            <a href={directionsUrl} target="_blank" rel="noreferrer"
              className="mt-2 inline-block rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition">
              Directions ↗
            </a>
          )}
        </div>

        {/* Gear */}
        {gearList.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Gear Checklist</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {gearList.map(g => (
                <span key={g} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">⚾ {g}</span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {event.notes && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Notes</p>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">{event.notes}</p>
          </div>
        )}

      </div>

      <BottomNav active="schedule" />
    </main>
  )
}
