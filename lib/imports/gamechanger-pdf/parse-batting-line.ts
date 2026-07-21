import { normalizeWhitespace, parsePlayerLabel } from './normalize'
import type {
  ParseResult,
  ParsedBattingLine,
  ParseWarning,
} from './types'

const BATTING_ROW_PATTERN =
  /^(.*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/

export function parseBattingLine(
  rawLine: string,
  sourceOrder: number
): ParseResult<ParsedBattingLine> {
  const line = normalizeWhitespace(rawLine)
  const warnings: ParseWarning[] = []
  const match = line.match(BATTING_ROW_PATTERN)

  if (!match) {
    return {
      value: null,
      warnings: [
        {
          code: 'invalid-batting-row',
          message: 'Batting row did not match the expected player and six-stat format.',
          severity: 'error',
          sourceLine: rawLine,
        },
      ],
    }
  }

  try {
    const identity = parsePlayerLabel(match[1])

    const atBats = Number(match[2])
    const runs = Number(match[3])
    const hits = Number(match[4])
    const runsBattedIn = Number(match[5])
    const walks = Number(match[6])
    const strikeouts = Number(match[7])

    if (hits > atBats) {
      warnings.push({
        code: 'hits-exceed-at-bats',
        message: `${identity.sourceName} has more hits than at-bats.`,
        severity: 'warning',
        sourceLine: rawLine,
      })
    }

    return {
      value: {
        ...identity,
        sourceOrder,
        atBats,
        runs,
        hits,
        runsBattedIn,
        walks,
        strikeouts,
        totalBases: null,
        doubles: null,
        triples: null,
        homeRuns: null,
        stolenBases: null,
        caughtStealing: null,
        rawLine: line,
      },
      warnings,
    }
  } catch (error) {
    return {
      value: null,
      warnings: [
        {
          code: 'invalid-batting-player-label',
          message:
            error instanceof Error
              ? error.message
              : 'Batting row contained an invalid player label.',
          severity: 'error',
          sourceLine: rawLine,
        },
      ],
    }
  }
}