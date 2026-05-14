'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { PICKABLE_TEAMS, DEFAULT_TEAM_ID, type PickableTeam } from '@/lib/teams'

const STORAGE_KEY = 'selectedTeamId'

type TeamContextValue = {
  currentTeam: PickableTeam
  setCurrentTeamId: (id: string) => void
  availableTeams: PickableTeam[]
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: ReactNode }) {
  // Start with default — localStorage gets read after mount to avoid SSR/CSR mismatch
  const [currentTeamId, setCurrentTeamIdState] = useState<string>(DEFAULT_TEAM_ID)

  // On mount, read persisted selection from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && PICKABLE_TEAMS.some(t => t.id === stored)) {
        setCurrentTeamIdState(stored)
      }
    } catch {
      // localStorage might be unavailable (private browsing, etc.) — fall back to default
    }
  }, [])

  const setCurrentTeamId = (id: string) => {
    if (!PICKABLE_TEAMS.some(t => t.id === id)) return // ignore unknown ids
    setCurrentTeamIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // ignore storage errors
    }
  }

  const currentTeam =
    PICKABLE_TEAMS.find(t => t.id === currentTeamId) ?? PICKABLE_TEAMS[0]

  return (
    <TeamContext.Provider
      value={{
        currentTeam,
        setCurrentTeamId,
        availableTeams: PICKABLE_TEAMS,
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
