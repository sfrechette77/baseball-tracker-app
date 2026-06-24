'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type TeamSeasonState = {
  teamSeasonId: string | null
  arrivalBufferMinutes: number | null
  loading: boolean
  notFound: boolean  // true once loading finishes if no matching team_season exists
  error: string | null
}

const INITIAL_STATE: TeamSeasonState = {
  teamSeasonId: null,
  arrivalBufferMinutes: null,
  loading: true,
  notFound: false,
  error: null,
}

/**
 * Look up the current season's team_seasons row for a given team.
 * Returns the team_season_id plus the team's arrival_buffer_minutes
 * (joined from teams), so callers don't need to query teams separately.
 *
 * - loading = true until the lookup finishes
 * - notFound = true if no matching team_season was found
 * - error = a message if the query failed
 *
 * If teamId is empty/undefined, the hook stays in loading=true state
 * (caller is presumably still resolving which team to use).
 */
  export function useTeamSeason(
    teamId: string | undefined,
    seasonId?: string | null
  ): TeamSeasonState {
    
  const [state, setState] = useState<TeamSeasonState>(INITIAL_STATE)

  useEffect(() => {
    if (!teamId) {
      setState(INITIAL_STATE)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const supabase = createClient()

        // Find the team_seasons row for this team in the current season.
        // We join to seasons (filter is_current=true) and teams (get arrival_buffer).
        const query = supabase
          .from('team_seasons')
          .select(`
            id,
            teams:team_id ( arrival_buffer_minutes ),
            seasons:season_id!inner ( is_current )
          `)
          .eq('team_id', teamId)

        const { data, error } = seasonId
          ? await query.eq('season_id', seasonId).limit(1).maybeSingle()
          : await query.eq('seasons.is_current', true).limit(1).maybeSingle()

        if (cancelled) return

        if (error) {
          setState({
            teamSeasonId: null,
            arrivalBufferMinutes: null,
            loading: false,
            notFound: false,
            error: 'Failed to look up team season.',
          })
          return
        }

        if (!data) {
          // No team_season exists for this team in the current season.
          // Most likely the team exists but no one created the team_seasons row
          // when the season was created.
          setState({
            teamSeasonId: null,
            arrivalBufferMinutes: null,
            loading: false,
            notFound: true,
            error: null,
          })
          return
        }

        const teamRow = Array.isArray(data.teams) ? data.teams[0] : data.teams
        const arrivalBuffer = teamRow?.arrival_buffer_minutes ?? null

        setState({
          teamSeasonId: data.id,
          arrivalBufferMinutes: arrivalBuffer,
          loading: false,
          notFound: false,
          error: null,
        })
      } catch {
        if (!cancelled) {
          setState({
            teamSeasonId: null,
            arrivalBufferMinutes: null,
            loading: false,
            notFound: false,
            error: 'Unexpected error looking up team season.',
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [teamId, seasonId])

  return state
}