import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  normalizePlayerName,
  parsePlayerLabel,
} from '../../lib/imports/gamechanger-pdf/normalize'
import {
  outsToInningsPitched,
  parseInningsPitched,
} from '../../lib/imports/gamechanger-pdf/innings'
import { parseBattingLine } from '../../lib/imports/gamechanger-pdf/parse-batting-line'
import { parsePitchingLine } from '../../lib/imports/gamechanger-pdf/parse-pitching-line'
import { parsePitchingNotes } from '../../lib/imports/gamechanger-pdf/parse-pitching-notes'

const playerWithJersey = parsePlayerLabel('L Dunton #44 (3B)')

assert.deepEqual(playerWithJersey, {
  sourceLabel: 'L Dunton #44 (3B)',
  sourceName: 'L Dunton',
  normalizedName: 'l dunton',
  jerseyNumber: '44',
  position: '3B',
})

assert.equal(
  normalizePlayerName("  O’Connor-Smith  "),
  'o connor smith'
)

const starter = parseInningsPitched('5.2')
const reliever = parseInningsPitched('1.1')

assert.equal(starter.outs, 17)
assert.equal(reliever.outs, 4)
assert.equal(
  outsToInningsPitched(starter.outs + reliever.outs),
  '7.0'
)

assert.throws(
  () => parseInningsPitched('4.3'),
  /Invalid innings-pitched value/
)

const fixturePath = resolve(
  process.cwd(),
  'scripts/fixtures/gamechanger-box-score-basic.txt'
)

const fixtureLines = readFileSync(fixturePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const firstBatter = parseBattingLine(fixtureLines[0], 1)

assert.ok(firstBatter.value)
assert.equal(firstBatter.value.sourceName, 'A Rivera')
assert.equal(firstBatter.value.jerseyNumber, '12')
assert.equal(firstBatter.value.position, 'CF')
assert.equal(firstBatter.value.atBats, 3)
assert.equal(firstBatter.value.runs, 2)
assert.equal(firstBatter.value.hits, 2)
assert.equal(firstBatter.value.runsBattedIn, 1)
assert.equal(firstBatter.value.walks, 1)
assert.equal(firstBatter.value.strikeouts, 0)

const zeroAtBatPlayer = parseBattingLine(fixtureLines[1], 2)

assert.ok(zeroAtBatPlayer.value)
assert.equal(zeroAtBatPlayer.value.sourceName, "M O'Neil")
assert.equal(zeroAtBatPlayer.value.atBats, 0)
assert.equal(zeroAtBatPlayer.value.walks, 3)

const invalidBatter = parseBattingLine(fixtureLines[2], 3)

assert.equal(invalidBatter.value, null)
assert.equal(
  invalidBatter.warnings[0]?.code,
  'invalid-batting-row'
)

const firstPitcher = parsePitchingLine(fixtureLines[3])

assert.ok(firstPitcher.value)
assert.equal(firstPitcher.value.sourceName, 'M Stone')
assert.equal(firstPitcher.value.jerseyNumber, '7')
assert.equal(firstPitcher.value.inningsPitched, '2.2')
assert.equal(firstPitcher.value.inningsOuts, 8)
assert.equal(firstPitcher.value.strikeouts, 5)

const secondPitcher = parsePitchingLine(fixtureLines[4])

assert.ok(secondPitcher.value)
assert.equal(secondPitcher.value.inningsPitched, '1.1')
assert.equal(secondPitcher.value.inningsOuts, 4)

const pitchingNotes = parsePitchingNotes(fixtureLines[5])

assert.deepEqual(pitchingNotes.pitchCounts, [
  {
    sourceName: 'M Stone',
    normalizedName: 'm stone',
    pitchCount: 48,
    strikes: 30,
  },
  {
    sourceName: 'J Cole',
    normalizedName: 'j cole',
    pitchCount: 21,
    strikes: 13,
  },
])

assert.deepEqual(pitchingNotes.wildPitches, [
  {
    sourceName: 'M Stone',
    normalizedName: 'm stone',
    value: 1,
  },
])

assert.deepEqual(pitchingNotes.battersFaced, [
  {
    sourceName: 'M Stone',
    normalizedName: 'm stone',
    value: 12,
  },
  {
    sourceName: 'J Cole',
    normalizedName: 'j cole',
    value: 6,
  },
])

assert.equal(pitchingNotes.warnings.length, 0)

console.log('GameChanger batting and pitching parser verified successfully.')