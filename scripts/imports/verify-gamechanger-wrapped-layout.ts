import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseGameChangerBoxScoreText } from '../../lib/imports/gamechanger-pdf/parse-box-score-text'

const fixturePath = resolve(
  process.cwd(),
  'scripts/fixtures/gamechanger-box-score-wrapped-layout.txt'
)

const fixture = readFileSync(fixturePath, 'utf8')
const parsed = parseGameChangerBoxScoreText(fixture)

assert.equal(parsed.game.date, '2025-10-12')
assert.equal(parsed.game.awayTeam, 'Harbor Hawks')
assert.equal(parsed.game.homeTeam, 'Sand Crabs 11U')
assert.equal(parsed.game.awayScore, 9)
assert.equal(parsed.game.homeScore, 0)

assert.equal(parsed.game.lineScore.length, 2)
assert.deepEqual(parsed.game.lineScore[0], {
  sourceTeamLabel: 'HRBR',
  innings: [1, 0, 0, 2, 3, 3, 0],
  runs: 9,
  hits: 6,
  errors: 0,
})

assert.deepEqual(parsed.game.lineScore[1], {
  sourceTeamLabel: 'SCRB',
  innings: [0, 0, 0, 0, 0, 0, 0],
  runs: 0,
  hits: 4,
  errors: 2,
})

assert.equal(parsed.teams.length, 2)

const harbor = parsed.teams[0]
const sandCrabs = parsed.teams[1]

assert.equal(harbor.name, 'Harbor Hawks')
assert.equal(sandCrabs.name, 'Sand Crabs 11U')

assert.equal(harbor.batting.length, 4)
assert.equal(sandCrabs.batting.length, 4)

assert.equal(harbor.leftOnBase, 5)
assert.equal(sandCrabs.leftOnBase, 4)

assert.equal(harbor.unparsedNotes.length, 1)
assert.match(harbor.unparsedNotes[0], /CS: M Carter/)
assert.match(harbor.unparsedNotes[0], /LOB: 5/)

assert.equal(sandCrabs.unparsedNotes.length, 1)
assert.match(sandCrabs.unparsedNotes[0], /3B: P Ortiz/)
assert.match(sandCrabs.unparsedNotes[0], /LOB: 4/)

assert.equal(harbor.pitching.length, 2)
assert.equal(sandCrabs.pitching.length, 2)

const mason = harbor.pitching.find(
  (pitcher) => pitcher.normalizedName === 'r mason'
)
const foster = harbor.pitching.find(
  (pitcher) => pitcher.normalizedName === 'b foster'
)
const hayes = sandCrabs.pitching.find(
  (pitcher) => pitcher.normalizedName === 'o hayes'
)
const ortiz = sandCrabs.pitching.find(
  (pitcher) => pitcher.normalizedName === 'p ortiz'
)

assert.ok(mason)
assert.ok(foster)
assert.ok(hayes)
assert.ok(ortiz)

assert.equal(mason.pitchCount, 85)
assert.equal(mason.strikes, 55)
assert.equal(mason.battersFaced, 20)

assert.equal(foster.pitchCount, 14)
assert.equal(foster.strikes, 11)
assert.equal(foster.battersFaced, 5)

assert.equal(hayes.pitchCount, 12)
assert.equal(hayes.strikes, 9)
assert.equal(hayes.battersFaced, 4)

assert.equal(ortiz.pitchCount, 36)
assert.equal(ortiz.strikes, 21)
assert.equal(ortiz.wildPitches, 3)
assert.equal(ortiz.battersFaced, 10)

/*
 * The batting table calls the second team "Sand Crabs 11U", while the
 * pitching table shortens it to "Sand Crabs". Pitching rows must still be
 * attached to the correct team based on section order.
 */
assert.equal(sandCrabs.name, 'Sand Crabs 11U')

assert.deepEqual(parsed.warnings, [])

console.log(
  'GameChanger wrapped-layout regression verified successfully.'
)
