'use server'

import { createClient } from '@/lib/supabase/server'

async function requireOrgAdmin(): Promise<
  | { ok: true; membership: { organization_id: string } }
  | { ok: false; error: string }
> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, error: 'Not authenticated' }

  const { data: memberships, error: memError } = await supabase
    .from('memberships')
    .select('id, organization_id, role, status')
    .eq('user_id', user.id)
    .eq('role', 'org_admin')
    .eq('status', 'approved')
    .limit(1)

  if (memError) return { ok: false, error: memError.message }
  if (!memberships || memberships.length === 0) {
    return { ok: false, error: 'Not an org admin' }
  }

  return {
    ok: true,
    membership: { organization_id: memberships[0].organization_id },
  }
}

export async function getDashboardPlayerCount(): Promise<
  { ok: true; playerCount: number } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { count, error } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', guard.membership.organization_id)

  if (error) return { ok: false, error: error.message }

  return { ok: true, playerCount: count ?? 0 }
}