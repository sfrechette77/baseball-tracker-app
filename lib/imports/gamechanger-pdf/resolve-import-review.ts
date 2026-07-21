import type {
  GameChangerImportReview,
  PlayerMatchStatus,
  ResolvedGameChangerImportPayload,
  ResolvedGameChangerImportRow,
  ReviewImportRow,
  ReviewValidationIssue,
} from './types'

function countStatuses(
  rows: ReviewImportRow[],
  status: PlayerMatchStatus
): number {
  return rows.filter(
    (row) => row.match.status === status
  ).length
}

function getDuplicatePlayerAssignments(
  rows: ReviewImportRow[]
): Map<string, ReviewImportRow[]> {
  const assignments = new Map<
    string,
    ReviewImportRow[]
  >()

  for (const row of rows) {
    if (!row.include || !row.selectedPlayerId) {
      continue
    }

    const existing =
      assignments.get(row.selectedPlayerId) ?? []

    existing.push(row)
    assignments.set(row.selectedPlayerId, existing)
  }

  return new Map(
    [...assignments.entries()].filter(
      ([, assignedRows]) => assignedRows.length > 1
    )
  )
}

function recalculateReview(
  review: GameChangerImportReview,
  rows: ReviewImportRow[]
): GameChangerImportReview {
  const requiresResolution = rows.filter(
    (row) =>
      row.include &&
      row.selectedPlayerId === null
  ).length

  const hasIncludedRows = rows.some(
    (row) => row.include
  )

  const duplicateAssignments =
    getDuplicatePlayerAssignments(rows)

  return {
    ...review,
    rows,
    summary: {
      totalRows: rows.length,
      matched: countStatuses(rows, 'matched'),
      needsReview: countStatuses(
        rows,
        'needs_review'
      ),
      unmatched: countStatuses(
        rows,
        'unmatched'
      ),
      requiresResolution,
    },
    readyToImport:
      hasIncludedRows &&
      requiresResolution === 0 &&
      duplicateAssignments.size === 0,
  }
}

function updateReviewRow(
  review: GameChangerImportReview,
  sourceKey: string,
  update: (
    row: ReviewImportRow
  ) => ReviewImportRow
): GameChangerImportReview {
  let found = false

  const rows = review.rows.map((row) => {
    if (row.sourceKey !== sourceKey) {
      return row
    }

    found = true
    return update(row)
  })

  if (!found) {
    throw new Error(
      `Review row not found: ${sourceKey}`
    )
  }

  return recalculateReview(review, rows)
}

export function selectGameChangerReviewPlayer(
  review: GameChangerImportReview,
  sourceKey: string,
  playerId: string | null
): GameChangerImportReview {
  return updateReviewRow(
    review,
    sourceKey,
    (row) => ({
      ...row,
      selectedPlayerId: playerId,
    })
  )
}

export function setGameChangerReviewRowIncluded(
  review: GameChangerImportReview,
  sourceKey: string,
  include: boolean
): GameChangerImportReview {
  return updateReviewRow(
    review,
    sourceKey,
    (row) => ({
      ...row,
      include,
    })
  )
}

export function validateGameChangerImportReview(
  review: GameChangerImportReview
): ReviewValidationIssue[] {
  const issues: ReviewValidationIssue[] = []

  const includedRows = review.rows.filter(
    (row) => row.include
  )

  if (includedRows.length === 0) {
    issues.push({
      code: 'no-rows-included',
      message:
        'At least one reviewed player row must be included.',
      sourceKeys: [],
    })
  }

  for (const row of includedRows) {
    if (row.selectedPlayerId) {
      continue
    }

    issues.push({
      code: 'unresolved-player',
      message:
        `${row.sourceName} has not been assigned ` +
        `to an On Deck roster player.`,
      sourceKeys: [row.sourceKey],
    })
  }

  const duplicateAssignments =
    getDuplicatePlayerAssignments(includedRows)

  for (
    const [playerId, rows]
    of duplicateAssignments.entries()
  ) {
    issues.push({
      code: 'duplicate-player-assignment',
      message:
        'Multiple imported rows are assigned to the ' +
        'same On Deck roster player.',
      sourceKeys: rows.map(
        (row) => row.sourceKey
      ),
      playerId,
    })
  }

  return issues
}

function toResolvedRow(
  row: ReviewImportRow
): ResolvedGameChangerImportRow {
  if (!row.selectedPlayerId) {
    throw new Error(
      `Review row is unresolved: ${row.sourceName}`
    )
  }

  return {
    sourceKey: row.sourceKey,
    sourceName: row.sourceName,
    playerId: row.selectedPlayerId,
    sourceSections: row.sourceSections,

    battingOrderPosition:
      row.batting?.sourceOrder ?? null,
    atBats: row.batting?.atBats ?? null,
    runs: row.batting?.runs ?? null,
    hits: row.batting?.hits ?? null,
    runsBattedIn:
      row.batting?.runsBattedIn ?? null,
    walks: row.batting?.walks ?? null,
    battingStrikeouts:
      row.batting?.strikeouts ?? null,

    totalBases:
      row.batting?.totalBases ?? null,
    doubles:
      row.batting?.doubles ?? null,
    triples:
      row.batting?.triples ?? null,
    homeRuns:
      row.batting?.homeRuns ?? null,
    stolenBases:
      row.batting?.stolenBases ?? null,
    caughtStealing:
      row.batting?.caughtStealing ?? null,

    inningsPitched:
      row.pitching?.inningsPitched ?? null,
    inningsOuts:
      row.pitching?.inningsOuts ?? null,
    hitsAllowed:
      row.pitching?.hitsAllowed ?? null,
    runsAllowed:
      row.pitching?.runsAllowed ?? null,
    earnedRuns:
      row.pitching?.earnedRuns ?? null,
    walksAllowed:
      row.pitching?.walksAllowed ?? null,
    pitchingStrikeouts:
      row.pitching?.strikeouts ?? null,
    homeRunsAllowed:
      row.pitching?.homeRunsAllowed ?? null,

    pitchCount:
      row.pitching?.pitchCount ?? null,
    strikes:
      row.pitching?.strikes ?? null,
    battersFaced:
      row.pitching?.battersFaced ?? null,
    wildPitches:
      row.pitching?.wildPitches ?? null,
  }
}

export function buildResolvedGameChangerImportPayload(
  review: GameChangerImportReview
): ResolvedGameChangerImportPayload {
  const issues =
    validateGameChangerImportReview(review)

  if (issues.length > 0) {
    throw new Error(
      issues
        .map((issue) => issue.message)
        .join(' ')
    )
  }

  return {
    teamIndex: review.teamIndex,
    teamName: review.teamName,
    rows: review.rows
      .filter((row) => row.include)
      .map(toResolvedRow),
  }
}