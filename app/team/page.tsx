'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCurrentTeam } from '@/components/team-context'
import { useTeamSeason } from '@/lib/org/useTeamSeason'
import { BottomNav } from '@/components/BottomNav'
import { Skeleton, RowSkeleton } from '@/components/Skeleton'
import { getDashboardTeamAdminAssignments, type DashboardTeamAdminAssignment } from '@/app/actions/dashboard'
import { useActiveOrg } from '@/components/org-context'
import { useOrgSeasons } from '@/lib/org/useOrgSeasons'

// ─── Types ────────────────────────────────────────────────────────────────

type StandingRow = {
  id: string
  team_name: string
  games_played: number
  wins: number
  losses: number
  ties: number
  runs_for: number
  runs_against: number
}

type Player = {
  id: string
  name: string
  jersey_number: string | null
  position: string | null
}

type LeagueGameRow = {
  id: string
  played_at: string
  home_score: number | null
  away_score: number | null
  status: string
  home_team: { id: string; name: string; division: string } | null
  away_team: { id: string; name: string; division: string } | null
  events: { id: string }[]
}

type SubView = 'overview' |'standings' | 'results' | 'roster'

type TeamOverviewEvent = {
  id: string
  event_type: string | null
  result: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRecord(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

function calcPct(w: number, l: number, t: number): string {
  const total = w + l + t
  if (total === 0) return '—'
  return ((w + t * 0.5) / total).toFixed(3).replace(/^0/, '')
}

function formatChicagoShortDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function TeamPage() {
  return (
    <Suspense fallback={<TeamPageSkeleton />}>
      <TeamPageInner />
    </Suspense>
  )
}

function TeamPageSkeleton() {
  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] text-slate-400 font-bold">2026</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Team</h1>
      </div>
      <div className="mx-auto max-w-sm px-4 pt-4">
        <div className="h-9 rounded-full bg-white/5 border border-white/10" />
      </div>
      <div className="mx-auto max-w-sm space-y-2 px-4 pt-4">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
      <BottomNav active="team" />
    </main>
  )
}

function TeamPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentTeam } = useCurrentTeam()
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color ?? '#dc2626'
  const { seasons, currentSeasonId, loading: seasonsLoading } = useOrgSeasons()
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const effectiveSeasonId = selectedSeasonId ?? currentSeasonId
  const selectedSeason = seasons.find(season => season.id === effectiveSeasonId) ?? null
  const { teamSeasonId, loading: teamSeasonLoading, notFound: teamSeasonNotFound } = useTeamSeason(
    currentTeam.id,
    effectiveSeasonId
)
  const [teamAdminAssignments, setTeamAdminAssignments] = useState<DashboardTeamAdminAssignment[]>([])
  const [teamAdminsLoading, setTeamAdminsLoading] = useState(true)
  const [overviewPlayerCount, setOverviewPlayerCount] = useState<number | null>(null)
  const [overviewEvents, setOverviewEvents] = useState<TeamOverviewEvent[]>([])

  const overviewRecord = useMemo(() => overviewEvents.reduce(
    (acc, e) => {
      if (e.result === 'win') acc.wins++
      else if (e.result === 'loss') acc.losses++
      else if (e.result === 'tie') acc.ties++
      return acc
    },
    { wins: 0, losses: 0, ties: 0 }
  ), [overviewEvents])

  const overviewLeagueRecord = useMemo(() => overviewEvents
    .filter(e => e.event_type !== 'tournament')
    .reduce(
      (acc, e) => {
        if (e.result === 'win') acc.wins++
        else if (e.result === 'loss') acc.losses++
        else if (e.result === 'tie') acc.ties++
        return acc
      },
      { wins: 0, losses: 0, ties: 0 }
    ), [overviewEvents])

  const overviewWinPct = (() => {
    const total = overviewRecord.wins + overviewRecord.losses + overviewRecord.ties
    if (total === 0) return '—'
    return ((overviewRecord.wins + overviewRecord.ties * 0.5) / total).toFixed(3).replace(/^0/, '')
  })()

  // Read sub-view from URL, default to standings
  const viewParam = searchParams.get('view')
  const view: SubView =
    viewParam === 'standings' || viewParam === 'results' || viewParam === 'roster'
      ? viewParam
      : 'overview'

  const setView = (next: SubView) => {
  const url = new URL(window.location.href)
  url.searchParams.set('view', next)
  router.replace(url.pathname + url.search, { scroll: false })
  }

  useEffect(() => {
    const loadTeamAdmins = async () => {
      setTeamAdminsLoading(true)

      const result = await getDashboardTeamAdminAssignments()

      if (result.ok) {
        setTeamAdminAssignments(
          result.assignments.filter(a => a.team_id === currentTeam.id)
        )
      }

      setTeamAdminsLoading(false)
    }

    loadTeamAdmins()
  }, [currentTeam.id])

 useEffect(() => {
  const loadPlayerCount = async () => {
    if (seasonsLoading || teamSeasonLoading) {
      return
    }

    if (!teamSeasonId) {
      setOverviewPlayerCount(0)
      return
    }

    const supabase = createClient()

    const { count } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_season_id', teamSeasonId)

    setOverviewPlayerCount(count ?? 0)
  }

  loadPlayerCount()
}, [teamSeasonId, teamSeasonLoading, seasonsLoading])

  useEffect(() => {
    const loadOverviewEvents = async () => {
      const supabase = createClient()

      const { data } = await supabase
        .from('events')
        .select('id, event_type, result')
        .eq('team_id', currentTeam.id)
        .not('result', 'is', null)

      setOverviewEvents((data ?? []) as TeamOverviewEvent[])
    }

    loadOverviewEvents()
  }, [currentTeam.id])

  if (teamSeasonNotFound) {
    return (
      <main className="min-h-screen bg-black pb-32 text-white">
        <div className="mx-auto max-w-sm px-4 pt-6">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <p className="font-bold">Team not found in current season</p>
            <p className="mt-1 text-sm">
              {currentTeam.label}: no team_seasons row exists for the current season.
              Admin should create one.
            </p>
          </div>
        </div>
        <BottomNav active="team" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p className="text-xl tracking-[0.1em] font-bold"
            style={{ color: brandColor }}
            >
              {selectedSeason?.name ?? 'Season'}
            </p>
        <h1 className="text-3xl font-extrabold text-white mt-1">
          {view === 'overview' ? 'Team'
            : view === 'standings' ? 'Standings'
            : view === 'results' ? 'Results'
            : 'Roster'}
                </h1>

        {seasons.length > 1 && (
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Season
            </label>
            <div className="relative">
              <select
                value={effectiveSeasonId ?? ''}
                onChange={e => setSelectedSeasonId(e.target.value || null)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-white/10 px-3 py-2 pr-10 text-sm font-semibold text-white outline-none"
              >
                {seasons.map(season => (
                  <option key={season.id} value={season.id} className="bg-slate-950 text-white">
                    {season.name}{season.is_current ? ' · Current' : ''}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
                ▾
              </span>
            </div>
          </div>
        )}

        <p className="text-sm text-slate-400 mt-1">{currentTeam.division}</p>
      </div>

      {/* Toggle */}
      <div className="mx-auto max-w-sm px-4 pt-4">
        <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-1">
          {(['overview', 'standings', 'results', 'roster'] as const).map((key) => {
           const label = key === 'overview' ? 'Overview'
            : key === 'standings' ? 'Standings'
            : key === 'results' ? 'Results'
            : 'Roster'
            const brandColor = org?.primary_color || '#dc2626'
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                  view === key
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
                style={
                  view === key
                    ? { backgroundColor: brandColor }
                    : undefined
                }
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

          <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">
            {view === 'overview' && (
              <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-4">
                  {org?.logo_url && (
                    <img
                      src={org.logo_url}
                      alt={org.name ?? 'Organization logo'}
                      className="h-16 w-16 object-contain"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[10px] uppercase tracking-wide font-semibold"
                      style={{ color: brandColor }}
                    >
                      Team Overview
                    </p>
                    <h2 className="mt-1 text-lg font-extrabold text-white">
                      {currentTeam.fullName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {currentTeam.division}
                    </p>
                  </div>
                </div>
              </div>  

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-[10px] uppercase tracking-wide font-semibold"
                style={{ color: brandColor }}>
                Record
            </p>

            <p className="mt-3 text-xs text-slate-400 tabular-nums">
              <span className="text-slate-500">PCT </span>
              <span className="text-white font-semibold">{overviewWinPct}</span>

              <span className="mx-2 text-slate-700">·</span>

              <span className="text-slate-500">Overall </span>
              <span className="text-slate-300 font-semibold">
                {overviewRecord.wins}–{overviewRecord.losses}
                {overviewRecord.ties > 0 ? `–${overviewRecord.ties}` : ''}
              </span>

              <span className="mx-2 text-slate-700">·</span>

              <span className="text-slate-500">League </span>
              <span className="text-slate-300 font-semibold">
                {overviewLeagueRecord.wins}–{overviewLeagueRecord.losses}
                {overviewLeagueRecord.ties > 0 ? `–${overviewLeagueRecord.ties}` : ''}
              </span>
            </p>
          </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-[10px] uppercase tracking-wide font-semibold"
                style={{ color: brandColor }}>
                Roster
              </p>

              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {overviewPlayerCount ?? '—'}
                </span>
                <span className="pb-1 text-sm text-slate-400">
                  players
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-[10px] uppercase tracking-wide font-semibold"
                style={{ color: brandColor }}>
                Team Admins
                </p>
              {teamAdminsLoading ? (
                <p className="mt-2 text-sm text-slate-400">Loading team admins...</p>
              ) : teamAdminAssignments.length === 0 ? (
                <p className="mt-2 text-sm text-yellow-300">No team admin assigned.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {teamAdminAssignments.map(admin => (
                    <div key={admin.membership_id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <p className="text-sm font-semibold text-white">
                        {admin.full_name || admin.email || 'Unnamed admin'}
                      </p>
                      {admin.email && (
                        <p className="text-xs text-slate-500">{admin.email}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {view === 'standings' && (
          <StandingsView
            division={currentTeam.division}
            currentTeamId={currentTeam.id}
            brandColor={brandColor}
          />
        )}
        {view === 'results' && (
          <ResultsView division={currentTeam.division} />
        )}
        {view === 'roster' && (
          <RosterView teamSeasonId={teamSeasonId} teamSeasonLoading={teamSeasonLoading} />
        )}
      </div>

      <BottomNav active="team" />
    </main>
  )
}

// ─── Standings sub-view ───────────────────────────────────────────────────

function StandingsView({
  division,
  currentTeamId,
  brandColor,
}: {
  division: string
  currentTeamId: string
  brandColor: string
}) {
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('computed_standings')
          .select('id, team_name, games_played, wins, losses, ties, runs_for, runs_against')
          .eq('division', division)
        setStandings((data ?? []) as StandingRow[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [division])

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
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 pl-4 pr-2 text-left text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Team</th>
            <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-14">Record</th>
            <th className="py-2 px-2 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-12">PCT</th>
            <th className="py-2 pl-2 pr-4 text-center text-[11px] uppercase tracking-wide text-slate-500 font-semibold w-10">RD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <tr key={i}>
              <td className="py-3 pl-4 pr-2"><Skeleton className="h-4 w-32" /></td>
              <td className="py-3 px-2"><Skeleton className="h-4 w-10 mx-auto" /></td>
              <td className="py-3 px-2"><Skeleton className="h-4 w-8 mx-auto" /></td>
              <td className="py-3 pl-2 pr-4"><Skeleton className="h-4 w-6 mx-auto" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <>
      <table className="w-full">
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
          const isUs = team.id === currentTeamId
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
              <td className="py-3 pl-2 pr-4 text-center tabular-nums">
                <span
                  className={diff === 0 ? 'text-slate-400' : undefined}
                  style={
                    diff > 0
                      ? { color: '#4ade80' }
                      : diff < 0
                        ? { color: '#f87171' }
                        : undefined
                  }
                >
                  {diff > 0 ? `+${diff}` : diff}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
      </table>
      <div className="pt-4 text-center">
        <Link href="/team/rules" className="text-xs text-slate-500 hover:text-slate-300 transition">
          MSBL 2026 Rules →
        </Link>
      </div>
    </>
  )
}

// ─── Results sub-view ─────────────────────────────────────────────────────

function ResultsView({ division }: { division: string }) {
  const [leagueGames, setLeagueGames] = useState<LeagueGameRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadLeagueGames = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('league_games')
          .select(`
            id, played_at, home_score, away_score, status,
            home_team_season:home_team_season_id (
              id,
              teams:team_id ( id, name, division )
            ),
            away_team_season:away_team_season_id (
              id,
              teams:team_id ( id, name, division )
            ),
            events!events_league_game_id_fkey (id)
          `)
          .order('played_at', { ascending: false })

        if (error) {
          console.error('Error loading league games:', error)
          return
        }
        if (!data) return

        // Unwrap nested team_season → teams shape (same pattern as standings page)
        const normalized = data.map((g: any) => {
          const homeTs = Array.isArray(g.home_team_season) ? g.home_team_season[0] : g.home_team_season
          const awayTs = Array.isArray(g.away_team_season) ? g.away_team_season[0] : g.away_team_season
          return {
            ...g,
            home_team: homeTs?.teams
              ? (Array.isArray(homeTs.teams) ? homeTs.teams[0] : homeTs.teams)
              : null,
            away_team: awayTs?.teams
              ? (Array.isArray(awayTs.teams) ? awayTs.teams[0] : awayTs.teams)
              : null,
          }
        })

        // Filter to games where at least one team is in our division
        const filtered = normalized.filter((g: any) =>
          g.home_team?.division === division || g.away_team?.division === division
        )
        setLeagueGames(filtered as LeagueGameRow[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadLeagueGames()
  }, [division])

  if (loading) {
    return (
      <div className="space-y-6">
        <section>
          <div className="mb-2 h-3 w-24"><Skeleton className="h-3 w-24" /></div>
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Skeleton className="h-3 w-16" />
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-6" />
                  </div>
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  if (leagueGames.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-slate-400 text-sm">No league games yet.</p>
      </div>
    )
  }

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
}

// ─── Roster sub-view ──────────────────────────────────────────────────────

function RosterView({ teamSeasonId, teamSeasonLoading }: { teamSeasonId: string | null; teamSeasonLoading: boolean }) {
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color ?? '#dc2626'
  
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (teamSeasonLoading) {
      setLoading(true)
      return
    }
    const load = async () => {
      try {
        if (!teamSeasonId) {
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
  }, [teamSeasonId, teamSeasonLoading])

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const numA = parseInt(a.jersey_number ?? '999', 10)
      const numB = parseInt(b.jersey_number ?? '999', 10)
      return numA - numB
    })
  }, [players])

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (sortedPlayers.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-slate-400">No players on this roster yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortedPlayers.map((player) => (
        <Link key={player.id} href={`/player/${player.id}`}>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                  style={{ backgroundColor: brandColor }}
                >
              {player.jersey_number ?? '?'}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{player.name}</p>
              {player.position && (
                <p className="text-xs text-slate-400">{player.position}</p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}