'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const PASSWORD_KEY = 'admin_password'
const INNINGS = [1, 2, 3, 4, 5, 6, 7]

type EventRow = {
  id: string
  title: string
  opponent: string | null
  starts_at: string
  event_type: string | null
  team_score: number | null
  opponent_score: number | null
  result: string | null
}

type Player = {
  id: string
  name: string
  jersey_number: string | null
}

type StatRow = {
  player_id: string
  at_bats: number
  hits: number
  rbi: number
  runs: number
  strikeouts: number
  pitch_count: number
  innings_pitched: number
  hits_allowed: number
  earned_runs: number
  strikeouts_pitching: number
  walks: number
}

type Standing = {
  id: string
  team_name: string
  games_played: number
  wins: number
  losses: number
  ties: number
  runs_for: number
  runs_against: number
}

type Tab = 'score' | 'stats' | 'standings'

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(new Date(dateStr))
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onSuccess }: { onSuccess: (pw: string) => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = async () => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input, action: 'update_score', eventId: 'test' })
    })
    if (res.status === 401) { setError(true); return }
    localStorage.setItem(PASSWORD_KEY, input)
    onSuccess(input)
  }

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">⚾</p>
          <h1 className="text-2xl font-extrabold text-white">Admin Access</h1>
          <p className="text-slate-400 text-sm mt-1">Chicago Elite 11U · Moore</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <input type="password" placeholder="Enter password" value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-red-500" />
          {error && <p className="text-red-400 text-sm">Incorrect password</p>}
          <button onClick={handleSubmit}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition">
            Sign In
          </button>
        </div>
      </div>
    </main>
  )
}

// ─── Main Admin ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('score')

  // Events
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [teamScore, setTeamScore] = useState('')
  const [opponentScore, setOpponentScore] = useState('')
  const [result, setResult] = useState<'win' | 'loss' | 'tie'>('win')
  const [isHome, setIsHome] = useState(false)
  const [usInnings, setUsInnings] = useState<number[]>(Array(7).fill(0))
  const [themInnings, setThemInnings] = useState<number[]>(Array(7).fill(0))
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreMsg, setScoreMsg] = useState<string | null>(null)

  // Player stats
  const [players, setPlayers] = useState<Player[]>([])
  const [statsEventId, setStatsEventId] = useState('')
  const [playerStats, setPlayerStats] = useState<Record<string, StatRow>>({})
  const [statsSaving, setStatsSaving] = useState(false)
  const [statsMsg, setStatsMsg] = useState<string | null>(null)

  // Standings
  const [standings, setStandings] = useState<Standing[]>([])
  const [editedStandings, setEditedStandings] = useState<Record<string, Standing>>({})
  const [standingsSaving, setStandingsSaving] = useState(false)
  const [standingsMsg, setStandingsMsg] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(PASSWORD_KEY)
    if (saved) setPassword(saved)
  }, [])

  useEffect(() => {
    if (!password) return
    const load = async () => {
      const supabase = createClient()
      const [{ data: eventsData }, { data: playersData }, { data: standingsData }] = await Promise.all([
        supabase.from('events').select('id, title, opponent, starts_at, event_type, team_score, opponent_score, result')
          .neq('event_type', 'practice').order('starts_at', { ascending: false }),
        supabase.from('players').select('id, name, jersey_number').order('jersey_number', { ascending: true }),
        supabase.from('standings').select('id, team_name, games_played, wins, losses, ties, runs_for, runs_against')
      ])
      setEvents((eventsData ?? []) as EventRow[])
      setPlayers((playersData ?? []) as Player[])
      const s = (standingsData ?? []) as Standing[]
      setStandings(s)
      const map: Record<string, Standing> = {}
      for (const row of s) map[row.id] = { ...row }
      setEditedStandings(map)
    }
    load()
  }, [password])

  // Load existing box scores when score event changes
  useEffect(() => {
    if (!selectedEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('box_scores').select('*').eq('event_id', selectedEventId)
      if (data) {
        const us = data.find((r: { team: string }) => r.team === 'us')
        const them = data.find((r: { team: string }) => r.team === 'them')
        if (us) setUsInnings(INNINGS.map(i => us[`inning_${i}`] ?? 0))
        if (them) setThemInnings(INNINGS.map(i => them[`inning_${i}`] ?? 0))
      }
    }
    load()
  }, [selectedEventId, password])

  // Load existing stats when stats event changes
  useEffect(() => {
    if (!statsEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('player_stats')
        .select('player_id, at_bats, hits, rbi, runs, strikeouts, pitch_count, innings_pitched, strikeouts_pitching, walks, hits_allowed, earned_runs')
        .eq('event_id', statsEventId)
      const map: Record<string, StatRow> = {}
      for (const p of players) {
        const existing = (data ?? [] as unknown as StatRow[]).find((r: StatRow) => r.player_id === p.id)
        map[p.id] = existing ?? { player_id: p.id, at_bats: 0, hits: 0, rbi: 0, runs: 0, strikeouts: 0, pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks: 0, hits_allowed: 0, earned_runs: 0 }
      }
      setPlayerStats(map)
    }
    load()
  }, [statsEventId, players, password])

  const api = async (body: object) => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password })
    })
    if (res.status === 401) { localStorage.removeItem(PASSWORD_KEY); setPassword(null) }
    return res.json()
  }

  const saveScore = async () => {
    if (!selectedEventId) return
    setScoreSaving(true)
    setScoreMsg(null)
    await api({ action: 'update_score', eventId: selectedEventId, teamScore: Number(teamScore), opponentScore: Number(opponentScore), result, isHome })
    await api({ action: 'update_box_score', eventId: selectedEventId, team: 'us', innings: usInnings })
    await api({ action: 'update_box_score', eventId: selectedEventId, team: 'them', innings: themInnings })
    setScoreSaving(false)
    setScoreMsg('✅ Saved!')
  }

  const saveStats = async () => {
    if (!statsEventId) return
    setStatsSaving(true)
    setStatsMsg(null)
    for (const [playerId, stats] of Object.entries(playerStats)) {
      await api({
        action: 'update_player_stats', playerId, eventId: statsEventId,
        atBats: stats.at_bats, hits: stats.hits, rbi: stats.rbi, runs: stats.runs, walks: stats.walks ?? 0, strikeouts: stats.strikeouts,
        pitchCount: stats.pitch_count ?? 0, inningsPitched: stats.innings_pitched ?? 0,
        strikeoutsPitching: stats.strikeouts_pitching ?? 0, walks: stats.walks ?? 0, hitsAllowed: stats.hits_allowed ?? 0, earnedRuns: stats.earned_runs ?? 0
      })
    }
    setStatsSaving(false)
    setStatsMsg('✅ All stats saved!')
  }

  const saveStandings = async () => {
    setStandingsSaving(true)
    setStandingsMsg(null)
    for (const row of Object.values(editedStandings)) {
      await api({ action: 'update_standing', standingId: row.id, wins: row.wins, losses: row.losses, ties: row.ties, gamesPlayed: row.games_played, runsFor: row.runs_for, runsAgainst: row.runs_against })
    }
    setStandingsSaving(false)
    setStandingsMsg('✅ Standings saved!')
  }

  const updateStat = (playerId: string, field: keyof StatRow, value: string) => {
    setPlayerStats(prev => ({ ...prev, [playerId]: { ...prev[playerId], [field]: Number(value) } }))
  }

  const updateStanding = (id: string, field: keyof Standing, value: string) => {
    setEditedStandings(prev => ({ ...prev, [id]: { ...prev[id], [field]: Number(value) } }))
  }

  if (!password) return <PasswordGate onSuccess={setPassword} />

  const selectedEvent = events.find(e => e.id === selectedEventId)
  const usTotal = usInnings.reduce((a, b) => a + b, 0)
  const themTotal = themInnings.reduce((a, b) => a + b, 0)

  return (
    <main className="min-h-screen bg-black pb-10 text-white">
      {/* Header */}
      <div className="bg-black px-4 pt-8 pb-4 border-b border-white/10">
        <div className="mx-auto max-w-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">Admin</p>
            <h1 className="text-xl font-extrabold text-white">Game Manager</h1>
          </div>
          <button onClick={() => { localStorage.removeItem(PASSWORD_KEY); setPassword(null) }}
            className="text-xs text-slate-500 hover:text-slate-300 transition">
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-sm mt-4 grid grid-cols-3 gap-2">
          {([
            { key: 'score', label: '🏆 Score' },
            { key: 'stats', label: '📊 Stats' },
            { key: 'standings', label: '📋 Standings' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`rounded-xl py-2 text-xs font-bold transition ${tab === key ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-sm px-4 pt-4 space-y-4">

        {/* ── Score Tab ──────────────────────────────────────────────────── */}
        {tab === 'score' && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Select Game</p>
              <select value={selectedEventId} onChange={e => {
                setSelectedEventId(e.target.value)
                setScoreMsg(null)
                setUsInnings(Array(7).fill(0))
                setThemInnings(Array(7).fill(0))
                setIsHome(false)
                const ev = events.find(ev => ev.id === e.target.value)
                if (ev) {
                  setTeamScore(ev.team_score?.toString() ?? '')
                  setOpponentScore(ev.opponent_score?.toString() ?? '')
                  setResult((ev.result as 'win' | 'loss' | 'tie') ?? 'win')
                }
              }}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:border-red-500">
                <option value="">— Pick a game —</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>
                    {formatDate(e.starts_at)} — {e.opponent ? `vs ${e.opponent}` : e.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedEventId && (
              <>
                {/* Final Score */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Final Score — {selectedEvent?.opponent ? `vs ${selectedEvent.opponent}` : selectedEvent?.title}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Our Score</p>
                      <input type="number" value={teamScore} onChange={e => setTeamScore(e.target.value)}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-2xl font-bold text-white text-center focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Their Score</p>
                      <input type="number" value={opponentScore} onChange={e => setOpponentScore(e.target.value)}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-2xl font-bold text-white text-center focus:outline-none focus:border-red-500" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Result</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['win', 'loss', 'tie'] as const).map(r => (
                        <button key={r} onClick={() => setResult(r)}
                          className={`rounded-xl py-3 text-sm font-bold transition ${result === r
                            ? r === 'win' ? 'bg-green-600 text-white' : r === 'loss' ? 'bg-red-600 text-white' : 'bg-slate-600 text-white'
                            : 'bg-white/10 text-slate-400'}`}>
                          {r === 'win' ? 'W' : r === 'loss' ? 'L' : 'T'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Game Location</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['away', 'home'] as const).map(loc => (
                        <button key={loc} onClick={() => setIsHome(loc === 'home')}
                          className={`rounded-xl py-3 text-sm font-bold transition ${
                            isHome === (loc === 'home') ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-400'
                          }`}>
                          {loc === 'home' ? '🏠 Home' : '✈️ Away'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Box Score Entry */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Box Score — Runs per Inning</p>

                  {/* Column headers */}
                  <div className="grid grid-cols-9 gap-1 text-center">
                    <p className="col-span-2 text-left text-[10px] text-slate-500 uppercase font-semibold">Team</p>
                    {INNINGS.map(i => (
                      <p key={i} className="text-[10px] text-slate-500 uppercase font-semibold">{i}</p>
                    ))}
                  </div>

                  {/* Us row */}
                  <div className="grid grid-cols-9 gap-1 items-center">
                    <p className="col-span-2 text-xs font-bold text-white">Elite</p>
                    {usInnings.map((val, idx) => (
                      <input key={idx} type="number" min="0" value={val}
                        onChange={e => {
                          const next = [...usInnings]
                          next[idx] = Number(e.target.value)
                          setUsInnings(next)
                        }}
                        className="rounded-lg bg-white/10 border border-white/10 px-0 py-2 text-sm text-white text-center focus:outline-none focus:border-red-500 w-full" />
                    ))}
                  </div>

                  {/* Them row */}
                  <div className="grid grid-cols-9 gap-1 items-center">
                    <p className="col-span-2 text-xs font-semibold text-slate-400 truncate">
                      {selectedEvent?.opponent ?? 'Opp'}
                    </p>
                    {themInnings.map((val, idx) => (
                      <input key={idx} type="number" min="0" value={val}
                        onChange={e => {
                          const next = [...themInnings]
                          next[idx] = Number(e.target.value)
                          setThemInnings(next)
                        }}
                        className="rounded-lg bg-white/10 border border-white/10 px-0 py-2 text-sm text-white text-center focus:outline-none focus:border-red-500 w-full" />
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="flex justify-between rounded-xl bg-white/5 px-4 py-2">
                    <span className="text-xs text-slate-400">Elite total: <span className="text-white font-bold">{usTotal}</span></span>
                    <span className="text-xs text-slate-400">{selectedEvent?.opponent ?? 'Opp'} total: <span className="text-white font-bold">{themTotal}</span></span>
                  </div>
                </div>

                <button onClick={saveScore} disabled={scoreSaving}
                  className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50">
                  {scoreSaving ? 'Saving...' : 'Save Score + Box Score'}
                </button>
                {scoreMsg && <p className="text-sm text-center">{scoreMsg}</p>}
              </>
            )}
          </>
        )}

        {/* ── Stats Tab ──────────────────────────────────────────────────── */}
        {tab === 'stats' && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Select Game</p>
              <select value={statsEventId} onChange={e => { setStatsEventId(e.target.value); setStatsMsg(null) }}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:border-red-500">
                <option value="">— Pick a game —</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>
                    {formatDate(e.starts_at)} — {e.opponent ? `vs ${e.opponent}` : e.title}
                  </option>
                ))}
              </select>
            </div>

            {statsEventId && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                {players.map(player => {
                  const s = playerStats[player.id] ?? { at_bats: 0, hits: 0, rbi: 0, runs: 0, strikeouts: 0, pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks: 0 }
                  return (
                    <div key={player.id} className="space-y-1">
                      <p className="text-xs font-semibold text-slate-300">
                        {player.jersey_number !== null ? `#${player.jersey_number} ` : ''}{player.name}
                      </p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Batting</p>
                      <div className="grid grid-cols-5 gap-1">
                        {([
                          ['at_bats', s.at_bats, 'AB'],
                          ['hits', s.hits, 'H'],
                          ['rbi', s.rbi, 'RBI'],
                          ['runs', s.runs, 'R'],
                          ['walks', s.walks, 'BB'],
                          ['strikeouts', s.strikeouts, 'K'],
                        ] as [keyof StatRow, number, string][]).map(([field, val, label]) => (
                          <div key={field} className="space-y-0.5">
                            <p className="text-[9px] text-slate-500 text-center">{label}</p>
                            <input type="number" value={val}
                              onChange={e => updateStat(player.id, field, e.target.value)}
                              className="w-full rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-sm text-white text-center focus:outline-none focus:border-red-500" />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide pt-1">Pitching</p>
                      <div className="grid grid-cols-4 gap-1">
                        {([
                          ['pitch_count', s.pitch_count ?? 0, 'Pitches'],
                          ['innings_pitched', s.innings_pitched ?? 0, 'IP'],
                          ['hits_allowed', s.hits_allowed ?? 0, 'H'],
                          ['earned_runs', s.earned_runs ?? 0, 'ER'],
                          ['strikeouts_pitching', s.strikeouts_pitching ?? 0, 'K'],
                          ['walks', s.walks ?? 0, 'BB'],
                        ] as [keyof StatRow, number, string][]).map(([field, val, label]) => (
                          <div key={field} className="space-y-0.5">
                            <p className="text-[9px] text-slate-500 text-center">{label}</p>
                            <input type="number" value={val}
                              onChange={e => updateStat(player.id, field, e.target.value)}
                              className="w-full rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-sm text-white text-center focus:outline-none focus:border-red-500" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                <button onClick={saveStats} disabled={statsSaving}
                  className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50">
                  {statsSaving ? 'Saving...' : 'Save All Stats'}
                </button>
                {statsMsg && <p className="text-sm text-center">{statsMsg}</p>}
              </div>
            )}
          </>
        )}

        {/* ── Standings Tab ──────────────────────────────────────────────── */}
        {tab === 'standings' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Edit Standings</p>
            <div className="grid grid-cols-6 gap-1 text-center">
              <p className="col-span-2 text-left text-[10px] uppercase text-slate-500 font-semibold">Team</p>
              {['W', 'L', 'T', 'RF', 'RA'].map(h => (
                <p key={h} className="text-[10px] uppercase text-slate-500 font-semibold">{h}</p>
              ))}
            </div>
            {standings.map(team => {
              const e = editedStandings[team.id] ?? team
              return (
                <div key={team.id} className="space-y-1">
                  <p className="text-xs font-semibold text-slate-300 truncate">{team.team_name}</p>
                  <div className="grid grid-cols-5 gap-1">
                    {([
                      ['wins', e.wins],
                      ['losses', e.losses],
                      ['ties', e.ties],
                      ['runs_for', e.runs_for],
                      ['runs_against', e.runs_against],
                    ] as [keyof Standing, number][]).map(([field, val]) => (
                      <input key={field} type="number" value={val}
                        onChange={ev => updateStanding(team.id, field, ev.target.value)}
                        className="w-full rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-sm text-white text-center focus:outline-none focus:border-red-500" />
                    ))}
                  </div>
                </div>
              )
            })}
            <button onClick={saveStandings} disabled={standingsSaving}
              className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50">
              {standingsSaving ? 'Saving...' : 'Save Standings'}
            </button>
            {standingsMsg && <p className="text-sm text-center">{standingsMsg}</p>}
          </div>
        )}
      </div>
    </main>
  )
}
