import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { CalendarSubscription } from './calendar-subscription'
import { identifyImportLink, type CalendarLinksState, type CalendarLinkResult } from '../shared/import-links'
import type { CalendarRange } from '../shared/focus'
import { CalendarFileSource, fileImportError, previewCalendarFile, validCalendarFile } from './calendar-file'
import type { CalendarFilePreview } from '../shared/calendar-files'
import { downloadCalendarResource } from './calendar-download'
import { subscriptionURL } from './calendar-feed'
import { CalendarImportError, calendarErrorMessage } from './calendar-errors'

export class CalendarLinks {
  private links = new Map<string, { provider: 'ical' | 'ticktick'; feed: CalendarSubscription | CalendarFileSource }>()
  private draft: { token: string; name: string; text: string; id: string; replaceId?: string } | null = null
  private draftRevision = 0
  private error = ''
  private busy = false
  private stopped = false
  private range: CalendarRange | undefined
  private adding: CalendarSubscription | CalendarFileSource | null = null
  private downloadController: AbortController | null = null
  private file: string
  constructor(private directory: string, private changed: (state: CalendarLinksState) => void) { this.file = join(directory, 'calendar-links.json') }
  state(): CalendarLinksState { return { sources: [...this.links].map(([id, item]) => ({ id, provider: item.provider, kind: item.feed instanceof CalendarFileSource ? 'file' : 'feed', snapshot: item.feed.state() })), error: this.error } }
  private publish() { if (!this.stopped) this.changed(this.state()) }
  private create(id: string, provider: 'ical' | 'ticktick') {
    return new CalendarSubscription(this.directory, () => { if (this.links.has(id)) this.publish() }, provider, id)
  }
  private registry() { return [...this.links].map(([id, item]) => ({ id, provider: item.provider, kind: item.feed instanceof CalendarFileSource ? 'file' : 'feed' })) }
  private async persist(items = this.registry()) {
    await writeFile(this.file + '.tmp', JSON.stringify({ sources: items }), 'utf8')
    await rename(this.file + '.tmp', this.file)
  }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      if (Array.isArray(data.sources)) for (const item of data.sources.slice(0, 10)) {
        if (!item || !/^link-[0-9a-f-]{36}$/i.test(item.id) || !['ical', 'ticktick'].includes(item.provider) || this.links.has(item.id)) continue
        this.links.set(item.id, { provider: item.provider, feed: item.kind === 'file' ? new CalendarFileSource(this.directory, () => { if (this.links.has(item.id)) this.publish() }, item.id) : this.create(item.id, item.provider) })
      }
    } catch { /* Older versions have no additional-link registry. */ }
    await Promise.all([...this.links.values()].map(item => item.feed.load()))
    this.publish()
  }
  async add(value: string): Promise<CalendarLinkResult> {
    if (this.busy || this.stopped) return { ...this.state(), error: '正在处理来源，请稍后重试。' }
    const link = identifyImportLink(value)
    if (!link || link.mode !== 'feed') return { ...this.state(), error: '这不是可直接读取的日历订阅链接。' }
    const found = [...this.links].find(([, item]) => item.feed.matches(value))
    this.busy = true
    const controller = new AbortController()
    this.downloadController = controller
    const timeout = setTimeout(() => controller.abort(), 20_000)
    const id = 'link-' + randomUUID(), provider = link.provider === 'ticktick' ? 'ticktick' : 'ical'
    const feed = this.create(id, provider)
    this.adding = feed
    try {
      const resource = await downloadCalendarResource(subscriptionURL(value), controller.signal, true)
      if (this.stopped) return { ...this.state(), error: '应用正在退出，请重新打开后重试。' }
      if (resource.kind === 'pdf') return { ...this.state(), error: '', pdf: { name: resource.name, base64: resource.base64 } }
      if (found) {
        const snapshot = await (found[1].feed as CalendarSubscription).refresh(value, false, resource.text)
        return { ...this.state(), addedId: found[0], error: snapshot.error }
      }
      if (this.links.size >= 10) return { ...this.state(), error: '最多添加 10 个来源，请先在管理中移除不用的来源。' }
      if (this.range) await feed.setRange(this.range)
      const snapshot = await feed.refresh(value, false, resource.text)
      if (snapshot.error || !snapshot.configured) { feed.stop(); return { ...this.state(), error: snapshot.error || '未能读取日历。' } }
      if (this.stopped) { feed.stop(); return { ...this.state(), error: '应用正在退出，请重新打开后重试。' } }
      try { await this.persist(this.registry().concat({ id, provider, kind: 'feed' })) }
      catch { await feed.remove().catch(() => {}); throw new CalendarImportError('storage') }
      this.links.set(id, { provider, feed }); feed.start(); this.error = ''; this.publish()
      return { ...this.state(), addedId: id }
    } catch (error) {
      return { ...this.state(), error: calendarErrorMessage(error, controller.signal.aborted) }
    } finally { clearTimeout(timeout); this.downloadController = null; if (!this.links.has(id)) feed.stop(); this.adding = null; this.busy = false }
  }
  async previewFile(name: unknown, text: unknown, replaceId?: unknown): Promise<CalendarFilePreview> {
    const failed = (error: string): CalendarFilePreview => ({ token: '', name: '', eventCount: 0, taskCount: 0, examples: [], warnings: [], error })
    if (this.busy || this.stopped) return failed('正在处理来源，请稍后重试。')
    this.cancelFile()
    const revision = this.draftRevision
    if (!validCalendarFile(name, text) || typeof text !== 'string') return failed('请选择不超过 8 MB 的 ICS 文件。')
    if (replaceId !== undefined && (typeof replaceId !== 'string' || !(this.links.get(replaceId)?.feed instanceof CalendarFileSource))) return failed('只能替换本地文件来源，请重新选择来源。')
    const existing = [...this.links].find(([, item]) => item.feed instanceof CalendarFileSource && item.feed.matchesText(text))
    if (existing && existing[0] !== replaceId) return { ...failed('这份文件已导入，可在来源管理中查看或替换。'), existingId: existing[0] }
    if (!replaceId && this.links.size >= 10) return failed('最多添加 10 个来源，请先移除不用的来源。')
    this.busy = true
    try {
      const id = typeof replaceId === 'string' ? replaceId : 'link-' + randomUUID()
      const preview = await previewCalendarFile(text, name, id), token = randomUUID()
      if (revision !== this.draftRevision || this.stopped) return failed('文件预览已取消。')
      this.draft = { token, name, text, id, replaceId: typeof replaceId === 'string' ? replaceId : undefined }
      return { ...preview, token }
    } catch (error) { return failed(fileImportError(error)) }
    finally { this.busy = false }
  }
  cancelFile() { this.draft = null; ++this.draftRevision }
  async commitFile(token: unknown): Promise<CalendarLinkResult> {
    const draft = this.draft
    if (this.busy || this.stopped || !draft || token !== draft.token) return { ...this.state(), error: '文件预览已失效，请重新选择文件。' }
    const existing = draft.replaceId ? this.links.get(draft.replaceId)?.feed : undefined
    if (draft.replaceId && !(existing instanceof CalendarFileSource)) return { ...this.state(), error: '原来源已移除，请重新导入。' }
    this.busy = true
    const feed = existing instanceof CalendarFileSource ? existing : new CalendarFileSource(this.directory, () => { if (this.links.has(draft.id)) this.publish() }, draft.id)
    if (!existing) this.adding = feed
    try {
      if (this.range) await feed.setRange(this.range)
      await feed.save(draft.text, draft.name)
      if (!existing) {
        try { await this.persist(this.registry().concat({ id: draft.id, provider: 'ical', kind: 'file' })) }
        catch (error) { await feed.remove().catch(() => {}); throw error }
        this.links.set(draft.id, { provider: 'ical', feed })
      }
      this.draft = null; this.error = ''; this.publish()
      return { ...this.state(), addedId: draft.id }
    } catch (error) { return { ...this.state(), error: fileImportError(error) } }
    finally { this.adding = null; this.busy = false }
  }
  async refresh(id: string) {
    const item = this.links.get(id)
    if (item) await item.feed.refresh()
    return this.state()
  }
  async remove(id: string) {
    if (this.busy || this.stopped) return { ...this.state(), error: '正在处理来源，请稍后重试。' }
    const item = this.links.get(id)
    if (!item) return this.state()
    this.busy = true
    try {
      await item.feed.remove()
      await this.persist(this.registry().filter(item => item.id !== id))
      item.feed.stop(); this.links.delete(id); this.error = ''
    } catch { this.error = '移除来源未保存，请重试。' }
    finally { this.busy = false; this.publish() }
    return this.state()
  }
  async setRange(range: CalendarRange) {
    this.range = range
    await Promise.all([...this.links.values()].map(item => item.feed.setRange(range)).concat(this.adding ? [this.adding.setRange(range)] : []))
    return this.state()
  }
  async readSource(id: string) { return this.links.get(id)?.feed.readSource() ?? { text: '', downloadedAt: 0, error: '该日程来源不存在。' } }
  stop() { this.stopped = true; this.cancelFile(); this.downloadController?.abort(); this.adding?.stop(); for (const item of this.links.values()) item.feed.stop() }
}
