'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const APP_TIME_ZONE = 'America/Chicago'

function getChicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)

  const getPart = (type: string) =>
    parts.find(part => part.type === type)?.value ?? ''

  return {
    year: Number(getPart('year')),
    month: Number(getPart('month')),
    day: Number(getPart('day')),
    hour: Number(getPart('hour')),
    minute: Number(getPart('minute'))
  }
}

function formatForDateTimeLocal(dateString: string) {
  const date = new Date(dateString)
  const parts = getChicagoParts(date)

  const year = String(parts.year)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')

  return `${year}-${month}-${day}T${hour}:${minute}`
}

function chicagoInputToIso(value: string) {
  if (!value) return ''

  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  let guess = Date.UTC(year, month - 1, day, hour, minute)

  for (let i = 0; i < 3; i++) {
    const actual = getChicagoParts(new Date(guess))

    const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute)
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute
    )

    const diff = desiredWallTime - actualWallTime

    if (diff === 0) {
      break
    }

    guess += diff
  }

  return new Date(guess).toISOString()
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children}
    </div>
  )
}

export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [title, setTitle] = useState('')
  const [opponent, setOpponent] = useState('')
  const [notes, setNotes] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadEvent = async () => {
      const supabase = createClient()

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (data) {
        setTitle(data.title || '')
        setOpponent(data.opponent || '')
        setNotes(data.notes || '')
        setStartsAt(data.starts_at ? formatForDateTimeLocal(data.starts_at) : '')
      }

      setLoading(false)
    }

    if (eventId) {
      loadEvent()
    }
  }, [eventId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const supabase = createClient()

    await supabase
      .from('events')
      .update({
        title,
        opponent: opponent || null,
        notes: notes || null,
        starts_at: chicagoInputToIso(startsAt)
      })
      .eq('id', eventId)

    router.push(`/event/${eventId}`)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            Loading...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <Link
          href={`/event/${eventId}`}
          className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back to Event
        </Link>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
              Edit Event
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              Update Event Details
            </h1>

            <p className="mt-3 text-sm text-slate-200">
              Make changes and save them back to your schedule.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Game Info
              </p>

              <div className="mt-4 space-y-4">
                <Field label="Title">
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    placeholder="Team Practice"
                    required
                  />
                </Field>

                <Field label="Opponent">
                  <input
                    value={opponent}
                    onChange={e => setOpponent(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    placeholder="River Cats"
                  />
                </Field>

                <Field label="Date & Time">
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={e => setStartsAt(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Entered and saved in Central time.
                  </p>
                </Field>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Notes
              </p>

              <div className="mt-4">
                <Field label="Event Notes">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={5}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    placeholder="Anything important to remember for this game..."
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              <Link
                href={`/event/${eventId}`}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}