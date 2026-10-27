import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { net, safeStorage } from 'electron'
import { calendarMetadata, parseSubscription, subscriptionURL } from './calendar-feed'
import { CalendarImportError, calendarErrorMessage } from './calendar-errors'
import type { CalendarRange, CalendarSource, FocusEvent, SubscriptionSnapshot } from '../shared/focus'
import type { ImportedTask } from '../shared/imports'
import { parseCalendarTasks } from './task-feed'
import { calendarSourceCounts } from './calendar-source'

const sameRange = (a: CalendarRange | undefined, b: CalendarRange | undefined) => a?.from === b?.from && a?.to === b?.to
export function validCalendarRange(value: unknown): value is CalendarRange {
  if (!value || typeof value !== 'object') return false
  const range = value as CalendarRange
  return Number.isFinite(range.from) && Number.isFinite(range.to) && !Number.isNaN(new Date(range.from).getTime())
    && !Number.isNaN(new Date(range.to).getTime()) && range.to > range.from && range.to - range.from <= 8 * 86_400_000
}

async function downloadCalendar(initial: URL, signal: AbortSignal): Promise<string> {
  let url = initial
  for (let redirects = 0; redirects < 5; redirects++) {
    // Chromium follows Windows proxy settings, including PAC configuration.
    const response = await net.fetch(url.href, { signal, redirect: 'manual', credentials: 'omit', cache: 'no-store', headers: { Accept: 'text/calendar', 'User-Agent': 'Dayweave/0.1' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new CalendarImportError('redirect')
      if (new URL(location, url).hostname === 'accounts.google.com') throw new CalendarImportError('html')
      url = subscriptionURL(new URL(location, url).href)
      continue
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new CalendarImportError('http', String(response.status)) }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.length
        if (size > 8 * 1024 * 1024) throw new CalendarImportError('size')
        chunks.push(chunk.value)
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error }
    return Buffer.concat(chunks).toString('utf8')
  }
  throw new CalendarImportError('redirect')
}

export class CalendarSubscription {
  private url = ''
  private content = ''
  private viewedRange: CalendarRange | undefined
  private revision = 0
  private controller: AbortController | null = null
  private snapshot: SubscriptionSnapshot = { configured: false, sourceLabel: '', events: [], lastSynced: null, refreshing: false, error: '' }
  private timer: NodeJS.Timeout | null = null
  private writes: Promise<void> = Promise.resolve()
  private readonly file: string
  constructor(directory: string, private changed: (snapshot: SubscriptionSnapshot) => void, private provider: 'ical' | 'ticktick' = 'ical', storageId?: string) {
    if (storageId && !/^link-[0-9a-f-]{36}$/i.test(storageId)) throw new Error('Invalid calendar storage identity.')
    this.file = join(directory, storageId ? storageId + '.json' : provider === 'ticktick' ? 'ticktick-subscription.json' : 'calendar-subscription.json')
  }
  state() { return this.snapshot }
  matches(value: string) { try { return Boolean(this.url) && subscriptionURL(value).href === this.url } catch { return false } }
  start() {
    if (!this.timer) this.timer = setInterval(() => { if (this.url && !this.snapshot.refreshing) void this.refresh() }, (this.provider === 'ticktick' ? 1 : 5) * 60_000)
  }
  private publish() { this.changed(this.snapshot) }
  async load() {
    try {
      const stored = JSON.parse(await readFile(this.file, 'utf8'))
      this.url = safeStorage.decryptString(Buffer.from(stored.address, 'base64'))
      const url = subscriptionURL(this.url)
      const events = Array.isArray(stored.events) ? stored.events.filter((e: FocusEvent) => e && typeof e.id === 'string' && typeof e.title === 'string' && Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start && e.source === 'subscription').slice(0, 5000) : []
      const tasks = Array.isArray(stored.tasks) ? stored.tasks.filter((task: ImportedTask) => task && typeof task.id === 'string' && typeof task.title === 'string' && task.provider === this.provider).slice(0, 5000) : []
      this.snapshot = { ...this.snapshot, configured: true, sourceLabel: url.hostname, events, tasks, lastSynced: Number.isFinite(stored.lastSynced) ? stored.lastSynced : null,
        calendarName: typeof stored.calendarName === 'string' ? stored.calendarName.slice(0, 200) : '', timeZone: typeof stored.timeZone === 'string' ? stored.timeZone.slice(0, 100) : '',
        addressKind: url.pathname.includes('/public/') ? 'public' : /\/private-[^/]+\//.test(url.pathname) ? 'private' : 'other',
        sourceEventCount: Number.isFinite(stored.sourceEventCount) ? stored.sourceEventCount : undefined, sourceBusyCount: Number.isFinite(stored.sourceBusyCount) ? stored.sourceBusyCount : undefined,
        sourceTaskCount: Number.isFinite(stored.sourceTaskCount) ? stored.sourceTaskCount : undefined, sourceOtherCount: Number.isFinite(stored.sourceOtherCount) ? stored.sourceOtherCount : undefined,
        importWarnings: Array.isArray(stored.importWarnings) ? stored.importWarnings.filter((value: unknown) => typeof value === 'string') : [],
        range: validCalendarRange(stored.range) ? stored.range : undefined, redactedCount: events.filter((event: FocusEvent) => /^(busy|忙碌)$/i.test(event.title.trim())).length }
    } catch { /* A missing or invalid subscription must not stop local schedules. */ }
    this.publish()
    if (this.url) void this.refresh()
    this.start()
  }
  private enqueueWrite(action: () => Promise<void>) {
    const pending = this.writes.then(action)
    this.writes = pending.catch(() => {})
    return pending
  }
  private async persist(url: string, snapshot: SubscriptionSnapshot, revision: number) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure local storage is unavailable.')
    const body = JSON.stringify({ address: safeStorage.encryptString(url).toString('base64'), events: snapshot.events, tasks: snapshot.tasks, lastSynced: snapshot.lastSynced,
      calendarName: snapshot.calendarName, timeZone: snapshot.timeZone, range: snapshot.range,
      sourceEventCount: snapshot.sourceEventCount, sourceBusyCount: snapshot.sourceBusyCount, sourceTaskCount: snapshot.sourceTaskCount,
      sourceOtherCount: snapshot.sourceOtherCount, importWarnings: snapshot.importWarnings, addressKind: snapshot.addressKind })
    await this.enqueueWrite(async () => {
      if (revision !== this.revision) return
      await writeFile(this.file + '.tmp', body, 'utf8')
      await rename(this.file + '.tmp', this.file)
    })
  }
  private async archiveSource(text: string, revision: number) {
    if (!safeStorage.isEncryptionAvailable()) throw new CalendarImportError('storage')
    const body = JSON.stringify({ encrypted: safeStorage.encryptString(text).toString('base64'), downloadedAt: Date.now() })
    try { await this.enqueueWrite(async () => {
      if (revision !== this.revision) return
      await writeFile(this.file + '.source.json.tmp', body, 'utf8')
      await rename(this.file + '.source.json.tmp', this.file + '.source.json')
    }) } catch { throw new CalendarImportError('storage') }
  }
  async readSource(): Promise<CalendarSource> {
    try {
      const stored = JSON.parse(await readFile(this.file + '.source.json', 'utf8'))
      const text = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
      if (!text.includes('BEGIN:VCALENDAR') || Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Invalid source')
      const redacted = Boolean(this.url && text.includes(this.url))
      return { text: redacted ? text.split(this.url).join('[订阅地址已隐藏]') : text, downloadedAt: Number.isFinite(stored.downloadedAt) ? stored.downloadedAt : 0, error: '', redacted }
    } catch { return { text: '', downloadedAt: 0, error: '暂无可查看的完整源文件，请先刷新此订阅。' } }
  }
  async setRange(range: CalendarRange) {
    if (!validCalendarRange(range)) return this.snapshot
    if (sameRange(this.viewedRange, range) && sameRange(this.snapshot.range, range)) return this.snapshot
    this.viewedRange = { ...range }
    // An in-flight download reads the latest viewed range before publishing.
    if (this.snapshot.refreshing || !this.url) return this.snapshot
    return this.refresh(this.url, true)
  }
  async refresh(address = this.url, reuseContent = false) {
    if (!address) return this.snapshot
    if (this.snapshot.refreshing) return this.snapshot
    let url: URL
    try { url = subscriptionURL(address) }
    catch (error) { return { ...this.snapshot, error: calendarErrorMessage(error, false) } }
    const revision = ++this.revision
    this.controller = new AbortController()
    const controller = this.controller
    const timeout = setTimeout(() => controller.abort(), 20_000)
    this.snapshot = { ...this.snapshot, refreshing: true, error: '' }
    this.publish()
    let succeeded = false
    try {
      // Archive the complete downloaded calendar before creating display projections.
      const cached = reuseContent && url.href === this.url && Boolean(this.content)
      const text = cached ? this.content : await downloadCalendar(url, controller.signal)
      if (!cached && text.includes('BEGIN:VCALENDAR') && text.includes('END:VCALENDAR')) await this.archiveSource(text, revision)
      const report = calendarSourceCounts(text)
      let warnings: string[]
      let range: CalendarRange | undefined
      let events: FocusEvent[]
      let tasks: ImportedTask[] = []
      do {
        range = this.viewedRange && { ...this.viewedRange }
        warnings = [...report.importWarnings]
        events = await parseSubscription(text, Date.now(), range, this.provider === 'ticktick', warnings)
        tasks = await parseCalendarTasks(text, range, this.provider, this.provider === 'ticktick' ? 'TickTick' : calendarMetadata(text).calendarName || url.hostname, warnings)
        if (this.provider === 'ticktick') {
          events = events.map(event => ({ ...event, id: 'ticktick:' + event.id, provider: 'ticktick', calendarName: 'TickTick' }))
        }
      } while (revision === this.revision && !sameRange(range, this.viewedRange))
      if (revision !== this.revision) return this.snapshot
      const next: SubscriptionSnapshot = { configured: true, sourceLabel: url.hostname, events, tasks,
        lastSynced: cached ? this.snapshot.lastSynced : Date.now(), refreshing: false, error: '', range, ...calendarMetadata(text), ...report, importWarnings: [...new Set(warnings)],
        addressKind: url.pathname.includes('/public/') ? 'public' : /\/private-[^/]+\//.test(url.pathname) ? 'private' : 'other',
        redactedCount: events.filter(event => /^(busy|忙碌)$/i.test(event.title.trim())).length }
      try { await this.persist(url.href, next, revision) }
      catch { throw new CalendarImportError('storage') }
      if (revision !== this.revision) return this.snapshot
      this.url = url.href
      this.content = text
      this.snapshot = next
      succeeded = true
    } catch (error) {
      if (revision === this.revision) {
        let message = calendarErrorMessage(error, controller.signal.aborted)
        if (this.provider === 'ticktick') {
          message = message.replace('Google 日历', 'TickTick 订阅服务')
          if (error instanceof CalendarImportError && error.code === 'http') message = 'TickTick 订阅读取失败（HTTP ' + error.detail + '），请在 TickTick 中重新复制“订阅到其他日历”的链接。'
          if (error instanceof CalendarImportError && error.code === 'recurrence') message = '此 TickTick 订阅包含当前无法展开的重复任务格式。'
        }
        this.snapshot = { ...this.snapshot, refreshing: false, error: message + ' 已有日程仍会保留。' }
      }
    } finally {
      clearTimeout(timeout)
      if (revision === this.revision) {
        this.controller = null; this.publish()
        // A week may change while the previous expanded cache is being persisted.
        if (succeeded && !sameRange(this.snapshot.range, this.viewedRange)) queueMicrotask(() => { if (revision === this.revision) void this.refresh(this.url, true) })
      }
    }
    return this.snapshot
  }
  async remove() {
    // Serialize removal after any pending write so an old request cannot restore the feed.
    ++this.revision
    this.controller?.abort()
    this.url = ''
    this.content = ''
    this.snapshot = { configured: false, sourceLabel: '', events: [], lastSynced: null, refreshing: false, error: '' }
    await this.enqueueWrite(async () => { await writeFile(this.file, '{}', 'utf8'); await writeFile(this.file + '.source.json', '{}', 'utf8') })
    this.publish()
    return this.snapshot
  }
  stop() { if (this.timer) clearInterval(this.timer); ++this.revision; this.controller?.abort() }
}
