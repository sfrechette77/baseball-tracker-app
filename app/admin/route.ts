import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const adminPassword = process.env.CRON_SECRET
  const body = await req.json()
  const { password, action } = body

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // ── Update game score + result ──────────────────────────────────────────
    if (action === 'update_score') {
      const { eventId, teamScore, opponentScore, result } = body
      const { error } = await supabase
        .from('events')
        .update({
          team_score: teamScore,
          opponent_score: opponentScore,
          result,
          status: 'final'
        })
        .eq('id', eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Upsert player stats for a game ─────────────────────────────────────
    if (action === 'update_player_stats') {
      const { playerId, eventId, atBats, hits, rbi, runs, strikeouts } = body
      const { error } = await supabase
        .from('player_stats')
        .upsert({
          player_id: playerId,
          event_id: eventId,
          at_bats: atBats,
          hits,
          rbi,
          runs,
          strikeouts
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
