'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentTeam } from '@/components/team-context'
import { useTeamSeason } from '@/lib/org/useTeamSeason'
import { BottomNav } from '@/components/BottomNav'
import { RowSkeleton } from '@/components/Skeleton'
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
  jersey_number: string | null
  position: string | null
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RosterPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
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
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
          <p className="text-xl tracking-[0.1em] text-slate-400 font-bold">2026</p>
          <h1 className="text-3xl font-extrabold text-white mt-1">Roster</h1>
        </div>
        <div className="mx-auto max-w-sm space-y-2 px-4 pt-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <RowSkeleton key={i} />
          ))}
        </div>
        <BottomNav active="team" />
      </main>
    )
  }

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
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl font-extrabold text-white text-lg"
                  style={{ backgroundColor: brandColor }}
                >
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

      <BottomNav active="team" />
    </main>
  )
}
