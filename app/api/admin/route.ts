import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

const TEAM_ID = '4beb0750-1883-4b56-a386-db280675036c'

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD
  const body = await req.json()
  const { password, action } = body

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // ── Save full game state atomically ─────────────────────────────────────
    if (action === 'save_game') {
      const { eventId, usInnings, themInnings, isHome } = body
      if (!eventId || !Array.isArray(usInnings) || !Array.isArray(themInnings)) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
      }

      const usTotal = usInnings.reduce((sum: number, n: number) => sum + (Number(n) || 0), 0)
      const themTotal = themInnings.reduce((sum: number, n: number) => sum + (Number(n) || 0), 0)
      const result =
        usTotal > themTotal ? 'win' :
        usTotal < themTotal ? 'loss' : 'tie'

      const usUpsert = await supabase
        .from('box_scores')
        .upsert({
          event_id: eventId, team: 'us',
          inning_1: usInnings[0] ?? 0, inning_2: usInnings[1] ?? 0,
          inning_3: usInnings[2] ?? 0, inning_4: usInnings[3] ?? 0,
          inning_5: usInnings[4] ?? 0, inning_6: usInnings[5] ?? 0,
          inning_7: usInnings[6] ?? 0,
        }, { onConflict: 'event_id,team' })
      if (usUpsert.error) {
        return NextResponse.json({ error: `Failed saving us box score: ${usUpsert.error.message}` }, { status: 500 })
      }

      const themUpsert = await supabase
        .from('box_scores')
        .upsert({
          event_id: eventId, team: 'them',
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

      return NextResponse.json({ ok: true, teamScore: usTotal, opponentScore: themTotal, result })
    }

    // ── Create a new game/tournament event ──────────────────────────────────
    if (action === 'create_event') {
      const { title, opponent, eventType, startsAt, fieldId, isHome, travelMinutes, travelMiles, notes, gearNotes } = body
      if (!title || !startsAt) {
        return NextResponse.json({ error: 'Title and start time are required' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('events')
        .insert({
          team_id: TEAM_ID,
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

      // Append to log
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
        // The update succeeded but log failed — return a soft warning, not a hard error
        return NextResponse.json({
          ok: true,
          warning: `Status saved but log failed: ${logError.message}`,
        })
      }

      return NextResponse.json({ ok: true })
    }

    // ── Create a new practice ───────────────────────────────────────────────
    if (action === 'create_practice') {
      const { title, startsAt, fieldId, notes, gearNotes } = body
      if (!title || !startsAt) {
        return NextResponse.json({ error: 'Title and start time are required' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('events')
        .insert({
          team_id: TEAM_ID,
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
      return NextResponse.json({ ok: true })
    }

    // ── Delete event (cascades to box_scores and player_stats via FK) ───────
    if (action === 'delete_event') {
      const { eventId } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
      // Delete child rows first to be safe (in case ON DELETE isn't set)
      await supabase.from('box_scores').delete().eq('event_id', eventId)
      await supabase.from('player_stats').delete().eq('event_id', eventId)
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Player stats ────────────────────────────────────────────────────────
    if (action === 'update_player_stats') {
      const { playerId, eventId, atBats, hits, rbi, runs, walks, strikeouts, pitchCount, inningsPitched, strikeoutsPitching, walksAllowed, hitsAllowed, earnedRuns } = body
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

    // ── Standings ───────────────────────────────────────────────────────────
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
