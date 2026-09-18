'use server'

import { createClient } from '@/lib/supabase/server'

export type BootstrapOrganizationInput = {
  name: string
  slug: string
  timezone: string
  teamNames: string[]
}

export type BootstrapOrganizationResult =
  | {
      ok: true
      organizationId: string
      membershipId: string
      teamCount: number
    }
  | {
      ok: false
      error: string
    }

export async function bootstrapOrganization(
  input: BootstrapOrganizationInput
): Promise<BootstrapOrganizationResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      error: 'You must be signed in to create an organization.',
    }
  }

  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()
  const timezone = input.timezone.trim()

  const teamNames = input.teamNames
    .map(teamName => teamName.trim())
    .filter(Boolean)

  if (!name) {
    return {
      ok: false,
      error: 'Organization name is required.',
    }
  }

  if (!slug) {
    return {
      ok: false,
      error: 'Organization slug is required.',
    }
  }

  if (!timezone) {
    return {
      ok: false,
      error: 'Organization timezone is required.',
    }
  }

  if (teamNames.length === 0) {
    return {
      ok: false,
      error: 'At least one team is required.',
    }
  }

  const { data, error } = await supabase.rpc(
    'bootstrap_organization',
    {
      p_name: name,
      p_slug: slug,
      p_timezone: timezone,
      p_team_names: teamNames,
    }
  )

  if (error) {
    return {
      ok: false,
      error: error.message,
    }
  }

  const result = Array.isArray(data) ? data[0] : data

  if (
    !result?.result_organization_id ||
    !result?.result_membership_id
  ) {
    return {
      ok: false,
      error: 'Organization setup did not return a valid result.',
    }
  }

  return {
    ok: true,
    organizationId: result.result_organization_id,
    membershipId: result.result_membership_id,
    teamCount: result.result_team_count ?? 0,
  }
}
