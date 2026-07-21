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

export type RosterPlayerForImport = {
  id: string
  name: string
  jerseyNumber: string | null
}

export type PlayerMatchCandidate = {
  playerId: string
  name: string
  normalizedName: string
  jerseyNumber: string | null
}

export type PlayerMatchStatus =
  | 'matched'
  | 'needs_review'
  | 'unmatched'

export type PlayerMatchConfidence =
  | 'high'
  | 'medium'
  | 'none'

export type PlayerMatchReason =
  | 'exact-name-and-jersey'
  | 'exact-name'
  | 'abbreviated-name-and-jersey'
  | 'abbreviated-name'
  | 'unique-jersey'
  | 'ambiguous-exact-name-and-jersey'
  | 'ambiguous-exact-name'
  | 'ambiguous-abbreviated-name-and-jersey'
  | 'ambiguous-abbreviated-name'
  | 'ambiguous-jersey'
  | 'no-match'

export type PlayerMatchResult = {
  sourceName: string
  normalizedSourceName: string
  sourceJerseyNumber: string | null

  status: PlayerMatchStatus
  confidence: PlayerMatchConfidence
  reason: PlayerMatchReason

  playerId: string | null
  candidates: PlayerMatchCandidate[]
}

export type ReviewImportSource =
  | 'batting'
  | 'pitching'
  | 'both'

export type ReviewImportRow = {
  sourceKey: string
  sourceName: string
  normalizedSourceName: string
  sourceJerseyNumber: string | null
  sourcePosition: string | null
  sourceSections: ReviewImportSource

  batting: ParsedBattingLine | null
  pitching: ParsedPitchingLine | null

  match: PlayerMatchResult
  suggestedPlayerId: string | null
  selectedPlayerId: string | null
  include: boolean

  warnings: ParseWarning[]
}

export type GameChangerImportReviewSummary = {
  totalRows: number
  matched: number
  needsReview: number
  unmatched: number
  requiresResolution: number
}

export type GameChangerImportReview = {
  teamIndex: number
  teamName: string
  rows: ReviewImportRow[]
  summary: GameChangerImportReviewSummary
  readyToImport: boolean
  warnings: ParseWarning[]
}

export type ReviewValidationIssueCode =
  | 'no-rows-included'
  | 'unresolved-player'
  | 'duplicate-player-assignment'

export type ReviewValidationIssue = {
  code: ReviewValidationIssueCode
  message: string
  sourceKeys: string[]
  playerId?: string
}

export type ResolvedGameChangerImportRow = {
  sourceKey: string
  sourceName: string
  playerId: string
  sourceSections: ReviewImportSource

  battingOrderPosition: number | null
  atBats: number | null
  runs: number | null
  hits: number | null
  runsBattedIn: number | null
  walks: number | null
  battingStrikeouts: number | null

  totalBases: number | null
  doubles: number | null
  triples: number | null
  homeRuns: number | null
  stolenBases: number | null
  caughtStealing: number | null

  inningsPitched: string | null
  inningsOuts: number | null
  hitsAllowed: number | null
  runsAllowed: number | null
  earnedRuns: number | null
  walksAllowed: number | null
  pitchingStrikeouts: number | null
  homeRunsAllowed: number | null

  pitchCount: number | null
  strikes: number | null
  battersFaced: number | null
  wildPitches: number | null
}

export type ResolvedGameChangerImportPayload = {
  teamIndex: number
  teamName: string
  rows: ResolvedGameChangerImportRow[]
}