'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type FieldRow = {
  id: string
  name: string
}

type TeamRow = {
  id: string
  name: string
}

export default function AddEventPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [teamId, setTeamId] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [title, setTitle] = useState('')
  const [opponent, setOpponent] = useState('')
  const [eventType, setEventType] = useState<'game' | 'practice' | 'event'>('game')
  const [startsAt, setStartsAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()

      const { data: teamData } = await supabase.from('teams').select('id, name').order('name')
      const { data: fieldData } = await supabase.from('fields').select('id, name').order('name')

      const loadedTeams = (teamData as TeamRow[]) ?? []
      const loadedFields = (fieldData as FieldRow[]) ?? []

      setTeams(loadedTeams)
      setFields(loadedFields)

      if (loadedTeams.length > 0) setTeamId(loadedTeams[0].id)
      if (loadedFields.length > 0) setFieldId(loadedFields[0].id)
    }

    loadData()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorMessage('')

    try {
      const supabase = createClient()

      const { error } = await supabase.from('events').insert({
        team_id: teamId,
        field_id: fieldId || null,
        event_type: eventType,
        opponent: opponent || null,
        title,
        starts_at: startsAt,
        status: 'confirmed',
        notes: notes || null,
        snack_family: null,
        gear_notes: 'Helmet, white pants, water bottle',
      })

      if (error) {
        setErrorMessage(error.message)
      } else {
        router.push('/schedule')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 text-slate-900">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Add Event
          </p>
          <h1 className="mt-2 text-2xl font-bold">Create New Event</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
          <div>
            <label className="mb-2 block text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
              placeholder="Belmont Hawks vs Tigers"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Opponent</label>
            <input
              value={opponent}
             onChange={(e) => {
                const value = e.target.value
                setOpponent(value)

                if (value) {
                setTitle(`Belmont Hawks vs ${value}`)
                } else {
                  setTitle('')
                }
              }}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Tigers"
          />
            /
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Event Type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as 'game' | 'practice' | 'event')}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            >
              <option value="game">Game</option>
              <option value="practice">Practice</option>
              <option value="event">Event</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Date and Time</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Team</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Field</label>
            <select
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            >
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
              rows={4}
              placeholder="Arrive early, white pants, bring water..."
            />
          </div>

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            {saving ? 'Saving...' : 'Save Event'}
          </button>
        </form>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-sm grid-cols-3 gap-2 p-3">
          <Link
            href="/"
            className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700"
          >
            Home
          </Link>
          <Link
            href="/schedule"
            className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700"
          >
            Schedule
          </Link>
          <Link
            href="/add-event"
            className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Add Event
          </Link>
        </div>
      </nav>
    </main>
  )
}