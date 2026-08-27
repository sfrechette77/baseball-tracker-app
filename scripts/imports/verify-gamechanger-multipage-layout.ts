import assert from 'node:assert/strict'

import { parseGameChangerPdfPageRows } from '../../lib/imports/gamechanger-pdf/parse-page-rows'
import type { TwoColumnPdfRow } from '../../lib/imports/gamechanger-pdf/pdf-layout'

function row(
  left: string,
  right = ''
): TwoColumnPdfRow {
  return {
    y: 0,
    left,
    right,
    all: [left, right]
      .filter(Boolean)
      .join(' '),
  }
}

const page1: TwoColumnPdfRow[] = [
  row('WPPA 13UB'),
  row('Diamond Warriors'),
  row('8 - 14', '13UB Trash Pandas'),
  row('Away Sunday August 23, 2026'),
  row('1 2 3 4 5 R H E'),
  row('DIAM 2 0 3 3 0 8 5 1'),
  row('TRSH 4 4 2 4 X 14 8 0'),

  row('BATTING'),

  row(
    'WPPA 13UB Diamond Warriors AB R H RBI BB SO',
    '13UB Trash Pandas AB R H RBI BB SO'
  ),
  row(
    'B Frechette #0 (P) 3 0 0 1 0 1',
    'L Residori #7 (P) 2 1 1 0 0 0'
  ),
  row(
    'Totals 3 0 0 1 0 1',
    'Totals 2 1 1 0 0 0'
  ),

  row('PITCHING'),

  row(
    'WPPA 13UB Diamond Warriors IP H R ER BB SO HR',
    '13UB Trash Pandas IP H R ER BB SO HR'
  ),
  row(
    'B Freche #0 2.2 3 2 2 2 4 0',
    'L Resid #7 2.0 2 1 1 1 3 0'
  ),
  row(
    'Totals 2.2 3 2 2 2 4 0',
    'Totals 2.0 2 1 1 1 3 0'
  ),
]

const page2: TwoColumnPdfRow[] = [
  row(
    'P-S: B Frechette 54-29, BF: B Frechette 16, WP: B Frechette 2'
  ),
  row(
    'Scorekeeping. Stats. Live Game Updates.'
  ),
]

const page3: TwoColumnPdfRow[] = [
  row(
    'P-S: L Residori 42-20, BF: L Residori 10, WP: L Residori 2'
  ),
  row(
    'Scorekeeping. Stats. Live Game Updates.'
  ),
]

const parsed =
  parseGameChangerPdfPageRows([
    page1,
    page2,
    page3,
  ])

assert.equal(
  parsed.game.awayTeam,
  'WPPA 13UB Diamond Warriors'
)

assert.equal(
  parsed.game.homeTeam,
  '13UB Trash Pandas'
)

assert.equal(parsed.game.awayScore, 8)
assert.equal(parsed.game.homeScore, 14)
assert.equal(parsed.game.date, '2026-08-23')

assert.equal(parsed.game.lineScore.length, 2)

assert.deepEqual(
  parsed.game.lineScore[0],
  {
    sourceTeamLabel: 'DIAM',
    innings: [2, 0, 3, 3, 0],
    runs: 8,
    hits: 5,
    errors: 1,
  }
)

assert.deepEqual(
  parsed.game.lineScore[1],
  {
    sourceTeamLabel: 'TRSH',
    innings: [4, 4, 2, 4, null],
    runs: 14,
    hits: 8,
    errors: 0,
  }
)

assert.equal(parsed.teams.length, 2)

const diamond = parsed.teams[0]
const trashPandas = parsed.teams[1]

assert.equal(
  diamond.name,
  'WPPA 13UB Diamond Warriors'
)

assert.equal(
  trashPandas.name,
  '13UB Trash Pandas'
)

assert.equal(diamond.batting.length, 1)
assert.equal(diamond.pitching.length, 1)

const freche = diamond.pitching.find(
  pitcher =>
    pitcher.normalizedName === 'b freche'
)

assert.ok(freche)

assert.equal(
  freche.sourceName,
  'B Freche'
)

assert.equal(
  freche.inningsPitched,
  '2.2'
)

assert.equal(freche.pitchCount, 54)
assert.equal(freche.strikes, 29)
assert.equal(freche.battersFaced, 16)
assert.equal(freche.wildPitches, 2)

const resid = trashPandas.pitching.find(
  pitcher =>
    pitcher.normalizedName === 'l resid'
)

assert.ok(resid)

assert.equal(
  resid.sourceName,
  'L Resid'
)

assert.equal(
  resid.inningsPitched,
  '2.0'
)

assert.equal(resid.pitchCount, 42)
assert.equal(resid.strikes, 20)
assert.equal(resid.battersFaced, 10)
assert.equal(resid.wildPitches, 2)

assert.deepEqual(parsed.warnings, [])

console.log(
  'GameChanger multipage-layout regression verified successfully.'
)