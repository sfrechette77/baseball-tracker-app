'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const APP_TIME_ZONE = 'America/Chicago'

type EventForm = {
  title: string
  opponent: string
  event_type: string
  starts_at: string
  status: string
  notes: string
  gear_notes: string
  travel_minutes: string
  travel_miles: string
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
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/95 backdrop-blur-md">
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateTimeInput(utcString: string) {
  const date = new Date(utcString)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function inputClass() {
  return 'w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500'
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [form, setForm] = useState<EventForm>({
    title: '', opponent: '', event_type: 'game', starts_at: '',
    status: 'confirmed', notes: '', gear_notes: '', travel_minutes: '', travel_miles: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('events')
        .select('title, opponent, event_type, starts_at, status, notes, gear_notes, travel_minutes, travel_miles')
        .eq('id', eventId)
        .single()
      if (data) {
        setForm({
          title: data.title ?? '',
          opponent: data.opponent ?? '',
          event_type: data.event_type ?? 'game',
          starts_at: data.starts_at ? toLocalDateTimeInput(data.starts_at) : '',
          status: data.status ?? 'confirmed',
          notes: data.notes ?? '',
          gear_notes: data.gear_notes ?? '',
          travel_minutes: data.travel_minutes?.toString() ?? '',
          travel_miles: data.travel_miles?.toString() ?? '',
        })
      }
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId])

  const set = (field: keyof EventForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setMsg(null)
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const supabase = createClient()

      // Convert local Chicago time back to UTC
      const localDate = new Date(form.starts_at)
      const utcString = localDate.toISOString()

      const { error } = await supabase
        .from('events')
        .update({
          title: form.title,
          opponent: form.opponent || null,
          event_type: form.event_type,
          starts_at: utcString,
          status: form.status,
          notes: form.notes || null,
          gear_notes: form.gear_notes || null,
          travel_minutes: form.travel_minutes ? Number(form.travel_minutes) : null,
          travel_miles: form.travel_miles ? Number(form.travel_miles) : null,
        })
        .eq('id', eventId)

      if (error) {
        setMsg(`❌ Error: ${error.message}`)
      } else {
        setMsg('✅ Saved!')
        setTimeout(() => router.push(`/event/${eventId}`), 1000)
      }
    } catch (err) {
      setMsg(`❌ Unexpected error`)
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚾</div>
          <p className="text-slate-400 text-sm">Loading event...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      {/* Header */}
      <div className="bg-black px-4 pt-8 pb-6">
        <div className="mx-auto max-w-sm">
          <div className="flex items-center justify-between mb-5">
            <Link href={`/event/${eventId}`}
              className="text-sm font-semibold text-slate-400 hover:text-white transition">
              ← Back
            </Link>
            <div className="relative h-10 w-10">
              <Image src="/Elite.png" alt="Elite Baseball" fill className="object-contain drop-shadow-lg" />
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-semibold">Edit Event</p>
          <h1 className="mt-1 text-2xl font-extrabold text-white leading-tight">{form.title || 'Event'}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-sm space-y-3 px-4">

        {/* Title */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Title</p>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Event title" className={inputClass()} />
        </div>

        {/* Type + Status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Event Type</p>
            <select value={form.event_type} onChange={e => set('event_type', e.target.value)}
              className={inputClass()}>
              <option value="game">Game</option>
              <option value="practice">Practice</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Status</p>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className={inputClass()}>
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
              <option value="final">Final</option>
            </select>
          </div>
        </div>

        {/* Opponent */}
        {form.event_type !== 'practice' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Opponent</p>
            <input value={form.opponent} onChange={e => set('opponent', e.target.value)}
              placeholder="Opponent name" className={inputClass()} />
          </div>
        )}

        {/* Date & Time */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Date & Time (Chicago)</p>
          <input type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)}
            className={inputClass()} />
        </div>

        {/* Travel */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Travel Minutes</p>
            <input type="number" value={form.travel_minutes} onChange={e => set('travel_minutes', e.target.value)}
              placeholder="e.g. 45" className={inputClass()} />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Travel Miles</p>
            <input type="number" value={form.travel_miles} onChange={e => set('travel_miles', e.target.value)}
              placeholder="e.g. 30" className={inputClass()} />
          </div>
        </div>

        {/* Gear Notes */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Gear Notes</p>
          <p className="text-[10px] text-slate-600">Separate items with commas</p>
          <input value={form.gear_notes} onChange={e => set('gear_notes', e.target.value)}
            placeholder="e.g. Helmet, Bat, Cleats" className={inputClass()} />
        </div>

        {/* Notes */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Notes</p>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Any additional notes..." rows={3}
            className={`${inputClass()} resize-none`} />
        </div>

        {/* Save */}
        <button onClick={save} disabled={saving}
          className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {msg && <p className="text-sm text-center pb-2">{msg}</p>}

      </div>

      <BottomNav active="schedule" />
    </main>
  )
}
