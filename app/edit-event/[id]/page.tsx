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

    if (diff === 0) break

    guess += diff
  }

  return new Date(guess).toISOString()
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
  const [teamScore, setTeamScore] = useState('')
  const [opponentScore, setOpponentScore] = useState('')
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
        setTeamScore(data.team_score?.toString() || '')
        setOpponentScore(data.opponent_score?.toString() || '')
      }

      setLoading(false)
    }

    if (eventId) loadEvent()
  }, [eventId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const supabase = createClient()

    const team = teamScore ? Number(teamScore) : null
    const opp = opponentScore ? Number(opponentScore) : null

    let result = null
    if (team !== null && opp !== null) {
      if (team > opp) result = 'win'
      else if (team < opp) result = 'loss'
      else result = 'tie'
    }

    await supabase
      .from('events')
      .update({
        title,
        opponent: opponent || null,
        notes: notes || null,
        starts_at: chicagoInputToIso(startsAt),
        team_score: team,
        opponent_score: opp,
        result
      })
      .eq('id', eventId)

    router.push(`/event/${eventId}`)
  }

  if (loading) return <div>Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/event/${eventId}`}>← Back</Link>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} />
          </Field>

          <Field label="Opponent">
            <input value={opponent} onChange={e => setOpponent(e.target.value)} />
          </Field>

          <Field label="Date & Time">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
            />
          </Field>

          <Field label="Team Score">
            <input
              type="number"
              value={teamScore}
              onChange={e => setTeamScore(e.target.value)}
            />
          </Field>

          <Field label="Opponent Score">
            <input
              type="number"
              value={opponentScore}
              onChange={e => setOpponentScore(e.target.value)}
            />
          </Field>

          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </main>
  )
}