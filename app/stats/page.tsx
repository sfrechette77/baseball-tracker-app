'use client'

import Link from 'next/link'
import Image from 'next/image'
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

function BottomNav({ active }: { active: 'home' | 'schedule' | 'stats' | 'roster' }) {
  const links = [
    { href: '/', label: 'Home', key: 'home', Icon: HomeIcon },
    { href: '/schedule', label: 'Schedule', key: 'schedule', Icon: CalendarIcon },
    { href: '/stats', label: 'Stats', key: 'stats', Icon: ChartIcon },
    { href: '/roster', label: 'Roster', key: 'roster', Icon: RosterIcon },
  ] as const
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-slate-900/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-sm grid-cols-4">
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

  // Team totals
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
      <main className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading stats...</p>
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
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0">
              <Image src="/Elite.png" alt="Elite Baseball" fill className="object-contain drop-shadow-lg" priority />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">Season 2025</p>
              <h1 className="text-xl font-extrabold leading-tight text-white">Batting Stats</h1>
              <p className="text-sm text-slate-400">Chicago Elite 11U · Moore</p>
            </div>
          </div>

          {/* Team batting summary */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              { label: 'Team AVG', value: teamAvg },
              { label: 'Hits', value: teamTotals.hits },
              { label: 'RBI', value: teamTotals.rbi },
              { label: 'Runs', value: teamTotals.runs },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-white/10 p-2 text-center border border-white/10">
                <p className="text-lg font-extrabold text-white">{value}</p>
                <p className="text-[9px] uppercase tracking-wide text-slate-400 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-sm px-4 pt-4 space-y-4">

        {/* Sort controls */}
        <div className="flex gap-2">
          {(['avg', 'hits', 'rbi', 'runs'] as const).map(key => (
            <button key={key} onClick={() => setSortBy(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                sortBy === key ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'
              }`}>
              {key === 'avg' ? 'AVG' : key.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Stats table header */}
        {players.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">No players added yet.</p>
            <p className="text-slate-500 text-xs mt-1">Add players in your Supabase dashboard, then enter stats per game.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-6 gap-1 px-4 py-2 border-b border-white/10">
              <p className="col-span-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Player</p>
              {(['AVG', 'AB', 'H', 'RBI', 'R'] as const).map(col => (
                <p key={col} className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold text-center">{col}</p>
              ))}
            </div>

            {/* Player rows */}
            <div className="divide-y divide-white/5">
              {sortedPlayers.map((player, i) => (
                <div key={player.id}
                  className={`grid grid-cols-6 gap-1 px-4 py-3 items-center ${i === 0 ? 'bg-red-600/10' : ''}`}>
                  <div className="col-span-2 flex items-center gap-2 min-w-0">
                    {i === 0 && <span className="text-red-400 text-xs">★</span>}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{player.name}</p>
                      {player.jersey_number !== null && (
                        <p className="text-[10px] text-slate-500">#{player.jersey_number}</p>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm font-bold text-center tabular-nums ${
                    sortBy === 'avg' ? 'text-red-400' : 'text-white'
                  }`}>{player.avg}</p>
                  <p className="text-sm text-slate-400 text-center tabular-nums">{player.at_bats}</p>
                  <p className={`text-sm text-center tabular-nums ${sortBy === 'hits' ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                    {player.hits}
                  </p>
                  <p className={`text-sm text-center tabular-nums ${sortBy === 'rbi' ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                    {player.rbi}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-600 pb-2">
          Enter stats per game in your Supabase dashboard under player_stats
        </p>
      </div>

      <BottomNav active="stats" />
    </main>
  )
}
