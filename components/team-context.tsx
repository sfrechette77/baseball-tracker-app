'use client'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PickableTeam } from '@/lib/teams'

const STORAGE_KEY = 'selectedTeamId'

type RawTeam = {
  id: string
  name: string
  division: string | null
}

type TeamContextValue = {
  currentTeam: PickableTeam
  setCurrentTeamId: (id: string) => void
  availableTeams: PickableTeam[]
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: ReactNode }) {
  const [rawTeams, setRawTeams] = useState<RawTeam[]>([])
  const [currentTeamId, setCurrentTeamIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasUser, setHasUser] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (!cancelled) {
            setHasUser(false)
            setRawTeams([])
            setCurrentTeamIdState(null)
            setLoading(false)
          }
          return
        }

        const { data: memberships } = await supabase
          .from('memberships')
          .select('id, organization_id')
          .eq('user_id', user.id)
          .eq('status', 'approved')

        if (cancelled) return

        if (!memberships || memberships.length === 0) {
          setHasUser(true)
          setRawTeams([])
          setCurrentTeamIdState(null)
          setLoading(false)
          return
        }

        const orgId = memberships[0].organization_id
        const membershipIds = memberships.map((m) => m.id)

        // Cross-team visibility: every approved member sees all of the org's
        // own teams (league opponents are flagged is_opponent and excluded).
        const { data: teamRows } = await supabase
          .from('teams')
          .select('id, name, division')
          .eq('organization_id', orgId)
          .eq('is_opponent', false)
          .order('name')

        const teams = (teamRows ?? []) as RawTeam[]

        // A parent's home/default team, if they have one.
        const { data: defaultRows } = await supabase
          .from('parent_teams')
          .select('team_id')
          .in('membership_id', membershipIds)
          .eq('is_default', true)
          .limit(1)
        const defaultId = defaultRows?.[0]?.team_id ?? null

        let stored: string | null = null
        try {
          stored = localStorage.getItem(STORAGE_KEY)
        } catch {
          stored = null
        }
        const validStored =
          stored && teams.some((t) => t.id === stored) ? stored : null
        const initialId =
          validStored ?? defaultId ?? (teams.length > 0 ? teams[0].id : null)

        if (cancelled) return
        setHasUser(true)
        setRawTeams(teams)
        setCurrentTeamIdState(initialId)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setHasUser(true)
          setRawTeams([])
          setCurrentTeamIdState(null)
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const setCurrentTeamId = (id: string) => {
    if (!rawTeams.some((t) => t.id === id)) return
    setCurrentTeamIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // ignore storage errors
    }
  }

  const availableTeams = useMemo<PickableTeam[]>(() => {
    return rawTeams.map((t) => ({
      id: t.id,
      label: t.name,
      fullName: t.name,
      division: t.division ?? '',
    }))
  }, [rawTeams])

  const currentTeam =
    availableTeams.find((t) => t.id === currentTeamId) ?? null

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-red-500 animate-spin" />
      </div>
    )
  }

  // Logged in but no team — graceful message instead of crashing a page.
  if (hasUser && !currentTeam) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-slate-200 text-base font-medium">
          You&apos;re not linked to a team yet.
        </p>
        <p className="text-slate-400 text-sm max-w-xs">
          Please contact your team admin to be added. If you just signed up,
          your account may still be pending approval.
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              const supabase = createClient()
              await supabase.auth.signOut()
            } finally {
              window.location.href = '/login'
            }
          }}
          className="mt-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <TeamContext.Provider
      value={{
        currentTeam: currentTeam as PickableTeam,
        setCurrentTeamId,
        availableTeams,
      }}
    >
      {children}
    </TeamContext.Provider>
  )
}

export function useCurrentTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) {
    throw new Error('useCurrentTeam must be used inside <TeamProvider>')
  }
  return ctx
}
