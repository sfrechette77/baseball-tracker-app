'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
      <main className="min-h-screen bg-black pb-24 text-white">
        {/* Header skeleton */}
        <div className="bg-black px-4 pt-8 pb-6">
          <div className="mx-auto max-w-sm">
            <Skeleton className="h-4 w-16 mb-5" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-2/3" />
          </div>
        </div>
        {/* Form panel skeletons */}
        <div className="mx-auto max-w-sm space-y-3 px-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <BottomNav active="schedule" />
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
