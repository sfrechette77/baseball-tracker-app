import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseGameChangerBoxScoreText } from '../../lib/imports/gamechanger-pdf/parse-box-score-text'

const fixturePath = resolve(
  process.cwd(),
  'scripts/fixtures/gamechanger-box-score-full.txt'
)

const fixture = readFileSync(fixturePath, 'utf8')
const parsed = parseGameChangerBoxScoreText(fixture)

assert.equal(parsed.game.date, '2025-10-12')
assert.equal(parsed.game.awayTeam, 'Harbor Hawks')
assert.equal(parsed.game.homeTeam, 'River Cats 11U')
assert.equal(parsed.game.awayScore, 4)
assert.equal(parsed.game.homeScore, 1)

assert.equal(parsed.game.lineScore.length, 2)
assert.deepEqual(parsed.game.lineScore[0], {
  sourceTeamLabel: 'HHWK',
  innings: [1, 0, 1, 0, 1, 1, 0],
  runs: 4,
  hits: 3,
  errors: 1,
})

assert.equal(parsed.teams.length, 2)

const harbor = parsed.teams[0]
const river = parsed.teams[1]

assert.equal(harbor.name, 'Harbor Hawks')
assert.equal(harbor.batting.length, 3)
assert.equal(harbor.batting[0].sourceName, 'A Rivera')
assert.equal(harbor.batting[0].jerseyNumber, '12')
assert.equal(harbor.batting[1].atBats, 0)
assert.equal(harbor.batting[1].walks, 3)

assert.deepEqual(harbor.battingTotals, {
  atBats: 6,
  runs: 4,
  hits: 3,
  runsBattedIn: 3,
  walks: 4,
  strikeouts: 1,
})

assert.equal(harbor.leftOnBase, 6)
assert.equal(river.leftOnBase, 4)

assert.equal(harbor.pitching.length, 2)
assert.equal(harbor.pitchingTotals?.inningsOuts, 21)

assert.equal(harbor.pitching[0].sourceName, 'M Stone')
assert.equal(harbor.pitching[0].inningsOuts, 17)
assert.equal(harbor.pitching[0].pitchCount, 48)
assert.equal(harbor.pitching[0].strikes, 30)
assert.equal(harbor.pitching[0].wildPitches, 1)
assert.equal(harbor.pitching[0].battersFaced, 20)

assert.equal(harbor.pitching[1].sourceName, 'J Cole')
assert.equal(harbor.pitching[1].pitchCount, 21)
assert.equal(harbor.pitching[1].strikes, 13)
assert.equal(harbor.pitching[1].battersFaced, 6)

assert.equal(river.pitching.length, 1)
assert.equal(river.pitching[0].pitchCount, 76)
assert.equal(river.pitching[0].strikes, 44)
assert.equal(river.pitching[0].battersFaced, 28)

assert.deepEqual(parsed.warnings, [])

console.log(
  'GameChanger full-document parser verified successfully.'
)
