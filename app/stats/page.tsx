'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

type Player = {
  id: string
  name: string
  jersey_number: number | null
  position: string | null
}

type StatRow = {
  player_id: string
  at_bats: number
  hits: number
  rbi: number
  runs: number
  strikeouts: number
}

type PlayerWithStats = Player & {
  at_bats: number
  hits: number
  rbi: number
  runs: number
  strikeouts: number
  avg: string
}

function calcAvg(hits: number, atBats: number): string {
  if (atBats === 0) return '.000'
  const avg = hits / atBats
  return avg >= 1 ? '1.000' : '.' + avg.toFixed(3).split('.')[1]
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
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-slate-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
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

export default function StatsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [stats, setStats] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'avg' | 'hits' | 'rbi' | 'runs'>('avg')

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const [{ data: playerData }, { data: statData }] = await Promise.all([
          supabase.from('players').select('id, name, jersey_number, position').order('jersey_number', { ascending: true }),
          supabase.from('player_stats').select('player_id, at_bats, hits, rbi, runs, strikeouts')
        ])
        setPlayers((playerData ?? []) as Player[])
        setStats((statData ?? []) as StatRow[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const playersWithStats = useMemo((): PlayerWithStats[] => {
    return players.map(player => {
      const playerStats = stats.filter(s => s.player_id === player.id)
      const totals = playerStats.reduce(
        (acc, s) => ({
          at_bats: acc.at_bats + (s.at_bats ?? 0),
          hits: acc.hits + (s.hits ?? 0),
          rbi: acc.rbi + (s.rbi ?? 0),
          runs: acc.runs + (s.runs ?? 0),
          strikeouts: acc.strikeouts + (s.strikeouts ?? 0),
        }),
        { at_bats: 0, hits: 0, rbi: 0, runs: 0, strikeouts: 0 }
      )
      return {
        ...player,
        ...totals,
        avg: calcAvg(totals.hits, totals.at_bats)
      }
    })
  }, [players, stats])

  const sortedPlayers = useMemo(() => {
    return [...playersWithStats].sort((a, b) => {
      if (sortBy === 'avg') return parseFloat(b.avg) - parseFloat(a.avg)
      return b[sortBy] - a[sortBy]
    })
  }, [playersWithStats, sortBy])

  const teamTotals = useMemo(() => {
    return playersWithStats.reduce(
      (acc, p) => ({
        at_bats: acc.at_bats + p.at_bats,
        hits: acc.hits + p.hits,
        rbi: acc.rbi + p.rbi,
        runs: acc.runs + p.runs,
      }),
      { at_bats: 0, hits: 0, rbi: 0, runs: 0 }
    )
  }, [playersWithStats])

  const teamAvg = calcAvg(teamTotals.hits, teamTotals.at_bats)

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading stats...</p>
        </div>
      </main>
    )
  }

  // Sort key → which column to highlight in the table
  const highlightedCol: 'avg' | 'hits' | 'rbi' | 'runs' = sortBy

  return (
    <main className="min-h-screen bg-black pb-32 text-white">

      {/* Page title */}
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Batting Stats</h1>
      </div>

      {/* Team summary tiles */}
      <div className="mx-auto max-w-sm px-4 pt-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Team AVG', value: teamAvg },
            { label: 'Hits', value: teamTotals.hits },
            { label: 'RBI', value: teamTotals.rbi },
            { label: 'Runs', value: teamTotals.runs },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
              <p className="text-lg font-extrabold text-white tabular-nums">{value}</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-400 leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-sm px-4 pt-4 space-y-4">

        {/* Sort controls */}
        <div className="flex gap-2">
          {(['avg', 'hits', 'rbi', 'runs'] as const).map(key => (
            <button key={key} onClick={() => setSortBy(key)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                sortBy === key ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'
              }`}>
              {key === 'avg' ? 'AVG' : key.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Stats table */}
        {players.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">No players added yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pl-4 pr-2 text-left text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Player</th>
                  <th className={`py-2 px-2 text-center text-[11px] uppercase tracking-wide font-semibold w-12 ${highlightedCol === 'avg' ? 'text-red-400' : 'text-slate-500'}`}>AVG</th>
                  <th className={`py-2 px-2 text-center text-[11px] uppercase tracking-wide font-semibold w-10 ${highlightedCol === 'hits' ? 'text-red-400' : 'text-slate-500'}`}>H</th>
                  <th className={`py-2 px-2 text-center text-[11px] uppercase tracking-wide font-semibold w-10 ${highlightedCol === 'rbi' ? 'text-red-400' : 'text-slate-500'}`}>RBI</th>
                  <th className={`py-2 pl-2 pr-4 text-center text-[11px] uppercase tracking-wide font-semibold w-10 ${highlightedCol === 'runs' ? 'text-red-400' : 'text-slate-500'}`}>R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedPlayers.map((player, i) => (
                  <tr key={player.id} className={i === 0 ? 'bg-red-600/10 border-l-2 border-l-red-500' : ''}>
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500 tabular-nums">
                          {player.jersey_number ?? '—'}
                        </span>
                        <span className="text-sm text-slate-300">{player.name}</span>
                      </div>
                    </td>
                    <td className={`py-3 px-2 text-center tabular-nums ${highlightedCol === 'avg' ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                      {player.avg}
                    </td>
                    <td className={`py-3 px-2 text-center tabular-nums ${highlightedCol === 'hits' ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                      {player.hits}
                    </td>
                    <td className={`py-3 px-2 text-center tabular-nums ${highlightedCol === 'rbi' ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                      {player.rbi}
                    </td>
                    <td className={`py-3 pl-2 pr-4 text-center tabular-nums ${highlightedCol === 'runs' ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                      {player.runs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BottomNav active="stats" />
    </main>
  )
}
