import { parseInningsPitched } from './innings'
import { normalizeWhitespace } from './normalize'
import { parseBattingLine } from './parse-batting-line'
import { parsePitchingLine } from './parse-pitching-line'
import { parsePitchingNotes } from './parse-pitching-notes'
import type {
  ParseWarning,
  ParsedBattingTotals,
  ParsedBoxScore,
  ParsedLineScore,
  ParsedPitchingTotals,
  ParsedTeamBoxScore,
} from './types'

const BATTING_HEADER_PATTERN =
  /^(.*?)\s+AB\s+R\s+H\s+RBI\s+BB\s+SO$/

const BATTING_TOTALS_PATTERN =
  /^Totals\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/

const PITCHING_HEADER_PATTERN =
  /^(.*?)\s+IP\s+H\s+R\s+ER\s+BB\s+SO\s+HR$/

const PITCHING_TOTALS_PATTERN =
  /^Totals\s+(\d+(?:\.[012])?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/

const MONTHS: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
}

function createTeam(name: string): ParsedTeamBoxScore {
  return {
    name: normalizeWhitespace(name),
    batting: [],
    pitching: [],
    battingTotals: null,
    pitchingTotals: null,
    leftOnBase: null,
    unparsedNotes: [],
  }
}

function parseDocumentDate(line: string): string | null {
  const match = line.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/
  )

  if (!match) {
    return null
  }

  const month = MONTHS[match[1]]
  const day = match[2].padStart(2, '0')
  const year = match[3]

  return `${year}-${month}-${day}`
}

function parseLineScoreRow(line: string): ParsedLineScore | null {
  const tokens = normalizeWhitespace(line).split(' ')
  const firstNumericIndex = tokens.findIndex((token) => /^\d+$/.test(token))

  if (firstNumericIndex <= 0) {
    return null
  }

  const sourceTeamLabel = tokens.slice(0, firstNumericIndex).join(' ')
  const numericValues = tokens
    .slice(firstNumericIndex)
    .map((token) => Number(token))

  if (
    numericValues.length < 4 ||
    numericValues.some((value) => !Number.isInteger(value))
  ) {
    return null
  }

  return {
    sourceTeamLabel,
    innings: numericValues.slice(0, -3),
    runs: numericValues.at(-3) ?? 0,
    hits: numericValues.at(-2) ?? 0,
    errors: numericValues.at(-1) ?? 0,
  }
}

function parseBattingTotals(
  line: string
): ParsedBattingTotals | null {
  const match = line.match(BATTING_TOTALS_PATTERN)

  if (!match) {
    return null
  }

  return {
    atBats: Number(match[1]),
    runs: Number(match[2]),
    hits: Number(match[3]),
    runsBattedIn: Number(match[4]),
    walks: Number(match[5]),
    strikeouts: Number(match[6]),
  }
}

function parsePitchingTotals(
  line: string
): ParsedPitchingTotals | null {
  const match = line.match(PITCHING_TOTALS_PATTERN)

  if (!match) {
    return null
  }

  const innings = parseInningsPitched(match[1])

  return {
    inningsPitched: innings.display,
    inningsOuts: innings.outs,
    hitsAllowed: Number(match[2]),
    runsAllowed: Number(match[3]),
    earnedRuns: Number(match[4]),
    walksAllowed: Number(match[5]),
    strikeouts: Number(match[6]),
    homeRunsAllowed: Number(match[7]),
  }
}

function groupBattingNotes(lines: string[]): string[] {
  const groups: string[] = []
  let current: string[] = []

  for (const line of lines) {
    current.push(line)

    if (/\bLOB:\s*\d+\b/.test(line)) {
      groups.push(current.join(' '))
      current = []
    }
  }

  if (current.length > 0) {
    groups.push(current.join(' '))
  }

  return groups
}

function groupPitchingNotes(lines: string[]): string[] {
  const groups: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (/^Scorekeeping\./i.test(line)) {
      continue
    }

    if (/\bP-S:\s*/.test(line) && current.length > 0) {
      groups.push(current.join(' '))
      current = []
    }

    current.push(line)
  }

  if (current.length > 0) {
    groups.push(current.join(' '))
  }

  return groups
}

function parseBattingSection(
  lines: string[],
  warnings: ParseWarning[]
): ParsedTeamBoxScore[] {
  const teams: ParsedTeamBoxScore[] = []
  const noteLines: string[] = []

  let currentTeam: ParsedTeamBoxScore | null = null
  let sourceOrder = 0

  for (const line of lines) {
    const headerMatch = line.match(BATTING_HEADER_PATTERN)

    if (headerMatch) {
      currentTeam = createTeam(headerMatch[1])
      teams.push(currentTeam)
      sourceOrder = 0
      continue
    }

    if (!currentTeam) {
      warnings.push({
        code: 'batting-line-before-team-header',
        message: 'Found batting content before a recognized team header.',
        severity: 'warning',
        sourceLine: line,
      })
      continue
    }

    const totals = parseBattingTotals(line)

    if (totals) {
      currentTeam.battingTotals = totals
      continue
    }

    if (currentTeam.battingTotals) {
      noteLines.push(line)
      continue
    }

    const parsed = parseBattingLine(line, sourceOrder + 1)
    warnings.push(...parsed.warnings)

    if (parsed.value) {
      sourceOrder += 1
      currentTeam.batting.push(parsed.value)
    }
  }

  const noteGroups = groupBattingNotes(noteLines)

  noteGroups.forEach((note, index) => {
    const team = teams[index]

    if (!team) {
      warnings.push({
        code: 'unmatched-batting-note-group',
        message: 'A batting note group could not be assigned to a team.',
        severity: 'warning',
        sourceLine: note,
      })
      return
    }

    const leftOnBaseMatch = note.match(/\bLOB:\s*(\d+)\b/)

    if (leftOnBaseMatch) {
      team.leftOnBase = Number(leftOnBaseMatch[1])
    }

    team.unparsedNotes.push(note)
  })

  return teams
}

function applyPitchingNotes(
  teams: ParsedTeamBoxScore[],
  noteLines: string[],
  warnings: ParseWarning[]
): void {
  const noteGroups = groupPitchingNotes(noteLines)

  noteGroups.forEach((noteGroup, teamIndex) => {
    const team = teams[teamIndex]

    if (!team) {
      warnings.push({
        code: 'unmatched-pitching-note-group',
        message: 'A pitching note group could not be assigned to a team.',
        severity: 'warning',
        sourceLine: noteGroup,
      })
      return
    }

    const parsedNotes = parsePitchingNotes(noteGroup)
    warnings.push(...parsedNotes.warnings)

    for (const note of parsedNotes.pitchCounts) {
      const pitcher = team.pitching.find(
        (row) => row.normalizedName === note.normalizedName
      )

      if (!pitcher) {
        warnings.push({
          code: 'unmatched-pitch-count-player',
          message: `Pitch-count note could not be matched to ${note.sourceName}.`,
          severity: 'warning',
          sourceLine: noteGroup,
        })
        continue
      }

      pitcher.pitchCount = note.pitchCount
      pitcher.strikes = note.strikes
    }

    for (const note of parsedNotes.battersFaced) {
      const pitcher = team.pitching.find(
        (row) => row.normalizedName === note.normalizedName
      )

      if (!pitcher) {
        warnings.push({
          code: 'unmatched-batters-faced-player',
          message: `Batters-faced note could not be matched to ${note.sourceName}.`,
          severity: 'warning',
          sourceLine: noteGroup,
        })
        continue
      }

      pitcher.battersFaced = note.value
    }

    for (const note of parsedNotes.wildPitches) {
      const pitcher = team.pitching.find(
        (row) => row.normalizedName === note.normalizedName
      )

      if (!pitcher) {
        warnings.push({
          code: 'unmatched-wild-pitch-player',
          message: `Wild-pitch note could not be matched to ${note.sourceName}.`,
          severity: 'warning',
          sourceLine: noteGroup,
        })
        continue
      }

      pitcher.wildPitches = note.value
    }
  })
}

function parsePitchingSection(
  lines: string[],
  teams: ParsedTeamBoxScore[],
  warnings: ParseWarning[]
): void {
  const noteLines: string[] = []

  let currentTeam: ParsedTeamBoxScore | null = null
  let teamIndex = -1

  for (const line of lines) {
    const headerMatch = line.match(PITCHING_HEADER_PATTERN)

    if (headerMatch) {
      teamIndex += 1

      if (!teams[teamIndex]) {
        teams.push(createTeam(headerMatch[1]))
      }

      currentTeam = teams[teamIndex]
      continue
    }

    if (!currentTeam) {
      warnings.push({
        code: 'pitching-line-before-team-header',
        message: 'Found pitching content before a recognized team header.',
        severity: 'warning',
        sourceLine: line,
      })
      continue
    }

    const totals = parsePitchingTotals(line)

    if (totals) {
      currentTeam.pitchingTotals = totals
      continue
    }

    if (currentTeam.pitchingTotals) {
      noteLines.push(line)
      continue
    }

    const parsed = parsePitchingLine(line)
    warnings.push(...parsed.warnings)

    if (parsed.value) {
      currentTeam.pitching.push(parsed.value)
    }
  }

  applyPitchingNotes(teams, noteLines, warnings)
}

export function parseGameChangerBoxScoreText(
  rawText: string
): ParsedBoxScore {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeWhitespace)
    .filter(Boolean)

  const warnings: ParseWarning[] = []

  const titleLine = lines[0]?.replace(/^\uFEFF/, '') ?? ''

  const titleMatch = titleLine.match(
    /^(.+?)\s+(\d+)\s*[-–—]\s*(\d+)\s+(.+)$/
  )

  const awayTeam = titleMatch
    ? normalizeWhitespace(titleMatch[1])
    : ''

  const awayScore = titleMatch
    ? Number(titleMatch[2])
    : null

  const homeScore = titleMatch
    ? Number(titleMatch[3])
    : null

  const homeTeam = titleMatch
    ? normalizeWhitespace(titleMatch[4])
    : ''

  if (!titleMatch) {
    warnings.push({
      code: 'invalid-game-title',
      message: 'The game title could not be parsed.',
      severity: 'error',
      sourceLine: titleLine,
    })
  }

  const date =
    lines
      .slice(0, 5)
      .map(parseDocumentDate)
      .find((value): value is string => value !== null) ?? null

  if (!date) {
    warnings.push({
      code: 'missing-game-date',
      message: 'The game date could not be parsed.',
      severity: 'warning',
    })
  }

  const lineScoreHeaderIndex = lines.findIndex(
    (line) => /^1\s/.test(line) && /\sR\s+H\s+E$/.test(line)
  )

  const lineScore: ParsedLineScore[] = []

  if (lineScoreHeaderIndex >= 0) {
    for (
      let index = lineScoreHeaderIndex + 1;
      index <= lineScoreHeaderIndex + 2;
      index += 1
    ) {
      const parsed = parseLineScoreRow(lines[index] ?? '')

      if (parsed) {
        lineScore.push(parsed)
      }
    }
  } else {
    warnings.push({
      code: 'missing-line-score-header',
      message: 'The inning-by-inning line-score header was not found.',
      severity: 'warning',
    })
  }

  const battingIndex = lines.indexOf('BATTING')
  const pitchingIndex = lines.indexOf('PITCHING')

  if (battingIndex < 0) {
    warnings.push({
      code: 'missing-batting-section',
      message: 'The BATTING section was not found.',
      severity: 'error',
    })
  }

  if (pitchingIndex < 0) {
    warnings.push({
      code: 'missing-pitching-section',
      message: 'The PITCHING section was not found.',
      severity: 'error',
    })
  }

  const battingLines =
    battingIndex >= 0 && pitchingIndex > battingIndex
      ? lines.slice(battingIndex + 1, pitchingIndex)
      : []

  const pitchingLines =
    pitchingIndex >= 0
      ? lines.slice(pitchingIndex + 1)
      : []

  const teams = parseBattingSection(battingLines, warnings)
  parsePitchingSection(pitchingLines, teams, warnings)

  return {
    game: {
      date,
      awayTeam,
      homeTeam,
      awayScore,
      homeScore,
      lineScore,
    },
    teams,
    warnings,
  }
}
