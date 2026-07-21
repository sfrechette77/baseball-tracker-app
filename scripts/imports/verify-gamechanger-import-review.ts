import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildGameChangerImportReview } from '../../lib/imports/gamechanger-pdf/build-import-review'
import { parseGameChangerBoxScoreText } from '../../lib/imports/gamechanger-pdf/parse-box-score-text'
import type { RosterPlayerForImport } from '../../lib/imports/gamechanger-pdf/types'

const fixturePath = resolve(
  process.cwd(),
  'scripts/fixtures/gamechanger-box-score-full.txt'
)

const fixture = readFileSync(fixturePath, 'utf8')
const parsed = parseGameChangerBoxScoreText(fixture)

const roster: RosterPlayerForImport[] = [
  {
    id: 'player-rivera',
    name: 'A Rivera',
    jerseyNumber: '12',
  },
  {
    id: 'player-oneil',
    name: "Morgan O'Neil",
    jerseyNumber: null,
  },
  {
    id: 'player-stone',
    name: 'M Stone',
    jerseyNumber: '7',
  },
  {
    id: 'player-cole',
    name: 'Jordan Cole',
    jerseyNumber: null,
  },
]

const review = buildGameChangerImportReview(
  parsed,
  0,
  roster
)

assert.equal(review.teamName, 'Harbor Hawks')
assert.equal(review.rows.length, 5)

assert.deepEqual(review.summary, {
  totalRows: 5,
  matched: 2,
  needsReview: 2,
  unmatched: 1,
  requiresResolution: 3,
})

assert.equal(review.readyToImport, false)

const rivera = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'a rivera'
)

assert.ok(rivera)
assert.equal(rivera.sourceSections, 'batting')
assert.equal(rivera.match.status, 'matched')
assert.equal(
  rivera.selectedPlayerId,
  'player-rivera'
)

const oneil = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'm o neil'
)

assert.ok(oneil)
assert.equal(
  oneil.match.status,
  'needs_review'
)
assert.equal(
  oneil.suggestedPlayerId,
  'player-oneil'
)
assert.equal(oneil.selectedPlayerId, null)

const banks = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'c banks'
)

assert.ok(banks)
assert.equal(banks.match.status, 'unmatched')
assert.equal(banks.suggestedPlayerId, null)
assert.equal(banks.selectedPlayerId, null)

const stone = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'm stone'
)

assert.ok(stone)
assert.equal(stone.sourceSections, 'pitching')
assert.equal(stone.match.status, 'matched')
assert.equal(
  stone.selectedPlayerId,
  'player-stone'
)
assert.equal(stone.pitching?.pitchCount, 48)
assert.equal(stone.pitching?.strikes, 30)

const cole = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'j cole'
)

assert.ok(cole)
assert.equal(cole.sourceSections, 'pitching')
assert.equal(
  cole.match.status,
  'needs_review'
)
assert.equal(
  cole.suggestedPlayerId,
  'player-cole'
)
assert.equal(cole.selectedPlayerId, null)

/*
 * Verify that one player appearing in both sections becomes
 * one review row instead of separate batting and pitching rows.
 */
const combinedFixture = `
Alpha Club 1 - 0 Beta Club
Away Sunday October 12, 2025
1 R H E
ALPH 1 1 0 0
BETA 0 0 0 0
BATTING
Alpha Club AB R H RBI BB SO
A Rivera #12 (P) 1 1 1 1 0 0
Totals 1 1 1 1 0 0
Beta Club AB R H RBI BB SO
B Hitter 1 0 0 0 0 1
Totals 1 0 0 0 0 1
PITCHING
Alpha Club IP H R ER BB SO HR
A Rivera #12 1.0 0 0 0 0 2 0
Totals 1.0 0 0 0 0 2 0
Beta Club IP H R ER BB SO HR
B Pitcher 1.0 1 1 1 0 0 0
Totals 1.0 1 1 1 0 0 0
`

const combinedParsed =
  parseGameChangerBoxScoreText(combinedFixture)

const combinedReview =
  buildGameChangerImportReview(
    combinedParsed,
    0,
    [
      {
        id: 'player-combined-rivera',
        name: 'A Rivera',
        jerseyNumber: '12',
      },
    ]
  )

assert.equal(combinedReview.rows.length, 1)

const combinedRivera = combinedReview.rows[0]

assert.equal(combinedRivera.sourceSections, 'both')
assert.ok(combinedRivera.batting)
assert.ok(combinedRivera.pitching)
assert.equal(
  combinedRivera.selectedPlayerId,
  'player-combined-rivera'
)
assert.equal(combinedReview.readyToImport, true)

console.log(
  'GameChanger import review model verified successfully.'
)