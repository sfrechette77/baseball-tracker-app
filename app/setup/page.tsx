'use client'

import { FormEvent, useState } from 'react'
import { bootstrapOrganization } from '@/app/actions/bootstrap'

const TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
]

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function OrganizationSetupPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [timezone, setTimezone] = useState('')
  const [teamNames, setTeamNames] = useState([''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameChange = (value: string) => {
    setName(value)

    if (!slugEdited) {
      setSlug(makeSlug(value))
    }
  }

  const updateTeamName = (index: number, value: string) => {
    setTeamNames(previous =>
      previous.map((teamName, teamIndex) =>
        teamIndex === index ? value : teamName
      )
    )
  }

  const addTeam = () => {
    setTeamNames(previous => [...previous, ''])
  }

  const removeTeam = (index: number) => {
    setTeamNames(previous =>
      previous.filter((_, teamIndex) => teamIndex !== index)
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)
    setError(null)

    try {
      const result = await bootstrapOrganization({
        name,
        slug,
        timezone,
        teamNames,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      // Force a full reload so organization/team contexts load
      // the newly created membership and teams.
      window.location.href = '/admin'
    } catch {
      setError('Organization setup failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
            On Deck
          </p>

          <h1 className="mt-2 text-3xl font-extrabold">
            Set up your organization
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Create your organization and initial teams. You can configure
            branding, fields, season details, and staff after setup.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Organization name
            </label>

            <input
              type="text"
              value={name}
              onChange={event => handleNameChange(event.target.value)}
              placeholder="Example Baseball Club"
              disabled={saving}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Public organization URL
            </label>

            <div className="flex items-center rounded-xl border border-white/10 bg-white/10">
              <span className="pl-4 text-sm text-slate-500">
                /o/
              </span>

              <input
                type="text"
                value={slug}
                onChange={event => {
                  setSlugEdited(true)
                  setSlug(makeSlug(event.target.value))
                }}
                placeholder="example-baseball-club"
                disabled={saving}
                className="min-w-0 flex-1 bg-transparent px-1 py-3 pr-4 text-sm text-white outline-none placeholder:text-slate-600"
              />
            </div>

            <p className="mt-2 text-xs text-slate-500">
              This becomes the public signup and organization address.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Organization time zone
            </label>

            <select
              value={timezone}
              onChange={event => setTimezone(event.target.value)}
              disabled={saving}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
            >

            <option value="" disabled>
              Select a time zone
            </option>

              {TIME_ZONES.map(option => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2">
              <label className="block text-sm font-semibold">
                Initial teams
              </label>

              <p className="mt-1 text-xs text-slate-500">
                Add the organization&apos;s current teams. More setup comes
                after the organization is created.
              </p>
            </div>

            <div className="space-y-3">
              {teamNames.map((teamName, index) => (
                <div
                  key={index}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={teamName}
                    onChange={event =>
                      updateTeamName(index, event.target.value)
                    }
                    placeholder={
                      index === 0
                        ? 'Team name'
                        : 'Another team'
                    }
                    disabled={saving}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                  />

                  {teamNames.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTeam(index)}
                      disabled={saving}
                      className="rounded-xl border border-red-500/30 px-3 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {teamNames.length < 25 && (
              <button
                type="button"
                onClick={addTeam}
                disabled={saving}
                className="mt-3 text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                + Add another team
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? 'Creating organization...'
              : 'Create organization'}
          </button>
        </form>
      </div>
    </main>
  )
}
