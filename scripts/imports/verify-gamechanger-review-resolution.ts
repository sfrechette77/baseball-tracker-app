import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildGameChangerImportReview } from '../../lib/imports/gamechanger-pdf/build-import-review'
import { parseGameChangerBoxScoreText } from '../../lib/imports/gamechanger-pdf/parse-box-score-text'
import {
  buildResolvedGameChangerImportPayload,
  selectGameChangerReviewPlayer,
  setGameChangerReviewRowIncluded,
  validateGameChangerImportReview,
} from '../../lib/imports/gamechanger-pdf/resolve-import-review'
import type {
  RosterPlayerForImport,
} from '../../lib/imports/gamechanger-pdf/types'

const fixturePath = resolve(
  process.cwd(),
  'scripts/fixtures/gamechanger-box-score-full.txt'
)

const fixture = readFileSync(
  fixturePath,
  'utf8'
)

const parsed =
  parseGameChangerBoxScoreText(fixture)

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

let review = buildGameChangerImportReview(
  parsed,
  0,
  roster
)

assert.equal(review.readyToImport, false)
assert.equal(
  validateGameChangerImportReview(review)
    .filter(
      (issue) =>
        issue.code === 'unresolved-player'
    ).length,
  3
)

const oneil = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'm o neil'
)

const banks = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'c banks'
)

const cole = review.rows.find(
  (row) =>
    row.normalizedSourceName === 'j cole'
)

assert.ok(oneil)
assert.ok(banks)
assert.ok(cole)

review = selectGameChangerReviewPlayer(
  review,
  oneil.sourceKey,
  'player-oneil'
)

review = setGameChangerReviewRowIncluded(
  review,
  banks.sourceKey,
  false
)

review = selectGameChangerReviewPlayer(
  review,
  cole.sourceKey,
  'player-cole'
)

assert.equal(
  review.summary.requiresResolution,
  0
)
assert.equal(review.readyToImport, true)
assert.deepEqual(
  validateGameChangerImportReview(review),
  []
)

const payload =
  buildResolvedGameChangerImportPayload(review)

assert.equal(payload.teamIndex, 0)
assert.equal(payload.teamName, 'Harbor Hawks')
assert.equal(payload.rows.length, 4)

const rivera = payload.rows.find(
  (row) => row.playerId === 'player-rivera'
)

assert.ok(rivera)
assert.equal(rivera.sourceSections, 'batting')
assert.equal(rivera.battingOrderPosition, 1)
assert.equal(rivera.atBats, 3)
assert.equal(rivera.runs, 2)
assert.equal(rivera.hits, 2)
assert.equal(rivera.runsBattedIn, 1)
assert.equal(rivera.walks, 1)
assert.equal(rivera.battingStrikeouts, 0)
assert.equal(rivera.inningsPitched, null)

const stone = payload.rows.find(
  (row) => row.playerId === 'player-stone'
)

assert.ok(stone)
assert.equal(stone.sourceSections, 'pitching')
assert.equal(stone.inningsPitched, '5.2')
assert.equal(stone.inningsOuts, 17)
assert.equal(stone.pitchCount, 48)
assert.equal(stone.strikes, 30)
assert.equal(stone.battersFaced, 20)
assert.equal(stone.wildPitches, 1)
assert.equal(stone.atBats, null)

/*
 * Duplicate assignments must prevent import.
 */
const duplicateReview =
  selectGameChangerReviewPlayer(
    review,
    cole.sourceKey,
    'player-stone'
  )

const duplicateIssues =
  validateGameChangerImportReview(
    duplicateReview
  )

assert.equal(
  duplicateIssues.some(
    (issue) =>
      issue.code ===
      'duplicate-player-assignment'
  ),
  true
)

assert.throws(
  () =>
    buildResolvedGameChangerImportPayload(
      duplicateReview
    ),
  /Multiple imported rows/
)

/*
 * Excluding every row must also prevent import.
 */
const emptyReview = review.rows.reduce(
  (currentReview, row) =>
    setGameChangerReviewRowIncluded(
      currentReview,
      row.sourceKey,
      false
    ),
  review
)

assert.equal(emptyReview.readyToImport, false)

assert.equal(
  validateGameChangerImportReview(
    emptyReview
  ).some(
    (issue) =>
      issue.code === 'no-rows-included'
  ),
  true
)

console.log(
  'GameChanger review resolution verified successfully.'
)