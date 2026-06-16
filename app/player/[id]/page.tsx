'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Skeleton } from '@/components/Skeleton'
import { BottomNav } from '@/components/BottomNav'

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
  walks: number
  pitch_count: number
  innings_pitched: number
  strikeouts_pitching: number
  walks_allowed: number
  hits_allowed: number
  earned_runs: number
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
            .select(`id, event_id, at_bats, hits, rbi, runs, strikeouts, walks,
              pitch_count, innings_pitched, strikeouts_pitching, walks_allowed, hits_allowed, earned_runs,
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
      walks: acc.walks + (s.walks ?? 0),
    }),
    { at_bats: 0, hits: 0, rbi: 0, runs: 0, walks: 0 }
  ), [stats])

  const obp = useMemo(() => {
    const plateAppearances = seasonBatting.at_bats + seasonBatting.walks
    if (plateAppearances === 0) return '.000'
    const val = (seasonBatting.hits + seasonBatting.walks) / plateAppearances
    return val >= 1 ? '1.000' : '.' + val.toFixed(3).split('.')[1]
  }, [seasonBatting])

  const seasonPitching = useMemo(() => {
    const totals = stats.reduce(
      (acc, s) => ({
        pitch_count: acc.pitch_count + (s.pitch_count ?? 0),
        innings_pitched: acc.innings_pitched + (s.innings_pitched ?? 0),
        strikeouts_pitching: acc.strikeouts_pitching + (s.strikeouts_pitching ?? 0),
        walks_allowed: acc.walks_allowed + (s.walks_allowed ?? 0),
        hits_allowed: acc.hits_allowed + (s.hits_allowed ?? 0),
        earned_runs: acc.earned_runs + (s.earned_runs ?? 0),
      }),
      { pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks_allowed: 0, hits_allowed: 0, earned_runs: 0 }
    )
    return {
      ...totals,
      innings_pitched: Math.round(totals.innings_pitched * 10) / 10
    }  
  }, [stats])

  const gamesWithStats = useMemo(() =>
    stats.filter(s => s.at_bats > 0 || s.pitch_count > 0)
      .sort((a, b) => {
        const aDate = a.events?.starts_at ?? ''
        const bDate = b.events?.starts_at ?? ''
        return bDate.localeCompare(aDate) // newest first
      }), [stats])

  if (loading) {
    return (
      <main className="min-h-screen bg-black pb-24 text-white">
        {/* Header skeleton */}
        <div className="bg-black px-4 pt-8 pb-6">
          <div className="mx-auto max-w-sm">
            <Skeleton className="h-4 w-20 mb-5" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
        {/* Season Batting summary skeleton */}
        <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <Skeleton className="h-3 w-28 mx-auto mb-3" />
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-xl bg-white/10 p-3 border border-white/10">
                  <Skeleton className="h-7 w-12 mx-auto" />
                  <Skeleton className="mt-1 h-3 w-8 mx-auto" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="rounded-xl bg-white/10 p-3 border border-white/10">
                  <Skeleton className="h-6 w-8 mx-auto" />
                  <Skeleton className="mt-1 h-3 w-6 mx-auto" />
                </div>
              ))}
            </div>
          </div>
          {/* Game log skeleton */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <Skeleton className="h-3 w-20 mx-auto" />
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <BottomNav active="team" />
      </main>
    )
  }

  if (!player) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-white font-bold">Player not found</p>
          <Link href="/team?view=roster" className="mt-3 inline-block text-sm text-red-400">← Roster</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      {/* Header */}
      <div className="relative overflow-hidden bg-black px-4 pt-8 pb-6">
        <div className="relative mx-auto max-w-sm">
          <div className="flex items-center justify-between mb-5">
            <Link href="/team?view=roster" className="text-sm font-semibold text-slate-400 hover:text-white transition">
              ← Roster
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-red-600 text-2xl font-extrabold text-white">
              {player.jersey_number ?? '—'}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">2026 Stats</p>
              <h1 className="text-xl font-extrabold text-white leading-tight">{player.name}</h1>
              {player.position && <p className="text-sm text-slate-400">{player.position}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">

        {/* Season Batting Summary */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3 text-center">Season Batting</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white-400">{calcAvg(seasonBatting.hits, seasonBatting.at_bats)}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">AVG</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white-400">{obp}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">OBP</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.hits}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Hits</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-xl font-extrabold text-white">{seasonBatting.at_bats}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">AB</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-xl font-extrabold text-white">{seasonBatting.rbi}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">RBI</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-2xl font-extrabold text-white">{seasonBatting.runs}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">R</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
              <p className="text-xl font-extrabold text-white">{seasonBatting.walks}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">BB</p>
            </div>
          </div>
        </div>

        {/* Season Pitching Summary — only if pitched */}
        {seasonPitching.innings_pitched > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3 text-center">Season Pitching</p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { label: 'IP', value: seasonPitching.innings_pitched },
                { label: 'K', value: seasonPitching.strikeouts_pitching },
                { label: 'H', value: seasonPitching.hits_allowed },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
                  <p className="text-2xl font-extrabold text-white-400">{value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Pitches', value: seasonPitching.pitch_count },
                { label: 'BB', value: seasonPitching.walks_allowed },
                { label: 'ER', value: seasonPitching.earned_runs },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-white/10 p-3 text-center border border-white/10">
                  <p className="text-xl font-extrabold text-white">{value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game-by-game breakdown */}
        {gamesWithStats.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold text-center">Game Log</p>
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
                    <th className="py-2 px-2 text-center text-[10px] uppercase tracking-wide text-slate-500 font-semibold">BB</th>
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
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.hits}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.rbi}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.runs}</td>
                        <td className="py-3 px-2 text-center tabular-nums text-slate-400">{s.walks ?? 0}</td>
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

      <BottomNav active="team" />
    </main>
  )
}
