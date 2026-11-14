import type { PDFPageProxy } from 'pdfjs-dist'
import type { OcrCrop } from '@shared/ocr'

export interface PdfTextGlyph { text: string; x: number; y: number; end: boolean; run: number }
/** Derive display coordinates through the same viewport as the raster, including page rotation.
 * PDF text runs do not expose glyph advances: estimate within-run advances with font metrics.
 * Extraction is deliberately a reviewable candidate, never an OCR/semantic result.
 */
export async function pdfTextGlyphs(page: PDFPageProxy, viewport: ReturnType<PDFPageProxy['getViewport']>): Promise<PdfTextGlyph[]> {
  const content = await page.getTextContent(), result: PdfTextGlyph[] = []
  const measure = document.createElement('canvas').getContext('2d')!
  let run = 0
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue
    const chars = Array.from(item.str), t = item.transform, style = content.styles[item.fontName]
    const length = Math.hypot(t[0], t[1]) || 1, height = Math.hypot(t[2], t[3]) || item.height || 1
    measure.font = `100px ${style?.fontFamily || 'sans-serif'}`
    const widths = chars.map((c) => Math.max(measure.measureText(c).width, 1)), total = widths.reduce((a, b) => a + b, 0)
    const vertical = style?.vertical === true
    const advance = vertical ? item.height : item.width
    const dx = vertical ? -t[2] / height : t[0] / length, dy = vertical ? -t[3] / height : t[1] / length
    const ascent = style?.ascent ?? 0.8, descent = style?.descent ?? -0.2
    let consumed = 0
    chars.forEach((char, index) => {
      const offset = (consumed + widths[index] / 2) / total * advance
      const center = (ascent + descent) / 2
      const x = t[4] + dx * offset + (vertical ? t[0] : t[2]) * center
      const y = t[5] + dy * offset + (vertical ? t[1] : t[3]) * center
      const point = viewport.convertToViewportPoint(x, y)
      result.push({ text: char, x: point[0] / viewport.width, y: point[1] / viewport.height, end: index === chars.length - 1 && item.hasEOL, run })
      consumed += widths[index]
    })
    run++
  }
  return result
}
export function extractSelectionText(glyphs: PdfTextGlyph[], crop: OcrCrop | null): string {
  const selected = glyphs.filter((g) => !crop || g.x >= crop.x && g.x <= crop.x + crop.width && g.y >= crop.y && g.y <= crop.y + crop.height)
  let result = '', previous: PdfTextGlyph | undefined
  for (const glyph of selected) {
    if (previous && glyph.run !== previous.run && !result.endsWith('\n')) result += Math.abs(glyph.y - previous.y) > 0.008 ? '\n' : ' '
    result += glyph.text + (glyph.end ? '\n' : '')
    previous = glyph
  }
  return result.trim()
}
