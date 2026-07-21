'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function requestAccessAgain(
  slug: string
): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect(
      `/o/${encodeURIComponent(slug)}/signup?error=not_authenticated`
    )
  }

  const admin = createServiceClient()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (orgError || !org) {
    redirect('/login?error=org_not_found')
  }

  const { data: rejectedMembership, error: membershipError } =
    await admin
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('role', 'parent')
      .eq('status', 'rejected')
      .maybeSingle()

  if (membershipError || !rejectedMembership) {
    redirect(
      `/o/${encodeURIComponent(org.slug)}/signup/complete?error=no_rejected_request`
    )
  }

  const { data: updated, error: updateError } = await admin
    .from('memberships')
    .update({
        status: 'pending',
        approved_by: null,
        approved_at: null,
    })
    .eq('id', rejectedMembership.id)
    .eq('user_id', user.id)
    .eq('organization_id', org.id)
    .eq('role', 'parent')
    .eq('status', 'rejected')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    redirect(
      `/o/${encodeURIComponent(org.slug)}/signup/complete?error=request_failed`
    )
  }

  redirect(
    `/o/${encodeURIComponent(org.slug)}/signup/complete?requested=1`
  )
}