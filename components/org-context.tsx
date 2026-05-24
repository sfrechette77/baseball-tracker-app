'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Org, ActiveMembership } from '@/lib/org/types'

type OrgContextValue = {
  org: Org | null
  membership: ActiveMembership | null
  loading: boolean
  error: string | null
}

const OrgContext = createContext<OrgContextValue>({
  org: null,
  membership: null,
  loading: true,
  error: null,
})

export function OrgProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrgContextValue>({
    org: null,
    membership: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const supabase = createClient()

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          if (!cancelled) {
            setState({ org: null, membership: null, loading: false, error: null })
          }
          return
        }

        // Same query shape as the server helper, but running client-side.
        // Once RLS is enabled at cutover, this will be naturally gated to
        // memberships the user can see (which is their own).
        const { data: memberships, error: membershipError } = await supabase
          .from('memberships')
          .select(`
            id,
            role,
            organization_id,
            organizations:organization_id (
              id,
              slug,
              name,
              primary_color,
              secondary_color,
              logo_url,
              has_league_features
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .limit(1)

        if (cancelled) return

        if (membershipError) {
          setState({
            org: null,
            membership: null,
            loading: false,
            error: 'Could not load organization.',
          })
          return
        }

        if (!memberships || memberships.length === 0) {
          // User is logged in but has no approved membership yet.
          // Could be a pending signup, or this is the dev/migration period
          // where memberships is empty. Surface as null org, no error.
          setState({ org: null, membership: null, loading: false, error: null })
          return
        }

        const m = memberships[0]
        const orgRow = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
        if (!orgRow) {
          setState({ org: null, membership: null, loading: false, error: null })
          return
        }

        setState({
          org: {
            id: orgRow.id,
            slug: orgRow.slug,
            name: orgRow.name,
            primary_color: orgRow.primary_color,
            secondary_color: orgRow.secondary_color,
            logo_url: orgRow.logo_url,
            has_league_features: orgRow.has_league_features,
          },
          membership: {
            id: m.id,
            role: m.role,
            organization_id: m.organization_id,
          },
          loading: false,
          error: null,
        })
      } catch {
        if (!cancelled) {
          setState({
            org: null,
            membership: null,
            loading: false,
            error: 'Unexpected error loading organization.',
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return <OrgContext.Provider value={state}>{children}</OrgContext.Provider>
}

export function useActiveOrg() {
  return useContext(OrgContext)
}