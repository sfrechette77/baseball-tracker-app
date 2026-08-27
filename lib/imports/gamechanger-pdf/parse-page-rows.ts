import type { TwoColumnPdfRow } from './pdf-layout'
import { normalizeGameChangerPdfRows } from './normalize-pdf-rows'
import { parseGameChangerBoxScoreText } from './parse-box-score-text'
import type { ParsedBoxScore } from './types'

export function parseGameChangerPdfPageRows(
  pageRows: TwoColumnPdfRow[][]
): ParsedBoxScore {
  const firstPageRows = pageRows[0]

  if (!firstPageRows) {
    throw new Error('GameChanger PDF contains no pages')
  }

  const normalizedText =
    normalizeGameChangerPdfRows(firstPageRows)

  const continuationLines = pageRows
    .slice(1)
    .flatMap(rows =>
      rows
        .map(row => row.all)
        .filter(
          line =>
            line &&
            !/^Scorekeeping\. Stats\. Live Game Updates\.$/i.test(
              line
            )
        )
    )

  return parseGameChangerBoxScoreText(
    [
      normalizedText,
      ...continuationLines,
    ].join('\n')
  )
}