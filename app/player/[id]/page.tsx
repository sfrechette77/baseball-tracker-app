'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'

type Player = {
  id: string
  name: string
  jersey_number: string | null
  position: string | null
}

type StatRow = {
  id: string
  event_id: string
  at_bats: number
  hits: number
  rbi: number
  runs: number
  strikeouts: number
  pitch_count: number
  innings_pitched: number
  strikeouts_pitching: number
  walks: number
  events: {
    title: string
    opponent: string | null
    starts_at: string
    result: string | null
  } | null
}

function calcAvg(hits: number, atBats: number): string {
  if (atBats === 0) return '.000'
  const avg = hits / atBats
  return avg >= 1 ? '1.000' : '.' + avg.toFixed(3).split('.')[1]
}

function formatShortDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE, month: 'short', day: 'numeric'
  }).format(new Date(dateStr))
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

export default function PlayerPage() {
  const params = useParams()
  const playerId = params.id as string

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const [{ data: playerData }, { data: statsData }] = await Promise.all([
          supabase.from('players').select('id, name, jersey_number, position').eq('id', playerId).single(),
          supabase.from('player_stats')
            .select(`id, event_id, at_bats, hits, rbi, runs, strikeouts,
              pitch_count, innings_pitched, strikeouts_pitching, walks,
              events (title, opponent, starts_at, result)`)
            .eq('player_id', playerId)
            .order('event_id', { ascending: true })
        ])
        setPlayer(playerData as Player)
        setStats((statsData ?? []) as unknown as StatRow[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    if (playerId) load()
  }, [playerId])

  const seasonBatting = useMemo(() => stats.reduce(
    (acc, s) => ({
      at_bats: acc.at_bats + s.at_bats,
      hits: acc.hits + s.hits,
      rbi: acc.rbi + s.rbi,
      runs: acc.runs + s.runs,
      strikeouts: acc.strikeouts + s.strikeouts,
    }),
    { at_bats: 0, hits: 0, rbi: 0, runs: 0, strikeouts: 0 }
  ), [stats])

  const seasonPitching = useMemo(() => {
    const totals = stats.reduce(
      (acc, s) => ({
        pitch_count: acc.pitch_count + (s.pitch_count ?? 0),
        innings_pitched: acc.innings_pitched + (s.innings_pitched ?? 0),
        strikeouts_pitching: acc.strikeouts_pitching + (s.strikeouts_pitching ?? 0),
        walks: acc.walks + (s.walks ?? 0),
      }),
      { pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks: 0 }
    )
    return totals.pitch_count > 0 ? totals : null
  }, [stats])

  const gamesWithStats = useMemo(() =>
    stats.filter(s => s.at_bats > 0 || s.pitch_count > 0)
      .sort((a, b) => {
        const aDate = a.events?.starts_at ?? ''
        const bDate = b.events?.starts_at ?? ''
        return aDate.localeCompare(bDate)
      }), [stats])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading player...</p>
        </div>
      </main>
    )
  }

  if (!player) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-white font-bold">Player not found</p>
          <Link href="/roster" className="mt-3 inline-block text-sm text-red-400">← Roster</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 pb-24 text-white">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 px-4 pt-8 pb-6">
        <div className="pointer-events-none absolute inset-0 opacity-5"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />
        <div className="relative mx-auto max-w-sm">
          <div className="flex items-center justify-between mb-5">
            <Link href="/roster" className="text-sm font-semibold text-slate-400 hover:text-white transition">
              ← Roster
            </Link>
            <div className="relative h-10 w-10">
              <Image src="/Elite.png" alt="Elite Baseball" fill className="object-contain drop-shadow-lg" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-red-600 text-2xl font-extrabold text-white">
              {player.jersey_number ?? '—'}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">Season 2026</p>
              <h1 className="text-xl font-extrabold text-white leading-tight">{player.name}</h1>
              {player.position && <p className="text-sm text-slate-400">{player.position}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">

        {/* Season Batting Summary */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3">Season Batting</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-red-400">{calcAvg(seasonBatting.hits, seasonBatting.at_bats)}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">AVG</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.hits}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Hits</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.at_bats}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">AB</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.rbi}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">RBI</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.runs}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Runs</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.strikeouts}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">K</p>
            </div>
          </div>
        </div>

        {/* Season Pitching Summary — only if pitched */}
        {seasonPitching && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3">Season Pitching</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Pitches', value: seasonPitching.pitch_count },
                { label: 'IP', value: seasonPitching.innings_pitched },
                { label: 'K', value: seasonPitching.strikeouts_pitching },
                { label: 'BB', value: seasonPitching.walks },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-white/10 p-2 text-center border border-white/10">
                  <p className="text-xl font-extrabold text-white">{value}</p>
                  <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game-by-game breakdown */}
        {gamesWithStats.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Game Log</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pl-4 pr-2 text-left text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Game</th>
                    <th className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">AB</th>
                    <th className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">H</th>
                    <th className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">RBI</th>
                    <th className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">R</th>
                    <th className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">K</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {gamesWithStats.map(s => {
                    const result = s.events?.result
                    const resultClass = result === 'win' ? 'text-green-500' : result === 'loss' ? 'text-red-400' : 'text-slate-400'
                    return (
                      <tr key={s.id}>
                        <td className="py-3 pl-4 pr-2">
                          <p className="text-xs font-semibold text-white whitespace-nowrap">
                            {s.events?.opponent ? `vs ${s.events.opponent}` : s.events?.title ?? '—'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[10px] text-slate-500">
                              {s.events?.starts_at ? formatShortDate(s.events.starts_at) : ''}
                            </p>
                            {result && (
                              <span className={`text-[10px] font-bold ${resultClass}`}>
                                {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'T'}
                              </span>
                            )}
                          </div>
                          {(s.pitch_count ?? 0) > 0 && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              ⚾ {s.pitch_count}p · {s.innings_pitched}IP
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.at_bats}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-white font-semibold">{s.hits}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.rbi}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.runs}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.strikeouts}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {gamesWithStats.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">No stats recorded yet.</p>
          </div>
        )}

      </div>

      <BottomNav active="roster" />
    </main>
  )
}
