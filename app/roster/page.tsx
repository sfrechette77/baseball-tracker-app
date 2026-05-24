'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentTeam } from '@/components/team-context'
import { useTeamSeason } from '@/lib/org/useTeamSeason'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

type Player = {
  id: string
  name: string
  jersey_number: string | null
  position: string | null
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

export default function RosterPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const { currentTeam } = useCurrentTeam()
  const { teamSeasonId, loading: teamSeasonLoading, notFound: teamSeasonNotFound } = useTeamSeason(currentTeam.id)

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
          return
        }
        const supabase = createClient()
        const { data } = await supabase
          .from('players')
          .select('id, name, jersey_number, position')
          .eq('team_season_id', teamSeasonId)
        setPlayers((data ?? []) as Player[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [teamSeasonId, teamSeasonLoading, teamSeasonNotFound])

  // Sort by jersey number numerically. "00" sorts as 0 but after "0".
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aNum = a.jersey_number === null ? Infinity : parseInt(a.jersey_number, 10)
      const bNum = b.jersey_number === null ? Infinity : parseInt(b.jersey_number, 10)
      if (aNum !== bNum) return aNum - bNum
      // Tie-break: "0" before "00", "5" before "05" — by string length
      const aLen = (a.jersey_number ?? '').length
      const bLen = (b.jersey_number ?? '').length
      if (aLen !== bLen) return aLen - bLen
      // Final tie-break: alphabetical by name
      return a.name.localeCompare(b.name)
    })
  }, [players])

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading roster...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white">

      {/* Page title */}
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Roster</h1>
      </div>

      {/* Player list */}
      <div className="mx-auto max-w-sm space-y-2 px-4 pt-4">
        {teamSeasonNotFound && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">Team not found in current season</p>
            <p className="mt-1 text-sm">
              {currentTeam.label}: no team_seasons row exists for the current season.
              Admin should create one.
            </p>
          </div>
        )}
        {sortedPlayers.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">No players added yet.</p>
          </div>
        ) : (
          sortedPlayers.map(player => (
            <Link key={player.id} href={`/player/${player.id}`}>
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-600 font-extrabold text-white text-lg">
                  {player.jersey_number ?? '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white truncate">{player.name}</p>
                  {player.position && (
                    <p className="text-xs text-slate-400 mt-0.5">{player.position}</p>
                  )}
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-600 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </Link>
          ))
        )}
      </div>

      <BottomNav active="roster" />
    </main>
  )
}
