'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentTeam } from '@/components/team-context'
import {
  getPendingMemberships,
  getOrgTeams,
  approveMembership,
  rejectMembership,
  getApprovedParents,
  updateMemberTeams,
  removeMembership,
  makeMemberTeamAdmin,
  removeMemberTeamAdmin,
  grantTeamAdminByEmail,
  startNewSeason,
  getOrganizationLinks,
  saveOrganizationLink,
  deleteOrganizationLink,
  getOrganizationLaunchReadiness,
  getOrganizationAthletes,
  updateGuardianAthleteAssignments,
  type PendingMembership,
  type OrgTeam,
  type ApprovedParent,
  type OrganizationLink,
  type OrganizationLaunchReadiness,
  type OrganizationAthleteOption,
} from '@/app/actions/admin'
import { getDashboardPlayerCount, getDashboardThisWeek, getDashboardTeamAdminAssignments, type DashboardEvent, type DashboardTeamAdminAssignment, getDashboardTeamHealthCounts, type DashboardTeamHealthCounts } from '@/app/actions/dashboard'
import { DashboardTab } from '@/components/admin/DashboardTab'
import { ORG_TEAM_IDS } from '@/lib/orgTeams'
import { useActiveOrg } from '@/components/org-context'
import { useOrgSeasons } from '@/lib/org/useOrgSeasons'
import { useTeamSeason } from '@/lib/org/useTeamSeason'

import {
  createAthleteRosterAssignment,
  assignExistingAthleteToTeamSeason,
  getAssignableAthletes,
  updateRosterAssignment,
  removePlayerFromRoster,
  restorePlayerToRoster,
  type AssignableAthlete,
} from '@/app/actions/roster'


function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createBrowserClient(url, key)
}

const PASSWORD_KEY = 'admin_password'
const INNINGS = [1, 2, 3, 4, 5, 6, 7]

type EventRow = {
  id: string
  title: string
  opponent: string | null
  starts_at: string
  event_type: string | null
  team_score: number | null
  opponent_score: number | null
  result: string | null
}

type Player = {
  id: string
  name: string
  jersey_number: string | null
}

type ManagedRosterPlayer = {
  id: string
  athlete_id: string | null
  name: string
  jersey_number: string | null
  position: string | null
  roster_status: 'active' | 'inactive'
  removed_at: string | null
  removed_reason: string | null
}

type StatRow = {
  player_id: string
  at_bats: number
  hits: number
  rbi: number
  runs: number
  walks: number
  strikeouts: number
  pitch_count: number
  innings_pitched: number
  hits_allowed: number
  earned_runs: number
  strikeouts_pitching: number
  walks_allowed: number
  batting_order_position: number | null
}

type Standing = {
  id: string
  team_name: string
  games_played: number
  wins: number
  losses: number
  ties: number
  runs_for: number
  runs_against: number
}

type Tab = 'dashboard' | 'pending' | 'members' | 'roster' | 'status' | 'score' | 'stats' | 'events' | 'league' | 'standings' | 'settings'
type SettingsSubTab = 'general' | 'branding' | 'access' | 'links' | 'season'

type Field = {
  id: string
  name: string
}

type TeamRow = {
  id: string
  name: string
}

type LeagueGameAdminRow = {
  id: string
  played_at: string
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: string
  home_team: { name: string } | null
  away_team: { name: string } | null
}

type EventListRow = {
  id: string
  title: string
  opponent: string | null
  event_type: string | null
  starts_at: string
  field_id: string | null
  is_home: boolean | null
  travel_minutes: number | null
  travel_miles: number | null
  notes: string | null
  gear_notes: string | null
  status: string
  team_score: number | null
}

type EventFilter = 'upcoming' | 'past' | 'all'

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(new Date(dateStr))
}

type TeamDashboardEvent = {
  id: string
  title: string
  event_type: string | null
  starts_at: string | null
  field_id: string | null
  status: string | null
  opponent: string | null
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onSuccess }: { onSuccess: (pw: string) => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = async () => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input, action: 'update_score', eventId: 'test' })
    })
    if (res.status === 401) { setError(true); return }
    localStorage.setItem(PASSWORD_KEY, input)
    onSuccess(input)
  }

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">⚾</p>
          <h1 className="text-2xl font-extrabold text-white">Admin Access</h1>
          <p className="text-slate-400 text-sm mt-1">Chicago Elite 11U · Moore</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <input type="password" placeholder="Enter password" value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-slate-400" />
          {error && <p className="text-red-400 text-sm">Incorrect password</p>}
          <button onClick={handleSubmit}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition">
            Sign In
          </button>
        </div>
      </div>
    </main>
  )
}

// ─── Main Admin ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('general')
  const { currentTeam } = useCurrentTeam()
  const {
  seasons: rosterSeasons,
  currentSeasonId,
  loading: rosterSeasonsLoading,
} = useOrgSeasons()

  const {
    teamSeasonId: rosterTeamSeasonId,
    loading: rosterTeamSeasonLoading,
    notFound: rosterTeamSeasonNotFound,
  } = useTeamSeason(currentTeam.id, currentSeasonId)

  const currentRosterSeason =
    rosterSeasons.find(season => season.id === currentSeasonId) ?? null

  const [rosterStatusSavingId, setRosterStatusSavingId] =
    useState<string | null>(null)

  const { membership, loading: orgLoading } = useActiveOrg()
  const isOrgAdmin = membership?.role === 'org_admin'
  const isTeamAdmin = membership?.role === 'team_admin'

  const { org } = useActiveOrg()
  const [settingsPublicDescription, setSettingsPublicDescription] = useState('')
  const brandColor = org?.primary_color || '#dc2626'

  const signupLink =
    org?.slug && typeof window !== 'undefined'
      ? `${window.location.origin}/o/${org.slug}/signup`
      : ''

  const [settingsName, setSettingsName] = useState('')
  const [settingsLogoUrl, setSettingsLogoUrl] = useState('')
  const [settingsPrimaryColor, setSettingsPrimaryColor] = useState('#dc2626')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const [settingsCopied, setSettingsCopied] = useState(false)
  const [settingsLogoUploading, setSettingsLogoUploading] = useState(false)

  const [settingsSeasonName, setSettingsSeasonName] = useState('')
  const [settingsSeasonLoading, setSettingsSeasonLoading] = useState(false)
  const [settingsSeasonMsg, setSettingsSeasonMsg] = useState<string | null>(null)

  const [launchReadiness, setLaunchReadiness] =
  useState<OrganizationLaunchReadiness | null>(null)

  const [launchReadinessLoading, setLaunchReadinessLoading] = useState(false)
  const [launchReadinessMsg, setLaunchReadinessMsg] = useState<string | null>(null)

  const [settingsLinks, setSettingsLinks] = useState<OrganizationLink[]>([])
  const [settingsLinksLoading, setSettingsLinksLoading] = useState(false)
  const [settingsLinksMsg, setSettingsLinksMsg] = useState<string | null>(null)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkDescription, setLinkDescription] = useState('')
  const [linkIsActive, setLinkIsActive] = useState(true)
  const [linkIsPublic, setLinkIsPublic] = useState(false)
  const [linkSortOrder, setLinkSortOrder] = useState('0')
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [linkSaving, setLinkSaving] = useState(false)

  const [newSeasonName, setNewSeasonName] = useState('')
  const [newSeasonStartDate, setNewSeasonStartDate] = useState('')
  const [newSeasonEndDate, setNewSeasonEndDate] = useState('')
  const [copyRostersForward, setCopyRostersForward] = useState(false)
  const [seasonRolloverSaving, setSeasonRolloverSaving] = useState(false)
  const [seasonRolloverMsg, setSeasonRolloverMsg] = useState<string | null>(null)
  

  useEffect(() => {
    if (!org) return

    setSettingsName(org.name ?? '')
    setSettingsLogoUrl(org.logo_url ?? '')
    setSettingsPrimaryColor(org.primary_color ?? '#dc2626')
    setSettingsPublicDescription(org.public_description ?? '')
  }, [org])

  const saveOrgSettings = async () => {
    if (!org || !isOrgAdmin) return

    setSettingsSaving(true)
    setSettingsMsg(null)

    try {
      const response = await fetch('/api/admin/organization-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: org.id,
          name: settingsName.trim(),
          logoUrl: settingsLogoUrl.trim() || null,
          primaryColor: settingsPrimaryColor.trim() || '#dc2626',
          publicDescription: settingsPublicDescription,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save organization settings.')
      }

      setSettingsMsg('Organization settings saved.')
      await loadLaunchReadiness()
    } catch (err) {
      setSettingsMsg(
        err instanceof Error
          ? err.message
          : 'Failed to save organization settings.'
      )
    } finally {
      setSettingsSaving(false)
    }
}
  
  const copySignupLink = async () => {
    if (!signupLink) return

    try {
      await navigator.clipboard.writeText(signupLink)
      setSettingsCopied(true)

      setTimeout(() => {
        setSettingsCopied(false)
      }, 2000)
    } catch {
      setSettingsMsg('❌ Could not copy signup link')
    }
  }

    const resetLinkForm = () => {
      setEditingLinkId(null)
      setLinkLabel('')
      setLinkUrl('')
      setLinkDescription('')
      setLinkIsActive(true)
      setLinkIsPublic(false)
      setLinkSortOrder('0')
    }

    const loadOrganizationLinks = async () => {
      if (!isOrgAdmin) return

      setSettingsLinksLoading(true)
      setSettingsLinksMsg(null)

      const result = await getOrganizationLinks()

      if (result.ok) {
        setSettingsLinks(result.links)
      } else {
        setSettingsLinksMsg(`❌ ${result.error}`)
      }

      setSettingsLinksLoading(false)
    }

    const editOrganizationLink = (link: OrganizationLink) => {
      setEditingLinkId(link.id)
      setLinkLabel(link.label)
      setLinkUrl(link.url)
      setLinkDescription(link.description ?? '')
      setLinkIsActive(link.is_active)
      setLinkIsPublic(link.is_public)
      setLinkSortOrder(String(link.sort_order ?? 0))
    }

    const submitOrganizationLink = async () => {
      if (!isOrgAdmin) return

      setLinkSaving(true)
      setSettingsLinksMsg(null)

      const result = await saveOrganizationLink({
        id: editingLinkId ?? undefined,
        label: linkLabel,
        url: linkUrl,
        description: linkDescription,
        isActive: linkIsActive,
        isPublic: linkIsPublic,
        sortOrder: Number.parseInt(linkSortOrder || '0', 10),
      })

      if (result.ok) {
        setSettingsLinksMsg(editingLinkId ? 'Link updated.' : 'Link added.')
        resetLinkForm()
        await loadOrganizationLinks()
        await loadLaunchReadiness()
      } else {
        setSettingsLinksMsg(`❌ ${result.error}`)
      }

      setLinkSaving(false)
    }

    const removeOrganizationLink = async (id: string) => {
      if (!isOrgAdmin) return
      if (!confirm('Delete this organization link?')) return

      setSettingsLinksMsg(null)

      const result = await deleteOrganizationLink(id)

      if (result.ok) {
        setSettingsLinksMsg('Link deleted.')
        await loadOrganizationLinks()
        await loadLaunchReadiness()
      } else {
        setSettingsLinksMsg(`❌ ${result.error}`)
      }
    }

  const loadLaunchReadiness = async () => {
    setLaunchReadinessLoading(true)
    setLaunchReadinessMsg(null)

    const result = await getOrganizationLaunchReadiness()

    if (result.ok) {
      setLaunchReadiness(result.readiness)
    } else {
      setLaunchReadinessMsg(`❌ ${result.error}`)
    }

    setLaunchReadinessLoading(false)
  }

  type LaunchReadinessItem = {
  label: string
  complete: boolean
  targetTab?: Tab
  targetSettingsSubTab?: SettingsSubTab
  manualSetup?: boolean
}

  const launchReadinessItems: LaunchReadinessItem[] =
    launchReadiness
      ? [
          {
            label: 'Organization logo',
            complete: launchReadiness.logoConfigured,
            targetTab: 'settings',
            targetSettingsSubTab: 'branding',
          },
          {
            label: 'Brand color',
            complete: launchReadiness.brandColorConfigured,
            targetTab: 'settings',
            targetSettingsSubTab: 'branding',
          },
          {
            label: 'Current season',
            complete: launchReadiness.currentSeasonExists,
            targetTab: 'settings',
            targetSettingsSubTab: 'season',
          },
          {
            label: 'At least one team',
            complete: launchReadiness.teamExists,
            manualSetup: true,
          },
          {
            label: 'Roster started',
            complete: launchReadiness.rosterStarted,
            targetTab: 'roster',
          },
          {
            label: 'Team admin assigned',
            complete: launchReadiness.teamAdminAssigned,
            targetTab: 'members',
          },
          {
            label: 'Approved org admin',
            complete: launchReadiness.orgAdminExists,
          },
          {
            label: 'Signup link',
            complete: launchReadiness.signupLinkAvailable,
            targetTab: 'settings',
            targetSettingsSubTab: 'access',
          },
          {
            label: 'Public welcome message',
            complete: launchReadiness.publicDescriptionConfigured,
            targetTab: 'settings',
            targetSettingsSubTab: 'general',
          },
          {
            label: 'Public resource link',
            complete: launchReadiness.publicLinkExists,
            targetTab: 'settings',
            targetSettingsSubTab: 'links',
          },
        ]
      : []

  const completedLaunchItems = launchReadinessItems.filter(
    item => item.complete
  ).length

  const launchReadinessPercent =
    launchReadinessItems.length > 0
      ? Math.round(
          (completedLaunchItems /
            launchReadinessItems.length) *
            100
        )
      : 0

  const openLaunchSetup = (
    item: LaunchReadinessItem
  ) => {
    if (item.targetSettingsSubTab) {
      setSettingsSubTab(item.targetSettingsSubTab)
    }

    if (item.targetTab) {
      setTab(item.targetTab)
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const submitSeasonRollover = async () => {
  if (!newSeasonName.trim()) {
    setSeasonRolloverMsg('❌ Enter a season name')
    return
  }

  if (!newSeasonStartDate || !newSeasonEndDate) {
    setSeasonRolloverMsg('❌ Enter a start date and end date')
    return
  }

  if (newSeasonEndDate < newSeasonStartDate) {
    setSeasonRolloverMsg('❌ End date must be after start date')
    return
  }

  const confirmed = window.confirm(
    `Start ${newSeasonName.trim()} as the new active season? The current season will be archived. Old schedules, scores, stats, standings, and games will be preserved, but the app will switch current-season pages to the new season.`
  )

  if (!confirmed) return

  setSeasonRolloverSaving(true)
  setSeasonRolloverMsg(null)

  const result = await startNewSeason(
    newSeasonName,
    newSeasonStartDate,
    newSeasonEndDate,
    copyRostersForward
  )

  setSeasonRolloverSaving(false)

  if (!result.ok) {
    setSeasonRolloverMsg(`❌ ${result.error}`)
    return
  }

  setSettingsSeasonName(newSeasonName.trim())
  setNewSeasonName('')
  setNewSeasonStartDate('')
  setNewSeasonEndDate('')
  setCopyRostersForward(false)
  setSeasonRolloverMsg('✅ New season started. Current-season pages now point to the new season.')
}

  const [managedRosterPlayers, setManagedRosterPlayers] =
    useState<ManagedRosterPlayer[]>([])

  const [assignableAthletes, setAssignableAthletes] =
    useState<AssignableAthlete[]>([])

  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterSaving, setRosterSaving] = useState(false)
  const [rosterMsg, setRosterMsg] = useState<string | null>(null)

  const [newAthleteName, setNewAthleteName] = useState('')
  const [newAthleteJersey, setNewAthleteJersey] = useState('')
  const [newAthletePosition, setNewAthletePosition] = useState('')

  const [existingAthleteId, setExistingAthleteId] = useState('')
  const [existingAthleteJersey, setExistingAthleteJersey] = useState('')
  const [existingAthletePosition, setExistingAthletePosition] = useState('')

  const [editingRosterPlayerId, setEditingRosterPlayerId] =
    useState<string | null>(null)

  const [editingRosterName, setEditingRosterName] = useState('')
  const [editingRosterJersey, setEditingRosterJersey] = useState('')
  const [editingRosterPosition, setEditingRosterPosition] = useState('')
  const [rosterEditSaving, setRosterEditSaving] = useState(false)

  const uploadOrgLogo = async (file: File) => {
    if (!org || !isOrgAdmin) return

    setSettingsLogoUploading(true)
    setSettingsMsg(null)

    const supabase = createClient()

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png'
    const filePath = `organizations/${org.id}/logo-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('organization-logos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      setSettingsLogoUploading(false)
      setSettingsMsg(`❌ Logo upload failed: ${uploadError.message}`)
      return
    }

    const { data } = supabase.storage
      .from('organization-logos')
      .getPublicUrl(filePath)

    setSettingsLogoUrl(data.publicUrl)
    setSettingsLogoUploading(false)
    setSettingsMsg('✅ Logo uploaded. Click Save Organization Settings to apply it.')
  }

  useEffect(() => {
    if (!org || !isOrgAdmin) return

    const loadCurrentSeason = async () => {
      setSettingsSeasonLoading(true)
      setSettingsSeasonMsg(null)

      const supabase = createClient()

      const { data, error } = await supabase
        .from('seasons')
        .select('id, name, is_current')
        .eq('organization_id', org.id)
        .eq('is_current', true)
        .limit(1)
        .maybeSingle()

      setSettingsSeasonLoading(false)

      if (error) {
        setSettingsSeasonMsg(`❌ ${error.message}`)
        return
      }

      if (!data) {
        setSettingsSeasonName('')
        setSettingsSeasonMsg('No active season found for this organization.')
        return
      }

      setSettingsSeasonName(data.name ?? '')
    }

    loadCurrentSeason()
  }, [org, isOrgAdmin])

    useEffect(() => {
      if (!isOrgAdmin || settingsSubTab !== 'links') return
      loadOrganizationLinks()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrgAdmin, settingsSubTab])

    useEffect(() => {
      if (!isOrgAdmin) return

      loadLaunchReadiness()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrgAdmin])  

  // Events
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [isHome, setIsHome] = useState(false)
  const [usInnings, setUsInnings] = useState<number[]>(Array(7).fill(0))
  const [themInnings, setThemInnings] = useState<number[]>(Array(7).fill(0))
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreMsg, setScoreMsg] = useState<string | null>(null)

  // Player stats
  const [players, setPlayers] = useState<Player[]>([])
  const [statsEventId, setStatsEventId] = useState('')
  const [playerStats, setPlayerStats] = useState<Record<string, StatRow>>({})
  const [savedPlayerStats, setSavedPlayerStats] = useState<Record<string, StatRow>>({})
  const [statsSaving, setStatsSaving] = useState(false)
  const [statsMsg, setStatsMsg] = useState<string | null>(null)

  // Standings
  const [standings, setStandings] = useState<Standing[]>([])
  const [editedStandings, setEditedStandings] = useState<Record<string, Standing>>({})
  const [standingsSaving, setStandingsSaving] = useState(false)
  const [standingsMsg, setStandingsMsg] = useState<string | null>(null)

  // Status
  const [statusEventId, setStatusEventId] = useState('')
  const [currentDisplayStatus, setCurrentDisplayStatus] = useState<'on' | 'watching' | 'off' | null>(null)
  const [currentMessage, setCurrentMessage] = useState('')
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState<string | null>(null)
  const [statusDraftStatus, setStatusDraftStatus] = useState<'on' | 'watching' | 'off' | null>(null)
  const [statusDraftMessage, setStatusDraftMessage] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // League tab
  const [allTeams, setAllTeams] = useState<TeamRow[]>([])
  const [allLeagueGames, setAllLeagueGames] = useState<LeagueGameAdminRow[]>([])
  const [leagueEditingId, setLeagueEditingId] = useState<string | null>(null)
  const [leagueHomeTeamId, setLeagueHomeTeamId] = useState('')
  const [leagueAwayTeamId, setLeagueAwayTeamId] = useState('')
  const [leaguePlayedAt, setLeaguePlayedAt] = useState('')
  const [leagueHomeScore, setLeagueHomeScore] = useState('')
  const [leagueAwayScore, setLeagueAwayScore] = useState('')
  const [leagueStatus, setLeagueStatus] = useState<'final' | 'scheduled' | 'forfeit' | 'postponed' | 'canceled'>('final')
  const [leagueSaving, setLeagueSaving] = useState(false)
  const [leagueMsg, setLeagueMsg] = useState<string | null>(null)

// Dashboard tab
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardMsg, setDashboardMsg] = useState<string | null>(null)
  const [dashboardTeamCount, setDashboardTeamCount] = useState<number | null>(null)
  const [dashboardTeams, setDashboardTeams] = useState<OrgTeam[]>([])
  const [dashboardPendingCount, setDashboardPendingCount] = useState<number | null>(null)
  const [dashboardFamilyCount, setDashboardFamilyCount] = useState<number | null>(null)
  const [dashboardPlayerCount, setDashboardPlayerCount] = useState<number | null>(null)
  const [dashboardThisWeek, setDashboardThisWeek] = useState<DashboardEvent[]>([])
  const [dashboardTeamsMissingAdmins, setDashboardTeamsMissingAdmins] = useState<OrgTeam[]>([])
  const [dashboardTeamAdminAssignments, setDashboardTeamAdminAssignments] = useState<DashboardTeamAdminAssignment[]>([])
  const [dashboardTeamHealthCounts, setDashboardTeamHealthCounts] = useState<DashboardTeamHealthCounts[]>([])

// Team admin dashboard tab
  const [teamDashboardLoading, setTeamDashboardLoading] = useState(false)
  const [teamDashboardMsg, setTeamDashboardMsg] = useState<string | null>(null)
  const [teamDashboardNextEvent, setTeamDashboardNextEvent] = useState<TeamDashboardEvent | null>(null)
  const [teamDashboardPlayers, setTeamDashboardPlayers] = useState<any[]>([]) 

// Pending approvals tab
  const [pendingList, setPendingList] = useState<PendingMembership[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingMsg, setPendingMsg] = useState<string | null>(null)
  const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveTeamIds, setApproveTeamIds] = useState<Set<string>>(new Set())
  const [approveDefaultTeamId, setApproveDefaultTeamId] = useState<string>('')
  const [approveSaving, setApproveSaving] = useState(false)
  const [rejectingId, setRejectingId] =
    useState<string | null>(null)
  const [rejectSaving, setRejectSaving] =
    useState(false)

  // Members tab
  const [membersList, setMembersList] = useState<ApprovedParent[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersMsg, setMembersMsg] = useState<string | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [memberTeamIds, setMemberTeamIds] = useState<Set<string>>(new Set())
  const [memberDefaultTeamId, setMemberDefaultTeamId] = useState<string>('')
  const [memberSaving, setMemberSaving] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null)
  const [promoteTeamIds, setPromoteTeamIds] = useState<Set<string>>(new Set())
  const [promoteSaving, setPromoteSaving] = useState(false)
  const [grantAdminEmail, setGrantAdminEmail] = useState('')
  const [grantAdminTeamIds, setGrantAdminTeamIds] = useState<Set<string>>(new Set())
  const [grantAdminSaving, setGrantAdminSaving] = useState(false)

  const [organizationAthletes, setOrganizationAthletes] =
    useState<OrganizationAthleteOption[]>([])

  const [editingAthletesMemberId, setEditingAthletesMemberId] =
    useState<string | null>(null)

  const [memberAthleteIds, setMemberAthleteIds] =
    useState<Set<string>>(new Set())

  const [memberPrimaryAthleteId, setMemberPrimaryAthleteId] =
    useState('')

  const [memberAthletesSaving, setMemberAthletesSaving] =
    useState(false)

  // Events tab
  const [allEvents, setAllEvents] = useState<EventListRow[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [eventFilter, setEventFilter] = useState<EventFilter>('upcoming')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'none' | 'game' | 'practice'>('none')
  const [eventForm, setEventForm] = useState({
    title: '', opponent: '', opponentTeamId: '', eventType: 'game' as 'game' | 'tournament' | 'practice',
    startsAt: '', fieldId: '', isHome: false,
    travelMinutes: '', travelMiles: '', notes: '', gearNotes: '',
  })
  const [eventSaving, setEventSaving] = useState(false)
  const [eventMsg, setEventMsg] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(PASSWORD_KEY)
    if (saved) setPassword(saved)
  }, [])

  const reloadEvents = async () => {
    const supabase = createClient()
    const [{ data: eventsForScore }, { data: allEventsData }] = await Promise.all([
      supabase.from('events').select('id, title, opponent, starts_at, event_type, team_score, opponent_score, result')
        .eq('team_id', currentTeam?.id)
        .neq('event_type', 'practice').order('starts_at', { ascending: false }),
      supabase.from('events').select('id, title, opponent, event_type, starts_at, field_id, is_home, travel_minutes, travel_miles, notes, gear_notes, status, team_score')
        .eq('team_id', currentTeam?.id)
        .order('starts_at', { ascending: false }),
    ])
    setEvents((eventsForScore ?? []) as EventRow[])
    setAllEvents((allEventsData ?? []) as EventListRow[])
  }

  useEffect(() => {
  if (tab !== 'roster' || !rosterTeamSeasonId) return

  loadManagedRoster()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab, rosterTeamSeasonId])

  useEffect(() => {
    if (!password) return
    const load = async () => {
      const supabase = createClient()
      const [
        { data: playersData },
        { data: standingsData },
        { data: fieldsData }
      ] = await Promise.all([
        rosterTeamSeasonId
          ? supabase
              .from('players')
              .select('id, name, jersey_number')
              .eq('team_season_id', rosterTeamSeasonId)
              .eq('roster_status', 'active')
              .order('jersey_number', { ascending: true })
          : Promise.resolve({
              data: [] as Player[],
              error: null,
            }),

        supabase
        .from('standings')
        .select(
          'id, team_name, games_played, wins, losses, ties, runs_for, runs_against'
        ),
        supabase
          .from('fields')
          .select('id, name')
          .order('name', { ascending: true }),
      ])

      setPlayers((playersData ?? []) as Player[])
      const s = (standingsData ?? []) as Standing[]
      setStandings(s)
      const map: Record<string, Standing> = {}
      for (const row of s) map[row.id] = { ...row }
      setEditedStandings(map)
      setFields((fieldsData ?? []) as Field[])
      await reloadEvents()
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, currentTeam?.id, rosterTeamSeasonId])
  
    useEffect(() => {
    if (!password || tab !== 'dashboard') return
    if (isOrgAdmin) return
    if (!currentTeam?.id) return

    loadTeamAdminDashboard()
  }, [password, tab, isOrgAdmin, currentTeam?.id])

  // Load dashboard snapshot when Dashboard tab is active
  useEffect(() => {
    if (!password || tab !== 'dashboard') return

  const load = async () => {
    setDashboardLoading(true)
    setDashboardMsg(null)

    const [pendingResult, teamsResult, membersResult, playersResult, thisWeekResult, teamAdminsResult, teamHealthResult] = await Promise.all([
      getPendingMemberships(),
      getOrgTeams(),
      getApprovedParents(),
      getDashboardPlayerCount(),
      getDashboardThisWeek(),
      getDashboardTeamAdminAssignments(),
      getDashboardTeamHealthCounts(),
    ])

    if (pendingResult.ok) {
      setDashboardPendingCount(pendingResult.pending.length)
    } else {
      setDashboardMsg(`❌ ${pendingResult.error}`)
    }

    if (teamsResult.ok) {
       const orgDashboardTeams = teamsResult.teams.filter(team =>
          ORG_TEAM_IDS.includes(team.id)
        )

      setDashboardTeamCount(orgDashboardTeams.length)
      setDashboardTeams(orgDashboardTeams)
    } else {
      setDashboardMsg(`❌ ${teamsResult.error}`)
    }

    if (teamsResult.ok && teamAdminsResult.ok) {
      const orgDashboardTeams = teamsResult.teams.filter(team =>
        ORG_TEAM_IDS.includes(team.id)
      )

      const teamsWithAdmins = new Set(teamAdminsResult.assignments.map(a => a.team_id))
      setDashboardTeamsMissingAdmins(
        orgDashboardTeams.filter(team => !teamsWithAdmins.has(team.id))
      )
      setDashboardTeamAdminAssignments(teamAdminsResult.assignments)
    } else if (!teamAdminsResult.ok) {
      setDashboardMsg(`❌ ${teamAdminsResult.error}`)
    }

    if (teamHealthResult.ok) {
      setDashboardTeamHealthCounts(teamHealthResult.counts)
    } else {
      setDashboardMsg(`❌ ${teamHealthResult.error}`)
    }

    if (membersResult.ok) {
      setDashboardFamilyCount(membersResult.members.length)
    } else {
      setDashboardMsg(`❌ ${membersResult.error}`)
    }

    if (playersResult.ok) {
      setDashboardPlayerCount(playersResult.playerCount)
    } else {
      setDashboardMsg(`❌ ${playersResult.error}`)
    }

    if (thisWeekResult.ok) {
      setDashboardThisWeek(thisWeekResult.events)
    } else {
      setDashboardMsg(`❌ ${thisWeekResult.error}`)
    }

    setDashboardLoading(false)
  }

  load()
}, [password, tab])

  const loadTeamAdminDashboard = async () => {
    if (!currentTeam?.id) return

    setTeamDashboardLoading(true)
    setTeamDashboardMsg(null)

    const supabase = createClient()

    const today = new Date().toISOString()

    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, title, event_type, starts_at, status, opponent, field_id')
      .eq('team_id', currentTeam.id)
      .gte('starts_at', today)
      .order('starts_at', { ascending: true })
      .limit(1)

    const { data: playersData, error: playersError } = rosterTeamSeasonId
      ? await supabase
          .from('players')
          .select('id, name, jersey_number, position')
          .eq('team_season_id', rosterTeamSeasonId)
          .eq('roster_status', 'active')
          .order('name', { ascending: true })
      : {
          data: [],
          error: null,
        }

    if (eventsError || playersError) {
      setTeamDashboardMsg(
        eventsError?.message || playersError?.message || 'Failed to load dashboard.'
      )
    }

    setTeamDashboardNextEvent(eventsData?.[0] ?? null)
    setTeamDashboardPlayers(playersData ?? [])
    setTeamDashboardLoading(false)
  }

  // Load pending memberships + org teams when Pending tab is active
  useEffect(() => {
    if (!password || tab !== 'pending') return
    const load = async () => {
      setPendingLoading(true)
      setPendingMsg(null)
      const [pendingResult, teamsResult,] = await Promise.all([
        getPendingMemberships(),
        getOrgTeams(),
      ])
      if (pendingResult.ok) {
        setPendingList(pendingResult.pending)
      } else {
        setPendingMsg(`❌ ${pendingResult.error}`)
      }
      if (teamsResult.ok) {
        setOrgTeams(teamsResult.teams)
      }
      setPendingLoading(false)
    }
    load()
  }, [password, tab])

  const reloadMembers = async () => {
    setMembersLoading(true)

    const [
      membersResult,
      teamsResult,
      athletesResult,
    ] = await Promise.all([
      getApprovedParents(),
      getOrgTeams(),
      getOrganizationAthletes(),
    ])

    if (membersResult.ok) {
      setMembersList(membersResult.members)
    } else {
      setMembersMsg(`Error: ${membersResult.error}`)
    }

    if (teamsResult.ok) {
      setOrgTeams(teamsResult.teams)
    } else {
      setMembersMsg(`Error: ${teamsResult.error}`)
    }

    if (athletesResult.ok) {
      setOrganizationAthletes(athletesResult.athletes)
    } else {
      setMembersMsg(`Error: ${athletesResult.error}`)
    }

    setMembersLoading(false)
  }

  const startEditingMemberAthletes = (member: ApprovedParent) => {
    setEditingAthletesMemberId(member.id)

    setMemberAthleteIds(
      new Set(member.athletes.map(athlete => athlete.id))
    )

    setMemberPrimaryAthleteId(
      member.athletes.find(athlete => athlete.is_primary)?.id ?? ''
    )

    setEditingMemberId(null)
    setRemovingMemberId(null)
    setPromotingMemberId(null)
    setMembersMsg(null)
  }

  const toggleMemberAthlete = (athleteId: string) => {
    setMemberAthleteIds(previous => {
      const next = new Set(previous)

      if (next.has(athleteId)) {
        next.delete(athleteId)

        if (memberPrimaryAthleteId === athleteId) {
          setMemberPrimaryAthleteId('')
        }
      } else {
        next.add(athleteId)
      }

      return next
    })
  }

  const cancelEditingMemberAthletes = () => {
    setEditingAthletesMemberId(null)
    setMemberAthleteIds(new Set())
    setMemberPrimaryAthleteId('')
    setMembersMsg(null)
  }

  const saveMemberAthletes = async () => {
    if (!editingAthletesMemberId || memberAthletesSaving) return

    setMemberAthletesSaving(true)
    setMembersMsg(null)

    const result = await updateGuardianAthleteAssignments({
      membershipId: editingAthletesMemberId,
      athleteIds: Array.from(memberAthleteIds),
      primaryAthleteId: memberPrimaryAthleteId || null,
    })

    if (result.ok) {
      setMembersMsg(
        `${result.assignedCount} athlete${
          result.assignedCount === 1 ? '' : 's'
        } assigned.`
      )

      setEditingAthletesMemberId(null)
      setMemberAthleteIds(new Set())
      setMemberPrimaryAthleteId('')

      await reloadMembers()
    } else {
      setMembersMsg(`Error: ${result.error}`)
    }

    setMemberAthletesSaving(false)
  }

  // Load approved parents when Members tab is active
  useEffect(() => {
    if (!password || tab !== 'members') return
    setMembersMsg(null)
    reloadMembers()
  }, [password, tab])

  // Load existing box scores AND is_home when score event changes
  useEffect(() => {
    if (!selectedEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const [{ data: boxData }, { data: eventData }] = await Promise.all([
        supabase.from('box_scores').select('*').eq('event_id', selectedEventId),
        supabase.from('events').select('is_home').eq('id', selectedEventId).single(),
      ])
      if (boxData) {
        const us = boxData.find((r: { team: string }) => r.team === 'us')
        const them = boxData.find((r: { team: string }) => r.team === 'them')
        if (us) setUsInnings(INNINGS.map(i => us[`inning_${i}`] ?? 0))
        if (them) setThemInnings(INNINGS.map(i => them[`inning_${i}`] ?? 0))
      }
      if (eventData?.is_home !== undefined && eventData.is_home !== null) {
        setIsHome(eventData.is_home)
      }
    }
    load()
  }, [selectedEventId, password])

  // Load existing status when status event changes
  useEffect(() => {
    if (!statusEventId || !password) return
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('events')
        .select('display_status, status_message, status_updated_at')
        .eq('id', statusEventId)
        .single()
      if (data) {
        const ds = (data.display_status as 'on' | 'watching' | 'off' | null) ?? null
        setCurrentDisplayStatus(ds)
        setCurrentMessage(data.status_message ?? '')
        setCurrentUpdatedAt(data.status_updated_at ?? null)
        setStatusDraftStatus(ds)
        setStatusDraftMessage(data.status_message ?? '')
      }
    }
    load()
  }, [statusEventId, password])

  // Load all teams and all league games when League tab is active
  useEffect(() => {
    if (!password) return
    const load = async () => {
      const supabase = createClient()
    
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name')
      .order('name')
    if (teamsData) setAllTeams(teamsData)
    
    const { data: gamesData } = await supabase
      .from('league_games')
      .select(`
        id, played_at, home_team_id, away_team_id, home_score, away_score, status,
        home_team:home_team_id (name),
        away_team:away_team_id (name)
      `)
      .order('played_at', { ascending: false })
    if (gamesData) {
      const normalized = gamesData.map((g: any) => ({
        ...g,
        home_team: Array.isArray(g.home_team) ? g.home_team[0] : g.home_team,
        away_team: Array.isArray(g.away_team) ? g.away_team[0] : g.away_team,
      }))
      setAllLeagueGames(normalized as LeagueGameAdminRow[])
    }
  }
  load()
}, [password])

// Load the selected event's season roster and existing stats when stats event changes
useEffect(() => {
  if (!statsEventId || !password) return

  const load = async () => {
    const supabase = createClient()

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('team_season_id')
      .eq('id', statsEventId)
      .single()

    if (eventError || !eventData?.team_season_id) {
      setStatsMsg('❌ Could not load this event season.')
      setPlayers([])
      setPlayerStats({})
      setSavedPlayerStats({})
      return
    }

    const [{ data: playersData }, { data: statsData }] = await Promise.all([
      supabase
        .from('players')
        .select('id, name, jersey_number')
        .eq('team_season_id', eventData.team_season_id)
        .order('jersey_number', { ascending: true }),
      supabase
        .from('player_stats')
        .select('player_id, at_bats, hits, rbi, runs, walks, strikeouts, pitch_count, innings_pitched, strikeouts_pitching, walks_allowed, hits_allowed, earned_runs, batting_order_position')
        .eq('event_id', statsEventId),
    ])

    const eventPlayers = (playersData ?? []) as Player[]
    setPlayers(eventPlayers)

    const statRows = (statsData ?? []) as unknown as StatRow[]
    const map: Record<string, StatRow> = {}

    for (const p of eventPlayers) {
      const existing = statRows.find((r: StatRow) => r.player_id === p.id)
      map[p.id] = existing ?? {
        player_id: p.id,
        at_bats: 0,
        hits: 0,
        rbi: 0,
        runs: 0,
        walks: 0,
        strikeouts: 0,
        pitch_count: 0,
        innings_pitched: 0,
        strikeouts_pitching: 0,
        walks_allowed: 0,
        hits_allowed: 0,
        earned_runs: 0,
        batting_order_position: null,
      }
    }

    setPlayerStats(map)
    setSavedPlayerStats(map)
  }

  load()
}, [statsEventId, password])

  const api = async (body: object) => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password, teamId: currentTeam.id })
    })
    if (res.status === 401) { localStorage.removeItem(PASSWORD_KEY); setPassword(null) }
    return res.json()
  }

  const saveScore = async () => {
    if (!selectedEventId) return
    setScoreSaving(true)
    setScoreMsg(null)
    const res = await api({
      action: 'save_game',
      eventId: selectedEventId,
      usInnings,
      themInnings,
      isHome,
    })
    setScoreSaving(false)
    if (res?.error) {
      setScoreMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      setScoreMsg(`✅ Saved! ${res.teamScore}–${res.opponentScore} ${res.result}`)
    } else {
      setScoreMsg('❌ Save failed (unknown error)')
    }
  }

    const validateStatsBeforeSave = () => {
    for (const [playerId, stats] of Object.entries(playerStats)) {
      const player = players.find(p => p.id === playerId)
      const playerName = player?.name ?? 'A player'

      const wholeNumberFields: [keyof StatRow, string][] = [
        ['batting_order_position', 'batting order'],
        ['at_bats', 'at-bats'],
        ['hits', 'hits'],
        ['rbi', 'RBI'],
        ['runs', 'runs'],
        ['walks', 'walks'],
        ['strikeouts', 'strikeouts'],
        ['pitch_count', 'pitch count'],
        ['strikeouts_pitching', 'pitching strikeouts'],
        ['walks_allowed', 'walks allowed'],
        ['hits_allowed', 'hits allowed'],
        ['earned_runs', 'earned runs'],
      ]

      for (const [field, label] of wholeNumberFields) {
        const rawValue = stats[field]
        if (rawValue === null || rawValue === undefined || rawValue === '') continue

        const value = Number(rawValue)

        if (!Number.isFinite(value)) {
          return `Error: ${playerName} has an invalid ${label} value.`
        }

        if (value < 0) {
          return `Error: ${playerName} has a negative ${label} value.`
        }

        if (!Number.isInteger(value)) {
          return `Error: ${playerName} has a non-whole-number ${label} value.`
        }
      }

      const inningsPitched = Number(stats.innings_pitched ?? 0)
      if (!Number.isFinite(inningsPitched)) {
        return `Error: ${playerName} has an invalid innings pitched value.`
      }

      if (inningsPitched < 0) {
        return `Error: ${playerName} has negative innings pitched.`
      }

      const atBats = Number(stats.at_bats ?? 0)
      const hits = Number(stats.hits ?? 0)

      if (Number.isFinite(atBats) && Number.isFinite(hits) && hits > atBats) {
        return `Error: ${playerName} has hits greater than at-bats.`
      }
    }

    return null
  }

      const battingStatCompareFields: (keyof StatRow)[] = [
    'batting_order_position',
    'at_bats',
    'hits',
    'rbi',
    'runs',
    'walks',
    'strikeouts',
  ]

  const pitchingStatCompareFields: (keyof StatRow)[] = [
    'pitch_count',
    'innings_pitched',
    'strikeouts_pitching',
    'walks_allowed',
    'hits_allowed',
    'earned_runs',
  ]

  const normalizeStatValue = (value: StatRow[keyof StatRow]) => value ?? 0

  const playerHasUnsavedFields = (playerId: string, fields: (keyof StatRow)[]) => {
    const current = playerStats[playerId]
    const saved = savedPlayerStats[playerId]

    if (!current && !saved) return false
    if (!current || !saved) return true

    return fields.some(field => normalizeStatValue(current[field]) !== normalizeStatValue(saved[field]))
  }

  const playerHasUnsavedBattingStats = (playerId: string) =>
    playerHasUnsavedFields(playerId, battingStatCompareFields)

  const playerHasUnsavedPitchingStats = (playerId: string) =>
    playerHasUnsavedFields(playerId, pitchingStatCompareFields)

  const hasUnsavedStats = players.some(player =>
    playerHasUnsavedBattingStats(player.id) || playerHasUnsavedPitchingStats(player.id)
  )

  const saveStats = async () => {
    if (!statsEventId) return

    setStatsSaving(true)
    setStatsMsg(null)

    const validationError = validateStatsBeforeSave()
    if (validationError) {
      setStatsSaving(false)
      setStatsMsg(validationError)
      return
    }

    try {
      const result = await api({
        action: 'update_player_stats_bulk',
        eventId: statsEventId,
        stats: Object.entries(playerStats).map(([playerId, stats]) => ({
          playerId,
          batting_order_position: stats.batting_order_position ?? null,
          at_bats: stats.at_bats ?? 0,
          hits: stats.hits ?? 0,
          rbi: stats.rbi ?? 0,
          runs: stats.runs ?? 0,
          walks: stats.walks ?? 0,
          strikeouts: stats.strikeouts ?? 0,
          pitch_count: stats.pitch_count ?? 0,
          innings_pitched: stats.innings_pitched ?? 0,
          strikeouts_pitching: stats.strikeouts_pitching ?? 0,
          walks_allowed: stats.walks_allowed ?? 0,
          hits_allowed: stats.hits_allowed ?? 0,
          earned_runs: stats.earned_runs ?? 0,
        })),
      })

      if (result?.error) {
        setStatsMsg(`Error: ${result.error}`)
        return
      }

      setSavedPlayerStats(playerStats)
      setStatsMsg('All stats saved!')
    } catch (err) {
      setStatsMsg(err instanceof Error ? `Error: ${err.message}` : 'Error: Could not save stats')
    } finally {
      setStatsSaving(false)
    }
  }

  const saveStatus = async () => {
    if (!statusEventId) return
    setStatusSaving(true)
    setStatusMsg(null)
    const res = await api({
      action: 'update_game_status',
      eventId: statusEventId,
      displayStatus: statusDraftStatus,
      message: statusDraftMessage,
      changedBy: 'Steve',
    })
    setStatusSaving(false)
    if (res?.error) {
      setStatusMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      setStatusMsg(res.warning ? `⚠ ${res.warning}` : '✅ Broadcast saved')
      setCurrentDisplayStatus(statusDraftStatus)
      setCurrentMessage(statusDraftMessage)
      setCurrentUpdatedAt(new Date().toISOString())
    } else {
      setStatusMsg('❌ Save failed')
    }
  }

  const saveStandings = async () => {
    setStandingsSaving(true)
    setStandingsMsg(null)
    for (const row of Object.values(editedStandings)) {
      await api({ action: 'update_standing', standingId: row.id, wins: row.wins, losses: row.losses, ties: row.ties, gamesPlayed: row.games_played, runsFor: row.runs_for, runsAgainst: row.runs_against })
    }
    setStandingsSaving(false)
    setStandingsMsg('✅ Standings saved!')
  }

  // Open the approve modal for a specific pending membership.
  // Default: all org teams checked, the first one selected as default.
  const startApprove = (membershipId: string) => {
    setRejectingId(null)
    setApprovingId(membershipId)
    setApproveTeamIds(new Set(orgTeams.map(t => t.id)))
    setApproveDefaultTeamId(orgTeams[0]?.id ?? '')
    setPendingMsg(null)
  }

  const cancelApprove = () => {
    setApprovingId(null)
    setApproveTeamIds(new Set())
    setApproveDefaultTeamId('')
  }

  const startReject = (membershipId: string) => {
    setApprovingId(null)
    setApproveTeamIds(new Set())
    setApproveDefaultTeamId('')
    setRejectingId(membershipId)
    setPendingMsg(null)
  }

  const cancelReject = () => {
    setRejectingId(null)
  }

  const submitReject = async () => {
    if (!rejectingId) return

    setRejectSaving(true)
    setPendingMsg(null)

    const result = await rejectMembership(rejectingId)

    setRejectSaving(false)

    if (!result.ok) {
      setPendingMsg(`❌ ${result.error}`)
      return
    }

    setPendingList(prev =>
      prev.filter(item => item.id !== rejectingId)
    )

    setDashboardPendingCount(prev =>
      prev === null ? null : Math.max(0, prev - 1)
    )

    setPendingMsg('✅ Access request rejected')
    cancelReject()
  }

  const startPromoteMember = (member: ApprovedParent) => {
  setPromotingMemberId(member.id)
  setPromoteTeamIds(new Set(member.teams.map(t => t.id)))
  setMembersMsg(null)
}

const cancelPromoteMember = () => {
  setPromotingMemberId(null)
  setPromoteTeamIds(new Set())
}

const togglePromoteTeam = (teamId: string) => {
  const next = new Set(promoteTeamIds)
  if (next.has(teamId)) next.delete(teamId)
  else next.add(teamId)
  setPromoteTeamIds(next)
}

const savePromoteMember = async () => {
  if (!promotingMemberId) return
  setPromoteSaving(true)
  setMembersMsg(null)

  const result = await makeMemberTeamAdmin(promotingMemberId, Array.from(promoteTeamIds))

  setPromoteSaving(false)

  if (!result.ok) {
    setMembersMsg(`❌ ${result.error}`)
    return
  }

  setMembersMsg('✅ Team admin assigned')
  cancelPromoteMember()
}

const removeTeamAdminTeam = async (memberId: string, teamId: string) => {
  setMembersMsg(null)

  const result = await removeMemberTeamAdmin(memberId, teamId)

  if (!result.ok) {
    setMembersMsg(`❌ ${result.error}`)
    return
  }

  setMembersMsg('✅ Team admin access removed')

  const [membersResult, teamsResult] = await Promise.all([
    getApprovedParents(),
    getOrgTeams(),
  ])

  if (membersResult.ok) setMembersList(membersResult.members)
  if (teamsResult.ok) setOrgTeams(teamsResult.teams)
}

const toggleGrantAdminTeam = (teamId: string) => {
  const next = new Set(grantAdminTeamIds)
  if (next.has(teamId)) next.delete(teamId)
  else next.add(teamId)
  setGrantAdminTeamIds(next)
}

const submitGrantTeamAdmin = async () => {
  setGrantAdminSaving(true)
  setMembersMsg(null)

  const result = await grantTeamAdminByEmail(grantAdminEmail, Array.from(grantAdminTeamIds))

  setGrantAdminSaving(false)

  if (!result.ok) {
    setMembersMsg(`❌ ${result.error}`)
    return
  }

  setGrantAdminEmail('')
  setGrantAdminTeamIds(new Set())
  setMembersMsg('✅ Team admin assigned')
  await reloadMembers()
}

  const toggleApproveTeam = (teamId: string) => {
    const next = new Set(approveTeamIds)
    if (next.has(teamId)) {
      next.delete(teamId)
      // If the unchecked team was the default, clear default
      if (approveDefaultTeamId === teamId) {
        setApproveDefaultTeamId('')
      }
    } else {
      next.add(teamId)
      // If no default set, this becomes default
      if (!approveDefaultTeamId) {
        setApproveDefaultTeamId(teamId)
      }
    }
    setApproveTeamIds(next)
  }

  const submitApprove = async () => {
    if (!approvingId) return
    setApproveSaving(true)
    setPendingMsg(null)
    const result = await approveMembership(
      approvingId,
      Array.from(approveTeamIds),
      approveDefaultTeamId
    )
    setApproveSaving(false)
    if (!result.ok) {
      setPendingMsg(`❌ ${result.error}`)
      return
    }
    setPendingMsg('✅ Approved')

    // Remove from list
    setPendingList(prev =>
      prev.filter(p => p.id !== approvingId)
    )

    // Update the dashboard count
    setDashboardPendingCount(prev =>
      prev === null ? null : Math.max(0, prev - 1)
    )

    // Close the approval panel
    cancelApprove()
  }

  const updateStat = (playerId: string, field: keyof StatRow, value: string) => {
    setPlayerStats(prev => ({ ...prev, [playerId]: { ...prev[playerId], [field]: Number(value) } }))
  }

  const emptyStatRow = (playerId: string): StatRow => ({
    player_id: playerId,
    at_bats: 0,
    hits: 0,
    rbi: 0,
    runs: 0,
    walks: 0,
    strikeouts: 0,
    pitch_count: 0,
    innings_pitched: 0,
    strikeouts_pitching: 0,
    walks_allowed: 0,
    hits_allowed: 0,
    earned_runs: 0,
    batting_order_position: null,
  })

  const fillBattingOrder = () => {
    setPlayerStats(prev => {
      const next = { ...prev }

      players.forEach((player, index) => {
        next[player.id] = {
          ...emptyStatRow(player.id),
          ...(next[player.id] ?? {}),
          batting_order_position: index + 1,
        }
      })

      return next
    })

    setStatsMsg(null)
  }

  const clearPitchingStats = () => {
    setPlayerStats(prev => {
      const next = { ...prev }

      players.forEach(player => {
        next[player.id] = {
          ...emptyStatRow(player.id),
          ...(next[player.id] ?? {}),
          pitch_count: 0,
          innings_pitched: 0,
          strikeouts_pitching: 0,
          walks_allowed: 0,
          hits_allowed: 0,
          earned_runs: 0,
        }
      })

      return next
    })

    setStatsMsg(null)
  }

  const updateStanding = (id: string, field: keyof Standing, value: string) => {
    setEditedStandings(prev => ({ ...prev, [id]: { ...prev[id], [field]: Number(value) } }))
  }

  // Convert ISO timestamp from DB to value compatible with <input type="datetime-local">
  const toDatetimeLocal = (iso: string): string => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const startNewGame = () => {
    setEditingEventId(null)
    setFormMode('game')
    setEventMsg(null)
    setEventForm({
      title: '', opponent: '', opponentTeamId: '', eventType: 'game', startsAt: '', fieldId: '',
      isHome: false, travelMinutes: '', travelMiles: '', notes: '', gearNotes: '',
    })
  }

  const resetLeagueForm = () => {
  setLeagueEditingId(null)
  setLeagueHomeTeamId('')
  setLeagueAwayTeamId('')
  setLeaguePlayedAt('')
  setLeagueHomeScore('')
  setLeagueAwayScore('')
  setLeagueStatus('final')
  setLeagueMsg(null)
}

const loadLeagueGameForEdit = (game: LeagueGameAdminRow) => {
  setLeagueEditingId(game.id)
  setLeagueHomeTeamId(game.home_team_id)
  setLeagueAwayTeamId(game.away_team_id)
  // Convert ISO timestamp to datetime-local format
  const date = new Date(game.played_at)
  const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  setLeaguePlayedAt(localDateTime)
  setLeagueHomeScore(game.home_score?.toString() ?? '')
  setLeagueAwayScore(game.away_score?.toString() ?? '')
  setLeagueStatus(game.status as any)
  setLeagueMsg(null)
}

const saveLeagueGame = async () => {
  if (!leagueHomeTeamId || !leagueAwayTeamId || !leaguePlayedAt) {
    setLeagueMsg('❌ Please fill in both teams and date/time')
    return
  }
  if (leagueHomeTeamId === leagueAwayTeamId) {
    setLeagueMsg('❌ Home and away teams must be different')
    return
  }
  setLeagueSaving(true)
  setLeagueMsg(null)
  
  const action = leagueEditingId ? 'update_league_game' : 'create_league_game'
  const res = await api({
    action,
    leagueGameId: leagueEditingId,
    homeTeamId: leagueHomeTeamId,
    awayTeamId: leagueAwayTeamId,
    playedAt: new Date(leaguePlayedAt).toISOString(),
    homeScore: leagueHomeScore ? Number(leagueHomeScore) : null,
    awayScore: leagueAwayScore ? Number(leagueAwayScore) : null,
    status: leagueStatus,
  })
  setLeagueSaving(false)
  if (res?.error) {
    setLeagueMsg(`❌ ${res.error}`)
  } else if (res?.ok) {
    setLeagueMsg(leagueEditingId ? '✅ Game updated' : '✅ Game created')
    resetLeagueForm()
    // Reload list
    const supabase = createClient()
    const { data } = await supabase
      .from('league_games')
      .select(`
        id, played_at, home_team_id, away_team_id, home_score, away_score, status,
        home_team:home_team_id (name),
        away_team:away_team_id (name)
      `)
      .order('played_at', { ascending: false })
    if (data) {
      const normalized = data.map((g: any) => ({
        ...g,
        home_team: Array.isArray(g.home_team) ? g.home_team[0] : g.home_team,
        away_team: Array.isArray(g.away_team) ? g.away_team[0] : g.away_team,
      }))
      setAllLeagueGames(normalized as LeagueGameAdminRow[])
    }
  } else {
    setLeagueMsg('❌ Save failed')
  }
}

const deleteLeagueGame = async () => {
  if (!leagueEditingId) return
  if (!confirm('Delete this league game? This cannot be undone.')) return
  const res = await api({ action: 'delete_league_game', leagueGameId: leagueEditingId })
  if (res?.error) {
    setLeagueMsg(`❌ ${res.error}`)
  } else if (res?.ok) {
    setAllLeagueGames(prev => prev.filter(g => g.id !== leagueEditingId))
    resetLeagueForm()
    setLeagueMsg('✅ Deleted')
  }
}

  const startNewPractice = () => {
    setEditingEventId(null)
    setFormMode('practice')
    setEventMsg(null)
    setEventForm({
      title: 'Practice', opponent: '', opponentTeamId: '', eventType: 'practice', startsAt: '', fieldId: '',
      isHome: false, travelMinutes: '', travelMiles: '', notes: '', gearNotes: '',
    })
  }

  const editEvent = (ev: EventListRow) => {
    setEditingEventId(ev.id)
    setFormMode(ev.event_type === 'practice' ? 'practice' : 'game')
    setEventMsg(null)
    // Try to match the stored opponent name to a team in allTeams.
    // If it matches, pre-fill the dropdown; if not, the form falls back gracefully.
    const matchedTeam = allTeams.find(t => t.name === ev.opponent)
    setEventForm({
      title: ev.title,
      opponent: ev.opponent ?? '',
      opponentTeamId: matchedTeam?.id ?? '',
      eventType: (ev.event_type as 'game' | 'tournament' | 'practice') ?? 'game',
      startsAt: toDatetimeLocal(ev.starts_at),
      fieldId: ev.field_id ?? '',
      isHome: ev.is_home ?? false,
      travelMinutes: ev.travel_minutes?.toString() ?? '',
      travelMiles: ev.travel_miles?.toString() ?? '',
      notes: ev.notes ?? '',
      gearNotes: ev.gear_notes ?? '',
    })
  }

  const cancelEventForm = () => {
    setEditingEventId(null)
    setFormMode('none')
    setEventMsg(null)
  }

  const saveEvent = async () => {
    if (!eventForm.title || !eventForm.startsAt) {
      setEventMsg('❌ Title and start time are required')
      return
    }
    setEventSaving(true)
    setEventMsg(null)
    const startsAtIso = new Date(eventForm.startsAt).toISOString()
    const payload = {
      title: eventForm.title,
      opponent: formMode === 'practice' ? null : eventForm.opponent,
      opponentTeamId: (formMode === 'game' && eventForm.eventType === 'game')
        ? (eventForm.opponentTeamId || null)
        : null,
      eventType: formMode === 'practice' ? 'practice' : eventForm.eventType,
      startsAt: startsAtIso,
      fieldId: eventForm.fieldId || null,
      isHome: formMode === 'practice' ? false : eventForm.isHome,
      travelMinutes: eventForm.travelMinutes ? Number(eventForm.travelMinutes) : null,
      travelMiles: eventForm.travelMiles ? Number(eventForm.travelMiles) : null,
      notes: eventForm.notes || null,
      gearNotes: eventForm.gearNotes || null,
    }

    let res
    if (editingEventId) {
      res = await api({ action: 'update_event', eventId: editingEventId, ...payload })
    } else if (formMode === 'practice') {
      res = await api({ action: 'create_practice', ...payload })
    } else {
      res = await api({ action: 'create_event', ...payload })
    }

    setEventSaving(false)
    if (res?.error) {
      setEventMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      setEventMsg('✅ Saved!')
      await reloadEvents()
      setTimeout(() => { cancelEventForm() }, 700)
    } else {
      setEventMsg('❌ Save failed (unknown error)')
    }
  }

  const deleteEvent = async () => {
    if (!editingEventId) return
    if (!confirm('Delete this event? This will also delete its box score and player stats. This cannot be undone.')) return
    setEventSaving(true)
    setEventMsg(null)
    const res = await api({ action: 'delete_event', eventId: editingEventId })
    setEventSaving(false)
    if (res?.error) {
      setEventMsg(`❌ ${res.error}`)
    } else if (res?.ok) {
      await reloadEvents()
      cancelEventForm()
    } else {
      setEventMsg('❌ Delete failed')
    }
  }

  const filteredEvents = (() => {
    const now = new Date().getTime()
    if (eventFilter === 'upcoming') return allEvents.filter(e => new Date(e.starts_at).getTime() >= now)
    if (eventFilter === 'past') return allEvents.filter(e => new Date(e.starts_at).getTime() < now)
    return allEvents
  })()
  
  if (!password) return <PasswordGate onSuccess={setPassword} />

  const selectedEvent = events.find(e => e.id === selectedEventId)

  const usTotal = usInnings.reduce((a, b) => a + b, 0)

  const themTotal = themInnings.reduce((a, b) => a + b, 0)

  const dashboardEventsMissingFields = dashboardThisWeek.filter(event => !event.field_id)

  const dashboardTeamIdsWithUpcomingEvents = new Set(
    dashboardThisWeek
      .map(event => event.team_id)
      .filter((teamId): teamId is string => Boolean(teamId))
  )

  const dashboardTeamsWithNoUpcomingEvents = dashboardTeams.filter(
    team => !dashboardTeamIdsWithUpcomingEvents.has(team.id)
  )

  const dashboardTeamHealthByTeamId = new Map(
  dashboardTeamHealthCounts.map(count => [count.team_id, count])
)

  const dashboardTeamsWithNoPlayers = dashboardTeams.filter(team => {
    const counts = dashboardTeamHealthByTeamId.get(team.id)
    return !counts || counts.player_count === 0
  })

  const dashboardTeamsWithNoFamilies = dashboardTeams.filter(team => {
    const counts = dashboardTeamHealthByTeamId.get(team.id)
    return !counts || counts.family_count === 0
  })

  const loadManagedRoster = async () => {
    if (!rosterTeamSeasonId) {
      setManagedRosterPlayers([])
      setAssignableAthletes([])
      return
    }

    setRosterLoading(true)
    setRosterMsg(null)

    try {
      const supabase = createClient()

      const [rosterResult, assignableResult] = await Promise.all([
        supabase
          .from('players')
          .select('id, athlete_id, name, jersey_number, position,  roster_status, removed_at, removed_reason')
          .eq('team_season_id', rosterTeamSeasonId)
          .order('name', { ascending: true }),

        getAssignableAthletes(rosterTeamSeasonId),
      ])

      if (rosterResult.error) {
        throw new Error(rosterResult.error.message)
      }

      if (!assignableResult.ok) {
        throw new Error(assignableResult.error)
      }

      setManagedRosterPlayers(
        (rosterResult.data ?? []) as ManagedRosterPlayer[]
      )
      setAssignableAthletes(assignableResult.athletes)
    } catch (err) {
      setManagedRosterPlayers([])
      setAssignableAthletes([])
      setRosterMsg(
        `Error: ${
          err instanceof Error ? err.message : 'Failed to load roster.'
        }`
      )
    } finally {
      setRosterLoading(false)
    }
  }

  const submitNewAthlete = async () => {
  if (!rosterTeamSeasonId || rosterSaving) return

  const displayName = newAthleteName.trim()

  if (!displayName) {
    setRosterMsg('Error: Enter the player name.')
    return
  }

  setRosterSaving(true)
  setRosterMsg(null)

  const result = await createAthleteRosterAssignment({
    teamSeasonId: rosterTeamSeasonId,
    displayName,
    jerseyNumber: newAthleteJersey,
    position: newAthletePosition,
  })

  if (result.ok) {
    setNewAthleteName('')
    setNewAthleteJersey('')
    setNewAthletePosition('')
    setRosterMsg('Player added to the current-season roster.')
    await loadManagedRoster()
  } else {
    setRosterMsg(`Error: ${result.error}`)
  }

  setRosterSaving(false)
}

const selectExistingAthlete = (athleteId: string) => {
  setExistingAthleteId(athleteId)

  const selected = assignableAthletes.find(
    athlete => athlete.id === athleteId
  )

  setExistingAthleteJersey(selected?.previousJerseyNumber ?? '')
  setExistingAthletePosition(selected?.previousPosition ?? '')
}

const submitExistingAthlete = async () => {
  if (!rosterTeamSeasonId || rosterSaving) return

  if (!existingAthleteId) {
    setRosterMsg('Error: Select an existing athlete.')
    return
  }

  setRosterSaving(true)
  setRosterMsg(null)

  const result = await assignExistingAthleteToTeamSeason({
    athleteId: existingAthleteId,
    teamSeasonId: rosterTeamSeasonId,
    jerseyNumber: existingAthleteJersey,
    position: existingAthletePosition,
  })

  if (result.ok) {
    setExistingAthleteId('')
    setExistingAthleteJersey('')
    setExistingAthletePosition('')
    setRosterMsg('Existing athlete added to the current-season roster.')
    await loadManagedRoster()
  } else {
    setRosterMsg(`Error: ${result.error}`)
  }

  setRosterSaving(false)
}

const beginRosterEdit = (player: ManagedRosterPlayer) => {
  setEditingRosterPlayerId(player.id)
  setEditingRosterName(player.name)
  setEditingRosterJersey(player.jersey_number ?? '')
  setEditingRosterPosition(player.position ?? '')
  setRosterMsg(null)
}

const cancelRosterEdit = () => {
  setEditingRosterPlayerId(null)
  setEditingRosterName('')
  setEditingRosterJersey('')
  setEditingRosterPosition('')
}

const saveRosterEdit = async () => {
  if (!editingRosterPlayerId || rosterEditSaving) return

  const displayName = editingRosterName.trim()

  if (!displayName) {
    setRosterMsg('Error: Player name is required.')
    return
  }

  setRosterEditSaving(true)
  setRosterMsg(null)

  const result = await updateRosterAssignment({
    playerId: editingRosterPlayerId,
    displayName,
    jerseyNumber: editingRosterJersey,
    position: editingRosterPosition,
  })

  if (result.ok) {
    cancelRosterEdit()
    setRosterMsg(`${result.displayName} was updated.`)
    await loadManagedRoster()
  } else {
    setRosterMsg(`Error: ${result.error}`)
  }

  setRosterEditSaving(false)
}

  const removeManagedPlayer = async (player: ManagedRosterPlayer) => {
    if (rosterStatusSavingId) return

    const confirmed = window.confirm(
      `Remove ${player.name} from this season's active roster?\n\n` +
        'Their athlete identity, statistics, and season history will be preserved.'
    )

    if (!confirmed) return

    setRosterStatusSavingId(player.id)
    setRosterMsg(null)

    const result = await removePlayerFromRoster({
      playerId: player.id,
    })

    if (result.ok) {
      setRosterMsg(`${player.name} was removed from the active roster.`)
      await loadManagedRoster()
    } else {
      setRosterMsg(`Error: ${result.error}`)
    }

    setRosterStatusSavingId(null)
  }

  const restoreManagedPlayer = async (player: ManagedRosterPlayer) => {
    if (rosterStatusSavingId) return

    setRosterStatusSavingId(player.id)
    setRosterMsg(null)

    const result = await restorePlayerToRoster(player.id)

    if (result.ok) {
      setRosterMsg(`${player.name} was restored to the active roster.`)
      await loadManagedRoster()
    } else {
      setRosterMsg(`Error: ${result.error}`)
    }

    setRosterStatusSavingId(null)
  }

  const activeRosterPlayers = managedRosterPlayers.filter(
    player => player.roster_status === 'active'
  )

  const inactiveRosterPlayers = managedRosterPlayers.filter(
    player => player.roster_status === 'inactive'
  )

  const allAdminTabs = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'roster', label: 'Roster' },
  { key: 'pending', label: 'Pending' },
  { key: 'members', label: 'Members' },
  { key: 'status', label: 'Status' },
  { key: 'score', label: 'Score' },
  { key: 'stats', label: 'Stats' },
  { key: 'events', label: 'Events' },
  { key: 'league', label: 'League' },
  { key: 'standings', label: 'Standings' },
  { key: 'settings', label: 'Settings' },
] as const

const teamAdminAllowedTabs: Tab[] = ['dashboard', 'roster', 'status', 'score', 'stats', 'events']

const visibleAdminTabs = isOrgAdmin
  ? allAdminTabs
  : allAdminTabs.filter(t => teamAdminAllowedTabs.includes(t.key))

  return (
    <main className="min-h-screen bg-black pb-10 text-white" style={{ colorScheme: 'dark' }}>
      {/* Header */}
      <div className="bg-black px-4 pt-8 pb-4 border-b border-white/10">
        <div className="mx-auto max-w-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] font-semibold"
                style={{ color: brandColor }}
                >
                  Admin
                </p>
            <h1 className="text-xl font-extrabold text-white">Organization Console</h1>
          </div>
          <button onClick={() => { localStorage.removeItem(PASSWORD_KEY); setPassword(null) }}
            className="text-xs text-slate-500 hover:text-slate-300 transition">
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-sm mt-4 grid grid-cols-5 gap-1">
          {visibleAdminTabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`rounded-xl py-2 text-xs font-bold transition ${tab === key ? 'text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
              style={tab === key ? { backgroundColor: brandColor } : undefined}
              >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`mx-auto px-4 pt-4 space-y-4 ${
          tab === 'stats'
            ? 'max-w-3xl'
            : tab === 'roster'
              ? 'max-w-xl'
              : 'max-w-sm'
        }`}
      >

        {/* ── Settings Tab ─────────────────────────────────────────────── */}
        {tab === 'settings' && isOrgAdmin && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-4 space-y-4"
              style={{
                border: `1px solid ${brandColor}4D`,
                backgroundColor: `${brandColor}0D`,
              }}
            >
              <p
                className="text-xs uppercase tracking-wide font-semibold"
                style={{ color: brandColor }}
              >
                Organization Settings
              </p>

              <div
                role="tablist"
                aria-label="Settings sections"
                className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
              >
                {([
                  ['general', 'General'],
                  ['branding', 'Branding'],
                  ['access', 'Access'],
                  ['links', 'Links'],
                  ['season', 'Season'],
                ] as const).map(([subTab, label]) => {
                  const isActive = settingsSubTab === subTab

                  return (
                    <button
                      key={subTab}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSettingsSubTab(subTab)}
                      className="rounded-xl border px-3 py-2 text-xs font-bold transition"
                      style={{
                        backgroundColor: isActive ? brandColor : 'rgba(255,255,255,0.05)',
                        borderColor: isActive ? brandColor : 'rgba(255,255,255,0.1)',
                        color: isActive ? '#ffffff' : '#cbd5e1',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {settingsSubTab === 'general' && (
                <div role="tabpanel" className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-white">Launch Readiness</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Core setup items for launching this organization.
                      </p>
                    </div>

                    {!launchReadinessLoading && launchReadiness && (
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-white">
                          {launchReadinessPercent}%
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {completedLaunchItems}/
                          {launchReadinessItems.length} complete
                        </p>
                      </div>
                    )}
                  </div>

                  {!launchReadinessLoading && launchReadiness && (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${launchReadinessPercent}%`,
                          backgroundColor: brandColor,
                        }}
                      />
                    </div>
                  )}

                  {launchReadinessLoading && (
                    <p className="mt-4 text-sm text-slate-400">Checking setup…</p>
                  )}

                  {!launchReadinessLoading && launchReadiness && (
                    <div className="mt-4 space-y-2">
                      {launchReadinessItems.map(item => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-slate-200">
                              {item.label}
                            </p>

                            {!item.complete && item.manualSetup && (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Team creation is currently handled during
                                organization provisioning.
                              </p>
                            )}
                          </div>

                          {item.complete ? (
                            <span className="shrink-0 text-xs font-semibold text-emerald-400">
                              Complete
                            </span>
                          ) : item.targetTab ? (
                            <button
                              type="button"
                              onClick={() => openLaunchSetup(item)}
                              className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold transition hover:bg-white/5"
                              style={{
                                borderColor: brandColor,
                                color: brandColor,
                              }}
                            >
                              Set up
                            </button>
                          ) : (
                            <span className="shrink-0 text-xs font-semibold text-amber-400">
                              Manual setup
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {launchReadinessMsg && (
                    <p className="mt-4 text-sm text-slate-300">{launchReadinessMsg}</p>
                  )}
                </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Organization Name</label>
                    <input
                      type="text"
                      value={settingsName}
                      onChange={e => setSettingsName(e.target.value)}
                      className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Public Welcome Message</label>
                    <textarea
                      value={settingsPublicDescription}
                      onChange={e => setSettingsPublicDescription(e.target.value)}
                      rows={3}
                      placeholder="Tell families what they can find here."
                      className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400"
                    />
                    <p className="text-[11px] text-slate-500">
                      This appears on the public organization page.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Slug</label>
                    <input
                      type="text"
                      value={org?.slug ?? ''}
                      disabled
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-500"
                    />
                    <p className="text-[11px] text-slate-500">
                      Slug editing is disabled for now because it affects signup links.
                    </p>
                  </div>

                  <button
                    onClick={saveOrgSettings}
                    disabled={settingsSaving || !settingsName.trim()}
                    className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                    style={{ backgroundColor: settingsPrimaryColor || brandColor }}
                  >
                    {settingsSaving ? 'Saving...' : 'Save Organization Settings'}
                  </button>

                  {settingsMsg && (
                    <p className="text-sm text-center text-slate-300">{settingsMsg}</p>
                  )}
                </div>
              )}

              {settingsSubTab === 'branding' && (
                <div role="tabpanel" className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Upload Logo</label>
                    <p className="text-[11px] text-slate-500">
                      Choose a PNG, JPG, or WebP logo. After upload, click Save Organization Settings.
                    </p>

                    <label
                      className="block cursor-pointer rounded-xl px-3 py-3 text-center text-sm font-bold text-white transition disabled:opacity-50"
                      style={{ backgroundColor: brandColor }}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={settingsLogoUploading}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          uploadOrgLogo(file)
                          e.currentTarget.value = ''
                        }}
                      />
                      {settingsLogoUploading ? 'Uploading logo...' : 'Choose Logo File'}
                    </label>
                  </div>

                  {settingsLogoUrl && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="mb-2 text-xs text-slate-400">Logo Preview</p>
                      <img
                        src={settingsLogoUrl}
                        alt="Organization logo preview"
                        className="h-16 w-16 rounded-xl object-contain bg-white"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Primary Color</label>
                    <p className="text-[11px] text-slate-500">
                      Click the color box to choose the organization’s main app color.
                    </p>

                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                      <input
                        type="color"
                        value={settingsPrimaryColor}
                        onChange={e => setSettingsPrimaryColor(e.target.value)}
                        className="h-12 w-16 cursor-pointer rounded-lg border border-white/20 bg-transparent"
                        title="Click to choose a color"
                      />

                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">App highlight color</p>
                        <p className="text-xs text-slate-400">
                          Used for buttons, tabs, navigation, chat bubbles, and highlights.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={saveOrgSettings}
                    disabled={settingsSaving || !settingsName.trim()}
                    className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                    style={{ backgroundColor: settingsPrimaryColor || brandColor }}
                  >
                    {settingsSaving ? 'Saving...' : 'Save Organization Settings'}
                  </button>

                  {settingsMsg && (
                    <p className="text-sm text-center text-slate-300">{settingsMsg}</p>
                  )}
                </div>
              )}

              {settingsSubTab === 'access' && (
                <div role="tabpanel" className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Access</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Share the signup link with parents, coaches, and players so they can request access.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={signupLink}
                        className="min-w-0 flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-400"
                      />

                      <button
                        type="button"
                        onClick={copySignupLink}
                        disabled={!signupLink}
                        className="rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                        style={{ backgroundColor: brandColor }}
                      >
                        {settingsCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {settingsMsg && (
                    <p className="text-sm text-center text-slate-300">{settingsMsg}</p>
                  )}
                </div>
              )}

              {settingsSubTab === 'links' && (
                <div role="tabpanel" className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Organization Links</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Add useful parent-facing links such as tryout registration, training sessions, your website, or team store.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Label</label>
                      <input
                        type="text"
                        value={linkLabel}
                        onChange={e => setLinkLabel(e.target.value)}
                        placeholder="Book a Training Session"
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">URL</label>
                      <input
                        type="url"
                        value={linkUrl}
                        onChange={e => setLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Description</label>
                      <textarea
                        value={linkDescription}
                        onChange={e => setLinkDescription(e.target.value)}
                        placeholder="Optional short description"
                        rows={2}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={linkIsActive}
                          onChange={e => setLinkIsActive(e.target.checked)}
                        />
                        Active
                      </label>

                      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={linkIsPublic}
                          onChange={e => setLinkIsPublic(e.target.checked)}
                        />
                        Public
                      </label>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Sort Order</label>
                      <input
                        type="number"
                        value={linkSortOrder}
                        onChange={e => setLinkSortOrder(e.target.value)}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={submitOrganizationLink}
                        disabled={linkSaving || !linkLabel.trim() || !linkUrl.trim()}
                        className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                        style={{ backgroundColor: brandColor }}
                      >
                        {linkSaving ? 'Saving...' : editingLinkId ? 'Update Link' : 'Add Link'}
                      </button>

                      {editingLinkId && (
                        <button
                          type="button"
                          onClick={resetLinkForm}
                          className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {settingsLinksLoading && (
                      <p className="text-sm text-slate-400">Loading links...</p>
                    )}

                    {!settingsLinksLoading && settingsLinks.length === 0 && (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-sm text-slate-400">No organization links yet.</p>
                      </div>
                    )}

                    {!settingsLinksLoading && settingsLinks.map(link => (
                      <div
                        key={link.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">{link.label}</p>
                            <p className="truncate text-xs text-slate-400">{link.url}</p>
                            {link.description && (
                              <p className="mt-1 text-xs text-slate-500">{link.description}</p>
                            )}
                            <div className="mt-2 flex gap-2">
                              <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-slate-300">
                                {link.is_active ? 'Active' : 'Inactive'}
                              </span>
                              {link.is_public && (
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-slate-300">
                                  Public
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => editOrganizationLink(link)}
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => removeOrganizationLink(link.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {settingsLinksMsg && (
                    <p className="text-sm text-center text-slate-300">{settingsLinksMsg}</p>
                  )}
                </div>
              )}

              {settingsSubTab === 'season' && (
                <div role="tabpanel" className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Season</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      The active season controls schedules, rosters, stats, and standings.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    {settingsSeasonLoading ? (
                      <p className="text-sm text-slate-400">Loading active season...</p>
                    ) : settingsSeasonName ? (
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">{settingsSeasonName}</p>
                        <span
                          className="inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
                          style={{ backgroundColor: brandColor }}
                        >
                          Active
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        {settingsSeasonMsg ?? 'No active season found.'}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">Start New Season</h4>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Archives the current season, creates fresh team-season records, and makes the new season active. Old season data is preserved, but current-season pages will switch to the new season. Historical season browsing is not available yet.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">New Season Name</label>
                      <input
                        type="text"
                        value={newSeasonName}
                        onChange={e => setNewSeasonName(e.target.value)}
                        placeholder="Fall 2026"
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={newSeasonStartDate}
                          onChange={e => setNewSeasonStartDate(e.target.value)}
                          className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-slate-400">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={newSeasonEndDate}
                          onChange={e => setNewSeasonEndDate(e.target.value)}
                          className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400"
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                      <input
                        type="checkbox"
                        checked={copyRostersForward}
                        onChange={e => setCopyRostersForward(e.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Copy rosters forward</span>
                        <span className="block text-[11px] text-slate-500">
                          Copies player names, jersey numbers, and positions into the new season. Stats are not copied.
                        </span>
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={submitSeasonRollover}
                      disabled={
                        seasonRolloverSaving ||
                        !newSeasonName.trim() ||
                        !newSeasonStartDate ||
                        !newSeasonEndDate
                      }
                      className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                      style={{ backgroundColor: brandColor }}
                    >
                      {seasonRolloverSaving ? 'Starting Season...' : 'Start New Season'}
                    </button>

                    {seasonRolloverMsg && (
                      <p className="text-sm text-center text-slate-300">{seasonRolloverMsg}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Dashboard Tab ─────────────────────────────────────────────── */}
         {tab === 'dashboard' && isOrgAdmin && (
          <DashboardTab
            dashboardLoading={dashboardLoading}
            dashboardMsg={dashboardMsg}
            dashboardTeamCount={dashboardTeamCount}
            dashboardFamilyCount={dashboardFamilyCount}
            dashboardPlayerCount={dashboardPlayerCount}
            dashboardPendingCount={dashboardPendingCount}
            dashboardThisWeek={dashboardThisWeek}
            dashboardTeams={dashboardTeams}
            dashboardTeamsMissingAdmins={dashboardTeamsMissingAdmins}
            dashboardTeamAdminAssignments={dashboardTeamAdminAssignments}
            dashboardEventsMissingFields={dashboardEventsMissingFields}
            dashboardTeamsWithNoUpcomingEvents={dashboardTeamsWithNoUpcomingEvents}
            dashboardTeamsWithNoPlayers={dashboardTeamsWithNoPlayers}
            dashboardTeamsWithNoFamilies={dashboardTeamsWithNoFamilies}
            formatDate={formatDate}
            setTab={setTab}
          />
        )}
        
        {tab === 'dashboard' && isTeamAdmin && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-lg">
              <div className="mb-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="mt-1 text-l font-black tracking-tight text-white">
                      Dashboard
                    </h2>
                  </div>

                  <span
                    className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide"
                    style={{ borderColor: brandColor, color: brandColor }}
                  >
                    Team Admin
                  </span>
                </div>


            </div>

              <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-black uppercase tracking-wide"
                    style={{ backgroundColor: `${brandColor}20`, color: brandColor }}
                  >
                    Next
                  </div>

                  <div className="flex-1">
                    {teamDashboardNextEvent ? (
                      <>
                        <p className="font-black text-white">
                          {teamDashboardNextEvent.event_type === 'practice'
                            ? 'Next Practice'
                            : teamDashboardNextEvent.event_type === 'tournament'
                              ? 'Next Tournament'
                              : 'Next Game'}
                        </p>

                        <p className="mt-1 text-sm text-slate-300">
                          {teamDashboardNextEvent.title}
                          {teamDashboardNextEvent.opponent ? ` vs ${teamDashboardNextEvent.opponent}` : ''}
                        </p>

                        {teamDashboardNextEvent.starts_at && (
                          <p className="mt-1 text-sm text-slate-400">
                            {formatDate(teamDashboardNextEvent.starts_at)}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-black text-white">
                          No upcoming events scheduled
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTab('events')}
                  className="mt-4 w-full rounded-xl py-2 text-sm font-bold text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  {teamDashboardNextEvent ? 'View Events' : 'Add Event'}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-lg">
              <div className="mb-5 flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: brandColor }}
                />
                <h3 className="text-lg font-black text-white">Quick Actions</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Set Status', nextTab: 'status' as Tab },
                  { label: 'Manage Roster', nextTab: 'roster' as Tab },
                  { label: 'Enter Score', nextTab: 'score' as Tab },
                  { label: 'Manage Events', nextTab: 'events' as Tab },
                  { label: 'Enter Stats', nextTab: 'stats' as Tab },
                ].map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => setTab(action.nextTab)}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border bg-black/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/5"
                    style={{ borderColor: brandColor, color: brandColor }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => (window.location.href = '/team')}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition hover:bg-white/5"
                style={{ borderColor: brandColor, color: brandColor }}
              >
                View Team Page
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-lg">
              <div className="mb-5 flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: brandColor }}
                />
                <h3 className="text-lg font-black text-white">Roster Health</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: 'Players',
                    value: teamDashboardPlayers.length,
                    icon: '👤',
                  },
                  {
                    label: 'Missing #',
                    value: teamDashboardPlayers.filter(player => !player.jersey_number).length,
                    icon: '!',
                  },
                  {
                    label: 'Missing Pos',
                    value: teamDashboardPlayers.filter(player => !player.position).length,
                    icon: '👕',
                  },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/10 bg-black/30 p-2 text-center"
                  >
                    <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-black text-slate-300">
                      {stat.icon}
                    </div>
                    <p className="text-2xl font-black text-white">{stat.value}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-400">{stat.label}</p>
                  </div>
                ))}
                <div className="col-span-3 mt-4 space-y-2">
                  {teamDashboardPlayers.filter(p => !p.jersey_number).length > 0 && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                      <span className="text-sm text-amber-300">
                        ⚠ {teamDashboardPlayers.filter(p => !p.jersey_number).length} player(s) missing jersey numbers
                      </span>

                      <button
                        type="button"
                        onClick={() => setTab('roster')}
                        className="text-xs font-bold text-amber-300"
                      >
                        Fix →
                      </button>
                    </div>
                  )}

                  {teamDashboardPlayers.filter(p => !p.position).length > 0 && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                      <span className="text-sm text-amber-300">
                        ⚠ {teamDashboardPlayers.filter(p => !p.position).length} player(s) missing positions
                      </span>

                      <button
                        type="button"
                        onClick={() => setTab('roster')}
                        className="text-xs font-bold text-amber-300"
                      >
                        Fix →
                      </button>
                    </div>
                  )}
                  {teamDashboardPlayers.length > 0 &&
                    teamDashboardPlayers.every(
                      p => p.jersey_number && p.position
                    ) && (
                      <div className="flex justify-center">
                        <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-300">
                          <span>Roster looks healthy</span>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Roster Tab ─────────────────────────────────────────────────── */}
        {tab === 'roster' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: brandColor }}
              >
                Roster Management
              </p>

              <h2 className="mt-1 text-lg font-extrabold text-white">
                {currentTeam.label}
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                {currentRosterSeason?.name ?? 'Current season'}
              </p>
            </div>

            {(rosterSeasonsLoading || rosterTeamSeasonLoading) && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-slate-400">Loading roster…</p>
              </div>
            )}

            {!rosterSeasonsLoading &&
              !rosterTeamSeasonLoading &&
              (rosterTeamSeasonNotFound || !rosterTeamSeasonId) && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                  <p className="font-bold text-amber-300">
                    Team is not configured for the current season.
                  </p>
                  <p className="mt-1 text-sm text-amber-200/70">
                    An organization admin must create the team-season before this
                    roster can be managed.
                  </p>
                </div>
              )}

            {!rosterSeasonsLoading &&
              !rosterTeamSeasonLoading &&
              rosterTeamSeasonId && (
                <>
                  {rosterMsg && (
                    <div
                      className={
                        rosterMsg.startsWith('Error:')
                          ? 'rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300'
                          : 'rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300'
                      }
                    >
                      {rosterMsg}
                    </div>
                  )}

                  {/* Current roster */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-extrabold text-white">Current Roster</h3>
                        <p className="mt-1 text-xs text-slate-400">
                          {currentRosterSeason?.name ?? 'Current season'}
                        </p>
                      </div>

                      <span className="text-sm font-bold text-slate-300">
                        {activeRosterPlayers.length}{' '}
                        {activeRosterPlayers.length === 1 ? 'player' : 'players'}
                      </span>
                    </div>

                    {rosterLoading ? (
                      <p className="mt-4 text-sm text-slate-400">Loading roster…</p>
                    ) : activeRosterPlayers.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-center">
                        <p className="text-sm text-slate-400">
                          No players are assigned to this season yet.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {activeRosterPlayers.map(player => {
                          const isEditing = editingRosterPlayerId === player.id

                          if (isEditing) {
                            return (
                              <div
                                key={player.id}
                                className="rounded-xl border bg-black/30 p-4"
                                style={{ borderColor: `${brandColor}80` }}
                              >
                                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)]">
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-400">
                                      Player name
                                    </label>
                                    <input
                                      type="text"
                                      value={editingRosterName}
                                      onChange={event => setEditingRosterName(event.target.value)}
                                      disabled={rosterEditSaving || !isOrgAdmin}
                                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400 disabled:opacity-50"
                                    />
                                    {!isOrgAdmin && (
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        Only organization admins can change athlete names.
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-400">
                                      Jersey number
                                    </label>
                                    <input
                                      type="text"
                                      value={editingRosterJersey}
                                      onChange={event => setEditingRosterJersey(event.target.value)}
                                      placeholder="Optional"
                                      disabled={rosterEditSaving}
                                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400 disabled:opacity-50"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-400">
                                      Position
                                    </label>
                                    <input
                                      type="text"
                                      value={editingRosterPosition}
                                      onChange={event => setEditingRosterPosition(event.target.value)}
                                      placeholder="Optional"
                                      disabled={rosterEditSaving}
                                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400 disabled:opacity-50"
                                    />
                                  </div>
                                </div>

                                <div className="mt-3 flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={cancelRosterEdit}
                                    disabled={rosterEditSaving}
                                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => void saveRosterEdit()}
                                    disabled={rosterEditSaving || !editingRosterName.trim()}
                                    className="rounded-lg px-4 py-1.5 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ backgroundColor: brandColor }}
                                  >
                                    {rosterEditSaving ? 'Saving…' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={player.id}
                              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                                style={{ backgroundColor: brandColor }}
                              >
                                {player.jersey_number || '—'}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-white">
                                  {player.name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {player.position || 'No position entered'}
                                </p>
                              </div>

                              {!player.athlete_id && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                                  Identity missing
                                </span>
                              )}

                              <div className="ml-auto flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => beginRosterEdit(player)}
                                  disabled={
                                    rosterEditSaving ||
                                    rosterStatusSavingId !== null
                                  }
                                  title="Edit player"
                                  className="rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                                  style={{
                                    borderColor: brandColor,
                                    color: brandColor,
                                  }}
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void removeManagedPlayer(player)}
                                  disabled={
                                    rosterStatusSavingId !== null ||
                                    rosterEditSaving
                                  }
                                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {rosterStatusSavingId === player.id
                                    ? 'Removing…'
                                    : 'Remove'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {inactiveRosterPlayers.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-extrabold text-white">Inactive Players</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Removed from this season&apos;s active roster. History and statistics
                            are preserved.
                          </p>
                        </div>

                        <span className="text-sm font-bold text-slate-300">
                          {inactiveRosterPlayers.length}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2">
                        {inactiveRosterPlayers.map(player => (
                          <div
                            key={player.id}
                            className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-extrabold text-slate-400">
                              {player.jersey_number || '—'}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-slate-300">
                                {player.name}
                              </p>

                              <p className="mt-0.5 text-xs text-slate-500">
                                {player.position || 'No position entered'}
                              </p>

                              {player.removed_reason && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Reason: {player.removed_reason}
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => void restoreManagedPlayer(player)}
                              disabled={rosterStatusSavingId !== null}
                              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                              style={{
                                borderColor: brandColor,
                                color: brandColor,
                              }}
                            >
                              {rosterStatusSavingId === player.id
                                ? 'Restoring…'
                                : 'Restore'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    {/* New athlete */}
                    <form
                      onSubmit={event => {
                        event.preventDefault()
                        void submitNewAthlete()
                      }}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5"
                    >
                      <h3 className="font-extrabold text-white">Add New Athlete</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Creates a permanent athlete and adds them to this season.
                      </p>

                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-400">
                            Player name
                          </label>
                          <input
                            type="text"
                            value={newAthleteName}
                            onChange={event => setNewAthleteName(event.target.value)}
                            placeholder="First and last name"
                            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-400">
                            Jersey number
                          </label>
                          <input
                            type="text"
                            value={newAthleteJersey}
                            onChange={event => setNewAthleteJersey(event.target.value)}
                            placeholder="Optional"
                            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-400">
                            Position
                          </label>
                          <input
                            type="text"
                            value={newAthletePosition}
                            onChange={event => setNewAthletePosition(event.target.value)}
                            placeholder="Optional"
                            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={rosterSaving}
                          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ backgroundColor: brandColor }}
                        >
                          {rosterSaving ? 'Saving…' : 'Add New Athlete'}
                        </button>
                      </div>
                    </form>

                    {/* Existing athlete */}
                    <form
                      onSubmit={event => {
                        event.preventDefault()
                        void submitExistingAthlete()
                      }}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5"
                    >
                      <h3 className="font-extrabold text-white">Add Existing Athlete</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Adds a returning athlete without creating a duplicate identity.
                      </p>

                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-400">
                            Athlete
                          </label>
                          <select
                            value={existingAthleteId}
                            onChange={event => selectExistingAthlete(event.target.value)}
                            disabled={assignableAthletes.length === 0}
                            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none disabled:opacity-50"
                          >
                            <option value="" className="bg-slate-950">
                              {assignableAthletes.length === 0
                                ? 'No eligible athletes'
                                : 'Select an athlete'}
                            </option>

                            {assignableAthletes.map(athlete => (
                              <option
                                key={athlete.id}
                                value={athlete.id}
                                className="bg-slate-950"
                              >
                                {athlete.displayName}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-400">
                            Jersey number
                          </label>
                          <input
                            type="text"
                            value={existingAthleteJersey}
                            onChange={event =>
                              setExistingAthleteJersey(event.target.value)
                            }
                            placeholder="Optional"
                            disabled={!existingAthleteId}
                            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-400">
                            Position
                          </label>
                          <input
                            type="text"
                            value={existingAthletePosition}
                            onChange={event =>
                              setExistingAthletePosition(event.target.value)
                            }
                            placeholder="Optional"
                            disabled={!existingAthleteId}
                            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-slate-400 disabled:opacity-50"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={rosterSaving || !existingAthleteId}
                          className="w-full rounded-xl border py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            borderColor: brandColor,
                            color: brandColor,
                          }}
                        >
                          {rosterSaving ? 'Saving…' : 'Add Existing Athlete'}
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}
          </div>
        )}

        {/* ── Pending Tab ────────────────────────────────────────────────── */}
        {tab === 'pending' && (
          <>
            {pendingLoading && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-slate-400 text-sm">Loading pending approvals…</p>
              </div>
            )}

            {!pendingLoading && pendingList.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-slate-400 text-sm">No pending approvals.</p>
                <p className="text-slate-500 text-xs mt-2">
                  When a parent signs up, they&apos;ll appear here for review.
                </p>
              </div>
            )}

            {!pendingLoading && pendingList.length > 0 && (
              <div className="space-y-2">
                {pendingList.map(p => {
                  const isApproving = approvingId === p.id
                  const isRejecting = rejectingId === p.id
                  return (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-white">
                          {p.full_name || p.email || '(no name)'}
                        </p>
                        <p className="text-xs text-slate-400">{p.email}</p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Signed up {new Date(p.created_at).toLocaleString('en-US', {
                            timeZone: 'America/Chicago',
                          })}
                        </p>
                      </div>

                      {!isApproving && !isRejecting && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => startApprove(p.id)}
                            className="rounded-xl py-2 text-sm font-bold text-white transition"
                            style={{ backgroundColor: settingsPrimaryColor }}
                          >
                            Approve
                          </button>

                          <button
                            onClick={() => startReject(p.id)}
                            className="rounded-xl bg-red-600 py-2 text-sm font-bold text-white transition hover:bg-red-500"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {isRejecting && (
                        <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
                              Reject access request
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-slate-300">
                              Reject the request from{' '}
                              <span className="font-semibold text-white">
                                {p.full_name || p.email || 'this user'}
                              </span>
                              ? They will not receive organization access, but they may
                              request access again later.
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={submitReject}
                              disabled={rejectSaving}
                              className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
                            >
                              {rejectSaving ? 'Rejecting…' : 'Confirm Reject'}
                            </button>

                            <button
                              onClick={cancelReject}
                              disabled={rejectSaving}
                              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/20 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {isApproving && (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                          <p
                            className="text-[10px] uppercase tracking-wide font-semibold"
                            style={{ color: settingsPrimaryColor }}
                          >
                            Assign teams
                          </p>
                          <p className="text-xs text-slate-400">
                            Check the teams this parent should see. Pick one as their default.
                          </p>

                          {orgTeams.length === 0 ? (
                            <p className="text-xs text-amber-400">No teams found in your org.</p>
                          ) : (
                            <div className="space-y-2">
                              {orgTeams.map(t => {
                                const checked = approveTeamIds.has(t.id)
                                const isDefault = approveDefaultTeamId === t.id
                                return (
                                  <div
                                    key={t.id}
                                    className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2"
                                  >
                                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleApproveTeam(t.id)}
                                        className="h-4 w-4"
                                      />
                                      <span className="text-sm text-white truncate">{t.name}</span>
                                    </label>
                                    {checked && (
                                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                                        <input
                                          type="radio"
                                          name="default-team"
                                          checked={isDefault}
                                          onChange={() => setApproveDefaultTeamId(t.id)}
                                          className="h-3 w-3"
                                        />
                                        <span
                                          className={isDefault ? 'font-semibold' : 'text-slate-500'}
                                          style={isDefault ? { color: settingsPrimaryColor } : undefined}
                                        >
                                          Default
                                        </span>
                                      </label>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={submitApprove}
                              disabled={approveSaving || approveTeamIds.size === 0 || !approveDefaultTeamId}
                              className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition disabled:opacity-50"
                              style={{ backgroundColor: settingsPrimaryColor }}
                            >
                              {approveSaving ? 'Saving…' : 'Confirm'}
                            </button>
                            <button
                              onClick={cancelApprove}
                              disabled={approveSaving}
                              className="rounded-xl bg-white/10 border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/20 transition disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {pendingMsg && <p className="text-sm text-center mt-2">{pendingMsg}</p>}
          </>
        )}

        {/* ── Members Tab ───────────────────────────────────────────────── */}
        {tab === 'members' && (
          <>
            <div
              className="rounded-2xl border bg-white/5 p-4 space-y-3 mb-4 shadow-lg"
              style={{ borderColor: `${settingsPrimaryColor}66` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className="text-[10px] uppercase tracking-wide font-semibold"
                    style={{ color: settingsPrimaryColor }}
                  >
                    Members Admin Tool
                  </p>
                  <h2 className="mt-1 text-lg font-extrabold text-white">
                    Grant Team Admin by Email
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Add team admin access for an existing signed-up user without changing the member list actions below.
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-white"
                  style={{ backgroundColor: settingsPrimaryColor }}
                >
                  New
                </span>
              </div>

              <input
                type="email"
                value={grantAdminEmail}
                onChange={e => setGrantAdminEmail(e.target.value)}
                placeholder="parent@example.com"
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400"
              />

              {orgTeams.length === 0 ? (
                <p className="text-xs text-amber-400">No teams found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {orgTeams.map(t => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={grantAdminTeamIds.has(t.id)}
                        onChange={() => toggleGrantAdminTeam(t.id)}
                      />
                      <span className="truncate">{t.name}</span>
                    </label>
                  ))}
                </div>
              )}

              <button
                onClick={submitGrantTeamAdmin}
                disabled={grantAdminSaving || grantAdminTeamIds.size === 0}
                className="w-full rounded-xl py-2 text-sm font-bold text-white transition disabled:opacity-50"
                style={{ backgroundColor: settingsPrimaryColor }}
              >
                {grantAdminSaving ? 'Adding…' : 'Add Team Admin'}
              </button>
            </div>
            {membersMsg && <p className="text-sm text-center mb-4">{membersMsg}</p>}
            {membersLoading && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-slate-400 text-sm">Loading members…</p>
              </div>
            )}

            {!membersLoading && membersList.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-slate-400 text-sm">No approved parents yet.</p>
              </div>
            )}

            {!membersLoading && membersList.length > 0 && (
              <div className="space-y-2">
                {membersList.map(m => {
                  const isEditing = editingMemberId === m.id
                  const isEditingAthletes = editingAthletesMemberId === m.id
                  const isRemoving = removingMemberId === m.id
                  return (
                    <div key={m.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">
                              {m.full_name || m.email || '(no name)'}
                            </p>
                            <p className="truncate text-xs text-slate-400">{m.email}</p>
                          </div>

                          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {m.role === 'parent' ? 'Parent' : 'Team Admin'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {m.teams.length === 0
                            ? 'No teams assigned'
                            : m.teams.map(t => t.is_default ? `${t.name} ★` : t.name).join(', ')}
                        </p>
                        {m.role === 'parent' && (
                          <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Athletes
                            </p>

                            <p className="mt-1 text-xs text-slate-300">
                              {m.athletes.length === 0
                                ? 'No athletes linked'
                                : m.athletes
                                    .map(athlete =>
                                      athlete.is_primary
                                        ? `${athlete.display_name} ★`
                                        : athlete.display_name
                                    )
                                    .join(', ')}
                            </p>
                          </div>
                        )}
                        {m.team_admin_teams.length > 0 && (
                          <div className="mt-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-yellow-400 font-semibold">
                              Team Admin
                            </p>

                            <div className="mt-2 space-y-2">
                              {m.team_admin_teams.map(t => (
                                <div key={t.id} className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-yellow-100">{t.name}</p>
                                  <button
                                    onClick={() => removeTeamAdminTeam(m.id, t.id)}
                                    className="rounded-lg border border-yellow-500/30 px-2 py-1 text-[10px] font-bold text-yellow-100 hover:bg-yellow-500/10"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {!isEditing && !isEditingAthletes && !isRemoving && (
                        <div
                          className={
                            m.role === 'parent'
                              ? 'grid grid-cols-2 gap-2'
                              : 'grid grid-cols-3 gap-2'
                          }
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAthletesMemberId(null)
                              setEditingMemberId(m.id)
                              setMemberTeamIds(new Set(m.teams.map(t => t.id)))
                              setMemberDefaultTeamId(
                                m.teams.find(t => t.is_default)?.id ??
                                  m.teams[0]?.id ??
                                  ''
                              )
                              setMembersMsg(null)
                            }}
                            className="rounded-xl border border-white/10 py-2 text-xs font-bold text-white transition hover:opacity-90"
                            style={{ backgroundColor: brandColor }}
                          >
                            Edit Teams
                          </button>

                          {m.role === 'parent' && (
                            <button
                              type="button"
                              onClick={() => startEditingMemberAthletes(m)}
                              className="rounded-xl border border-white/10 py-2 text-xs font-bold text-white transition"
                              style={{ backgroundColor: brandColor }}
                            >
                              Athletes
                            </button>
                          )}

                          <button
                            onClick={() => startPromoteMember(m)}
                            className="rounded-xl bg-white/10 border border-white/10 py-2 text-xs font-bold text-white transition"
                            style={{ backgroundColor: brandColor }}
                          >
                            Make Admin
                          </button>
                          
                          <button
                            onClick={() => { setRemovingMemberId(m.id); setMembersMsg(null) }}
                            className="rounded-xl border border-red-500/40 bg-transparent px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 transition"
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      {isEditingAthletes && m.role === 'parent' && (
                        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                          <div>
                            <p
                              className="text-[10px] font-semibold uppercase tracking-wide"
                              style={{ color: settingsPrimaryColor }}
                            >
                              Assign athletes
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              Select the athletes connected to this parent. The primary designation
                              does not change team access.
                            </p>
                          </div>

                          {organizationAthletes.length === 0 ? (
                            <p className="text-xs text-amber-400">
                              No organization athletes are available.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {organizationAthletes.map(athlete => {
                                const checked = memberAthleteIds.has(athlete.id)
                                const isPrimary =
                                  memberPrimaryAthleteId === athlete.id

                                return (
                                  <div
                                    key={athlete.id}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                                  >
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleMemberAthlete(athlete.id)}
                                        disabled={memberAthletesSaving}
                                        className="h-4 w-4"
                                      />

                                      <span className="truncate text-sm text-white">
                                        {athlete.display_name}
                                      </span>
                                    </label>

                                    {checked && (
                                      <label className="flex cursor-pointer items-center gap-1 text-xs">
                                        <input
                                          type="radio"
                                          name={`primary-athlete-${m.id}`}
                                          checked={isPrimary}
                                          onChange={() =>
                                            setMemberPrimaryAthleteId(athlete.id)
                                          }
                                          disabled={memberAthletesSaving}
                                          className="h-3 w-3"
                                        />

                                        <span
                                          className={
                                            isPrimary
                                              ? 'font-semibold'
                                              : 'text-slate-500'
                                          }
                                          style={
                                            isPrimary
                                              ? { color: settingsPrimaryColor }
                                              : undefined
                                          }
                                        >
                                          Primary
                                        </span>
                                      </label>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void saveMemberAthletes()}
                              disabled={memberAthletesSaving}
                              className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition disabled:opacity-50"
                              style={{ backgroundColor: settingsPrimaryColor }}
                            >
                              {memberAthletesSaving ? 'Saving…' : 'Save Athletes'}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEditingMemberAthletes}
                              disabled={memberAthletesSaving}
                              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/20 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {isEditing && (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                          <p
                            className="text-[10px] uppercase tracking-wide font-semibold"
                            style={{ color: settingsPrimaryColor }}
                          >
                            Edit team access
                          </p>
                          {orgTeams.length === 0 ? (
                            <p className="text-xs text-amber-400">No teams found.</p>
                          ) : (
                            <div className="space-y-2">
                              {orgTeams.map(t => {
                                const checked = memberTeamIds.has(t.id)
                                const isDefault = memberDefaultTeamId === t.id
                                return (
                                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = new Set(memberTeamIds)
                                          if (next.has(t.id)) {
                                            next.delete(t.id)
                                            if (memberDefaultTeamId === t.id) setMemberDefaultTeamId('')
                                          } else {
                                            next.add(t.id)
                                            if (!memberDefaultTeamId) setMemberDefaultTeamId(t.id)
                                          }
                                          setMemberTeamIds(next)
                                        }}
                                        className="h-4 w-4"
                                      />
                                      <span className="text-sm text-white truncate">{t.name}</span>
                                    </label>
                                    {checked && (
                                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`default-member-team-${m.id}`}
                                          checked={isDefault}
                                          onChange={() => setMemberDefaultTeamId(t.id)}
                                          className="h-3 w-3"
                                        />
                                        <span
                                          className={isDefault ? 'font-semibold' : 'text-slate-500'}
                                          style={isDefault ? { color: settingsPrimaryColor } : undefined}
                                        >
                                          Default
                                        </span>
                                      </label>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={async () => {
                                setMemberSaving(true)
                                setMembersMsg(null)
                                const result = await updateMemberTeams(
                                  m.id,
                                  Array.from(memberTeamIds),
                                  memberDefaultTeamId
                                )
                                setMemberSaving(false)
                                if (!result.ok) { setMembersMsg(`❌ ${result.error}`); return }
                                setMembersList(prev => prev.map(x =>
                                  x.id !== m.id ? x : {
                                    ...x,
                                    teams: orgTeams
                                      .filter(t => memberTeamIds.has(t.id))
                                      .map(t => ({ id: t.id, name: t.name, is_default: t.id === memberDefaultTeamId }))
                                  }
                                ))
                                setEditingMemberId(null)
                                setMembersMsg('✅ Teams updated')
                              }}
                              disabled={memberSaving || memberTeamIds.size === 0 || !memberDefaultTeamId}
                              className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition disabled:opacity-50"
                              style={{ backgroundColor: settingsPrimaryColor }}
                            >
                              {memberSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingMemberId(null)}
                              disabled={memberSaving}
                              className="rounded-xl bg-white/10 border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/20 transition disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {promotingMemberId === m.id && (
                        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-3">
                          <p className="text-[10px] uppercase tracking-wide text-yellow-400 font-semibold">
                            Make team admin
                          </p>

                          {orgTeams.length === 0 ? (
                            <p className="text-xs text-amber-400">No teams found.</p>
                          ) : (
                            <div className="space-y-2">
                              {orgTeams.map(t => {
                                const checked = promoteTeamIds.has(t.id)
                                return (
                                  <label
                                    key={t.id}
                                    className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => togglePromoteTeam(t.id)}
                                    />
                                    {t.name}
                                  </label>
                                )
                              })}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={savePromoteMember}
                              disabled={promoteSaving || promoteTeamIds.size === 0}
                              className="flex-1 rounded-xl bg-yellow-500 py-2 text-xs font-bold text-black hover:bg-yellow-400 disabled:opacity-50"
                            >
                              {promoteSaving ? 'Saving...' : 'Save Admin'}
                            </button>
                            <button
                              onClick={cancelPromoteMember}
                              disabled={promoteSaving}
                              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {isRemoving && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-3">
                          <p className="text-sm text-white">
                            Remove <span className="font-bold">{m.full_name ?? m.email}</span>? This deletes their membership and team access.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                setMemberSaving(true)
                                setMembersMsg(null)
                                const result = await removeMembership(m.id)
                                setMemberSaving(false)
                                if (!result.ok) { setMembersMsg(`❌ ${result.error}`); return }
                                setMembersList(prev => prev.filter(x => x.id !== m.id))
                                setRemovingMemberId(null)
                                setMembersMsg('✅ Member removed')
                              }}
                              disabled={memberSaving}
                              className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50"
                            >
                              {memberSaving ? 'Removing…' : 'Confirm Remove'}
                            </button>
                            <button
                              onClick={() => setRemovingMemberId(null)}
                              disabled={memberSaving}
                              className="rounded-xl bg-white/10 border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/20 transition disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

          </>
        )}

        {/* ── Status Tab ─────────────────────────────────────────────────── */}
        {tab === 'status' && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Pick an event to Broadcast</p>
              <select value={statusEventId} onChange={e => { setStatusEventId(e.target.value); setStatusMsg(null) }}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:border-slate-400">
                <option value="">— Pick an event —</option>
                {allEvents
                  .filter(e => new Date(e.starts_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
                  .reverse()
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {formatDate(e.starts_at)} — {e.opponent ? `vs ${e.opponent}` : e.title}
                    </option>
                  ))}
              </select>
            </div>

            {statusEventId && (
              <>
                {/* Current state */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Current Broadcast</p>
                  {currentDisplayStatus ? (
                    <>
                      <p className={`text-lg font-extrabold ${
                        currentDisplayStatus === 'on' ? 'text-green-400' :
                        currentDisplayStatus === 'watching' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {currentDisplayStatus === 'on' ? '🟢 Game On' :
                         currentDisplayStatus === 'watching' ? '🟡 Watching' :
                         '🔴 Off'}
                      </p>
                      {currentMessage && (
                        <p className="text-sm text-slate-300 mt-1">{currentMessage}</p>
                      )}
                      {currentUpdatedAt && (
                        <p className="text-xs text-slate-500 mt-2">
                          Updated {new Date(currentUpdatedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">No broadcast set yet</p>
                  )}
                </div>

                {/* Draft new status */}
                <div className="rounded-2xl p-4 space-y-4"
                      style={{
                        border: `1px solid ${brandColor}4D`,
                        backgroundColor: `${brandColor}0D`,
                      }}
                    >
                  <p className="text-[10px] uppercase tracking-wide font-semibold"
                      style={{ color: brandColor }}
                  >
                    Set Broadcast
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      { key: 'on', label: '🟢 Game On', desc: 'Show up as scheduled', cls: 'border-green-500/40 bg-green-500/10' },
                      { key: 'watching', label: '🟡 Watching', desc: 'Monitoring — decision pending', cls: 'border-amber-500/40 bg-amber-500/10' },
                      { key: 'off', label: '🔴 Off / Canceled', desc: 'Event is off', cls: 'border-red-500/40 bg-red-500/10' },
                    ] as const).map(({ key, label, desc, cls }) => (
                      <button key={key} onClick={() => setStatusDraftStatus(key)}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          statusDraftStatus === key
                            ? cls
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}>
                        <p className="font-bold text-white">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </button>
                    ))}
                    <button onClick={() => setStatusDraftStatus(null)}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        statusDraftStatus === null
                          ? 'border-slate-500/40 bg-slate-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}>
                      <p className="font-bold text-white">⊘ Clear Status</p>
                      <p className="text-xs text-slate-400">Remove broadcast — parents see nothing</p>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Message (optional)</label>
                    <textarea value={statusDraftMessage} rows={2}
                      placeholder="Coaches arriving at 8am to evaluate, decision by 9am"
                      onChange={e => setStatusDraftMessage(e.target.value)}
                      className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                  </div>

                  <button onClick={saveStatus} disabled={statusSaving || statusDraftStatus === undefined}
                    className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                    style={{ backgroundColor: brandColor }}
                    >
                    {statusSaving ? 'Broadcasting...' : 'Save & Broadcast'}
                  </button>
                  {statusMsg && <p className="text-sm text-center">{statusMsg}</p>}
                   {/* Test push notification — temporary tool to verify push send works */}
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                      <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">🧪 Test Push (dev tool)</p>
                      <p className="text-xs text-slate-400">
                        Sends a test notification to all subscribers of the currently selected team.
                      </p>
                      <button
                        onClick={async () => {
                          setStatusMsg(null)
                          try {
                            const res = await fetch('/api/push/send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                password,
                                teamId: currentTeam.id,
                                title: 'Test from Admin',
                                message: 'If you see this, push is working ✅',
                                url: '/',
                              })
                            })
                            const data = await res.json()
                            setStatusMsg(data.ok
                              ? `✅ Sent: ${data.sent} · Failed: ${data.failed ?? 0} · Cleaned: ${data.cleanedUp ?? 0}`
                              : `❌ ${data.error ?? 'unknown error'}`)
                          } catch (err) {
                            setStatusMsg(`❌ ${err instanceof Error ? err.message : 'unknown'}`)
                          }
                        }}
                        className="w-full rounded-xl bg-amber-600/80 py-2 text-sm font-bold text-white hover:bg-amber-700 transition"
                      >
                        Send Test Push
                      </button>
                    </div>
                </div>
              </>
            )}
          </>
        )}
        
        {/* ── Score Tab ──────────────────────────────────────────────────── */}
        {tab === 'score' && (
          <>
            <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Select Game</p>
              <select value={selectedEventId} onChange={e => {
                setSelectedEventId(e.target.value)
                setScoreMsg(null)
                setUsInnings(Array(7).fill(0))
                setThemInnings(Array(7).fill(0))
                setIsHome(false)
              }}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:border-slate-400">
                <option value="">— Pick a game —</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>
                    {formatDate(e.starts_at)} — {e.opponent ? `vs ${e.opponent}` : e.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedEventId && (
              <>
                {/* Final Score */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Final Score — {selectedEvent?.opponent ? `vs ${selectedEvent.opponent}` : selectedEvent?.title}
                  </p>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                    <p className="text-xs text-slate-400 mb-1">Final Score (auto-calculated)</p>
                    <p className="text-3xl font-extrabold tabular-nums">
                      <span className={usTotal > themTotal ? 'text-green-400' : usTotal < themTotal ? 'text-red-400' : 'text-slate-300'}>
                        {usTotal}
                      </span>
                      <span className="text-slate-600 mx-3">–</span>
                      <span className={themTotal > usTotal ? 'text-green-400' : themTotal < usTotal ? 'text-red-400' : 'text-slate-300'}>
                        {themTotal}
                      </span>
                    </p>
                    <p className="text-xs mt-2 font-bold uppercase tracking-wide">
                      {usTotal === themTotal && usTotal === 0 ? (
                        <span className="text-slate-600">Enter inning runs below</span>
                      ) : usTotal > themTotal ? (
                        <span className="text-green-400">Win</span>
                      ) : usTotal < themTotal ? (
                        <span className="text-red-400">Loss</span>
                      ) : (
                        <span className="text-slate-400">Tie</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Game Location</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['away', 'home'] as const).map(loc => (
                        <button
                          key={loc}
                          onClick={() => setIsHome(loc === 'home')}
                          className={`rounded-xl py-3 text-sm font-bold transition ${
                            isHome === (loc === 'home') ? 'text-white' : 'bg-white/10 text-slate-400'
                          }`}
                          style={
                            isHome === (loc === 'home')
                              ? { backgroundColor: brandColor }
                              : undefined
                          }
                        >
                          {loc === 'home' ? '🏠 Home' : '✈️ Away'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Box Score Entry */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Box Score — Runs per Inning</p>
                  <div className="grid grid-cols-9 gap-1 text-center">
                    <p className="col-span-2 text-left text-[10px] text-slate-500 uppercase font-semibold">Team</p>
                    {INNINGS.map(i => (
                      <p key={i} className="text-[10px] text-slate-500 uppercase font-semibold">{i}</p>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1 items-center">
                    <p className="col-span-2 text-xs font-bold text-white">Elite</p>
                    {usInnings.map((val, idx) => (
                      <input key={idx} type="number" min="0" value={val}
                        onChange={e => {
                          const next = [...usInnings]
                          next[idx] = Number(e.target.value)
                          setUsInnings(next)
                        }}
                        className="rounded-lg bg-white/10 border border-white/10 px-0 py-2 text-sm text-white text-center focus:outline-none focus:border-slate-400" />
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1 items-center">
                    <p className="col-span-2 text-xs font-semibold text-slate-400 truncate">
                      {selectedEvent?.opponent ?? 'Opp'}
                    </p>
                    {themInnings.map((val, idx) => (
                      <input key={idx} type="number" min="0" value={val}
                        onChange={e => {
                          const next = [...themInnings]
                          next[idx] = Number(e.target.value)
                          setThemInnings(next)
                        }}
                        className="rounded-lg bg-white/10 border border-white/10 px-0 py-2 text-sm text-white text-center focus:outline-none focus:border-slate-400" />
                    ))}
                  </div>
                  <div className="flex justify-between rounded-xl bg-white/5 px-4 py-2">
                    <span className="text-xs text-slate-400">Elite total: <span className="text-white font-bold">{usTotal}</span></span>
                    <span className="text-xs text-slate-400">{selectedEvent?.opponent ?? 'Opp'} total: <span className="text-white font-bold">{themTotal}</span></span>
                  </div>
                </div>

                <button onClick={saveScore} disabled={scoreSaving}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                  style={{ backgroundColor: brandColor }}
                  >
                  {scoreSaving ? 'Saving...' : 'Save Score + Box Score'}
                </button>
                {scoreMsg && <p className="text-sm text-center">{scoreMsg}</p>}
              </>
            )}
          </>
        )}

        {/* ── Stats Tab ──────────────────────────────────────────────────── */}
        {tab === 'stats' && (
          <>
            <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Select Game</p>
              <select value={statsEventId} onChange={e => { setStatsEventId(e.target.value); setStatsMsg(null) }}
                className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white focus:outline-none focus:slate-400">
                <option value="">— Pick a game —</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>
                    {formatDate(e.starts_at)} {e.opponent ? `vs ${e.opponent}` : e.title}
                  </option>
                ))}
              </select>
            </div>

            {statsEventId && (
              <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className="text-sm uppercase tracking-[0.18em] font-extrabold"
                      style={{ color: brandColor }}
                    >
                      Batting
                    </p>
                    <button
                      type="button"
                      onClick={fillBattingOrder}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10"
                      style={{ borderColor: brandColor, color: brandColor }}
                    >
                      Fill batting order
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full min-w-[620px] border-collapse text-sm table-fixed">
                      <thead className="bg-white/10 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          {['Player', 'BO', 'AB', 'H', 'R', 'RBI', 'BB', 'K'].map(header => (
                            <th key={header} className={`px-1 py-2 font-semibold ${header === 'Player' ? 'w-36 text-left' : 'w-12 text-center'}`}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {players.map(player => {
                          const s = playerStats[player.id] ?? { at_bats: 0, hits: 0, rbi: 0, runs: 0, walks: 0, strikeouts: 0, pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks_allowed: 0, hits_allowed: 0, earned_runs: 0 }
                          return (
                            <tr
                              key={player.id}
                              className={playerHasUnsavedBattingStats(player.id) ? 'border-l-2 hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]'}
                              style={playerHasUnsavedBattingStats(player.id) ? { borderLeftColor: brandColor, backgroundColor: `${brandColor}14` } : undefined}
                            >
                              <td className="w-36 px-1 py-2 text-xs font-semibold text-slate-300">
                                <span className="block truncate">
                                  {player.jersey_number !== null ? `#${player.jersey_number} ` : ''}{player.name}
                                </span>
                              </td>
                              <td className="px-1 py-2 text-center">
                                <input type="number" min="1" value={s.batting_order_position ?? ''}
                                  onChange={e => {
                                    const v = e.target.value
                                    setPlayerStats(prev => ({ ...prev, [player.id]: { ...prev[player.id], batting_order_position: v === '' ? null : Number(v) } }))
                                  }}
                                  className="w-11 rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-center text-sm text-white [appearance:textfield] focus:outline-none focus:border-slate-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                              </td>
                              {([
                                ['at_bats', s.at_bats, 'AB'],
                                ['hits', s.hits, 'H'],
                                ['runs', s.runs, 'R'],
                                ['rbi', s.rbi, 'RBI'],
                                ['walks', s.walks, 'BB'],
                                ['strikeouts', s.strikeouts, 'K'],
                              ] as [keyof StatRow, number, string][]).map(([field, val, label]) => (
                                <td key={field} className="px-1 py-2 text-center">
                                  <label className="sr-only">{label} for {player.name}</label>
                                  <input type="number" value={val}
                                    onChange={e => updateStat(player.id, field, e.target.value)}
                                    className="w-11 rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-center text-sm text-white [appearance:textfield] focus:outline-none focus:border-slate-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className="text-sm uppercase tracking-[0.18em] font-extrabold"
                      style={{ color: brandColor }}
                    >
                      Pitching
                    </p>
                    <button
                      type="button"
                      onClick={clearPitchingStats}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10"
                      style={{ borderColor: brandColor, color: brandColor }}
                    >
                      Clear pitching
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full min-w-[560px] border-collapse text-sm table-fixed">
                      <thead className="bg-white/10 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          {['Player', 'PC', 'IP', 'K', 'BB', 'H', 'ER'].map(header => (
                            <th key={header} className={`px-1 py-2 font-semibold ${header === 'Player' ? 'w-36 text-left' : 'w-12 text-center'}`}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {players.map(player => {
                          const s = playerStats[player.id] ?? { at_bats: 0, hits: 0, rbi: 0, runs: 0, walks: 0, strikeouts: 0, pitch_count: 0, innings_pitched: 0, strikeouts_pitching: 0, walks_allowed: 0, hits_allowed: 0, earned_runs: 0 }
                          return (
                            <tr
                              key={player.id}
                              className={playerHasUnsavedPitchingStats(player.id) ? 'border-l-2 hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]'}
                              style={playerHasUnsavedPitchingStats(player.id) ? { borderLeftColor: brandColor, backgroundColor: `${brandColor}14` } : undefined}
                            >
                              <td className="w-36 px-1 py-2 text-xs font-semibold text-slate-300">
                                <span className="block truncate">
                                  {player.jersey_number !== null ? `#${player.jersey_number} ` : ''}{player.name}
                                </span>
                              </td>
                              {([
                                ['pitch_count', s.pitch_count ?? 0, 'PC'],
                                ['innings_pitched', s.innings_pitched ?? 0, 'IP'],
                                ['strikeouts_pitching', s.strikeouts_pitching ?? 0, 'K'],
                                ['walks_allowed', s.walks_allowed ?? 0, 'BB'],
                                ['hits_allowed', s.hits_allowed ?? 0, 'H'],
                                ['earned_runs', s.earned_runs ?? 0, 'ER'],
                              ] as [keyof StatRow, number, string][]).map(([field, val, label]) => (
                                <td key={field} className="px-1 py-2 text-center">
                                  <label className="sr-only">{label} for {player.name}</label>
                                  <input type="number" value={val}
                                    onChange={e => updateStat(player.id, field, e.target.value)}
                                    className="w-11 rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-center text-sm text-white [appearance:textfield] focus:outline-none focus:border-slate-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={saveStats}
                    disabled={statsSaving}
                    className="w-48 rounded-xl px-5 py-2 text-sm font-bold text-white transition disabled:opacity-50"
                    style={{ backgroundColor: brandColor }}
                  >
                    {statsSaving ? 'Saving...' : 'Save All Stats'}

                    {hasUnsavedStats && (
                      <p className="text-center text-xs font-semibold text-slate-400">
                        Unsaved changes
                      </p>
                    )}

                  </button>
                </div>
                {statsMsg && (
                  <p className="text-sm text-center font-semibold text-slate-200">
                    {statsMsg}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Events Tab ─────────────────────────────────────────────────── */}
        {tab === 'events' && (
          <>
            {/* Filter + create buttons */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(['upcoming', 'past', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setEventFilter(f)}
                    className={`rounded-xl py-2 text-xs font-bold uppercase tracking-wide transition ${eventFilter === f ? 'text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                    style={
                      eventFilter === f
                        ? { backgroundColor: brandColor }
                        : undefined
                    }>
                    {f}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={startNewGame}
                  className="rounded-xl bg-white/10 border border-white/10 py-2 text-xs font-bold text-white hover:bg-white/20 transition">
                  + Add Game
                </button>
                <button onClick={startNewPractice}
                  className="rounded-xl bg-white/10 border border-white/10 py-2 text-xs font-bold text-white hover:bg-white/20 transition">
                  + Add Practice
                </button>
              </div>
            </div>

            {/* Form */}
            {formMode !== 'none' && (
              <div className="rounded-2xl p-4 space-y-3"
              style={{
                  border: `1px solid ${brandColor}4D`,
                  backgroundColor: `${brandColor}0D`,
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wide font-semibold"
                       style={{ color: brandColor }}
                      >
                    {editingEventId
                      ? `Editing ${formMode === 'practice' ? 'Practice' : 'Game'}`
                      : `New ${formMode === 'practice' ? 'Practice' : 'Game'}`}
                  </p>
                  <button onClick={cancelEventForm}
                    className="text-xs text-slate-500 hover:text-white">
                    Cancel
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Title</label>
                  <input type="text" value={eventForm.title}
                    onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                </div>

                {formMode === 'game' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Type</label>
                      <select value={eventForm.eventType}
                        onChange={e => setEventForm({ ...eventForm, eventType: e.target.value as 'game' | 'tournament', opponent: '', opponentTeamId: '' })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400">
                        <option value="game">Game</option>
                        <option value="tournament">Tournament</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Opponent</label>
                      {eventForm.eventType === 'game' ? (
                        <select
                          value={eventForm.opponentTeamId}
                          onChange={e => {
                            const id = e.target.value
                            const team = allTeams.find(t => t.id === id)
                            setEventForm({
                              ...eventForm,
                              opponentTeamId: id,
                              opponent: team?.name ?? '',
                            })
                          }}
                          className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400"
                        >
                          <option value="">— Pick an MSBL team —</option>
                          {allTeams
                            .filter(t => t.id !== currentTeam.id)
                            .map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={eventForm.opponent}
                          onChange={e => setEventForm({ ...eventForm, opponent: e.target.value })}
                          placeholder="Tournament opponent name"
                          className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Home / Away</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['away', 'home'] as const).map(loc => (
                          <button key={loc} onClick={() => setEventForm({ ...eventForm, isHome: loc === 'home' })}
                            className={`rounded-xl py-2 text-xs font-bold transition ${
                              eventForm.isHome === (loc === 'home') ? 'text-white' : 'bg-white/10 text-slate-400'
                            }`}
                            style={
                              eventForm.isHome === (loc === 'home')
                                ? { backgroundColor: brandColor }
                                : undefined
                            }>
                            {loc === 'home' ? '🏠 Home' : '✈️ Away'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Date & Time</label>
                  <input type="datetime-local" value={eventForm.startsAt}
                    onChange={e => setEventForm({ ...eventForm, startsAt: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Field</label>
                  <select value={eventForm.fieldId}
                    onChange={e => setEventForm({ ...eventForm, fieldId: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400">
                    <option value="">— No field —</option>
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {formMode === 'game' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Travel min</label>
                      <input type="number" value={eventForm.travelMinutes}
                        onChange={e => setEventForm({ ...eventForm, travelMinutes: e.target.value })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Travel mi</label>
                      <input type="number" value={eventForm.travelMiles}
                        onChange={e => setEventForm({ ...eventForm, travelMiles: e.target.value })}
                        className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Notes</label>
                  <textarea value={eventForm.notes} rows={2}
                    onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Gear (comma separated)</label>
                  <input type="text" value={eventForm.gearNotes}
                    onChange={e => setEventForm({ ...eventForm, gearNotes: e.target.value })}
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
                </div>

                <button onClick={saveEvent} disabled={eventSaving}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                  style={{ backgroundColor: brandColor }}
                  >
                  {eventSaving ? 'Saving...' : (editingEventId ? 'Save Changes' : 'Create Event')}
                </button>

                {editingEventId && (
                  <button onClick={deleteEvent} disabled={eventSaving}
                    className="w-full rounded-xl border border-red-500/40 bg-transparent py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 transition disabled:opacity-50">
                    Delete Event
                  </button>
                )}

                {eventMsg && <p className="text-sm text-center">{eventMsg}</p>}
              </div>
            )}

            {/* List */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-2 space-y-1">
              {filteredEvents.length === 0 ? (
                <p className="p-3 text-sm text-slate-500 text-center">No events.</p>
              ) : (
                filteredEvents.map(ev => (
                  <button key={ev.id} onClick={() => editEvent(ev)}
                    className={`w-full text-left rounded-xl px-3 py-2 transition ${editingEventId === ev.id ? '' : 'hover:bg-white/10'}`}
                    style={
                      editingEventId === ev.id
                        ? { backgroundColor: `${brandColor}33` }
                        : undefined
                    }>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {ev.event_type === 'practice'
                            ? '🏋️ ' + ev.title
                            : ev.opponent ? `vs ${ev.opponent}` : ev.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(ev.starts_at)}
                          {ev.team_score !== null && ' · final'}
                          {ev.event_type === 'tournament' && ' · 🏆'}
                        </p>
                      </div>
                      <span className="text-xs text-slate-600">›</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* ── League Tab ─────────────────────────────────────────────────────── */}
        {tab === 'league' && (
      <>

    {/* Form */}
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          {leagueEditingId ? 'Edit League Game' : 'New League Game'}
        </p>
        {leagueEditingId && (
          <button onClick={resetLeagueForm}
            className="text-xs text-slate-400 hover:text-white">
            + New
          </button>
        )}
      </div>

      <div>
        <label className="text-xs text-slate-400">Away Team</label>
        <select value={leagueAwayTeamId} onChange={e => setLeagueAwayTeamId(e.target.value)}
          className="w-full mt-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400">
          <option value="">— Pick a team —</option>
          {allTeams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-slate-400">Home Team</label>
        <select value={leagueHomeTeamId} onChange={e => setLeagueHomeTeamId(e.target.value)}
          className="w-full mt-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400">
          <option value="">— Pick a team —</option>
          {allTeams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-slate-400">Date & Time</label>
        <input type="datetime-local" value={leaguePlayedAt}
          onChange={e => setLeaguePlayedAt(e.target.value)}
          className="w-full mt-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
      </div>

      <div>
        <label className="text-xs text-slate-400">Status</label>
        <select value={leagueStatus} onChange={e => setLeagueStatus(e.target.value as any)}
          className="w-full mt-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400">
          <option value="final">Final</option>
          <option value="scheduled">Scheduled</option>
          <option value="forfeit">Forfeit</option>
          <option value="postponed">Postponed</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      {leagueStatus === 'final' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400">Away Score</label>
            <input type="number" value={leagueAwayScore} min={0}
              onChange={e => setLeagueAwayScore(e.target.value)}
              className="w-full mt-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Home Score</label>
            <input type="number" value={leagueHomeScore} min={0}
              onChange={e => setLeagueHomeScore(e.target.value)}
              className="w-full mt-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-slate-400" />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={saveLeagueGame} disabled={leagueSaving}
          className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
          style={{ backgroundColor: brandColor }}
          >
          {leagueSaving ? 'Saving...' : leagueEditingId ? 'Save Changes' : 'Create Game'}
        </button>
        {leagueEditingId && (
          <button onClick={deleteLeagueGame}
            className="rounded-xl bg-red-900/40 border border-red-500/40 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-900/60 transition">
            Delete
          </button>
        )}
      </div>
      {leagueMsg && <p className="text-sm text-center">{leagueMsg}</p>}
    </div>

    {/* List */}
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3">
        All League Games ({allLeagueGames.length})
      </p>
      {allLeagueGames.length === 0 ? (
        <p className="text-sm text-slate-500">No league games yet</p>
      ) : (
        <div className="space-y-2">
          {allLeagueGames.map(g => {
            const date = new Date(g.played_at)
            const dateLabel = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/Chicago',
              month: 'numeric', day: 'numeric',
            }).format(date)
            const isFinal = g.status === 'final' && g.home_score !== null && g.away_score !== null
            return (
              <button key={g.id} onClick={() => loadLeagueGameForEdit(g)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition ${
                  leagueEditingId === g.id
                    ? 'border-red-500/40 bg-red-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}>
                <p className="text-xs text-slate-500">{dateLabel}</p>
                <p className="text-sm text-white">
                  {g.away_team?.name} @ {g.home_team?.name}
                </p>
                {isFinal ? (
                  <p className="text-xs text-slate-400 tabular-nums">
                    {g.away_score} – {g.home_score}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 italic">{g.status}</p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  </>
)}

        {/* ── Standings Tab ──────────────────────────────────────────────── */}
        {tab === 'standings' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Edit Standings</p>
            <div className="grid grid-cols-6 gap-1 text-center">
              <p className="col-span-2 text-left text-[10px] uppercase text-slate-500 font-semibold">Team</p>
              {['W', 'L', 'T', 'RF', 'RA'].map(h => (
                <p key={h} className="text-[10px] uppercase text-slate-500 font-semibold">{h}</p>
              ))}
            </div>
            {standings.map(team => {
              const e = editedStandings[team.id] ?? team
              return (
                <div key={team.id} className="space-y-1">
                  <p className="text-xs font-semibold text-slate-300 truncate">{team.team_name}</p>
                  <div className="grid grid-cols-5 gap-1">
                    {([
                      ['wins', e.wins],
                      ['losses', e.losses],
                      ['ties', e.ties],
                      ['runs_for', e.runs_for],
                      ['runs_against', e.runs_against],
                    ] as [keyof Standing, number][]).map(([field, val]) => (
                      <input key={field} type="number" value={val}
                        onChange={ev => updateStanding(team.id, field, ev.target.value)}
                        className="w-full rounded-lg bg-white/10 border border-white/10 px-1 py-2 text-sm text-white text-center focus:outline-none focus:border-slate-400" />
                    ))}
                  </div>
                </div>
              )
            })}
            <button onClick={saveStandings} disabled={standingsSaving}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
              style={{ backgroundColor: brandColor }}
              >
              {standingsSaving ? 'Saving...' : 'Save Standings'}
            </button>
            {standingsMsg && <p className="text-sm text-center">{standingsMsg}</p>}
          </div>
        )}
      </div>
    </main>
  )
}
