// Server-side helper to fetch the active org for the current user.
//
// For now, a user belongs to exactly one org per design (no multi-org users).
// We pick their first approved membership and return that org.
//
// If multi-org users ever become a thing, this is the seam to extend —
// it should consult a "currently active org" preference (cookie, session,
// or memberships.is_active flag).

import { createClient } from '@/lib/supabase/server'
import type { Org, ActiveMembership } from './types'

export type ActiveOrgResult = {
  org: Org
  membership: ActiveMembership
} | null

/**
 * Returns the active org + membership for the current logged-in user.
 * Returns null if:
 *   - user is not logged in
 *   - user has no approved memberships
 *   - any database error occurs
 *
 * Callers should treat null as "no active org" and decide whether to
 * redirect to /login, /signup, or a "pending approval" page.
 */
export async function getActiveOrg(): Promise<ActiveOrgResult> {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return null

  // Find approved memberships for this user.
  // Limit 1 because design says one user belongs to one org.
  // If they had multiple approved memberships, we'd pick the first;
  // we'll add an explicit "active" selector when multi-org becomes real.
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
        public_description,
        has_league_features
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .limit(1)

  if (membershipError || !memberships || memberships.length === 0) return null

  const m = memberships[0]

  // Supabase's typed return for a single foreign-key join can come back as
  // either an object or a single-element array depending on schema introspection.
  // Normalize to an object.
  const orgRow = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
  if (!orgRow) return null

  return {
    org: {
      id: orgRow.id,
      slug: orgRow.slug,
      name: orgRow.name,
      primary_color: orgRow.primary_color,
      secondary_color: orgRow.secondary_color,
      logo_url: orgRow.logo_url,
      public_description: orgRow.public_description,
      has_league_features: orgRow.has_league_features,
    },
    membership: {
      id: m.id,
      role: m.role,
      organization_id: m.organization_id,
    },
  }
}