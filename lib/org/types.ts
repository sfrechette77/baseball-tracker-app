// Shared type definitions for org context

export type Org = {
  id: string
  slug: string
  name: string
  primary_color: string | null
  secondary_color: string | null
  logo_url: string | null
  has_league_features: boolean
}

export type MembershipRole = 'org_admin' | 'team_admin' | 'parent'

export type ActiveMembership = {
  id: string
  role: MembershipRole
  organization_id: string
}