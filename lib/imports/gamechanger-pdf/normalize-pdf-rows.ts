import type { TwoColumnPdfRow } from './pdf-layout'

const SCORE_PATTERN = /^(\d+)\s*[-–—]\s*(\d+)$/

const DATE_PATTERN =
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/

const LINE_SCORE_HEADER_PATTERN =
  /^1(?:\s+\d+)*\s+R\s+H\s+E$/

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function findRowIndex(
  rows: TwoColumnPdfRow[],
  predicate: (row: TwoColumnPdfRow) => boolean
): number {
  return rows.findIndex(predicate)
}

function collectTitleSide(
  rows: TwoColumnPdfRow[],
  scoreIndex: number,
  dateIndex: number,
  side: 'left' | 'right'
): string {
  return clean(
    rows
      .slice(0, dateIndex)
      .filter((_, index) => index !== scoreIndex)
      .map(row => row[side])
      .filter(Boolean)
      .join(' ')
  )
}

function getSectionSideLines(
  rows: TwoColumnPdfRow[],
  startIndex: number,
  endIndex: number,
  side: 'left' | 'right'
): string[] {
  return rows
    .slice(startIndex, endIndex)
    .map(row => clean(row[side]))
    .filter(Boolean)
}

function replaceSectionHeader(
  lines: string[],
  teamName: string,
  columns: string
): string[] {
  if (lines.length === 0) {
    return lines
  }

  return [
    `${teamName} ${columns}`,
    ...lines.slice(1),
  ]
}

export function normalizeGameChangerPdfRows(
  rows: TwoColumnPdfRow[]
): string {
  const scoreIndex = findRowIndex(
    rows,
    row => SCORE_PATTERN.test(row.all)
  )

  const dateIndex = findRowIndex(
    rows,
    row => DATE_PATTERN.test(row.all)
  )

  const lineScoreHeaderIndex = findRowIndex(
    rows,
    row => LINE_SCORE_HEADER_PATTERN.test(row.all)
  )

  const battingIndex = findRowIndex(
    rows,
    row => row.all === 'BATTING'
  )

  const pitchingIndex = findRowIndex(
    rows,
    row => row.all === 'PITCHING'
  )

  if (
    scoreIndex < 0 ||
    dateIndex < 0 ||
    lineScoreHeaderIndex < 0 ||
    battingIndex < 0 ||
    pitchingIndex < 0
  ) {
    throw new Error(
      'Could not recognize the expected GameChanger box-score layout'
    )
  }

  const scoreMatch = rows[scoreIndex].all.match(SCORE_PATTERN)

  if (!scoreMatch) {
    throw new Error('Could not parse the GameChanger score')
  }

  const awayTeam = collectTitleSide(
    rows,
    scoreIndex,
    dateIndex,
    'left'
  )

  const homeTeam = collectTitleSide(
    rows,
    scoreIndex,
    dateIndex,
    'right'
  )

  if (!awayTeam || !homeTeam) {
    throw new Error(
      'Could not reconstruct the GameChanger team names'
    )
  }

  const title =
    `${awayTeam} ${scoreMatch[1]} - ` +
    `${scoreMatch[2]} ${homeTeam}`

  const lineScoreRows = rows
    .slice(
      lineScoreHeaderIndex,
      lineScoreHeaderIndex + 3
    )
    .map(row => row.all)
    .filter(Boolean)

  const battingRows = rows.slice(
    battingIndex + 1,
    pitchingIndex
  )

  const battingLeft = replaceSectionHeader(
    getSectionSideLines(
      battingRows,
      0,
      battingRows.length,
      'left'
    ),
    awayTeam,
    'AB R H RBI BB SO'
  )

  const battingRight = replaceSectionHeader(
    getSectionSideLines(
      battingRows,
      0,
      battingRows.length,
      'right'
    ),
    homeTeam,
    'AB R H RBI BB SO'
  )

  const pitchingRows = rows.slice(pitchingIndex + 1)

  const pitchingLeft = replaceSectionHeader(
    getSectionSideLines(
      pitchingRows,
      0,
      pitchingRows.length,
      'left'
    ),
    awayTeam,
    'IP H R ER BB SO HR'
  )

  const pitchingRight = replaceSectionHeader(
    getSectionSideLines(
      pitchingRows,
      0,
      pitchingRows.length,
      'right'
    ),
    homeTeam,
    'IP H R ER BB SO HR'
  )

  return [
    title,
    rows[dateIndex].all,
    ...lineScoreRows,
    'BATTING',
    ...battingLeft,
    ...battingRight,
    'PITCHING',
    ...pitchingLeft,
    ...pitchingRight,
  ].join('\n')
}
