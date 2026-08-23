import { normalizePlayerName, normalizeWhitespace } from './normalize'
import type {
  ParsedNamedCountNote,
  ParsedPitchCountNote,
  ParsedPitchingNotes,
  ParseWarning,
} from './types'

const PARSED_NOTE_CATEGORIES = new Set([
  'P-S',
  'BF',
  'WP',
])

type CategorySection = {
  category: string
  content: string
}

const CATEGORY_PATTERN =
  /(?:^|,\s*)(P-S|[A-Z0-9][A-Z0-9-]*):\s*/g

function splitCategorySections(rawText: string): CategorySection[] {
  const text = normalizeWhitespace(rawText)
  const matches = Array.from(text.matchAll(CATEGORY_PATTERN))
  const sections: CategorySection[] = []

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const next = matches[index + 1]

    const category = current[1]
    const contentStart = (current.index ?? 0) + current[0].length
    const contentEnd = next?.index ?? text.length

    sections.push({
      category,
      content: text.slice(contentStart, contentEnd).replace(/^,\s*/, '').trim(),
    })
  }

  return sections
}

function parsePitchCountEntry(
  entry: string
): ParsedPitchCountNote | null {
  const match = normalizeWhitespace(entry).match(/^(.*?)\s+(\d+)-(\d+)$/)

  if (!match) {
    return null
  }

  const sourceName = normalizeWhitespace(match[1])

  return {
    sourceName,
    normalizedName: normalizePlayerName(sourceName),
    pitchCount: Number(match[2]),
    strikes: Number(match[3]),
  }
}

function parseNamedCountEntry(
  entry: string
): ParsedNamedCountNote | null {
  const match = normalizeWhitespace(entry).match(/^(.*?)\s+(\d+)$/)

  if (!match) {
    return null
  }

  const sourceName = normalizeWhitespace(match[1])

  return {
    sourceName,
    normalizedName: normalizePlayerName(sourceName),
    value: Number(match[2]),
  }
}

function parseWildPitchEntry(
  entry: string
): ParsedNamedCountNote | null {
  const explicitCount = parseNamedCountEntry(entry)

  if (explicitCount) {
    return explicitCount
  }

  const sourceName = normalizeWhitespace(entry)

  if (!sourceName) {
    return null
  }

  return {
    sourceName,
    normalizedName: normalizePlayerName(sourceName),
    value: 1,
  }
}

export function parsePitchingNotes(rawText: string): ParsedPitchingNotes {
  const pitchCounts: ParsedPitchCountNote[] = []
  const battersFaced: ParsedNamedCountNote[] = []
  const wildPitches: ParsedNamedCountNote[] = []
  const warnings: ParseWarning[] = []

  const sections = splitCategorySections(rawText)

  if (sections.length === 0) {
    return {
      pitchCounts,
      battersFaced,
      wildPitches,
      warnings: [
        {
          code: 'no-pitching-note-categories',
          message: 'No recognized P-S, BF, or WP categories were found.',
          severity: 'warning',
          sourceLine: rawText,
        },
      ],
    }
  }

  for (const section of sections) {
    if (!PARSED_NOTE_CATEGORIES.has(section.category)) {
      continue
    }

    const entries = section.content
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)

    for (const entry of entries) {
      if (section.category === 'P-S') {
        const parsed = parsePitchCountEntry(entry)

        if (parsed) {
          pitchCounts.push(parsed)
        } else {
          warnings.push({
            code: 'invalid-pitch-count-note',
            message: `Could not parse pitch-count note: "${entry}"`,
            severity: 'warning',
            sourceLine: rawText,
          })
        }

        continue
      }

      const parsed =
        section.category === 'WP'
          ? parseWildPitchEntry(entry)
          : parseNamedCountEntry(entry)

      if (!parsed) {
        warnings.push({
          code: `invalid-${section.category.toLowerCase()}-note`,
          message: `Could not parse ${section.category} note: "${entry}"`,
          severity: 'warning',
          sourceLine: rawText,
        })

        continue
      }

      if (section.category === 'BF') {
        battersFaced.push(parsed)
      } else {
        wildPitches.push(parsed)
      }
    }
  }

  return {
    pitchCounts,
    battersFaced,
    wildPitches,
    warnings,
  }
}