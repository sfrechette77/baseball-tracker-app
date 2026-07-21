import { matchParsedPlayerToRoster } from './match-players'
import { normalizeWhitespace } from './normalize'
import type {
  GameChangerImportReview,
  ParseWarning,
  ParsedBattingLine,
  ParsedBoxScore,
  ParsedPitchingLine,
  ParsedPlayerIdentity,
  PlayerMatchStatus,
  ReviewImportRow,
  RosterPlayerForImport,
} from './types'

type DraftReviewRow = {
  batting: ParsedBattingLine | null
  pitching: ParsedPitchingLine | null
  sequence: number
  warnings: ParseWarning[]
}

function normalizeJerseyNumber(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null
  }

  const normalized = normalizeWhitespace(value)
    .replace(/^#/, '')
    .trim()

  return normalized || null
}

function getNormalizedName(
  row: DraftReviewRow
): string {
  return (
    row.batting?.normalizedName ??
    row.pitching?.normalizedName ??
    ''
  )
}

function getJerseyNumber(
  row: DraftReviewRow
): string | null {
  return normalizeJerseyNumber(
    row.batting?.jerseyNumber ??
      row.pitching?.jerseyNumber
  )
}

function countStatuses(
  rows: ReviewImportRow[],
  status: PlayerMatchStatus
): number {
  return rows.filter(
    (row) => row.match.status === status
  ).length
}

function createReviewRow(
  draft: DraftReviewRow,
  rosterPlayers: RosterPlayerForImport[]
): ReviewImportRow {
  const batting = draft.batting
  const pitching = draft.pitching

  if (!batting && !pitching) {
    throw new Error(
      'Review row must contain batting or pitching data.'
    )
  }

  const sourceName =
    batting?.sourceName ??
    pitching?.sourceName ??
    ''

  const normalizedSourceName =
    batting?.normalizedName ??
    pitching?.normalizedName ??
    ''

  const battingJersey = normalizeJerseyNumber(
    batting?.jerseyNumber
  )

  const pitchingJersey = normalizeJerseyNumber(
    pitching?.jerseyNumber
  )

  const warnings = [...draft.warnings]

  if (
    battingJersey &&
    pitchingJersey &&
    battingJersey !== pitchingJersey
  ) {
    warnings.push({
      code: 'conflicting-source-jersey',
      message:
        `${sourceName} has different jersey numbers in the ` +
        `batting and pitching sections.`,
      severity: 'warning',
    })
  }

  const sourceJerseyNumber =
    battingJersey ?? pitchingJersey

  const identity: ParsedPlayerIdentity = {
    sourceLabel:
      batting?.sourceLabel ??
      pitching?.sourceLabel ??
      sourceName,
    sourceName,
    normalizedName: normalizedSourceName,
    jerseyNumber: sourceJerseyNumber,
    position:
      batting?.position ??
      pitching?.position ??
      null,
  }

  const match = matchParsedPlayerToRoster(
    identity,
    rosterPlayers
  )

  const sourceSections =
    batting && pitching
      ? 'both'
      : batting
        ? 'batting'
        : 'pitching'

  return {
    sourceKey: [
      normalizedSourceName,
      sourceJerseyNumber ?? 'no-jersey',
      String(draft.sequence),
    ].join('|'),

    sourceName,
    normalizedSourceName,
    sourceJerseyNumber,
    sourcePosition: identity.position,
    sourceSections,

    batting,
    pitching,

    match,
    suggestedPlayerId: match.playerId,
    selectedPlayerId:
      match.status === 'matched'
        ? match.playerId
        : null,
    include: true,

    warnings,
  }
}

export function buildGameChangerImportReview(
  parsedBoxScore: ParsedBoxScore,
  teamIndex: number,
  rosterPlayers: RosterPlayerForImport[]
): GameChangerImportReview {
  const team = parsedBoxScore.teams[teamIndex]

  if (!team) {
    throw new Error(
      `Parsed team index ${teamIndex} does not exist.`
    )
  }

  const drafts: DraftReviewRow[] =
    team.batting.map((batting, index) => ({
      batting,
      pitching: null,
      sequence: index + 1,
      warnings: [],
    }))

  team.pitching.forEach((pitching, pitchingIndex) => {
    const sameNameDrafts = drafts.filter(
      (draft) =>
        getNormalizedName(draft) ===
        pitching.normalizedName
    )

    const pitchingJersey = normalizeJerseyNumber(
      pitching.jerseyNumber
    )

    const sameNameAndJerseyDrafts =
      pitchingJersey == null
        ? []
        : sameNameDrafts.filter(
            (draft) =>
              getJerseyNumber(draft) === pitchingJersey
          )

    let target: DraftReviewRow | null = null

    if (sameNameAndJerseyDrafts.length === 1) {
      target = sameNameAndJerseyDrafts[0]
    } else if (sameNameDrafts.length === 1) {
      target = sameNameDrafts[0]
    }

    if (target && !target.pitching) {
      target.pitching = pitching
      return
    }

    const warnings: ParseWarning[] = []

    if (sameNameDrafts.length > 1) {
      warnings.push({
        code: 'ambiguous-source-row-merge',
        message:
          `${pitching.sourceName} appears more than once ` +
          `in the batting section, so the pitching row ` +
          `was kept separate.`,
        severity: 'warning',
        sourceLine: pitching.rawLine,
      })
    } else if (target?.pitching) {
      warnings.push({
        code: 'duplicate-source-pitching-row',
        message:
          `${pitching.sourceName} has more than one ` +
          `pitching row, so the rows were kept separate.`,
        severity: 'warning',
        sourceLine: pitching.rawLine,
      })
    }

    drafts.push({
      batting: null,
      pitching,
      sequence:
        team.batting.length + pitchingIndex + 1,
      warnings,
    })
  })

  const rows = drafts.map((draft) =>
    createReviewRow(draft, rosterPlayers)
  )

  const matched = countStatuses(rows, 'matched')
  const needsReview = countStatuses(
    rows,
    'needs_review'
  )
  const unmatched = countStatuses(rows, 'unmatched')

  return {
    teamIndex,
    teamName: team.name,
    rows,
    summary: {
      totalRows: rows.length,
      matched,
      needsReview,
      unmatched,
      requiresResolution:
        needsReview + unmatched,
    },
    readyToImport: rows.every(
      (row) =>
        !row.include ||
        row.selectedPlayerId !== null
    ),
    warnings: [...parsedBoxScore.warnings],
  }
}