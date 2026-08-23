import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { buildGameChangerImportReview } from '@/lib/imports/gamechanger-pdf/build-import-review'
import { parseGameChangerPdf } from '@/lib/imports/gamechanger-pdf/parse-pdf'
import type {
  GameChangerImportReview,
  RosterPlayerForImport,
} from '@/lib/imports/gamechanger-pdf/types'

export const runtime = 'nodejs'

const MAX_PDF_BYTES = 5 * 1024 * 1024

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase env vars')
  }

  return createClient(url, key)
}

function suggestTeamIndex(
  reviews: GameChangerImportReview[]
): number | null {
  const ranked = reviews
    .map(review => ({
      teamIndex: review.teamIndex,
      candidateRows:
        review.summary.totalRows -
        review.summary.unmatched,
      matched: review.summary.matched,
    }))
    .sort((a, b) => {
      if (b.candidateRows !== a.candidateRows) {
        return b.candidateRows - a.candidateRows
      }

      return b.matched - a.matched
    })

  const first = ranked[0]
  const second = ranked[1]

  if (!first || first.candidateRows === 0) {
    return null
  }

  if (
    second &&
    first.candidateRows === second.candidateRows &&
    first.matched === second.matched
  ) {
    return null
  }

  return first.teamIndex
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()

    const password = formData.get('password')
    const teamId = formData.get('teamId')
    const eventId = formData.get('eventId')
    const file = formData.get('file')

    if (
      typeof password !== 'string' ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (
      typeof teamId !== 'string' ||
      typeof eventId !== 'string' ||
      !(file instanceof File)
    ) {
      return NextResponse.json(
        {
          error:
            'PDF file, teamId, and eventId are required.',
        },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'The uploaded PDF is empty.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: 'PDF must be 5 MB or smaller.' },
        { status: 400 }
      )
    }

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      return NextResponse.json(
        { error: 'Upload a PDF file.' },
        { status: 400 }
      )
    }

    const authSupabase = await createServerClient()

    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = getAdminSupabase()

    const { data: team, error: teamError } =
      await supabase
        .from('teams')
        .select('id, organization_id')
        .eq('id', teamId)
        .maybeSingle()

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found.' },
        { status: 404 }
      )
    }

    const { data: membership, error: membershipError } =
      await supabase
        .from('memberships')
        .select('id, role, status')
        .eq('organization_id', team.organization_id)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .in('role', ['org_admin', 'team_admin'])
        .limit(1)
        .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json(
        {
          error:
            'You do not have admin access to this organization.',
        },
        { status: 403 }
      )
    }

    if (membership.role === 'team_admin') {
      const { data: teamAdmin, error: teamAdminError } =
        await supabase
          .from('team_admins')
          .select('id')
          .eq('membership_id', membership.id)
          .eq('team_id', teamId)
          .maybeSingle()

      if (teamAdminError || !teamAdmin) {
        return NextResponse.json(
          {
            error:
              'You do not have admin access to this team.',
          },
          { status: 403 }
        )
      }
    }

    const { data: event, error: eventError } =
      await supabase
        .from('events')
        .select(
          'id, team_id, team_season_id, event_type'
        )
        .eq('id', eventId)
        .eq('team_id', teamId)
        .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json(
        {
          error:
            'Event not found for the selected team.',
        },
        { status: 404 }
      )
    }

    if (event.event_type === 'practice') {
      return NextResponse.json(
        {
          error:
            'GameChanger stats can only be imported for games.',
        },
        { status: 400 }
      )
    }

    if (!event.team_season_id) {
      return NextResponse.json(
        {
          error:
            'This event is not linked to a team season.',
        },
        { status: 400 }
      )
    }

    const { data: roster, error: rosterError } =
      await supabase
        .from('players')
        .select('id, name, jersey_number')
        .eq('team_season_id', event.team_season_id)
        .order('name')

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message },
        { status: 500 }
      )
    }

    const rosterPlayers: RosterPlayerForImport[] =
      (roster ?? []).map(player => ({
        id: player.id,
        name: player.name,
        jerseyNumber: player.jersey_number,
      }))

    const parsed = await parseGameChangerPdf(
      await file.arrayBuffer()
    )

    const reviews = parsed.teams.map(
      (_, teamIndex) =>
        buildGameChangerImportReview(
          parsed,
          teamIndex,
          rosterPlayers
        )
    )

    return NextResponse.json({
      ok: true,
      eventId,
      rosterCount: rosterPlayers.length,
      roster: rosterPlayers,
      parsedGame: parsed.game,
      reviews,
      suggestedTeamIndex:
        suggestTeamIndex(reviews),
    })
  } catch (error) {
    console.error(
      'GameChanger preview failed:',
      error
    )

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not parse GameChanger PDF.',
      },
      { status: 500 }
    )
  }
}
