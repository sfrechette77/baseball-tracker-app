import assert from 'node:assert/strict'

import { mapGameChangerImportToCurrentPlayerStats } from '../../lib/imports/gamechanger-pdf/map-import-to-player-stats'
import type {
  ResolvedGameChangerImportPayload,
} from '../../lib/imports/gamechanger-pdf/types'

const payload: ResolvedGameChangerImportPayload = {
  teamIndex: 0,
  teamName: 'Harbor Hawks',
  rows: [
    {
      sourceKey: 'a rivera|12|1',
      sourceName: 'A Rivera',
      playerId: 'player-rivera',
      sourceSections: 'batting',

      battingOrderPosition: 1,
      atBats: 3,
      runs: 2,
      hits: 2,
      runsBattedIn: 1,
      walks: 1,
      battingStrikeouts: 0,

      totalBases: 4,
      doubles: 1,
      triples: 0,
      homeRuns: 0,
      stolenBases: 2,
      caughtStealing: 0,

      inningsPitched: null,
      inningsOuts: null,
      hitsAllowed: null,
      runsAllowed: null,
      earnedRuns: null,
      walksAllowed: null,
      pitchingStrikeouts: null,
      homeRunsAllowed: null,

      pitchCount: null,
      strikes: null,
      battersFaced: null,
      wildPitches: null,
    },
    {
      sourceKey: 'm stone|7|4',
      sourceName: 'M Stone',
      playerId: 'player-stone',
      sourceSections: 'pitching',

      battingOrderPosition: null,
      atBats: null,
      runs: null,
      hits: null,
      runsBattedIn: null,
      walks: null,
      battingStrikeouts: null,

      totalBases: null,
      doubles: null,
      triples: null,
      homeRuns: null,
      stolenBases: null,
      caughtStealing: null,

      inningsPitched: '5.2',
      inningsOuts: 17,
      hitsAllowed: 1,
      runsAllowed: 1,
      earnedRuns: 1,
      walksAllowed: 1,
      pitchingStrikeouts: 5,
      homeRunsAllowed: 0,

      pitchCount: 48,
      strikes: 30,
      battersFaced: 20,
      wildPitches: 1,
    },
  ],
}

const mapped =
  mapGameChangerImportToCurrentPlayerStats(
    payload
  )

assert.equal(mapped.stats.length, 2)

assert.deepEqual(mapped.stats[0], {
  playerId: 'player-rivera',
  batting_order_position: 1,
  at_bats: 3,
  hits: 2,
  rbi: 1,
  runs: 2,
  walks: 1,
  strikeouts: 0,
  pitch_count: 0,
  innings_pitched: 0,
  strikeouts_pitching: 0,
  walks_allowed: 0,
  hits_allowed: 0,
  earned_runs: 0,
})

assert.deepEqual(mapped.stats[1], {
  playerId: 'player-stone',
  batting_order_position: null,
  at_bats: 0,
  hits: 0,
  rbi: 0,
  runs: 0,
  walks: 0,
  strikeouts: 0,
  pitch_count: 48,
  innings_pitched: 5.2,
  strikeouts_pitching: 5,
  walks_allowed: 1,
  hits_allowed: 1,
  earned_runs: 1,
})

const riveraUnstored =
  mapped.unstoredStats.filter(
    (stat) =>
      stat.playerId === 'player-rivera'
  )

assert.deepEqual(
  riveraUnstored.map(
    (stat) => [stat.stat, stat.value]
  ),
  [
    ['totalBases', 4],
    ['doubles', 1],
    ['triples', 0],
    ['homeRuns', 0],
    ['stolenBases', 2],
    ['caughtStealing', 0],
  ]
)

const stoneUnstored =
  mapped.unstoredStats.filter(
    (stat) =>
      stat.playerId === 'player-stone'
  )

assert.deepEqual(
  stoneUnstored.map(
    (stat) => [stat.stat, stat.value]
  ),
  [
    ['runsAllowed', 1],
    ['homeRunsAllowed', 0],
    ['strikes', 30],
    ['battersFaced', 20],
    ['wildPitches', 1],
  ]
)

const invalidPayload: ResolvedGameChangerImportPayload = {
  ...payload,
  rows: [
    {
      ...payload.rows[1],
      inningsPitched: '4.3',
    },
  ],
}

assert.throws(
  () =>
    mapGameChangerImportToCurrentPlayerStats(
      invalidPayload
    ),
  /Invalid baseball innings-pitched value/
)

console.log(
  'GameChanger player-stats mapping verified successfully.'
)