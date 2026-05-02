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
  const { password, action } = body

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // ── Save full game state atomically ─────────────────────────────────────
    // Writes box score (us + them) and event totals (team_score, opponent_score,
    // result, is_home, status) in a single API call. If any step fails, the
    // response carries the error and the caller knows nothing was completed
    // beyond what's reported.
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

      // 1. Upsert "us" box score row
      const usUpsert = await supabase
        .from('box_scores')
        .upsert({
          event_id: eventId,
          team: 'us',
          inning_1: usInnings[0] ?? 0,
          inning_2: usInnings[1] ?? 0,
          inning_3: usInnings[2] ?? 0,
          inning_4: usInnings[3] ?? 0,
          inning_5: usInnings[4] ?? 0,
          inning_6: usInnings[5] ?? 0,
          inning_7: usInnings[6] ?? 0,
        }, { onConflict: 'event_id,team' })
      if (usUpsert.error) {
        return NextResponse.json({ error: `Failed saving us box score: ${usUpsert.error.message}` }, { status: 500 })
      }

      // 2. Upsert "them" box score row
      const themUpsert = await supabase
        .from('box_scores')
        .upsert({
          event_id: eventId,
          team: 'them',
          inning_1: themInnings[0] ?? 0,
          inning_2: themInnings[1] ?? 0,
          inning_3: themInnings[2] ?? 0,
          inning_4: themInnings[3] ?? 0,
          inning_5: themInnings[4] ?? 0,
          inning_6: themInnings[5] ?? 0,
          inning_7: themInnings[6] ?? 0,
        }, { onConflict: 'event_id,team' })
      if (themUpsert.error) {
        return NextResponse.json({ error: `Failed saving them box score: ${themUpsert.error.message}` }, { status: 500 })
      }

      // 3. Update event totals (computed, not user-entered)
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

      return NextResponse.json({
        ok: true,
        teamScore: usTotal,
        opponentScore: themTotal,
        result,
      })
    }

    // ── Upsert player stats for a game ─────────────────────────────────────
    if (action === 'update_player_stats') {
      const { playerId, eventId, atBats, hits, rbi, runs, walks, strikeouts, pitchCount, inningsPitched, strikeoutsPitching, walksAllowed, hitsAllowed, earnedRuns } = body
      const { error } = await supabase
        .from('player_stats')
        .upsert({
          player_id: playerId,
          event_id: eventId,
          at_bats: atBats,
          hits,
          rbi,
          runs,
          walks: walks ?? 0,
          strikeouts,
          pitch_count: pitchCount ?? 0,
          innings_pitched: inningsPitched ?? 0,
          strikeouts_pitching: strikeoutsPitching ?? 0,
          walks_allowed: walksAllowed ?? 0,
          hits_allowed: hitsAllowed ?? 0,
          earned_runs: earnedRuns ?? 0,
        }, { onConflict: 'player_id,event_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Update standings row ────────────────────────────────────────────────
    if (action === 'update_standing') {
      const { standingId, wins, losses, ties, gamesPlayed, runsFor, runsAgainst } = body
      const { error } = await supabase
        .from('standings')
        .update({
          wins,
          losses,
          ties,
          games_played: gamesPlayed,
          runs_for: runsFor,
          runs_against: runsAgainst,
          updated_at: new Date().toISOString()
        })
        .eq('id', standingId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Legacy: keep the old endpoints around in case something still calls them
    if (action === 'update_score') {
      const { eventId, teamScore, opponentScore, result, isHome } = body
      const { error } = await supabase
        .from('events')
        .update({
          team_score: teamScore,
          opponent_score: opponentScore,
          result,
          status: 'final',
          is_home: isHome ?? false
        })
        .eq('id', eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_box_score') {
      const { eventId, team, innings } = body
      const { error } = await supabase
        .from('box_scores')
        .upsert({
          event_id: eventId,
          team,
          inning_1: innings[0] ?? 0,
          inning_2: innings[1] ?? 0,
          inning_3: innings[2] ?? 0,
          inning_4: innings[3] ?? 0,
          inning_5: innings[4] ?? 0,
          inning_6: innings[5] ?? 0,
          inning_7: innings[6] ?? 0,
        }, { onConflict: 'event_id,team' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
