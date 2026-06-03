import type { OrgTeam } from '@/app/actions/admin'
import type { DashboardEvent, DashboardTeamAdminAssignment } from '@/app/actions/dashboard'

type Props = {
  dashboardLoading: boolean
  dashboardMsg: string | null
  dashboardTeamCount: number | null
  dashboardFamilyCount: number | null
  dashboardPlayerCount: number | null
  dashboardPendingCount: number | null
  dashboardThisWeek: DashboardEvent[]
  dashboardTeams: OrgTeam[]
  dashboardTeamsMissingAdmins: OrgTeam[]
  dashboardEventsMissingFields: DashboardEvent[]
  dashboardTeamAdminAssignments: DashboardTeamAdminAssignment[]
  dashboardTeamsWithNoUpcomingEvents: OrgTeam[]
  dashboardTeamsWithNoPlayers: OrgTeam[]
  dashboardTeamsWithNoFamilies: OrgTeam[]
  formatDate: (dateStr: string) => string
  setTab: (tab: 'pending') => void
}

export function DashboardTab({
  dashboardLoading,
  dashboardMsg,
  dashboardTeamCount,
  dashboardFamilyCount,
  dashboardPlayerCount,
  dashboardPendingCount,
  dashboardThisWeek,
  dashboardTeams,
  dashboardTeamsMissingAdmins,
  dashboardEventsMissingFields,
  dashboardTeamAdminAssignments,
  dashboardTeamsWithNoUpcomingEvents,
  dashboardTeamsWithNoPlayers,
  dashboardTeamsWithNoFamilies,
  formatDate,
  setTab,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-[10px] uppercase tracking-wide text-red-400 font-semibold">
          Organization Dashboard
        </p>
        <h2 className="mt-1 text-lg font-extrabold text-white">
          On Deck Command Center
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Organization-wide view for teams, families, events, approvals, and attention items.
        </p>
      </div>

      {dashboardMsg && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {dashboardMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-500">Teams</p>
          <p className="mt-1 text-2xl font-extrabold text-white">
            {dashboardLoading ? '...' : dashboardTeamCount ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-500">Families</p>
          <p className="mt-1 text-2xl font-extrabold text-white">
            {dashboardLoading ? '...' : dashboardFamilyCount ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-500">Players</p>
          <p className="mt-1 text-2xl font-extrabold text-white">
            {dashboardLoading ? '...' : dashboardPlayerCount ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-extrabold text-white">
            {dashboardLoading ? '...' : dashboardPendingCount ?? '—'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-bold text-white">Attention Required</h3>

        {dashboardLoading ? (
          <p className="mt-2 text-sm text-slate-400">Checking organization status...</p>
        ) : (
          <div className="mt-3 space-y-2">
            {dashboardPendingCount !== null && dashboardPendingCount > 0 && (
              <button
                onClick={() => setTab('pending')}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-left text-sm font-bold text-white hover:bg-red-700 transition"
              >
                {dashboardPendingCount} parent{dashboardPendingCount === 1 ? '' : 's'} waiting for approval
              </button>
            )}

            {dashboardEventsMissingFields.length > 0 && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                <p className="text-sm font-bold text-yellow-200">
                  {dashboardEventsMissingFields.length} event{dashboardEventsMissingFields.length === 1 ? '' : 's'} missing field assignment
                </p>
                <div className="mt-2 space-y-1">
                  {dashboardEventsMissingFields.slice(0, 3).map(event => (
                    <div key={event.id} className="text-xs text-yellow-100/70">
                      • {event.team_name ?? 'Unknown Team'} —{' '}
                      {event.opponent ? `vs ${event.opponent}` : event.title ?? 'Event'}
                    </div>
                  ))}
                  {dashboardEventsMissingFields.length > 3 && (
                    <div className="text-xs text-yellow-100/70">
                      + {dashboardEventsMissingFields.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {dashboardTeamsMissingAdmins.length > 0 && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                <p className="text-sm font-bold text-yellow-200">
                  {dashboardTeamsMissingAdmins.length} team{dashboardTeamsMissingAdmins.length === 1 ? '' : 's'} missing team admin
                </p>
                <div className="mt-2 space-y-1">
                  {dashboardTeamsMissingAdmins.slice(0, 3).map(team => (
                    <div key={team.id} className="text-xs text-yellow-100/70">
                      • {team.name}
                    </div>
                  ))}
                  {dashboardTeamsMissingAdmins.length > 3 && (
                    <div className="text-xs text-yellow-100/70">
                      + {dashboardTeamsMissingAdmins.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {dashboardTeamsWithNoUpcomingEvents.length > 0 && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                <p className="text-sm font-bold text-yellow-200">
                  {dashboardTeamsWithNoUpcomingEvents.length} team{dashboardTeamsWithNoUpcomingEvents.length === 1 ? '' : 's'} with no upcoming events
                </p>
                <div className="mt-2 space-y-1">
                  {dashboardTeamsWithNoUpcomingEvents.slice(0, 3).map(team => (
                    <div key={team.id} className="text-xs text-yellow-100/70">
                      • {team.name}
                    </div>
                  ))}
                  {dashboardTeamsWithNoUpcomingEvents.length > 3 && (
                    <div className="text-xs text-yellow-100/70">
                      + {dashboardTeamsWithNoUpcomingEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {dashboardTeamsWithNoPlayers.length > 0 && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                <p className="text-sm font-bold text-yellow-200">
                  {dashboardTeamsWithNoPlayers.length} team{dashboardTeamsWithNoPlayers.length === 1 ? '' : 's'} with no players
                </p>
                <div className="mt-2 space-y-1">
                  {dashboardTeamsWithNoPlayers.slice(0, 3).map(team => (
                    <div key={team.id} className="text-xs text-yellow-100/70">
                      • {team.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dashboardTeamsWithNoFamilies.length > 0 && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                <p className="text-sm font-bold text-yellow-200">
                  {dashboardTeamsWithNoFamilies.length} team{dashboardTeamsWithNoFamilies.length === 1 ? '' : 's'} with no families
                </p>
                <div className="mt-2 space-y-1">
                  {dashboardTeamsWithNoFamilies.slice(0, 3).map(team => (
                    <div key={team.id} className="text-xs text-yellow-100/70">
                      • {team.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!dashboardPendingCount || dashboardPendingCount === 0) &&
              dashboardEventsMissingFields.length === 0 &&
              dashboardTeamsMissingAdmins.length === 0 &&
              dashboardTeamsWithNoUpcomingEvents.length === 0 &&
              dashboardTeamsWithNoPlayers.length === 0 &&
              dashboardTeamsWithNoFamilies.length === 0 && (
                <p className="text-sm text-slate-400">
                  Nothing needs attention right now.
                </p>
              )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Team Admin Coverage</h3>
          <span className="text-xs text-slate-500">
            {dashboardTeams.length} team{dashboardTeams.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {dashboardTeams.map(team => {
            const admins = dashboardTeamAdminAssignments.filter(a => a.team_id === team.id)

            return (
              <div
                key={team.id}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <p className="text-sm font-semibold text-white">{team.name}</p>

                {admins.length > 0 ? (
                  <p className="mt-1 text-xs text-green-300">
                    ✓ {admins.map(a => a.full_name || a.email || 'Unnamed admin').join(', ')}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-yellow-300">
                    ⚠ No team admin assigned
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">This Week</h3>
          <span className="text-xs text-slate-500">
            {dashboardThisWeek.length} event{dashboardThisWeek.length === 1 ? '' : 's'}
          </span>
        </div>

        {dashboardLoading ? (
          <p className="mt-3 text-sm text-slate-400">Loading this week...</p>
        ) : dashboardThisWeek.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No events scheduled in the next 7 days.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {dashboardThisWeek.slice(0, 6).map(event => (
              <div
                key={event.id}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {event.team_name ?? 'Unknown team'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {event.opponent ? `vs ${event.opponent}` : event.title ?? event.event_type ?? 'Event'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {event.field_name ?? 'Field TBD'}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-xs text-slate-400">
                    {formatDate(event.starts_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {dashboardThisWeek.length > 6 && (
          <p className="mt-3 text-xs text-slate-500">
            Showing 6 of {dashboardThisWeek.length} events.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Teams</h3>
          <span className="text-xs text-slate-500">
            {dashboardTeamCount ?? 0} total
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {dashboardTeams.slice(0, 6).map(team => (
            <div
              key={team.id}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <p className="text-sm font-semibold text-white">{team.name}</p>
            </div>
          ))}
        </div>

        {dashboardTeams.length > 6 && (
          <p className="mt-3 text-xs text-slate-500">
            Showing 6 of {dashboardTeams.length} teams.
          </p>
        )}
      </div>
    </div>
  )
}