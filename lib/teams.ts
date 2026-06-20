// Pickable teams — the teams a user can switch between in the team picker.
//
// To add a team to the picker:
//   1. Insert the team row in Supabase (with a `division` value)
//   2. Add a new entry here with its UUID, label, and division
//
// Order in this array = order in the dropdown.

export type PickableTeam = {
  id: string
  label: string       // short label shown in the picker
  fullName: string    // longer name shown in the header
  division: string    // matches teams.division column
}

export const PICKABLE_TEAMS: PickableTeam[] = [
  {
    id: '4beb0750-1883-4b56-a386-db280675036c',
    label: 'Elite - 11U Moore',
    fullName: 'Chicago Elite 11U - Moore',
    division: '11U American Division',
  },
  {
    id: '0c8cc8d0-2398-41c2-8ba0-036d62ee13a6',
    label: 'Ayeski',
    fullName: 'Chicago Elite 11U - Ayeski',
    division: '11U Elite Division',
  },
]

// Default team shown on first visit (before user has chosen one)
export const DEFAULT_TEAM_ID = PICKABLE_TEAMS[0].id
