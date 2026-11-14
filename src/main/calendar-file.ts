import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import ical from 'node-ical'
import { calendarMetadata, parseSubscription } from './calendar-feed'
import { calendarSourceCounts } from './calendar-source'
import { parseCalendarTasks } from './task-feed'
import { CalendarImportError, calendarErrorMessage } from './calendar-errors'
import type { CalendarRange, CalendarSource, SubscriptionSnapshot } from '../shared/focus'
import type { CalendarFilePreview } from '../shared/calendar-files'

const empty = (): SubscriptionSnapshot => ({ configured: false, sourceLabel: '', events: [], tasks: [], lastSynced: null, refreshing: false, error: '', connectionType: 'file' })
const sameRange = (a?: CalendarRange, b?: CalendarRange) => a?.from === b?.from && a?.to === b?.to
export const validCalendarFile = (name: unknown, text: unknown): name is string => typeof name === 'string' && name.length > 0 && name.length <= 255 && !/[\r\n\0/\\]/.test(name) && typeof text === 'string' && Buffer.byteLength(text) <= 8 * 1024 * 1024

export async function projectCalendarFile(text: string, name: string, id: string, range?: CalendarRange): Promise<SubscriptionSnapshot> {
  const report = calendarSourceCounts(text), warnings = [...report.importWarnings]
  const events = await parseSubscription(text, Date.now(), range, false, warnings)
  const metadata = calendarMetadata(text)
  const tasks = await parseCalendarTasks(text, range, 'ical', metadata.calendarName || name, warnings)
  if (!metadata.sourceEventCount && !report.sourceTaskCount) throw new CalendarImportError('format')
  return { ...empty(), configured: true, sourceLabel: name,
    ...metadata, calendarName: metadata.calendarName || name.replace(/\.(ics|ical)$/i, ''), ...report, range, importWarnings: [...new Set(warnings)],
    // The source identity makes replacements stable and independent files removable separately.
    events: events.map(event => ({ ...event, id: id + ':' + event.id, provider: 'ical' })),
    tasks: tasks.map(task => ({ ...task, id: id + ':' + task.id })) }
}
export async function previewCalendarFile(text: string, name: string, id: string): Promise<Omit<CalendarFilePreview, 'token'>> {
  const data = await ical.async.parseICS(text).catch(() => { throw new CalendarImportError('parse') })
  const first = Object.values(data).flatMap(item => item?.type === 'VEVENT' && item.start instanceof Date && Number.isFinite(item.start.getTime()) ? [item.start.getTime()] : []).sort((a, b) => a - b)[0]
  const range = Number.isFinite(first) ? { from: first, to: first + 7 * 86400000 } : undefined
  const snapshot = await projectCalendarFile(text, name, id, range)
  return { name, eventCount: snapshot.sourceEventCount || 0, taskCount: snapshot.sourceTaskCount || 0, examples: snapshot.events.slice(0, 8), warnings: snapshot.importWarnings || [], error: '' }
}
export function fileImportError(error: unknown): string {
  if (error instanceof CalendarImportError) {
    if (error.code === 'format' || error.code === 'html') return '文件中没有可读取的日历事件或待办，请选择学校导出的 ICS 文件。'
    if (error.code === 'parse') return '文件中的日期或重复规则无法解析，请检查学校导出的 ICS 文件。'
    return calendarErrorMessage(error, false)
  }
  return '文件未能保存，请检查本机存储后重试。'
}

export class CalendarFileSource {
  private snapshot = empty()
  private text = ''
  private name = ''
  private range: CalendarRange | undefined
  private readonly file: string
  constructor(directory: string, private changed: () => void, private id: string) {
    if (!/^link-[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid calendar storage identity.')
    this.file = join(directory, id + '.json')
  }
  state() { return this.snapshot }
  matches(_value: string) { return false }
  matchesText(value: string) { return Boolean(this.text) && value === this.text }
  start() { /* File imports are snapshots and never poll the network. */ }
  stop() {}
  async load() {
    try {
      const stored = JSON.parse(await readFile(this.file, 'utf8'))
      const text = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
      if (!validCalendarFile(stored.name, text)) throw new Error('Invalid calendar file.')
      this.text = text; this.name = stored.name
      await this.refresh()
      this.snapshot.lastSynced = Number.isFinite(stored.importedAt) ? stored.importedAt : null
    } catch { this.snapshot = { ...empty(), error: '本地日历文件无法读取，请重新导入或移除此来源。' } }
    this.changed()
  }
  async save(text: string, name: string) {
    let snapshot = await projectCalendarFile(text, name, this.id, this.range)
    if (!safeStorage.isEncryptionAvailable()) throw new CalendarImportError('storage')
    const importedAt = Date.now()
    await writeFile(this.file + '.tmp', JSON.stringify({ name, importedAt, encrypted: safeStorage.encryptString(text).toString('base64') }), 'utf8')
    await rename(this.file + '.tmp', this.file)
    this.text = text; this.name = name
    // Range navigation may finish while storage is being written.
    while (!sameRange(snapshot.range, this.range)) snapshot = await projectCalendarFile(text, name, this.id, this.range)
    this.snapshot = { ...snapshot, lastSynced: importedAt }; this.changed()
  }
  async refresh() {
    if (!this.text) return this.snapshot
    const text = this.text, name = this.name
    let snapshot: SubscriptionSnapshot
    do { snapshot = await projectCalendarFile(text, name, this.id, this.range) } while (this.text === text && !sameRange(snapshot.range, this.range))
    if (this.text !== text) return this.snapshot
    this.snapshot = { ...snapshot, lastSynced: this.snapshot.lastSynced }; this.changed()
    return this.snapshot
  }
  async setRange(range: CalendarRange) { this.range = { ...range }; return this.refresh() }
  async readSource(): Promise<CalendarSource> { return { text: this.text, downloadedAt: this.snapshot.lastSynced || 0, error: this.text ? '' : '请重新导入此来源。' } }
  async remove() { await writeFile(this.file, '{}', 'utf8'); this.text = ''; this.snapshot = empty(); this.changed(); return this.snapshot }
}
