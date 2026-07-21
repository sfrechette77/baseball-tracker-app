export type ParseWarningSeverity = 'info' | 'warning' | 'error'

export type ParseWarning = {
  code: string
  message: string
  severity: ParseWarningSeverity
  sourceLine?: string
}

export type ParsedPlayerIdentity = {
  sourceLabel: string
  sourceName: string
  normalizedName: string
  jerseyNumber: string | null
  position: string | null
}

export type ParsedBattingLine = ParsedPlayerIdentity & {
  sourceOrder: number

  atBats: number
  runs: number
  hits: number
  runsBattedIn: number
  walks: number
  strikeouts: number

  totalBases: number | null
  doubles: number | null
  triples: number | null
  homeRuns: number | null
  stolenBases: number | null
  caughtStealing: number | null

  rawLine: string
}

export type ParsedPitchingLine = ParsedPlayerIdentity & {
  inningsPitched: string
  inningsOuts: number

  hitsAllowed: number
  runsAllowed: number
  earnedRuns: number
  walksAllowed: number
  strikeouts: number
  homeRunsAllowed: number

  pitchCount: number | null
  strikes: number | null
  battersFaced: number | null
  wildPitches: number | null

  rawLine: string
}

export type ParsedLineScore = {
  sourceTeamLabel: string
  innings: Array<number | null>
  runs: number
  hits: number
  errors: number
}

export type ParsedBattingTotals = {
  atBats: number
  runs: number
  hits: number
  runsBattedIn: number
  walks: number
  strikeouts: number
}

export type ParsedPitchingTotals = {
  inningsPitched: string
  inningsOuts: number
  hitsAllowed: number
  runsAllowed: number
  earnedRuns: number
  walksAllowed: number
  strikeouts: number
  homeRunsAllowed: number
}

export type ParsedTeamBoxScore = {
  name: string
  batting: ParsedBattingLine[]
  pitching: ParsedPitchingLine[]
  battingTotals: ParsedBattingTotals | null
  pitchingTotals: ParsedPitchingTotals | null
  leftOnBase: number | null
  unparsedNotes: string[]
}

export type ParsedBoxScore = {
  game: {
    date: string | null
    awayTeam: string
    homeTeam: string
    awayScore: number | null
    homeScore: number | null
    lineScore: ParsedLineScore[]
  }
  teams: ParsedTeamBoxScore[]
  warnings: ParseWarning[]
}

export type ParseResult<T> = {
  value: T | null
  warnings: ParseWarning[]
}

export type ParsedPitchCountNote = {
  sourceName: string
  normalizedName: string
  pitchCount: number
  strikes: number
}

export type ParsedNamedCountNote = {
  sourceName: string
  normalizedName: string
  value: number
}

export type ParsedPitchingNotes = {
  pitchCounts: ParsedPitchCountNote[]
  battersFaced: ParsedNamedCountNote[]
  wildPitches: ParsedNamedCountNote[]
  warnings: ParseWarning[]
}