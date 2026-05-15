import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD
  const body = await req.json()
  const { password, action, teamId } = body

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  // Helper: verify an event belongs to the team that's trying to modify it.
  // Used by update_event and delete_event to prevent cross-team edits.
  const verifyEventOwnership = async (eventId: string): Promise<string | null> => {
    if (!teamId) return 'Missing teamId'
    const { data, error } = await supabase
      .from('events')
      .select('team_id')
      .eq('id', eventId)
      .single()
    if (error || !data) return 'Event not found'
    if (data.team_id !== teamId) return 'Event does not belong to current team'
    return null
  }

  try {
    // ── Save full game state atomically ─────────────────────────────────────
    if (action === 'save_game') {
      const { eventId, usInnings, themInnings, isHome } = body
      if (!eventId || !Array.isArray(usInnings) || !Array.isArray(themInnings)) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
      }

      const ownershipError = await verifyEventOwnership(eventId)
      if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 403 })

      // Look up the event's team_id and the opponent's team_id (if any)
      const { data: eventInfo } = await supabase
        .from('events')
        .select('team_id, opponent, league_game_id')
        .eq('id', eventId)
        .single()

      let opponentTeamId: string | null = null
      if (eventInfo?.league_game_id) {
        // Get opponent from linked league_game
        const { data: lg } = await supabase
          .from('league_games')
          .select('home_team_id, away_team_id')
          .eq('id', eventInfo.league_game_id)
          .single()
        if (lg) {
          opponentTeamId = lg.home_team_id === eventInfo.team_id ? lg.away_team_id : lg.home_team_id
        }
      } else if (eventInfo?.opponent) {
        // Fallback: look up by name
        const { data: opp } = await supabase
          .from('teams')
          .select('id')
          .eq('name', eventInfo.opponent)
          .maybeSingle()
        opponentTeamId = opp?.id ?? null
      }

      const usTotal = usInnings.reduce((sum: number, n: number) => sum + (Number(n) || 0), 0)
      const themTotal = themInnings.reduce((sum: number, n: number) => sum + (Number(n) || 0), 0)
      const result =
        usTotal > themTotal ? 'win' :
        usTotal < themTotal ? 'loss' : 'tie'

      const usUpsert = await supabase
        .from('box_scores')
        .upsert({
          event_id: eventId, team_id: eventInfo?.team_id ?? null,
          inning_1: usInnings[0] ?? 0, inning_2: usInnings[1] ?? 0,
          inning_3: usInnings[2] ?? 0, inning_4: usInnings[3] ?? 0,
          inning_5: usInnings[4] ?? 0, inning_6: usInnings[5] ?? 0,
          inning_7: usInnings[6] ?? 0,
        }, { onConflict: 'event_id,team' })
      if (usUpsert.error) {
        return NextResponse.json({ error: `Failed saving us box score: ${usUpsert.error.message}` }, { status: 500 })
      }

      const themUpsert = await supabase
        .from(')
        .upsert({
          event_id: eventId, team_id: opponentTeamId,
          inning_1: themInnings[0] ?? 0, inning_2: themInnings[1] ?? 0,
          inning_3: themInnings[2] ?? 0, inning_4: themInnings[3] ?? 0,
          inning_5: themInnings[4] ?? 0, inning_6: themInnings[5] ?? 0,
          inning_7: themInnings[6] ?? 0,
        }, { onConflict: 'event_id,team' })
      if (themUpsert.error) {
        return NextResponse.json({ error: `Failed saving them box score: ${themUpsert.error.message}` }, { status: 500 })
      }

      const eventUpdate = await supabase
        .from('events')
        .update({
          team_score: usTotal,
          opponent_score: themTotal,
          result,
          status: 'final',
          is_home: isHome ?? false,
        })
        .eq('id', eventId)
      if (eventUpdate.error) {
        return NextResponse.json({ error: `Failed saving event totals: ${eventUpdate.error.message}` }, { status: 500 })
      }
      // Sync to league_games if this event is linked
      const { data: eventData } = await supabase
        .from('events')
        .select('league_game_id')
        .eq('id', eventId)
        .single()

      if (eventData?.league_game_id) {
        const homeScore = isHome ? usTotal : themTotal
        const awayScore = isHome ? themTotal : usTotal
        await supabase
          .from('league_games')
          .update({
            home_score: homeScore,
            away_score: awayScore,
            status: 'final',
            updated_at: new Date().toISOString(),
          })
          .eq('id', eventData.league_game_id)
      }

      return NextResponse.json({ ok: true, teamScore: usTotal, opponentScore: themTotal, result })
    }

    // ── Create a new game/tournament event ──────────────────────────────────
    if (action === 'create_event') {
      const { title, opponent, eventType, startsAt, fieldId, isHome, travelMinutes, travelMiles, notes, gearNotes } = body
      if (!title || !startsAt) {
        return NextResponse.json({ error: 'Title and start time are required' }, { status: 400 })
      }
      if (!teamId) {
        return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
      }

      // Check if this is an MSBL game with an opponent team selected
        const opponentTeamId = eventType === 'game' ? (body.opponentTeamId ?? null) : null
        let leagueGameId: string | null = null

        if (opponentTeamId) {
          // Create a corresponding league_games row using the current team
          const homeId = isHome ? teamId : opponentTeamId
          const awayId = isHome ? opponentTeamId : teamId

        const { data: lgData, error: lgError } = await supabase
          .from('league_games')
          .insert({
            home_team_id: homeId,
            away_team_id: awayId,
            played_at: startsAt,
            status: 'scheduled',
            field_id: fieldId || null,
            entered_by: 'Admin (auto)',
          })
          .select('id')
          .single()

        if (lgError) {
          return NextResponse.json({ error: `Failed creating league game: ${lgError.message}` }, { status: 500 })
        }
        leagueGameId = lgData?.id ?? null
      }

      const { data, error } = await supabase
        .from('events')
        .insert({
          team_id: teamId,
          title,
          opponent: opponent || null,
          event_type: eventType ?? 'game',
          starts_at: startsAt,
          field_id: fieldId || null,
          is_home: isHome ?? false,
          travel_minutes: travelMinutes ?? null,
          travel_miles: travelMiles ?? null,
          notes: notes || null,
          gear_notes: gearNotes || null,
          status: 'confirmed',
          league_game_id: leagueGameId,
        })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    // ── Update display status (and write to log) atomically ────────────────
    if (action === 'update_game_status') {
      const { eventId, displayStatus, message, changedBy } = body
      if (!eventId || displayStatus === undefined) {
        return NextResponse.json({ error: 'Missing eventId or displayStatus' }, { status: 400 })
      }
      if (displayStatus !== null && !['on', 'watching', 'off'].includes(displayStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }

      const ownershipError = await verifyEventOwnership(eventId)
      if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 403 })

      // Read current status so we can record it as old_status in the log
      const { data: current, error: readError } = await supabase
        .from('events')
        .select('display_status')
        .eq('id', eventId)
        .single()
      if (readError) {
        return NextResponse.json({ error: `Could not read event: ${readError.message}` }, { status: 500 })
      }
      const now = new Date().toISOString()

      // Update event
      const { error: updateError } = await supabase
        .from('events')
        .update({
          display_status: displayStatus,
          status_message: message || null,
          status_updated_at: now,
          status_updated_by: changedBy || 'Admin',
        })
        .eq('id', eventId)
      if (updateError) {
        return NextResponse.json({ error: `Failed updating event: ${updateError.message}` }, { status: 500 })
      }

      // Only log if setting a status (not clearing)
      if (displayStatus !== null) {
        const { error: logError } = await supabase
          .from('game_status_log')
          .insert({
            event_id: eventId,
            old_status: current?.display_status ?? null,
            new_status: displayStatus,
            message: message || null,
            changed_by: changedBy || 'Admin',
          })
        if (logError) {
          return NextResponse.json({
            ok: true,
            warning: `Status saved but log failed: ${logError.message}`,
          })
        }
      }
      return NextResponse.json({ ok: true })
    }

    // ── Create a new practice ───────────────────────────────────────────────
    if (action === 'create_practice') {
      const { title, startsAt, fieldId, notes, gearNotes } = body
      if (!title || !startsAt) {
        return NextResponse.json({ error: 'Title and start time are required' }, { status: 400 })
      }
      if (!teamId) {
        return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('events')
        .insert({
          team_id: teamId,
          title,
          opponent: null,
          event_type: 'practice',
          starts_at: startsAt,
          field_id: fieldId || null,
          is_home: false,
          notes: notes || null,
          gear_notes: gearNotes || null,
          status: 'confirmed',
        })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    // ── Update event metadata (NOT scores — those go through save_game) ────
    if (action === 'update_event') {
      const { eventId, title, opponent, eventType, startsAt, fieldId, isHome, travelMinutes, travelMiles, notes, gearNotes, status } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

      const ownershipError = await verifyEventOwnership(eventId)
      if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 403 })

      // Get current event state to know if a league_game already exists
      const { data: existingEvent } = await supabase
        .from('events')
        .select('league_game_id, opponent')
        .eq('id', eventId)
        .single()

      const { error } = await supabase
        .from('events')
        .update({
          title,
          opponent: opponent || null,
          event_type: eventType,
          starts_at: startsAt,
          field_id: fieldId || null,
          is_home: isHome ?? false,
          travel_minutes: travelMinutes ?? null,
          travel_miles: travelMiles ?? null,
          notes: notes || null,
          gear_notes: gearNotes || null,
          status: status ?? 'confirmed',
        })
        .eq('id', eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Sync to linked league_game if exists
      // Sync to linked league_game if exists
      const opponentTeamId = eventType === 'game' ? (body.opponentTeamId ?? null) : null

      if (existingEvent?.league_game_id && opponentTeamId) {
        // Update the existing league_game with new metadata
        const homeId = isHome ? teamId : opponentTeamId
        const awayId = isHome ? opponentTeamId : teamId

        await supabase
          .from('league_games')
          .update({
            home_team_id: homeId,
            away_team_id: awayId,
            played_at: startsAt,
            field_id: fieldId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEvent.league_game_id)
      } else if (existingEvent?.league_game_id && !opponentTeamId) {
        // Event no longer matches MSBL team — unlink and delete league_game
        await supabase.from('events').update({ league_game_id: null }).eq('id', eventId)
        await supabase.from('league_games').delete().eq('id', existingEvent.league_game_id)
      } else if (!existingEvent?.league_game_id && opponentTeamId) {
        // Event newly matches MSBL team — create a league_game and link it
        const homeId = isHome ? teamId : opponentTeamId
        const awayId = isHome ? opponentTeamId : teamId

        const { data: lgData } = await supabase
          .from('league_games')
          .insert({
            home_team_id: homeId,
            away_team_id: awayId,
            played_at: startsAt,
            status: 'scheduled',
            field_id: fieldId || null,
            entered_by: 'Admin (auto)',
          })
          .select('id')
          .single()

        if (lgData?.id) {
          await supabase.from('events').update({ league_game_id: lgData.id }).eq('id', eventId)
        }
      }

      return NextResponse.json({ ok: true })
    }

    // ── Delete event (cascades to box_scores and player_stats via FK) ───────
    if (action === 'delete_event') {
      const { eventId } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

      const ownershipError = await verifyEventOwnership(eventId)
      if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 403 })

      // Check if linked to a league_game
      const { data: existingEvent } = await supabase
        .from('events')
        .select('league_game_id')
        .eq('id', eventId)
        .single()

      // Delete child rows first
      await supabase.from(').delete().eq('event_id', eventId)
      await supabase.from('player_stats').delete().eq('event_id', eventId)

      // Delete the event
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Also delete the linked league_game if exists
      if (existingEvent?.league_game_id) {
        await supabase.from('league_games').delete().eq('id', existingEvent.league_game_id)
      }

      return NextResponse.json({ ok: true })
    }

    // ── Player stats ────────────────────────────────────────────────────────
    if (action === 'update_player_stats') {
      const { playerId, eventId, atBats, hits, rbi, runs, walks, strikeouts, pitchCount, inningsPitched, strikeoutsPitching, walksAllowed, hitsAllowed, earnedRuns } = body

      const ownershipError = await verifyEventOwnership(eventId)
      if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 403 })

      const { error } = await supabase
        .from('player_stats')
        .upsert({
          player_id: playerId, event_id: eventId,
          at_bats: atBats, hits, rbi, runs,
          walks: walks ?? 0, strikeouts,
          pitch_count: pitchCount ?? 0, innings_pitched: inningsPitched ?? 0,
          strikeouts_pitching: strikeoutsPitching ?? 0, walks_allowed: walksAllowed ?? 0,
          hits_allowed: hitsAllowed ?? 0, earned_runs: earnedRuns ?? 0,
        }, { onConflict: 'player_id,event_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Standings (cross-team, no ownership check) ──────────────────────────
    if (action === 'update_standing') {
      const { standingId, wins, losses, ties, gamesPlayed, runsFor, runsAgainst } = body
      const { error } = await supabase
        .from('standings')
        .update({
          wins, losses, ties,
          games_played: gamesPlayed,
          runs_for: runsFor, runs_against: runsAgainst,
          updated_at: new Date().toISOString()
        })
        .eq('id', standingId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Create a league game (and auto-create matching event if current team plays) ───
if (action === 'create_league_game') {
  const { homeTeamId, awayTeamId, playedAt, homeScore, awayScore, status, fieldId } = body
  if (!homeTeamId || !awayTeamId || !playedAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (homeTeamId === awayTeamId) {
    return NextResponse.json({ error: 'Home and away teams must be different' }, { status: 400 })
  }
 
  // Create the league_game
  const { data: lgData, error: lgError } = await supabase
    .from('league_games')
    .insert({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      played_at: playedAt,
      home_score: homeScore,
      away_score: awayScore,
      status: status ?? 'final',
      field_id: fieldId || null,
      entered_by: 'Admin',
    })
    .select('id')
    .single()
  if (lgError) return NextResponse.json({ error: lgError.message }, { status: 500 })
 
  // Determine if the current team is one of the participating teams.
  // If yes, also create a matching event so it appears on schedule/home.
  const currentTeamPlays = teamId && (homeTeamId === teamId || awayTeamId === teamId)
  if (currentTeamPlays && lgData?.id) {
    const isHome = homeTeamId === teamId
    const opponentTeamId = isHome ? awayTeamId : homeTeamId
 
    // Look up the opponent's name from the teams table
    const { data: opponentTeam } = await supabase
      .from('teams')
      .select('name')
      .eq('id', opponentTeamId)
      .single()
    const opponentName = opponentTeam?.name ?? 'Unknown'
 
    // Determine event scores from the league_game perspective
    const isFinal = status === 'final' && homeScore !== null && awayScore !== null && homeScore !== undefined && awayScore !== undefined
    const teamScore = isFinal ? (isHome ? homeScore : awayScore) : null
    const opponentScore = isFinal ? (isHome ? awayScore : homeScore) : null
    let result: 'win' | 'loss' | 'tie' | null = null
    if (isFinal && teamScore !== null && opponentScore !== null) {
      if (teamScore > opponentScore) result = 'win'
      else if (teamScore < opponentScore) result = 'loss'
      else result = 'tie'
    }
 
    // Create the event linked to this league_game
    await supabase
      .from('events')
      .insert({
        team_id: teamId,
        title: `Chicago Elite vs ${opponentName}`,
        opponent: opponentName,
        event_type: 'game',
        starts_at: playedAt,
        field_id: fieldId || null,
        is_home: isHome,
        status: isFinal ? 'final' : 'confirmed',
        team_score: teamScore,
        opponent_score: opponentScore,
        result,
        league_game_id: lgData.id,
      })
  }
 
  return NextResponse.json({ ok: true })
}
 
// ── Update a league game (and sync linked event if exists) ───────────────────────
if (action === 'update_league_game') {
  const { leagueGameId, homeTeamId, awayTeamId, playedAt, homeScore, awayScore, status, fieldId } = body
  if (!leagueGameId) {
    return NextResponse.json({ error: 'Missing leagueGameId' }, { status: 400 })
  }
  if (homeTeamId === awayTeamId) {
    return NextResponse.json({ error: 'Home and away teams must be different' }, { status: 400 })
  }
 
  // Update the league_game
  const { error: lgError } = await supabase
    .from('league_games')
    .update({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      played_at: playedAt,
      home_score: homeScore,
      away_score: awayScore,
      status: status ?? 'final',
      field_id: fieldId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leagueGameId)
  if (lgError) return NextResponse.json({ error: lgError.message }, { status: 500 })
 
  // Check if any event is linked to this league_game (for the current team)
  const { data: linkedEvent } = await supabase
    .from('events')
    .select('id, team_id')
    .eq('league_game_id', leagueGameId)
    .maybeSingle()
 
  // Determine if the current team is now one of the participating teams
  const currentTeamPlays = teamId && (homeTeamId === teamId || awayTeamId === teamId)
 
  if (currentTeamPlays && linkedEvent) {
    // Update the existing event to match the league_game
    const isHome = homeTeamId === teamId
    const opponentTeamId = isHome ? awayTeamId : homeTeamId
 
    const { data: opponentTeam } = await supabase
      .from('teams')
      .select('name')
      .eq('id', opponentTeamId)
      .single()
    const opponentName = opponentTeam?.name ?? 'Unknown'
 
    const isFinal = status === 'final' && homeScore !== null && awayScore !== null && homeScore !== undefined && awayScore !== undefined
    const teamScore = isFinal ? (isHome ? homeScore : awayScore) : null
    const opponentScore = isFinal ? (isHome ? awayScore : homeScore) : null
    let result: 'win' | 'loss' | 'tie' | null = null
    if (isFinal && teamScore !== null && opponentScore !== null) {
      if (teamScore > opponentScore) result = 'win'
      else if (teamScore < opponentScore) result = 'loss'
      else result = 'tie'
    }
 
    await supabase
      .from('events')
      .update({
        title: `Chicago Elite vs ${opponentName}`,
        opponent: opponentName,
        starts_at: playedAt,
        field_id: fieldId || null,
        is_home: isHome,
        status: isFinal ? 'final' : 'confirmed',
        team_score: teamScore,
        opponent_score: opponentScore,
        result,
      })
      .eq('id', linkedEvent.id)
  } else if (currentTeamPlays && !linkedEvent) {
    // Current team just got added to a game it wasn't in before — create event
    const isHome = homeTeamId === teamId
    const opponentTeamId = isHome ? awayTeamId : homeTeamId
 
    const { data: opponentTeam } = await supabase
      .from('teams')
      .select('name')
      .eq('id', opponentTeamId)
      .single()
    const opponentName = opponentTeam?.name ?? 'Unknown'
 
    const isFinal = status === 'final' && homeScore !== null && awayScore !== null && homeScore !== undefined && awayScore !== undefined
    const teamScore = isFinal ? (isHome ? homeScore : awayScore) : null
    const opponentScore = isFinal ? (isHome ? awayScore : homeScore) : null
    let result: 'win' | 'loss' | 'tie' | null = null
    if (isFinal && teamScore !== null && opponentScore !== null) {
      if (teamScore > opponentScore) result = 'win'
      else if (teamScore < opponentScore) result = 'loss'
      else result = 'tie'
    }
 
    await supabase
      .from('events')
      .insert({
        team_id: teamId,
        title: `Chicago Elite vs ${opponentName}`,
        opponent: opponentName,
        event_type: 'game',
        starts_at: playedAt,
        field_id: fieldId || null,
        is_home: isHome,
        status: isFinal ? 'final' : 'confirmed',
        team_score: teamScore,
        opponent_score: opponentScore,
        result,
        league_game_id: leagueGameId,
      })
  } else if (!currentTeamPlays && linkedEvent) {
    // Current team no longer plays in this game — delete the orphaned event
    await supabase.from(').delete().eq('event_id', linkedEvent.id)
    await supabase.from('player_stats').delete().eq('event_id', linkedEvent.id)
    await supabase.from('events').delete().eq('id', linkedEvent.id)
  }
 
  return NextResponse.json({ ok: true })
}
 
// ── Delete a league game (cascade to linked event) ───────────────────────────────
if (action === 'delete_league_game') {
  const { leagueGameId } = body
  if (!leagueGameId) {
    return NextResponse.json({ error: 'Missing leagueGameId' }, { status: 400 })
  }
 
  // Find any linked event to clean up its child rows
  const { data: linkedEvents } = await supabase
    .from('events')
    .select('id')
    .eq('league_game_id', leagueGameId)
 
  if (linkedEvents && linkedEvents.length > 0) {
    const eventIds = linkedEvents.map(e => e.id)
    // Delete child rows first
    await supabase.from(').delete().in('event_id', eventIds)
    await supabase.from('player_stats').delete().in('event_id', eventIds)
    // Delete the events
    await supabase.from('events').delete().in('id', eventIds)
  }
 
  // Delete the league_game itself
  const { error } = await supabase
    .from('league_games')
    .delete()
    .eq('id', leagueGameId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
 
  return NextResponse.json({ ok: true })
}
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
