import type { ParsedPlayerIdentity } from './types'

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizePlayerName(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parsePlayerLabel(label: string): ParsedPlayerIdentity {
  const sourceLabel = normalizeWhitespace(label)
  let remaining = sourceLabel

  let position: string | null = null
  const positionMatch = remaining.match(/\s*\(([^()]*)\)\s*$/)

  if (positionMatch) {
    position = normalizeWhitespace(positionMatch[1]) || null
    remaining = remaining.slice(0, positionMatch.index).trim()
  }

  let jerseyNumber: string | null = null
  const jerseyMatch = remaining.match(/\s+#([A-Za-z0-9-]+)\s*$/)

  if (jerseyMatch) {
    jerseyNumber = jerseyMatch[1]
    remaining = remaining.slice(0, jerseyMatch.index).trim()
  }

  const sourceName = normalizeWhitespace(remaining)

  if (!sourceName) {
    throw new Error(`Player label has no name: "${label}"`)
  }

  return {
    sourceLabel,
    sourceName,
    normalizedName: normalizePlayerName(sourceName),
    jerseyNumber,
    position,
  }
}