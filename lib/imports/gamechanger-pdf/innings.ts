export type ParsedInnings = {
  display: string
  outs: number
}

export function parseInningsPitched(value: string): ParsedInnings {
  const normalized = value.trim()
  const match = normalized.match(/^(\d+)(?:\.([012]))?$/)

  if (!match) {
    throw new Error(`Invalid innings-pitched value: "${value}"`)
  }

  const completeInnings = Number(match[1])
  const partialOuts = Number(match[2] ?? '0')

  return {
    display: `${completeInnings}.${partialOuts}`,
    outs: completeInnings * 3 + partialOuts,
  }
}

export function outsToInningsPitched(outs: number): string {
  if (!Number.isInteger(outs) || outs < 0) {
    throw new Error(`Invalid outs value: ${outs}`)
  }

  const completeInnings = Math.floor(outs / 3)
  const partialOuts = outs % 3

  return `${completeInnings}.${partialOuts}`
}