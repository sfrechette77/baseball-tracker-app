'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useActiveOrg } from '@/components/org-context'

export type OrgSeason = {
  id: string
  name: string
  start_date: string
  end_date: string
  is_current: boolean
}

type OrgSeasonsState = {
  seasons: OrgSeason[]
  currentSeasonId: string | null
  loading: boolean
  error: string | null
}

const INITIAL_STATE: OrgSeasonsState = {
  seasons: [],
  currentSeasonId: null,
  loading: true,
  error: null,
}

export function useOrgSeasons(): OrgSeasonsState {
  const { org } = useActiveOrg()
  const [state, setState] = useState<OrgSeasonsState>(INITIAL_STATE)

  useEffect(() => {
    if (!org?.id) {
      setState(INITIAL_STATE)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const supabase = createClient()

        const { data, error } = await supabase
          .from('seasons')
          .select('id, name, start_date, end_date, is_current')
          .eq('organization_id', org.id)
          .order('start_date', { ascending: false })

        if (cancelled) return

        if (error) {
          setState({
            seasons: [],
            currentSeasonId: null,
            loading: false,
            error: 'Failed to load seasons.',
          })
          return
        }

        const seasons = (data ?? []) as OrgSeason[]
        const currentSeason = seasons.find(s => s.is_current) ?? null

        setState({
          seasons,
          currentSeasonId: currentSeason?.id ?? null,
          loading: false,
          error: null,
        })
      } catch {
        if (!cancelled) {
          setState({
            seasons: [],
            currentSeasonId: null,
            loading: false,
            error: 'Unexpected error loading seasons.',
          })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [org?.id])

  return state
}