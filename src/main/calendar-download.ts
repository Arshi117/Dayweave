import { net } from 'electron'
import { subscriptionURL } from './calendar-feed'
import { CalendarImportError } from './calendar-errors'

export type DownloadedResource = { kind: 'calendar'; text: string } | { kind: 'pdf'; name: string; base64: string }
const MB = 1024 * 1024
function resourceKind(bytes: Buffer): 'pdf' | 'page' | 'calendar' | 'other' {
  const prefix = bytes.subarray(0, 1024).toString('latin1').replace(/^\xef\xbb\xbf/, '').trimStart()
  if (/^<\s*(?:!doctype\s+html|html|head|body|form|script|\?xml)\b/i.test(prefix)) return 'page'
  if (/%PDF-\d\.\d/.test(prefix)) return 'pdf'
  if (/^BEGIN:VCALENDAR\b/i.test(prefix)) return 'calendar'
  return 'other'
}
function pdfName(disposition: string | null, url: URL): string {
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition || '')?.[1]
  const plain = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(disposition || '')
  let name = encoded || plain?.[1] || plain?.[2] || url.pathname.split('/').at(-1) || ''
  try { name = decodeURIComponent(name.trim()) } catch { /* A malformed filename does not invalidate the document. */ }
  // Never expose a signed URL or query string as a filename in the UI.
  name = name.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').trim().slice(0, 180)
  return /\.pdf$/i.test(name) ? name : '课表.pdf'
}

// Read bytes rather than trusting MIME types or filename extensions. School
// download endpoints often use opaque paths and application/octet-stream.
export async function downloadCalendarResource(initial: URL, signal: AbortSignal, allowPdf = false, fetchResource = net.fetch): Promise<DownloadedResource> {
  let url = subscriptionURL(initial.href)
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetchResource(url.href, { signal, redirect: 'manual', credentials: 'omit', cache: 'no-store', headers: { Accept: allowPdf ? 'text/calendar, application/pdf, */*;q=0.5' : 'text/calendar', 'User-Agent': 'Dayweave/0.1' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new CalendarImportError('redirect')
      url = subscriptionURL(new URL(location, url).href)
      if (url.hostname === 'accounts.google.com') throw new CalendarImportError('html')
      continue
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new CalendarImportError('http', String(response.status)) }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0, prefix = Buffer.alloc(0)
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.length
        if (prefix.length < 1024) prefix = Buffer.concat([prefix, Buffer.from(chunk.value.subarray(0, 1024 - prefix.length))])
        const pdf = allowPdf && resourceKind(prefix) === 'pdf'
        if (size > (pdf ? 20 : 8) * MB) throw new CalendarImportError('size', pdf ? 'pdf' : '')
        chunks.push(chunk.value)
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error }
    const bytes = Buffer.concat(chunks)
    const kind = resourceKind(bytes)
    if (kind === 'page' || kind === 'other' && /html/i.test(response.headers.get('content-type') || '')) throw new CalendarImportError('html')
    if (kind === 'pdf') {
      if (!allowPdf) throw new CalendarImportError('format')
      return { kind, name: pdfName(response.headers.get('content-disposition'), url), base64: bytes.toString('base64') }
    }
    if (kind !== 'calendar') throw new CalendarImportError('format')
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { try { text = new TextDecoder('gb18030', { fatal: true }).decode(bytes) } catch { throw new CalendarImportError('parse') } }
    return { kind, text }
  }
  throw new CalendarImportError('redirect')
}
