'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentTeam } from '@/components/team-context'
import { useTeamSeason } from '@/lib/org/useTeamSeason'
import { BottomNav } from '@/components/BottomNav'
import { Skeleton } from '@/components/Skeleton'
import { useActiveOrg } from '@/components/org-context'

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [stats, setStats] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'avg' | 'hits' | 'rbi' | 'runs'>('avg')
  const { currentTeam } = useCurrentTeam()
  const { teamSeasonId, loading: teamSeasonLoading, notFound: teamSeasonNotFound } = useTeamSeason(currentTeam.id)
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  useEffect(() => {
    // Wait until team_season is resolved — don't enter the try/finally
    // because finally would clear the loading state and flash empty UI
    if (teamSeasonLoading) {
      setLoading(true)
      return
    }

    const load = async () => {
      try {
        if (teamSeasonNotFound || !teamSeasonId) {
          setPlayers([])
          setStats([])
          return
        }

        const supabase = createClient()
        const [{ data: playerData }, { data: statData }] = await Promise.all([
          supabase
            .from('players')
            .select('id, name, jersey_number, position')
            .eq('team_season_id', teamSeasonId)
            .order('jersey_number', { ascending: true }),
          supabase
            .from('player_stats')
            .select('player_id, at_bats, hits, rbi, runs, strikeouts')
            .eq('team_season_id', teamSeasonId),
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
  }, [teamSeasonId, teamSeasonLoading, teamSeasonNotFound])

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
        avg: calcAvg(totals.hits, totals.at_bats),
      }
    })
  }, [players, stats])

  const sortedPlayers = useMemo(() => {
    return [...playersWithStats].sort((a, b) => {
      if (sortBy === 'avg') return parseFloat(b.avg) - parseFloat(a.avg)
      return b[sortBy] - a[sortBy]
    })
  }, [playersWithStats, sortBy])

  if (loading) {
    return (
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
          <p
            className="text-xl tracking-[0.1em] font-bold"
            style={{ color: brandColor }}
          >
            2026
          </p>
          <h1 className="text-3xl font-extrabold text-white mt-1">Batting Stats</h1>
        </div>

        <div className="mx-auto max-w-sm px-4 pt-4 space-y-4">
          {/* Sort chips */}
          <div className="flex gap-2">
            <Skeleton className="h-7 flex-1 rounded-full" />
            <Skeleton className="h-7 flex-1 rounded-full" />
            <Skeleton className="h-7 flex-1 rounded-full" />
            <Skeleton className="h-7 flex-1 rounded-full" />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pl-4 pr-2 text-left text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Player</th>
                  <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-12">AVG</th>
                  <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-10">H</th>
                  <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-10">RBI</th>
                  <th className="py-2 pl-2 pr-4 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-10">R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                  <tr key={i}>
                    <td className="py-3 pl-4 pr-2"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3 px-2"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="py-3 px-2"><Skeleton className="h-4 w-6 mx-auto" /></td>
                    <td className="py-3 px-2"><Skeleton className="h-4 w-6 mx-auto" /></td>
                    <td className="py-3 pl-2 pr-4"><Skeleton className="h-4 w-6 mx-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <BottomNav active="stats" />
      </main>
    )
  }

  // Sort key → which column to highlight in the table
  const highlightedCol: 'avg' | 'hits' | 'rbi' | 'runs' = sortBy

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      {/* Page title */}
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p
          className="text-xl tracking-[0.1em] font-bold"
          style={{ color: brandColor }}
        >
          2026
        </p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Batting Stats</h1>
      </div>

      <div className="mx-auto max-w-sm px-4 pt-4 space-y-4">
        {teamSeasonNotFound && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">Team not found in current season</p>
            <p className="mt-1 text-sm">
              {currentTeam.label}: no team_seasons row exists for the current season.
              Admin should create one.
            </p>
          </div>
        )}

        {/* Sort controls */}
        <div className="flex gap-2">
          {(['avg', 'hits', 'rbi', 'runs'] as const).map(key => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                sortBy === key ? 'text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'
              }`}
              style={sortBy === key ? { backgroundColor: brandColor } : undefined}
            >
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
                  <th
                    className={`py-2 px-2 text-center text-[11px] uppercase tracking-wide font-semibold w-12 ${
                      highlightedCol === 'avg' ? '' : 'text-slate-500'
                    }`}
                    style={highlightedCol === 'avg' ? { color: brandColor } : undefined}
                  >
                    AVG
                  </th>
                  <th
                    className={`py-2 px-2 text-center text-[11px] uppercase tracking-wide font-semibold w-10 ${
                      highlightedCol === 'hits' ? '' : 'text-slate-500'
                    }`}
                    style={highlightedCol === 'hits' ? { color: brandColor } : undefined}
                  >
                    H
                  </th>
                  <th
                    className={`py-2 px-2 text-center text-[11px] uppercase tracking-wide font-semibold w-10 ${
                      highlightedCol === 'rbi' ? '' : 'text-slate-500'
                    }`}
                    style={highlightedCol === 'rbi' ? { color: brandColor } : undefined}
                  >
                    RBI
                  </th>
                  <th
                    className={`py-2 pl-2 pr-4 text-center text-[11px] uppercase tracking-wide font-semibold w-10 ${
                      highlightedCol === 'runs' ? '' : 'text-slate-500'
                    }`}
                    style={highlightedCol === 'runs' ? { color: brandColor } : undefined}
                  >
                    R
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedPlayers.map((player, i) => (
                  <tr key={player.id} className={i === 0 ? 'border-l-2' : ''}
                  style={
                    i === 0
                      ? {
                          backgroundColor: `${brandColor}1A`, // subtle tint
                          borderLeftColor: brandColor,
                        }
                      : undefined
                  }
                  >
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500 tabular-nums">
                          {player.jersey_number ?? '—'}
                        </span>
                        <span className="text-sm text-slate-300">{player.name}</span>
                      </div>
                    </td>
                    <td
                      className={`py-3 px-2 text-center tabular-nums ${
                        highlightedCol === 'avg' ? 'font-bold' : 'text-slate-300'
                      }`}
                      style={highlightedCol === 'avg' ? { color: brandColor } : undefined}
                    >
                      {player.avg}
                    </td>
                    <td
                      className={`py-3 px-2 text-center tabular-nums ${
                        highlightedCol === 'hits' ? 'font-bold' : 'text-slate-400'
                      }`}
                      style={highlightedCol === 'hits' ? { color: brandColor } : undefined}
                    >
                      {player.hits}
                    </td>
                    <td
                      className={`py-3 px-2 text-center tabular-nums ${
                        highlightedCol === 'rbi' ? 'font-bold' : 'text-slate-400'
                      }`}
                      style={highlightedCol === 'rbi' ? { color: brandColor } : undefined}
                    >
                      {player.rbi}
                    </td>
                    <td
                      className={`py-3 pl-2 pr-4 text-center tabular-nums ${
                        highlightedCol === 'runs' ? 'font-bold' : 'text-slate-400'
                      }`}
                      style={highlightedCol === 'runs' ? { color: brandColor } : undefined}
                    >
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
