'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentTeam } from '@/components/team-context'
import { BottomNav } from '@/components/BottomNav'
import { useActiveOrg } from '@/components/org-context'
import { useOrgSeasons } from '@/lib/org/useOrgSeasons'
import { useTeamSeason } from '@/lib/org/useTeamSeason'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

type StandingRow = {
  id: string
  team_name: string
  games_played: number
  wins: number
  losses: number
  ties: number
  runs_for: number
  runs_against: number
  win_pct: number
}

type LeagueGameRow = {
  id: string
  played_at: string
  home_score: number | null
  away_score: number | null
  status: string
  home_team: { id: string; name: string; division: string | null } | null
  away_team: { id: string; name: string; division: string | null } | null
  events: { id: string }[] | null  // linked event if exists
}

function calcPct(wins: number, losses: number, ties: number): string {
  const total = wins + losses + ties
  if (total === 0) return '.000'
  const pct = (wins + ties * 0.5) / total
  return pct >= 1 ? '1.000' : '.' + pct.toFixed(3).split('.')[1]
}

function formatRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StandingsPage() {
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [leagueGames, setLeagueGames] = useState<LeagueGameRow[]>([])
  const [activeTab, setActiveTab] = useState<'standings' | 'results'>('standings')
  const [loading, setLoading] = useState(true)
  const { currentTeam } = useCurrentTeam()
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'
  const { seasons, currentSeasonId, loading: seasonsLoading } = useOrgSeasons()
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const effectiveSeasonId = selectedSeasonId ?? currentSeasonId
  const selectedSeason =
    seasons.find(season => season.id === effectiveSeasonId) ?? null

  const {
    division: teamSeasonDivision,
    loading: teamSeasonLoading,
    notFound: teamSeasonNotFound,
  } = useTeamSeason(
    currentTeam.id,
    effectiveSeasonId
  )

  const seasonDivision = teamSeasonDivision ?? currentTeam.division

  useEffect(() => {
    const load = async () => {
      if (seasonsLoading || teamSeasonLoading) {
        return
      }

      setLoading(true)

      try {
        if (teamSeasonNotFound || !effectiveSeasonId) {
          setStandings([])
          return
        }

        const supabase = createClient()
        const { data } = await supabase
          .from('computed_standings')
          .select('id, team_name, games_played, wins, losses, ties, runs_for, runs_against')
          .eq('season_id', effectiveSeasonId)
          .eq('division', seasonDivision)

        setStandings((data ?? []) as StandingRow[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [
    effectiveSeasonId,
    seasonDivision,
    seasonsLoading,
    teamSeasonLoading,
    teamSeasonNotFound,
  ])

  useEffect(() => {
  const loadLeagueGames = async () => {
    if (seasonsLoading || teamSeasonLoading) {
      return
    }

    if (teamSeasonNotFound || !effectiveSeasonId) {
      setLeagueGames([])
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('league_games')
      .select(`
        id, played_at, home_score, away_score, status,
        home_team_season:home_team_season_id (
          id,
          season_id,
          display_name,
          division,
          teams:team_id ( id, name, division )
        ),
        away_team_season:away_team_season_id (
          id,
          season_id,
          display_name,
          division,
          teams:team_id ( id, name, division )
        ),
        events!events_league_game_id_fkey (id)
      `)
      .order('played_at', { ascending: false })
    
    if (error) {
      console.error('Error loading league games:', error)
      return
    }
    
    if (data) {
      // Unwrap team-season identity while retaining permanent team IDs.
      const normalized = data.map((g: any) => {
        const homeTs = Array.isArray(g.home_team_season)
          ? g.home_team_season[0]
          : g.home_team_season
        const awayTs = Array.isArray(g.away_team_season)
          ? g.away_team_season[0]
          : g.away_team_season

        const homeTeam = homeTs?.teams
          ? (Array.isArray(homeTs.teams) ? homeTs.teams[0] : homeTs.teams)
          : null
        const awayTeam = awayTs?.teams
          ? (Array.isArray(awayTs.teams) ? awayTs.teams[0] : awayTs.teams)
          : null

        return {
          ...g,
          home_team: homeTeam
            ? {
                ...homeTeam,
                name: homeTs?.display_name ?? homeTeam.name,
                division: homeTs?.division ?? homeTeam.division,
              }
            : null,
          away_team: awayTeam
            ? {
                ...awayTeam,
                name: awayTs?.display_name ?? awayTeam.name,
                division: awayTs?.division ?? awayTeam.division,
              }
            : null,
        }
      })

      const filtered = normalized.filter((g: any) => {
        const homeTs = Array.isArray(g.home_team_season)
          ? g.home_team_season[0]
          : g.home_team_season
        const awayTs = Array.isArray(g.away_team_season)
          ? g.away_team_season[0]
          : g.away_team_season

        const isSelectedSeason =
          homeTs?.season_id === effectiveSeasonId ||
          awayTs?.season_id === effectiveSeasonId

        const isDivisionGame =
          g.home_team?.division === seasonDivision ||
          g.away_team?.division === seasonDivision

        return isSelectedSeason && isDivisionGame
      })
      setLeagueGames(filtered as LeagueGameRow[])
    }
  }
  loadLeagueGames()
}, [
  effectiveSeasonId,
  seasonDivision,
  seasonsLoading,
  teamSeasonLoading,
  teamSeasonNotFound,
])

  const sorted = useMemo(() => {
    return [...standings].sort((a, b) => {
      const totalA = a.wins + a.losses + a.ties
      const totalB = b.wins + b.losses + b.ties
      const pctA = totalA === 0 ? 0 : (a.wins + a.ties * 0.5) / totalA
      const pctB = totalB === 0 ? 0 : (b.wins + b.ties * 0.5) / totalB
      if (pctB !== pctA) return pctB - pctA
      return (b.runs_for - b.runs_against) - (a.runs_for - a.runs_against)
    })
  }, [standings])

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading standings...</p>
        </div>
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
          {selectedSeason?.name ?? 'Season'}
        </p>
        <h1 className="text-xl font-extrabold text-white mt-1">Mid Suburban Baseball League</h1>
        <p className="text-sm text-slate-400 mt-1">{seasonDivision}</p>

        {seasons.length > 0 && (
          <div className="relative mt-3">
            <select
              value={effectiveSeasonId ?? ''}
              onChange={e => setSelectedSeasonId(e.target.value || null)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-white/10 px-3 py-2 pr-10 text-sm font-semibold text-white outline-none"
            >
              {seasons.map(season => (
                <option
                  key={season.id}
                  value={season.id}
                  className="bg-slate-950 text-white"
                >
                  {season.name}{season.is_current ? ' · Current' : ''}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
              ▾
            </span>
          </div>
        )}
      </div>

      {/* Internal tabs */}
        <div className="flex justify-center gap-2 mb-4">
          {([
            { key: 'standings', label: 'Standings' },
            { key: 'results', label: 'Results' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                activeTab === key
                  ? 'text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
              style={activeTab === key ? { backgroundColor: brandColor } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      {/* Standings table */}
      {activeTab === 'standings' && (
      <div className="mx-auto max-w-sm px-4 pt-2">
        {standings.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-400 text-sm">No standings data yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pl-4 pr-2 text-left text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Team</th>
                  <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-14">Record</th>
                  <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-12">PCT</th>
                  <th className="py-2 pl-2 pr-4 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-10">RD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map((team) => {
                  const isUs = team.id === currentTeam.id
                  const diff = team.runs_for - team.runs_against
                  return (
                    <tr
                      key={team.id}
                      className={isUs ? 'border-l-2' : ''}
                      style={isUs ? {
                        backgroundColor: `${brandColor}1A`,
                        borderLeftColor: brandColor,
                      } : undefined}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <span className={`text-sm ${isUs ? 'font-bold text-white' : 'text-slate-300'}`}>
                          {team.team_name}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums text-slate-300 font-semibold">
                        {formatRecord(team.wins, team.losses, team.ties)}
                      </td>
                      <td className="py-3 px-2 text-center tabular-nums text-white font-semibold">
                        {calcPct(team.wins, team.losses, team.ties)}
                      </td>
                      <td className={`py-3 pl-2 pr-4 text-center tabular-nums font-semibold ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {activeTab === 'results' && (
  <div className="mx-auto max-w-sm px-4 pt-2">
    {leagueGames.length === 0 ? (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-slate-400 text-sm">No league games yet.</p>
      </div>
    ) : (() => {
      const completed = leagueGames.filter(g => 
        g.status === 'final' && g.home_score !== null && g.away_score !== null
      )
      const upcoming = leagueGames.filter(g => 
        g.status !== 'final' || g.home_score === null || g.away_score === null
      ).sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime())
      
      const renderGameCard = (game: LeagueGameRow) => {
        const eventId = game.events?.[0]?.id ?? null
        const homeName = game.home_team?.name ?? 'Unknown'
        const awayName = game.away_team?.name ?? 'Unknown'
        const playedDate = new Date(game.played_at)
        const dateLabel = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          month: 'short', day: 'numeric',
        }).format(playedDate)
        const timeLabel = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric', minute: '2-digit',
        }).format(playedDate)
        
        const isFinal = game.status === 'final' && game.home_score !== null && game.away_score !== null
        const homeWon = isFinal && (game.home_score ?? 0) > (game.away_score ?? 0)
        const awayWon = isFinal && (game.away_score ?? 0) > (game.home_score ?? 0)

        const cardContent = (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              {dateLabel}{!isFinal && ` · ${timeLabel}`}
            </p>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className={`text-sm ${awayWon ? 'font-bold text-white' : 'text-slate-400'}`}>
                  {awayName}
                </p>
                {isFinal && (
                  <p className={`text-sm tabular-nums ${awayWon ? 'font-bold text-white' : 'text-slate-400'}`}>
                    {game.away_score}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className={`text-sm ${homeWon ? 'font-bold text-white' : 'text-slate-400'}`}>
                  {homeName}
                </p>
                {isFinal && (
                  <p className={`text-sm tabular-nums ${homeWon ? 'font-bold text-white' : 'text-slate-400'}`}>
                    {game.home_score}
                  </p>
                )}
              </div>
            </div>
            {!isFinal && game.status !== 'scheduled' && (
              <p className="mt-2 text-xs text-slate-500 italic">
                {game.status === 'postponed' ? 'Postponed' :
                 game.status === 'forfeit' ? 'Forfeit' :
                 game.status === 'canceled' ? 'Canceled' : game.status}
              </p>
            )}
          </div>
        )
        
        return eventId ? (
          <Link key={game.id} href={`/event/${eventId}`}>
            {cardContent}
          </Link>
        ) : (
          <div key={game.id}>{cardContent}</div>
        )
      }
      
      return (
        <div className="space-y-6">
          {completed.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
                Recent Results
              </p>
              <div className="space-y-2">
                {completed.map(renderGameCard)}
              </div>
            </section>
          )}
          
          {upcoming.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
                Upcoming Games
              </p>
              <div className="space-y-2">
                {upcoming.map(renderGameCard)}
              </div>
            </section>
          )}
        </div>
      )
    })()}
  </div>
)}
      
      <BottomNav active="team" />
    </main>
  )
}
