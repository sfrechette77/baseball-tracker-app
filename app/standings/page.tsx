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

const LEAGUE_RULES = [
  {
    section: '1. Mission Statement',
    content: 'The Mid Suburban Baseball League (MSBL) was founded to provide travel teams from local communities with a fair, flexible, and affordable way to compete in organized league and tournament play. Our mission is to promote good sportsmanship, inclusiveness, and respect for all players, coaches, and families, while allowing teams to shape their own schedules based on field availability and needs.'
  },
  {
    section: '2. League Entry',
    content: [
      'Entry is by invitation only.',
      'League entry fee is $600 ($800 for 15/16U). Includes the MSBL Tournament. Teams must complete 75% of regular season games to be eligible.',
      'Teams must upload a Certificate of Insurance to the MSBL website. Birth certificates produced within 24 hours of coach request.',
      '2025 B/National Regular Season Champions must register for A/American division in 2026.'
    ]
  },
  {
    section: '3. Rostered Players and Coaches',
    content: [
      'Maximum of 15 players per team. No add/replace players after 3/31/2026.',
      'Limit of 3 coaches + 1 manager + 1 scorekeeper in dugout at any one time.',
      'Late arrivals placed at end of batting order.',
      'Players can only be rostered on one MSBL team.',
      'No "Hired Gun" rule: rostered players must have played in 70% of games to be used (calculation begins on the 11th game).',
      'Exceptions: Injury/illness games not counted. House players as fill-ins eligible. Travel players playing up require notification and approval.'
    ]
  },
  {
    section: '4. Games',
    content: [
      'League games begin no earlier than April 1st. Approximately 16-20 games per season (8U: 10-12).',
      '11U Regular Season ends 11:59 PM 6/22/2026, Bracket Play 6/25 – 6/28.',
      'No double-booking. 14-day notice required for postponement due to scheduling conflicts.',
      'Home team manager must contact visiting team at least 1½ hours before game time to cancel due to weather.',
      'Home team supplies one "patched" umpire (IHSA preferred) and two new game balls (Rawlings ROLB, ROLB1 R100, or Wilson).',
      'Wait 15 minutes after scheduled time for traveling teams. Game can begin with 8 players (9th spot is automatic out).',
      'Teams must play 100% of scheduled games. Forfeits scored 6-0 (8U-10U) or 7-0 (11U-14U).',
      'Hosting team selects their dugout regardless of scheduled "home team".'
    ]
  },
  {
    section: '5. Playing Rules — 11U Specific',
    content: [
      'Base Distance: 70\'',
      'Pitching Distance: 50\'',
      'Pitching Inning Limit: 3 innings (3 consecutive outs = 1 inning)',
      'Game Length: 7 innings (official after 5 innings)',
      'Bunts: Allowed',
      'Steals: Allowed',
      'Leadoffs: Allowed',
      'Balks: 1 warning per pitcher per inning',
      'Dropped Third Strike: Yes',
      'Infield Fly: Yes',
      'Metal Spikes: No',
      'Breaking Balls: No',
      'Run Rule: 12 runs after 4 innings, 10 runs after 5 innings'
    ]
  },
  {
    section: '5. General Playing Rules',
    content: [
      'IHSA rules apply unless otherwise noted.',
      'Tied games at end of regulation play California Rules: extra inning starts with 1 out, last batted out on 2nd base, 1-1 count.',
      'Continuous batting lineup. Free defensive substitutions. Players leaving early result in automatic out (with exceptions for pre-announced or injury).',
      'Courtesy Runners: Allowed for catchers, pitchers, and injured players. Must be last batted out.',
      'Avoid Contact Rule: Runners must slide or attempt to avoid contact. Malicious contact may result in ejection.',
      'Run Rule: 12 runs after 4 innings, 10 runs after 5 innings.',
      'Bunt Rule: Batters showing bunt must bunt or take the pitch. No swinging after showing bunt.',
      'Pitching: 1 free mound visit per inning, 2 per pitcher per game. Removed pitchers cannot re-enter as pitchers. Pitcher hitting 3 batters in a game must be removed.'
    ]
  },
  {
    section: '6. Equipment',
    content: [
      'No metal spikes at 8U-12U.',
      'Helmets required for batters, on-deck hitters, base runners, and player base coaches.',
      'No jewelry.',
      'Bats must be marked "1.15 BPF", "USSSA", "USA", "BBCOR", or be wood. 13U: -8 minimum. 14U: -5 or -3 only.',
      'Protective cup required for all players. Catchers must wear full catcher\'s equipment.'
    ]
  },
  {
    section: '7. Conduct',
    content: [
      'Only team managers may discuss calls with umpires (rules questions only — judgment calls are final).',
      'Ejections: 1st = warning + up to 1 game suspension. 2nd = minimum 3 game suspension. 3rd = Disciplinary Committee.',
      'Ejections must be reported by both managers within 24 hours.',
      'Team managers responsible for conduct of coaches, players, and fans.',
      'No vocal distractions during pitcher\'s wind-up. No protests allowed.',
      'Disputes (rules, not judgment calls) submitted via email to MSBL — final decision by MSBL.'
    ]
  },
  {
    section: '8. Tie Breakers — Divisional Standings',
    content: [
      '1. Best record in head-to-head competition (2 teams only).',
      '2. Best division/conference record.',
      '3. Fewest runs allowed overall.',
      '4. Most runs scored overall.',
      '5. One game playoff.'
    ]
  },
  {
    section: '9. MSBL Tournament',
    content: [
      'All teams required to participate. Must complete 75% of regular season games to be eligible.',
      'Format: Single elimination. Teams seeded into "Gold" or "Silver" bracket based on regular season record.',
      'Two tournament winners per league level (Gold + Silver).',
      'Seeding Tie Breakers: Head-to-head → Runs Allowed → Runs Scored → Coin Flip.'
    ]
  }
]

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

function StandingsIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
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

const CURRENT_DIVISION = '11U American Division'
const OUR_TEAM = 'Elite 11U - Moore'

export default function StandingsPage() {
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [leagueGames, setLeagueGames] = useState<LeagueGameRow[]>([])
  const [activeTab, setActiveTab] = useState<'standings' | 'results' | 'rules'>('standings')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('computed_standings')
          .select('id, team_name, games_played, wins, losses, ties, runs_for, runs_against')
          .eq('division', CURRENT_DIVISION)
        setStandings((data ?? []) as StandingRow[])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
  const loadLeagueGames = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('league_games')
      .select(`
        id, played_at, home_score, away_score, status,
        home_team:home_team_id (id, name, division),
        away_team:away_team_id (id, name, division),
        events!events_league_game_id_fkey (id)
      `)
      .order('played_at', { ascending: false })
    
    if (error) {
      console.error('Error loading league games:', error)
      return
    }
    
    if (data) {
  const normalized = data.map((g: any) => ({
    ...g,
    home_team: Array.isArray(g.home_team) ? g.home_team[0] : g.home_team,
    away_team: Array.isArray(g.away_team) ? g.away_team[0] : g.away_team,
  }))
  // Filter to games where at least one team is in our division
  const filtered = normalized.filter((g: any) =>
    g.home_team?.division === CURRENT_DIVISION ||
    g.away_team?.division === CURRENT_DIVISION
  )
  setLeagueGames(filtered as LeagueGameRow[])
    }
  }
  loadLeagueGames()
}, [])

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
        <p className="text-xl tracking-[0.1em] text-red-400 font-bold">2026</p>
        <h1 className="text-xl font-extrabold text-white mt-1">Mid Suburban Baseball League</h1>
        <p className="text-sm text-slate-400 mt-1">11U American Division</p>
      </div>

      {/* Internal tabs */}
        <div className="flex justify-center gap-2 mb-4">
          {([
            { key: 'standings', label: 'Standings' },
            { key: 'results', label: 'Results' },
            { key: 'rules', label: 'MSBL Rules' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                activeTab === key
                  ? 'bg-red-600 text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
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
                  const isUs = team.team_name === OUR_TEAM
                  const diff = team.runs_for - team.runs_against
                  return (
                    <tr key={team.id} className={isUs ? 'bg-red-600/10 border-l-2 border-l-red-500' : ''}>
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
      
      {/* League Rules */}
      {activeTab === 'rules' && (
        <section className="mt-6">
          <div className="space-y-2">
            {LEAGUE_RULES.map((rule) => (
              <details key={rule.section} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <summary className="cursor-pointer text-sm font-bold text-white">
                  {rule.section}
                </summary>
                <div className="mt-3 text-sm text-slate-300 space-y-2">
                  {Array.isArray(rule.content) ? (
                    <ul className="list-disc list-inside space-y-1.5">
                      {rule.content.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{rule.content}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            Source: 2026 MSBL Official League Rules
          </p>
        </section>
      )}
      <BottomNav active="standings" />
    </main>
  )
}
