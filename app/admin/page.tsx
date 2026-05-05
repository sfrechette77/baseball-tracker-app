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
  walks: number
  strikeouts: number
  pitch_count: number
  innings_pitched: number
  hits_allowed: number
  earned_runs: number
  strikeouts_pitching: number
  walks_allowed: number
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

type Tab = 'status' |'score' | 'stats' | 'events' | 'standings'

type Field = {
  id: string
  name: string
}

type EventListRow = {
  id: string
  title: string
  opponent: string | null
  event_type: string | null
  starts_at: string
  field_id: string | null
  is_home: boolean | null
  travel_minutes: number | null
  travel_miles: number | null
  notes: string | null
  gear_notes: string | null
  status: string
  team_score: number | null
}

type EventFilter = 'upcoming' | 'past' | 'all'

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
  const [tab, setTab] = useState<Tab>('status')

  // Events
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
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

  // Status
  const [statusEventId, setStatusEventId] = useState('')
  const [currentDisplayStatus, setCurrentDisplayStatus] = useState<'on' | 'watching' | 'off' | null>(null)
  const [currentMessage, setCurrentMessage] = useState('')
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState<string | null>(null)
  const [statusDraftStatus, setStatusDraftStatus] = useState<'on' | 'watching' | 'off' | null>(null)
  const [statusDraftMessage, setStatusDraftMessage] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Events tab
  const [allEvents, setAllEvents] = useState<EventListRow[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [eventFilter, setEventFilter] = useState<EventFilter>('upcoming')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'none' | 'game' | 'practice'>('none')
  const [eventForm, setEventForm] = useState({
    title: '', opponent: '', eventType: 'game' as 'game' | 'tournament' | 'practice',
    startsAt: '', fieldId: '', isHome: false,
    travelMinutes: '', travelMiles: '', notes: '', gearNotes: '',
  })
  const [eventSaving, setEventSaving] = useState(false)
  const [eventMsg, setEventMsg] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(PASSWORD_KEY)
    if (saved) setPassword(saved)
  }, [])

  const reloadEvents = async () => {
    const supabase = createClient()
    const [{ data: eventsForScore }, { data: allEventsData }] = await Promise.all([
      supabase.from('events').select('id, title, opponent, starts_at, event_type, team_score, opponent_score, result')
        .neq('event_type', 'practice').order('starts_at', { ascending: false }),
      supabase.from('events').select('id, title, opponent, event_type, starts_at, field_id, is_home, travel_minutes, travel_miles, notes, gear_notes, status, team_score')
        .order('starts_at', { ascending: false }),
    ])
    setEvents((eventsForScore ?? []) as EventRow[])
    setAllEvents((allEventsData ?? []) as EventListRow[])
  }

  useEffect(() => {
    if (!password) return
    const load = async () => {
      const supabase = createClient()
      const [{ data: playersData }, { data: standingsData }, { data: fieldsData }] = await Promise.all([
        supabase.from('players').select('id, name, jersey_number').order('jersey_number', { ascending: true }),
        supabase.from('standings').select('id, team_name, games_played, wins, losses, ties, runs_for, runs_against'),
        supabase.from('fields').select('id, name').order('name', { ascending: true }),
      ])
      setPlayers((playersData ?? []) as Player[])
      const s = (standingsData ?? []) as Standing[]
      setStandings(s)
      const map: Record<string, Standing> = {}
      for (const row of s) map[row.id] = { ...row }
      setEditedStandings(map)
      setFields((fieldsData ?? []) as Field[])
      await reloadEvents()
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password])

  // Load existing box scores AND is_home when score event changes
  useEffect(() => {
    if (!selectedEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const [{ data: boxData }, { data: eventData }] = await Promise.all([
        supabase.from('box_scores').select('*').eq('event_id', selectedEventId),
        supabase.from('events').select('is_home').eq('id', selectedEventId).single(),
      ])
      if (boxData) {
        const us = boxData.find((r: { team: string }) => r.team === 'us')
        const them = boxData.find((r: { team: string }) => r.team === 'them')
        if (us) setUsInnings(INNINGS.map(i => us[`inning_${i}`] ?? 0))
        if (them) setThemInnings(INNINGS.map(i => them[`inning_${i}`] ?? 0))
      }
      if (eventData?.is_home !== undefined && eventData.is_home !== null) {
        setIsHome(eventData.is_home)
      }
    }
    load()
  }, [selectedEventId, password])

  // Load existing status when status event changes
  useEffect(() => {
    if (!statusEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('events')
        .select('display_status, status_message, status_updated_at')
        .eq('id', statusEventId)
        .single()
      if (data) {
        const ds = (data.display_status as 'on' | 'watching' | 'off' | null) ?? null
        setCurrentDisplayStatus(ds)
        setCurrentMessage(data.status_message ?? '')
        setCurrentUpdatedAt(data.status_updated_at ?? null)
        setStatusDraftStatus(ds)
        setStatusDraftMessage(data.status_message ?? '')
      }
    }
    load()
  }, [statusEventId, password])

  // Load existing stats when stats event changes
  useEffect(() => {
    if (!statsEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('player_stats')
        .select('player_id, at_bats, hits, rbi, runs, walks, strikeouts, pitch_count, innings_pitched, strikeouts_pitching, walks_allowed, hits_allowed, earned_runs')
        .eq('event_id', statsEventId)
      const map: Record<string, StatRow> = {}
      for (const p of players) {
        const existing = (data ?? [] as unknown as StatRow[]).find((r: StatRow) => r.player_id === p.id)
        map[p.id] = existing ?? { player_id: p.id, at_bats: 0, hits: 0, rbi: 0, runs: 0, walks: 0, strikeouts: 0, pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks_allowed: 0, hits_allowed: 0, earned_runs: 0 }
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
    const res = await api({
      action: 'save_game',
      eventId: selectedEventId,
      usInnings,
      themInnings,
      isHome,
    })
    setScoreSaving(false)
    if (res?.error) {
      setScoreMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      setScoreMsg(`✅ Saved! ${res.teamScore}–${res.opponentScore} ${res.result}`)
    } else {
      setScoreMsg('❌ Save failed (unknown error)')
    }
  }
  const saveStats = async () => {
    if (!statsEventId) return
    setStatsSaving(true)
    setStatsMsg(null)
    for (const [playerId, stats] of Object.entries(playerStats)) {
      await api({
        action: 'update_player_stats', playerId, eventId: statsEventId,
        atBats: stats.at_bats, hits: stats.hits, rbi: stats.rbi, runs: stats.runs,
        walks: stats.walks ?? 0, strikeouts: stats.strikeouts,
        pitchCount: stats.pitch_count ?? 0, inningsPitched: stats.innings_pitched ?? 0,
        strikeoutsPitching: stats.strikeouts_pitching ?? 0, walksAllowed: stats.walks_allowed ?? 0,
        hitsAllowed: stats.hits_allowed ?? 0, earnedRuns: stats.earned_runs ?? 0
      })
    }
    setStatsSaving(false)
    setStatsMsg('✅ All stats saved!')
  }

  const saveStatus = async () => {
    if (!statusEventId) return
    setStatusSaving(true)
    setStatusMsg(null)
    const res = await api({
      action: 'update_game_status',
      eventId: statusEventId,
      displayStatus: statusDraftStatus,
      message: statusDraftMessage,
      changedBy: 'Steve',
    })
    setStatusSaving(false)
    if (res?.error) {
      setStatusMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      setStatusMsg(res.warning ? `⚠ ${res.warning}` : '✅ Broadcast saved')
      setCurrentDisplayStatus(statusDraftStatus)
      setCurrentMessage(statusDraftMessage)
      setCurrentUpdatedAt(new Date().toISOString())
    } else {
      setStatusMsg('❌ Save failed')
    }
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

  // Convert ISO timestamp from DB to value compatible with <input type="datetime-local">
  const toDatetimeLocal = (iso: string): string => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const startNewGame = () => {
    setEditingEventId(null)
    setFormMode('game')
    setEventMsg(null)
    setEventForm({
      title: '', opponent: '', eventType: 'game', startsAt: '', fieldId: '',
      isHome: false, travelMinutes: '', travelMiles: '', notes: '', gearNotes: '',
    })
  }

  const startNewPractice = () => {
    setEditingEventId(null)
    setFormMode('practice')
    setEventMsg(null)
    setEventForm({
      title: 'Practice', opponent: '', eventType: 'practice', startsAt: '', fieldId: '',
      isHome: false, travelMinutes: '', travelMiles: '', notes: '', gearNotes: '',
    })
  }

  const editEvent = (ev: EventListRow) => {
    setEditingEventId(ev.id)
    setFormMode(ev.event_type === 'practice' ? 'practice' : 'game')
    setEventMsg(null)
    setEventForm({
      title: ev.title,
      opponent: ev.opponent ?? '',
      eventType: (ev.event_type as 'game' | 'tournament' | 'practice') ?? 'game',
      startsAt: toDatetimeLocal(ev.starts_at),
      fieldId: ev.field_id ?? '',
      isHome: ev.is_home ?? false,
      travelMinutes: ev.travel_minutes?.toString() ?? '',
      travelMiles: ev.travel_miles?.toString() ?? '',
      notes: ev.notes ?? '',
      gearNotes: ev.gear_notes ?? '',
    })
  }

  const cancelEventForm = () => {
    setEditingEventId(null)
    setFormMode('none')
    setEventMsg(null)
  }

  const saveEvent = async () => {
    if (!eventForm.title || !eventForm.startsAt) {
      setEventMsg('❌ Title and start time are required')
      return
    }
    setEventSaving(true)
    setEventMsg(null)
    const startsAtIso = new Date(eventForm.startsAt).toISOString()
    const payload = {
      title: eventForm.title,
      opponent: formMode === 'practice' ? null : eventForm.opponent,
      eventType: formMode === 'practice' ? 'practice' : eventForm.eventType,
      startsAt: startsAtIso,
      fieldId: eventForm.fieldId || null,
      isHome: formMode === 'practice' ? false : eventForm.isHome,
      travelMinutes: eventForm.travelMinutes ? Number(eventForm.travelMinutes) : null,
      travelMiles: eventForm.travelMiles ? Number(eventForm.travelMiles) : null,
      notes: eventForm.notes || null,
      gearNotes: eventForm.gearNotes || null,
    }

    let res
    if (editingEventId) {
      res = await api({ action: 'update_event', eventId: editingEventId, ...payload })
    } else if (formMode === 'practice') {
      res = await api({ action: 'create_practice', ...payload })
    } else {
      res = await api({ action: 'create_event', ...payload })
    }

    setEventSaving(false)
    if (res?.error) {
      setEventMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      setEventMsg('✅ Saved!')
      await reloadEvents()
      setTimeout(() => { cancelEventForm() }, 700)
    } else {
      setEventMsg('❌ Save failed (unknown error)')
    }
  }

  const deleteEvent = async () => {
    if (!editingEventId) return
    if (!confirm('Delete this event? This will also delete its box score and player stats. This cannot be undone.')) return
    setEventSaving(true)
    setEventMsg(null)
    const res = await api({ action: 'delete_event', eventId: editingEventId })
    setEventSaving(false)
    if (res?.error) {
      setEventMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      await reloadEvents()
      cancelEventForm()
    } else {
      setEventMsg('❌ Delete failed')
    }
  }

  const filteredEvents = (() => {
    const now = new Date().getTime()
    if (eventFilter === 'upcoming') return allEvents.filter(e => new Date(e.starts_at).getTime() >= now)
    if (eventFilter === 'past') return allEvents.filter(e => new Date(e.starts_at).getTime() < now)
    return allEvents
  })()
  
  if (!password) return <PasswordGate onSuccess={setPassword} />

  const selectedEvent = events.find(e => e.id === selectedEventId)
  const usTotal = usInnings.reduce((a, b) => a + b, 0)
  const themTotal = themInnings.reduce((a, b) => a + b, 0)

  return (
    <main className="min-h-screen bg-black pb-10 text-white" style={{ colorScheme: 'dark' }}>
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
        <div className="mx-auto max-w-sm mt-4 grid grid-cols-5 gap-1">
          {([
            { key: 'status', label: '📡 Status' },
            { key: 'score', label: '🏆 Score' },
            { key: 'stats', label: '📊 Stats' },
            { key: 'events', label: '📅 Events' },      
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

        {/* ── Status Tab ─────────────────────────────────────────────────── */}
        {tab === 'status' && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Pick a Game to Broadcast</p>
              <select value={statusEventId} onChange={e => { setStatusEventId(e.target.value); setStatusMsg(null) }}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:border-red-500">
                <option value="">— Pick a game —</option>
                {events
                  .filter(e => new Date(e.starts_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
                  .reverse()
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {formatDate(e.starts_at)} — {e.opponent ? `vs ${e.opponent}` : e.title}
                    </option>
                  ))}
              </select>
            </div>

            {statusEventId && (
              <>
                {/* Current state */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Current Broadcast</p>
                  {currentDisplayStatus ? (
                    <>
                      <p className={`text-lg font-extrabold ${
                        currentDisplayStatus === 'on' ? 'text-green-400' :
                        currentDisplayStatus === 'watching' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {currentDisplayStatus === 'on' ? '🟢 Game On' :
                         currentDisplayStatus === 'watching' ? '🟡 Watching' :
                         '🔴 Off'}
                      </p>
                      {currentMessage && (
                        <p className="text-sm text-slate-300 mt-1">{currentMessage}</p>
                      )}
                      {currentUpdatedAt && (
                        <p className="text-xs text-slate-500 mt-2">
                          Updated {new Date(currentUpdatedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">No broadcast set yet</p>
                  )}
                </div>

                {/* Draft new status */}
                <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-4">
                  <p className="text-[10px] uppercase tracking-wide text-red-400 font-semibold">Set Broadcast</p>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      { key: 'on', label: '🟢 Game On', desc: 'Show up as scheduled', cls: 'border-green-500/40 bg-green-500/10' },
                      { key: 'watching', label: '🟡 Watching', desc: 'Monitoring — decision pending', cls: 'border-amber-500/40 bg-amber-500/10' },
                      { key: 'off', label: '🔴 Off / Canceled', desc: 'Game is off', cls: 'border-red-500/40 bg-red-500/10' },
                    ] as const).map(({ key, label, desc, cls }) => (
                      <button key={key} onClick={() => setStatusDraftStatus(key)}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          statusDraftStatus === key
                            ? cls
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}>
                        <p className="font-bold text-white">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </button>
                    ))}
                    <button onClick={() => setStatusDraftStatus(null)}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        statusDraftStatus === null
                          ? 'border-slate-500/40 bg-slate-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}>
                      <p className="font-bold text-white">⊘ Clear Status</p>
                      <p className="text-xs text-slate-400">Remove broadcast — parents see nothing</p>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Message (optional)</label>
                    <textarea value={statusDraftMessage} rows={2}
                      placeholder="Coaches arriving at 8am to evaluate, decision by 9am"
                      onChange={e => setStatusDraftMessage(e.target.value)}
                      className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                  </div>

                  <button onClick={saveStatus} disabled={statusSaving || !statusDraftStatus === undefined}
                    className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50">
                    {statusSaving ? 'Broadcasting...' : 'Save & Broadcast'}
                  </button>
                  {statusMsg && <p className="text-sm text-center">{statusMsg}</p>}
                </div>
              </>
            )}
          </>
        )}
        
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
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                    <p className="text-xs text-slate-400 mb-1">Final Score (auto-calculated)</p>
                    <p className="text-3xl font-extrabold tabular-nums">
                      <span className={usTotal > themTotal ? 'text-green-400' : usTotal < themTotal ? 'text-red-400' : 'text-slate-300'}>
                        {usTotal}
                      </span>
                      <span className="text-slate-600 mx-3">–</span>
                      <span className={themTotal > usTotal ? 'text-green-400' : themTotal < usTotal ? 'text-red-400' : 'text-slate-300'}>
                        {themTotal}
                      </span>
                    </p>
                    <p className="text-xs mt-2 font-bold uppercase tracking-wide">
                      {usTotal === themTotal && usTotal === 0 ? (
                        <span className="text-slate-600">Enter inning runs below</span>
                      ) : usTotal > themTotal ? (
                        <span className="text-green-400">Win</span>
                      ) : usTotal < themTotal ? (
                        <span className="text-red-400">Loss</span>
                      ) : (
                        <span className="text-slate-400">Tie</span>
                      )}
                    </p>
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
                  <div className="grid grid-cols-9 gap-1 text-center">
                    <p className="col-span-2 text-left text-[10px] text-slate-500 uppercase font-semibold">Team</p>
                    {INNINGS.map(i => (
                      <p key={i} className="text-[10px] text-slate-500 uppercase font-semibold">{i}</p>
                    ))}
                  </div>
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
                  const s = playerStats[player.id] ?? { at_bats: 0, hits: 0, rbi: 0, runs: 0, walks: 0, strikeouts: 0, pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks_allowed: 0, hits_allowed: 0, earned_runs: 0 }
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
                          ['walks_allowed', s.walks_allowed ?? 0, 'BB'],
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

        {/* ── Events Tab ─────────────────────────────────────────────────── */}
        {tab === 'events' && (
          <>
            {/* Filter + create buttons */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(['upcoming', 'past', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setEventFilter(f)}
                    className={`rounded-xl py-2 text-xs font-bold uppercase tracking-wide transition ${eventFilter === f ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={startNewGame}
                  className="rounded-xl bg-white/10 border border-white/10 py-2 text-xs font-bold text-white hover:bg-white/20 transition">
                  + Add Game
                </button>
                <button onClick={startNewPractice}
                  className="rounded-xl bg-white/10 border border-white/10 py-2 text-xs font-bold text-white hover:bg-white/20 transition">
                  + Add Practice
                </button>
              </div>
            </div>

            {/* Form */}
            {formMode !== 'none' && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wide text-red-400 font-semibold">
                    {editingEventId
                      ? `Editing ${formMode === 'practice' ? 'Practice' : 'Game'}`
                      : `New ${formMode === 'practice' ? 'Practice' : 'Game'}`}
                  </p>
                  <button onClick={cancelEventForm}
                    className="text-xs text-slate-500 hover:text-white">
                    Cancel
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Title</label>
                  <input type="text" value={eventForm.title}
                    onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                </div>

                {formMode === 'game' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Opponent</label>
                      <input type="text" value={eventForm.opponent}
                        onChange={e => setEventForm({ ...eventForm, opponent: e.target.value })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Type</label>
                      <select value={eventForm.eventType}
                        onChange={e => setEventForm({ ...eventForm, eventType: e.target.value as 'game' | 'tournament' })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500">
                        <option value="game">Game</option>
                        <option value="tournament">Tournament</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Home / Away</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['away', 'home'] as const).map(loc => (
                          <button key={loc} onClick={() => setEventForm({ ...eventForm, isHome: loc === 'home' })}
                            className={`rounded-xl py-2 text-xs font-bold transition ${
                              eventForm.isHome === (loc === 'home') ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-400'
                            }`}>
                            {loc === 'home' ? '🏠 Home' : '✈️ Away'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Date & Time</label>
                  <input type="datetime-local" value={eventForm.startsAt}
                    onChange={e => setEventForm({ ...eventForm, startsAt: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Field</label>
                  <select value={eventForm.fieldId}
                    onChange={e => setEventForm({ ...eventForm, fieldId: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500">
                    <option value="">— No field —</option>
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {formMode === 'game' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Travel min</label>
                      <input type="number" value={eventForm.travelMinutes}
                        onChange={e => setEventForm({ ...eventForm, travelMinutes: e.target.value })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Travel mi</label>
                      <input type="number" value={eventForm.travelMiles}
                        onChange={e => setEventForm({ ...eventForm, travelMiles: e.target.value })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Notes</label>
                  <textarea value={eventForm.notes} rows={2}
                    onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Gear (comma separated)</label>
                  <input type="text" value={eventForm.gearNotes}
                    onChange={e => setEventForm({ ...eventForm, gearNotes: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                </div>

                <button onClick={saveEvent} disabled={eventSaving}
                  className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50">
                  {eventSaving ? 'Saving...' : (editingEventId ? 'Save Changes' : 'Create Event')}
                </button>

                {editingEventId && (
                  <button onClick={deleteEvent} disabled={eventSaving}
                    className="w-full rounded-xl border border-red-500/40 bg-transparent py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 transition disabled:opacity-50">
                    Delete Event
                  </button>
                )}

                {eventMsg && <p className="text-sm text-center">{eventMsg}</p>}
              </div>
            )}

            {/* List */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-2 space-y-1">
              {filteredEvents.length === 0 ? (
                <p className="p-3 text-sm text-slate-500 text-center">No events.</p>
              ) : (
                filteredEvents.map(ev => (
                  <button key={ev.id} onClick={() => editEvent(ev)}
                    className={`w-full text-left rounded-xl px-3 py-2 transition ${editingEventId === ev.id ? 'bg-red-500/20' : 'hover:bg-white/10'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {ev.event_type === 'practice'
                            ? '🏋️ ' + ev.title
                            : ev.opponent ? `vs ${ev.opponent}` : ev.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(ev.starts_at)}
                          {ev.team_score !== null && ' · final'}
                          {ev.event_type === 'tournament' && ' · 🏆'}
                        </p>
                      </div>
                      <span className="text-xs text-slate-600">›</span>
                    </div>
                  </button>
                ))
              )}
            </div>
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
