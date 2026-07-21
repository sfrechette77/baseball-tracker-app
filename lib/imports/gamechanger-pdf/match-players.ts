import {
  normalizePlayerName,
  normalizeWhitespace,
} from './normalize'
import type {
  ParsedPlayerIdentity,
  PlayerMatchCandidate,
  PlayerMatchResult,
  RosterPlayerForImport,
} from './types'

function normalizeJerseyNumber(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null
  }

  const normalized = normalizeWhitespace(value)
    .replace(/^#/, '')
    .trim()

  return normalized || null
}

function toCandidate(
  player: RosterPlayerForImport
): PlayerMatchCandidate {
  return {
    playerId: player.id,
    name: normalizeWhitespace(player.name),
    normalizedName: normalizePlayerName(player.name),
    jerseyNumber: normalizeJerseyNumber(player.jerseyNumber),
  }
}

function namesMatchByAbbreviation(
  sourceName: string,
  rosterName: string
): boolean {
  const sourceTokens = sourceName.split(' ').filter(Boolean)
  const rosterTokens = rosterName.split(' ').filter(Boolean)

  if (sourceTokens.length < 2 || rosterTokens.length < 2) {
    return false
  }

  const sourceFirst = sourceTokens[0]
  const sourceLast = sourceTokens[sourceTokens.length - 1]
  const rosterFirst = rosterTokens[0]
  const rosterLast = rosterTokens[rosterTokens.length - 1]

  const sourceUsesFirstInitial =
    sourceFirst.length === 1 &&
    rosterFirst.startsWith(sourceFirst) &&
    sourceLast === rosterLast

  const sourceUsesLastInitial =
    sourceLast.length === 1 &&
    sourceFirst === rosterFirst &&
    rosterLast.startsWith(sourceLast)

  const rosterUsesFirstInitial =
    rosterFirst.length === 1 &&
    sourceFirst.startsWith(rosterFirst) &&
    sourceLast === rosterLast

  const rosterUsesLastInitial =
    rosterLast.length === 1 &&
    sourceFirst === rosterFirst &&
    sourceLast.startsWith(rosterLast)

  return (
    sourceUsesFirstInitial ||
    sourceUsesLastInitial ||
    rosterUsesFirstInitial ||
    rosterUsesLastInitial
  )
}

function matchedResult(
  identity: ParsedPlayerIdentity,
  candidate: PlayerMatchCandidate,
  reason:
    | 'exact-name-and-jersey'
    | 'exact-name'
): PlayerMatchResult {
  return {
    sourceName: identity.sourceName,
    normalizedSourceName: identity.normalizedName,
    sourceJerseyNumber: normalizeJerseyNumber(
      identity.jerseyNumber
    ),
    status: 'matched',
    confidence: 'high',
    reason,
    playerId: candidate.playerId,
    candidates: [candidate],
  }
}

function reviewResult(
  identity: ParsedPlayerIdentity,
  candidates: PlayerMatchCandidate[],
  reason:
    | 'abbreviated-name-and-jersey'
    | 'abbreviated-name'
    | 'unique-jersey'
    | 'ambiguous-exact-name-and-jersey'
    | 'ambiguous-exact-name'
    | 'ambiguous-abbreviated-name-and-jersey'
    | 'ambiguous-abbreviated-name'
    | 'ambiguous-jersey'
): PlayerMatchResult {
  return {
    sourceName: identity.sourceName,
    normalizedSourceName: identity.normalizedName,
    sourceJerseyNumber: normalizeJerseyNumber(
      identity.jerseyNumber
    ),
    status: 'needs_review',
    confidence: 'medium',
    reason,
    playerId:
      candidates.length === 1
        ? candidates[0].playerId
        : null,
    candidates,
  }
}

export function matchParsedPlayerToRoster(
  identity: ParsedPlayerIdentity,
  rosterPlayers: RosterPlayerForImport[]
): PlayerMatchResult {
  const candidates = rosterPlayers.map(toCandidate)
  const sourceJerseyNumber = normalizeJerseyNumber(
    identity.jerseyNumber
  )

  const exactNameCandidates = candidates.filter(
    (candidate) =>
      candidate.normalizedName === identity.normalizedName
  )

  const exactNameAndJerseyCandidates =
    sourceJerseyNumber == null
      ? []
      : exactNameCandidates.filter(
          (candidate) =>
            candidate.jerseyNumber === sourceJerseyNumber
        )

  if (exactNameAndJerseyCandidates.length === 1) {
    return matchedResult(
      identity,
      exactNameAndJerseyCandidates[0],
      'exact-name-and-jersey'
    )
  }

  if (exactNameAndJerseyCandidates.length > 1) {
    return reviewResult(
      identity,
      exactNameAndJerseyCandidates,
      'ambiguous-exact-name-and-jersey'
    )
  }

  if (exactNameCandidates.length === 1) {
    return matchedResult(
      identity,
      exactNameCandidates[0],
      'exact-name'
    )
  }

  if (exactNameCandidates.length > 1) {
    return reviewResult(
      identity,
      exactNameCandidates,
      'ambiguous-exact-name'
    )
  }

  const abbreviatedNameCandidates = candidates.filter(
    (candidate) =>
      namesMatchByAbbreviation(
        identity.normalizedName,
        candidate.normalizedName
      )
  )

  const abbreviatedNameAndJerseyCandidates =
    sourceJerseyNumber == null
      ? []
      : abbreviatedNameCandidates.filter(
          (candidate) =>
            candidate.jerseyNumber === sourceJerseyNumber
        )

  if (abbreviatedNameAndJerseyCandidates.length === 1) {
    return reviewResult(
      identity,
      abbreviatedNameAndJerseyCandidates,
      'abbreviated-name-and-jersey'
    )
  }

  if (abbreviatedNameAndJerseyCandidates.length > 1) {
    return reviewResult(
      identity,
      abbreviatedNameAndJerseyCandidates,
      'ambiguous-abbreviated-name-and-jersey'
    )
  }

  if (abbreviatedNameCandidates.length === 1) {
    return reviewResult(
      identity,
      abbreviatedNameCandidates,
      'abbreviated-name'
    )
  }

  if (abbreviatedNameCandidates.length > 1) {
    return reviewResult(
      identity,
      abbreviatedNameCandidates,
      'ambiguous-abbreviated-name'
    )
  }

  if (sourceJerseyNumber != null) {
    const jerseyCandidates = candidates.filter(
      (candidate) =>
        candidate.jerseyNumber === sourceJerseyNumber
    )

    if (jerseyCandidates.length === 1) {
      return reviewResult(
        identity,
        jerseyCandidates,
        'unique-jersey'
      )
    }

    if (jerseyCandidates.length > 1) {
      return reviewResult(
        identity,
        jerseyCandidates,
        'ambiguous-jersey'
      )
    }
  }

  return {
    sourceName: identity.sourceName,
    normalizedSourceName: identity.normalizedName,
    sourceJerseyNumber,
    status: 'unmatched',
    confidence: 'none',
    reason: 'no-match',
    playerId: null,
    candidates: [],
  }
}