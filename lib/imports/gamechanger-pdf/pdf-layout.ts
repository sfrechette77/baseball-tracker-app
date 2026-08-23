export type PositionedPdfText = {
  text: string
  x: number
  y: number
}

export type TwoColumnPdfRow = {
  y: number
  left: string
  right: string
  all: string
}

type PositionedItem = PositionedPdfText & {
  normalizedText: string
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function joinItems(items: PositionedItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map(item => item.normalizedText)
    .filter(text => text && text !== '…' && text !== '...')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildTwoColumnPdfRows(input: {
  items: PositionedPdfText[]
  pageWidth: number
  yTolerance?: number
}): TwoColumnPdfRow[] {
  const {
    items,
    pageWidth,
    yTolerance = 2,
  } = input

  const midpoint = pageWidth / 2

  const normalizedItems: PositionedItem[] = items
    .map(item => ({
      ...item,
      normalizedText: normalizeText(item.text),
    }))
    .filter(item => item.normalizedText)

  normalizedItems.sort((a, b) => {
    if (Math.abs(a.y - b.y) <= yTolerance) {
      return a.x - b.x
    }

    return b.y - a.y
  })

  const groups: {
    y: number
    items: PositionedItem[]
  }[] = []

  for (const item of normalizedItems) {
    const current = groups.at(-1)

    if (
      current &&
      Math.abs(current.y - item.y) <= yTolerance
    ) {
      current.items.push(item)
      continue
    }

    groups.push({
      y: item.y,
      items: [item],
    })
  }

  return groups.map(group => {
    const leftItems = group.items.filter(
      item => item.x < midpoint
    )

    const rightItems = group.items.filter(
      item => item.x >= midpoint
    )

    return {
      y: group.y,
      left: joinItems(leftItems),
      right: joinItems(rightItems),
      all: joinItems(group.items),
    }
  })
}
