import type {
  CurrentPlayerStatsBulkRow,
  GameChangerPlayerStatsMapping,
  ResolvedGameChangerImportPayload,
  ResolvedGameChangerImportRow,
  UnstoredGameChangerStat,
  UnstoredGameChangerStatName,
} from './types'

function inningsPitchedToCurrentNumber(
  value: string | null
): number {
  if (value === null) {
    return 0
  }

  if (!/^\d+\.[012]$/.test(value)) {
    throw new Error(
      `Invalid baseball innings-pitched value: "${value}"`
    )
  }

  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new Error(
      `Invalid baseball innings-pitched value: "${value}"`
    )
  }

  return numericValue
}

function toCurrentStatsRow(
  row: ResolvedGameChangerImportRow
): CurrentPlayerStatsBulkRow {
  return {
    playerId: row.playerId,

    batting_order_position:
      row.battingOrderPosition,
    at_bats: row.atBats ?? 0,
    hits: row.hits ?? 0,
    rbi: row.runsBattedIn ?? 0,
    runs: row.runs ?? 0,
    walks: row.walks ?? 0,
    strikeouts: row.battingStrikeouts ?? 0,

    pitch_count: row.pitchCount ?? 0,
    innings_pitched:
      inningsPitchedToCurrentNumber(
        row.inningsPitched
      ),
    strikeouts_pitching:
      row.pitchingStrikeouts ?? 0,
    walks_allowed: row.walksAllowed ?? 0,
    hits_allowed: row.hitsAllowed ?? 0,
    earned_runs: row.earnedRuns ?? 0,
  }
}

function addUnstoredStat(
  output: UnstoredGameChangerStat[],
  row: ResolvedGameChangerImportRow,
  stat: UnstoredGameChangerStatName,
  value: number | null
): void {
  if (value === null) {
    return
  }

  output.push({
    sourceKey: row.sourceKey,
    sourceName: row.sourceName,
    playerId: row.playerId,
    stat,
    value,
  })
}

function collectUnstoredStats(
  row: ResolvedGameChangerImportRow
): UnstoredGameChangerStat[] {
  const output: UnstoredGameChangerStat[] = []

  addUnstoredStat(
    output,
    row,
    'totalBases',
    row.totalBases
  )
  addUnstoredStat(
    output,
    row,
    'doubles',
    row.doubles
  )
  addUnstoredStat(
    output,
    row,
    'triples',
    row.triples
  )
  addUnstoredStat(
    output,
    row,
    'homeRuns',
    row.homeRuns
  )
  addUnstoredStat(
    output,
    row,
    'stolenBases',
    row.stolenBases
  )
  addUnstoredStat(
    output,
    row,
    'caughtStealing',
    row.caughtStealing
  )

  addUnstoredStat(
    output,
    row,
    'runsAllowed',
    row.runsAllowed
  )
  addUnstoredStat(
    output,
    row,
    'homeRunsAllowed',
    row.homeRunsAllowed
  )
  addUnstoredStat(
    output,
    row,
    'strikes',
    row.strikes
  )
  addUnstoredStat(
    output,
    row,
    'battersFaced',
    row.battersFaced
  )
  addUnstoredStat(
    output,
    row,
    'wildPitches',
    row.wildPitches
  )

  return output
}

export function mapGameChangerImportToCurrentPlayerStats(
  payload: ResolvedGameChangerImportPayload
): GameChangerPlayerStatsMapping {
  return {
    stats: payload.rows.map(toCurrentStatsRow),
    unstoredStats: payload.rows.flatMap(
      collectUnstoredStats
    ),
  }
}