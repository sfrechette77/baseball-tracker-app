import assert from 'node:assert/strict'

import { matchParsedPlayerToRoster } from '../../lib/imports/gamechanger-pdf/match-players'
import { parsePlayerLabel } from '../../lib/imports/gamechanger-pdf/normalize'
import type { RosterPlayerForImport } from '../../lib/imports/gamechanger-pdf/types'

const roster: RosterPlayerForImport[] = [
  {
    id: 'player-ben',
    name: 'Benjamin Frechette',
    jerseyNumber: '12',
  },
  {
    id: 'player-nolan',
    name: 'Nolan Reed',
    jerseyNumber: '25',
  },
  {
    id: 'player-alex-7',
    name: 'Alex Rivera',
    jerseyNumber: '7',
  },
  {
    id: 'player-alex-18',
    name: 'Alex Rivera',
    jerseyNumber: '18',
  },
  {
    id: 'player-jordan',
    name: 'Jordan Cole',
    jerseyNumber: null,
  },
  {
    id: 'player-sam',
    name: 'Sam Stone',
    jerseyNumber: '44',
  },
  {
    id: 'player-taylor',
    name: 'Taylor Moss',
    jerseyNumber: '44',
  },
]

const exactNameAndJersey = matchParsedPlayerToRoster(
  parsePlayerLabel('Benjamin Frechette #12 (SS)'),
  roster
)

assert.equal(exactNameAndJersey.status, 'matched')
assert.equal(exactNameAndJersey.confidence, 'high')
assert.equal(
  exactNameAndJersey.reason,
  'exact-name-and-jersey'
)
assert.equal(
  exactNameAndJersey.playerId,
  'player-ben'
)

const exactName = matchParsedPlayerToRoster(
  parsePlayerLabel('Jordan Cole'),
  roster
)

assert.equal(exactName.status, 'matched')
assert.equal(exactName.reason, 'exact-name')
assert.equal(exactName.playerId, 'player-jordan')

const firstInitialAndSurname = matchParsedPlayerToRoster(
  parsePlayerLabel('B Frechette #12'),
  roster
)

assert.equal(
  firstInitialAndSurname.status,
  'needs_review'
)
assert.equal(
  firstInitialAndSurname.reason,
  'abbreviated-name-and-jersey'
)
assert.equal(
  firstInitialAndSurname.playerId,
  'player-ben'
)

const firstNameAndLastInitial =
  matchParsedPlayerToRoster(
    parsePlayerLabel('Nolan R #25 (P)'),
    roster
  )

assert.equal(
  firstNameAndLastInitial.status,
  'needs_review'
)
assert.equal(
  firstNameAndLastInitial.reason,
  'abbreviated-name-and-jersey'
)
assert.equal(
  firstNameAndLastInitial.playerId,
  'player-nolan'
)

const abbreviatedDuplicateNameWithJersey =
  matchParsedPlayerToRoster(
    parsePlayerLabel('A Rivera #7'),
    roster
  )

assert.equal(
  abbreviatedDuplicateNameWithJersey.status,
  'needs_review'
)
assert.equal(
  abbreviatedDuplicateNameWithJersey.reason,
  'abbreviated-name-and-jersey'
)
assert.equal(
  abbreviatedDuplicateNameWithJersey.playerId,
  'player-alex-7'
)

const ambiguousExactName = matchParsedPlayerToRoster(
  parsePlayerLabel('Alex Rivera'),
  roster
)

assert.equal(
  ambiguousExactName.status,
  'needs_review'
)
assert.equal(
  ambiguousExactName.reason,
  'ambiguous-exact-name'
)
assert.equal(ambiguousExactName.playerId, null)
assert.equal(ambiguousExactName.candidates.length, 2)

const uniqueJerseyOnly = matchParsedPlayerToRoster(
  parsePlayerLabel('Unknown Player #18'),
  roster
)

assert.equal(uniqueJerseyOnly.status, 'needs_review')
assert.equal(uniqueJerseyOnly.reason, 'unique-jersey')
assert.equal(
  uniqueJerseyOnly.playerId,
  'player-alex-18'
)

const ambiguousJersey = matchParsedPlayerToRoster(
  parsePlayerLabel('Unknown Player #44'),
  roster
)

assert.equal(ambiguousJersey.status, 'needs_review')
assert.equal(ambiguousJersey.reason, 'ambiguous-jersey')
assert.equal(ambiguousJersey.playerId, null)
assert.equal(ambiguousJersey.candidates.length, 2)

const unmatched = matchParsedPlayerToRoster(
  parsePlayerLabel('Mystery Player #99'),
  roster
)

assert.equal(unmatched.status, 'unmatched')
assert.equal(unmatched.confidence, 'none')
assert.equal(unmatched.reason, 'no-match')
assert.equal(unmatched.playerId, null)
assert.deepEqual(unmatched.candidates, [])

console.log(
  'GameChanger player matching verified successfully.'
)