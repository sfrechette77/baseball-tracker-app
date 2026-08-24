import { buildTwoColumnPdfRows } from './pdf-layout'
import { normalizeGameChangerPdfRows } from './normalize-pdf-rows'
import { parseGameChangerBoxScoreText } from './parse-box-score-text'
import type {
  ParsedBoxScore,
} from './types'

export async function parseGameChangerPdf(
  input: ArrayBuffer | Uint8Array
): Promise<ParsedBoxScore> {
  const canvas = await import('@napi-rs/canvas')

  if (typeof globalThis.DOMMatrix === 'undefined') {
    Object.defineProperty(globalThis, 'DOMMatrix', {
      value: canvas.DOMMatrix,
      configurable: true,
      writable: true,
    })
  }

  if (typeof globalThis.ImageData === 'undefined') {
    Object.defineProperty(globalThis, 'ImageData', {
      value: canvas.ImageData,
      configurable: true,
      writable: true,
    })
  }

  if (typeof globalThis.Path2D === 'undefined') {
    Object.defineProperty(globalThis, 'Path2D', {
      value: canvas.Path2D,
      configurable: true,
      writable: true,
    })
  }

  const pdfjs = await import(
    'pdfjs-dist/legacy/build/pdf.mjs'
  )

  const pdfjsWorker = await import(
    'pdfjs-dist/legacy/build/pdf.worker.mjs'
  )

  ;(
    globalThis as typeof globalThis & {
      pdfjsWorker?: typeof pdfjsWorker
    }
  ).pdfjsWorker = pdfjsWorker

  const data =
    input instanceof Uint8Array
      ? new Uint8Array(input)
      : new Uint8Array(input)

  const pdf = await pdfjs.getDocument({ data }).promise

  if (pdf.numPages !== 1) {
    throw new Error(
      `Expected a one-page GameChanger box score, ` +
        `but found ${pdf.numPages} pages`
    )
  }

  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()

  const items = content.items
    .filter(
      (
        item
      ): item is typeof item & {
        str: string
        transform: number[]
      } =>
        'str' in item &&
        'transform' in item &&
        typeof item.str === 'string'
    )
    .map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }))

  const rows = buildTwoColumnPdfRows({
    items,
    pageWidth: viewport.width,
  })

  const normalizedText =
    normalizeGameChangerPdfRows(rows)

  return parseGameChangerBoxScoreText(
    normalizedText
  )
}
