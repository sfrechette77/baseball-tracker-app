import { parseInningsPitched } from './innings'
import { normalizeWhitespace, parsePlayerLabel } from './normalize'
import type {
  ParseResult,
  ParsedPitchingLine,
  ParseWarning,
} from './types'

const PITCHING_ROW_PATTERN =
  /^(.*?)\s+(\d+(?:\.[012])?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/

export function parsePitchingLine(
  rawLine: string
): ParseResult<ParsedPitchingLine> {
  const line = normalizeWhitespace(rawLine)
  const warnings: ParseWarning[] = []
  const match = line.match(PITCHING_ROW_PATTERN)

  if (!match) {
    return {
      value: null,
      warnings: [
        {
          code: 'invalid-pitching-row',
          message: 'Pitching row did not match the expected player, IP, and six-stat format.',
          severity: 'error',
          sourceLine: rawLine,
        },
      ],
    }
  }

  try {
    const identity = parsePlayerLabel(match[1])
    const innings = parseInningsPitched(match[2])

    const hitsAllowed = Number(match[3])
    const runsAllowed = Number(match[4])
    const earnedRuns = Number(match[5])
    const walksAllowed = Number(match[6])
    const strikeouts = Number(match[7])
    const homeRunsAllowed = Number(match[8])

    if (earnedRuns > runsAllowed) {
      warnings.push({
        code: 'earned-runs-exceed-runs',
        message: `${identity.sourceName} has more earned runs than total runs allowed.`,
        severity: 'warning',
        sourceLine: rawLine,
      })
    }

    return {
      value: {
        ...identity,
        inningsPitched: innings.display,
        inningsOuts: innings.outs,
        hitsAllowed,
        runsAllowed,
        earnedRuns,
        walksAllowed,
        strikeouts,
        homeRunsAllowed,
        pitchCount: null,
        strikes: null,
        battersFaced: null,
        wildPitches: null,
        rawLine: line,
      },
      warnings,
    }
  } catch (error) {
    return {
      value: null,
      warnings: [
        {
          code: 'invalid-pitching-player-label',
          message:
            error instanceof Error
              ? error.message
              : 'Pitching row contained invalid data.',
          severity: 'error',
          sourceLine: rawLine,
        },
      ],
    }
  }
}