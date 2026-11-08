import { Util, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { recognizePdfTimetable, type PdfTextPage } from '../../shared/pdf-timetable'

export function pdfResourceOptions() {
  const base = new URL('./pdfjs/', window.location.href)
  return { cMapUrl: new URL('cmaps/', base).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', base).href, wasmUrl: new URL('wasm/', base).href, useSystemFonts: true }
}
export async function readPdfTimetable(pdf: PDFDocumentProxy) {
  const pages: PdfTextPage[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 }), content = await page.getTextContent()
    pages.push({ width: viewport.width, height: viewport.height, items: content.items.flatMap(item => {
      if (!('str' in item) || !item.str.trim()) return []
      const transform = Util.transform(viewport.transform, item.transform)
      return [{ str: item.str, x: transform[4], y: transform[5], width: item.width, height: item.height }]
    }) })
  }
  return recognizePdfTimetable(pages)
}
