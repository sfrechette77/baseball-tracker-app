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
import { useActiveOrg } from '@/components/org-context'
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
  const { org } = useActiveOrg()
  const [rawTeams, setRawTeams] = useState<RawTeam[]>([])
  const [currentTeamId, setCurrentTeamIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load the teams this user can pick from, scoped to their role.
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
            setRawTeams([])
            setCurrentTeamIdState(null)
            setLoading(false)
          }
          return
        }

        // All approved memberships for this user (one row per role).
        const { data: memberships } = await supabase
          .from('memberships')
          .select('id, role, organization_id')
          .eq('user_id', user.id)
          .eq('status', 'approved')

        if (cancelled) return

        if (!memberships || memberships.length === 0) {
          setRawTeams([])
          setCurrentTeamIdState(null)
          setLoading(false)
          return
        }

        const isOrgAdmin = memberships.some(m => m.role === 'org_admin')
        const orgId = memberships[0].organization_id
        const membershipIds = memberships.map(m => m.id)

        let teams: RawTeam[] = []
        let defaultId: string | null = null

        if (isOrgAdmin) {
          // Org admins pick from teams the org FIELDS this season — teams
          // with a team_season in the current season. Excludes league
          // opponent teams, which share the org_id but have no team_season.
          const { data: season } = await supabase
            .from('seasons')
            .select('id')
            .eq('organization_id', orgId)
            .eq('is_current', true)
            .maybeSingle()

          if (season) {
            const { data: ts } = await supabase
              .from('team_seasons')
              .select('team_id, teams:team_id ( id, name, division )')
              .eq('organization_id', orgId)
              .eq('season_id', season.id)

            const byId = new Map<string, RawTeam>()
            for (const row of ts ?? []) {
              const t = Array.isArray(row.teams) ? row.teams[0] : row.teams
              if (t) byId.set(t.id, { id: t.id, name: t.name, division: t.division })
            }
            teams = Array.from(byId.values()).sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          }
        } else {
          // Parents + team_admins: only their assigned teams.
          const { data: parentRows } = await supabase
            .from('parent_teams')
            .select('team_id, is_default, teams:team_id ( id, name, division )')
            .in('membership_id', membershipIds)

          const { data: adminRows } = await supabase
            .from('team_admins')
            .select('team_id, teams:team_id ( id, name, division )')
            .in('membership_id', membershipIds)

          const byId = new Map<string, RawTeam>()

          for (const row of parentRows ?? []) {
            const t = Array.isArray(row.teams) ? row.teams[0] : row.teams
            if (t) {
              byId.set(t.id, { id: t.id, name: t.name, division: t.division })
              if (row.is_default) defaultId = t.id
            }
          }
          for (const row of adminRows ?? []) {
            const t = Array.isArray(row.teams) ? row.teams[0] : row.teams
            if (t && !byId.has(t.id)) {
              byId.set(t.id, { id: t.id, name: t.name, division: t.division })
            }
          }

          teams = Array.from(byId.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        }

        // Initial selection: saved choice, else default team, else first.
        let stored: string | null = null
        try {
          stored = localStorage.getItem(STORAGE_KEY)
        } catch {
          stored = null
        }

        const validStored =
          stored && teams.some(t => t.id === stored) ? stored : null
        const initialId =
          validStored ?? defaultId ?? (teams.length > 0 ? teams[0].id : null)

        if (cancelled) return
        setRawTeams(teams)
        setCurrentTeamIdState(initialId)
        setLoading(false)
      } catch {
        if (!cancelled) {
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
    if (!rawTeams.some(t => t.id === id)) return // ignore unknown ids
    setCurrentTeamIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // ignore storage errors
    }
  }

  // Display-shaped teams. fullName uses the org name once it's loaded.
  const availableTeams = useMemo<PickableTeam[]>(() => {
    return rawTeams.map(t => ({
      id: t.id,
      label: t.name,
      fullName: org ? `${org.name} - ${t.name}` : t.name,
      division: t.division ?? '',
    }))
  }, [rawTeams, org])

  const currentTeam = availableTeams.find(t => t.id === currentTeamId) ?? null

  // Hold the app behind a neutral loading screen until teams resolve, so no
  // team-scoped page mounts without a team.
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-red-500 animate-spin" />
      </div>
    )
  }

  return (
    <TeamContext.Provider
      value={{
        // Non-null whenever a team-scoped page renders. Can be null for
        // logged-out / pending / no-team users (their pages don't read it;
        // Header guards against null).
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
