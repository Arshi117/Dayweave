import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { CalendarSubscription } from './calendar-subscription'
import { identifyImportLink, type CalendarLinksState, type CalendarLinkResult } from '../shared/import-links'
import type { CalendarRange } from '../shared/focus'

export class CalendarLinks {
  private links = new Map<string, { provider: 'ical' | 'ticktick'; feed: CalendarSubscription }>()
  private error = ''
  private busy = false
  private stopped = false
  private range: CalendarRange | undefined
  private adding: CalendarSubscription | null = null
  private file: string
  constructor(private directory: string, private changed: (state: CalendarLinksState) => void) { this.file = join(directory, 'calendar-links.json') }
  state(): CalendarLinksState { return { sources: [...this.links].map(([id, item]) => ({ id, provider: item.provider, snapshot: item.feed.state() })), error: this.error } }
  private publish() { if (!this.stopped) this.changed(this.state()) }
  private create(id: string, provider: 'ical' | 'ticktick') {
    return new CalendarSubscription(this.directory, () => { if (this.links.has(id)) this.publish() }, provider, id)
  }
  private async persist(items = [...this.links].map(([id, item]) => ({ id, provider: item.provider }))) {
    await writeFile(this.file + '.tmp', JSON.stringify({ sources: items }), 'utf8')
    await rename(this.file + '.tmp', this.file)
  }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      if (Array.isArray(data.sources)) for (const item of data.sources.slice(0, 10)) {
        if (!item || !/^link-[0-9a-f-]{36}$/i.test(item.id) || !['ical', 'ticktick'].includes(item.provider) || this.links.has(item.id)) continue
        this.links.set(item.id, { provider: item.provider, feed: this.create(item.id, item.provider) })
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
    if (found) {
      this.busy = true
      try { const snapshot = await found[1].feed.refresh(); return { ...this.state(), addedId: found[0], error: snapshot.error } }
      finally { this.busy = false }
    }
    if (this.links.size >= 10) return { ...this.state(), error: '最多添加 10 个订阅链接，请先在管理中移除不用的来源。' }
    this.busy = true
    const id = 'link-' + randomUUID(), provider = link.provider === 'ticktick' ? 'ticktick' : 'ical'
    const feed = this.create(id, provider)
    this.adding = feed
    try {
      if (this.range) await feed.setRange(this.range)
      const snapshot = await feed.refresh(value)
      if (snapshot.error || !snapshot.configured) { feed.stop(); return { ...this.state(), error: snapshot.error || '未能读取日历。' } }
      if (this.stopped) { feed.stop(); return { ...this.state(), error: '应用正在退出，请重新打开后重试。' } }
      await this.persist([...this.links].map(([id, item]) => ({ id, provider: item.provider })).concat({ id, provider }))
      this.links.set(id, { provider, feed }); feed.start(); this.error = ''; this.publish()
      return { ...this.state(), addedId: id }
    } catch {
      await feed.remove().catch(() => {}); feed.stop()
      return { ...this.state(), error: '保存订阅来源失败，请检查本机存储后重试。' }
    } finally { this.adding = null; this.busy = false }
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
      await this.persist([...this.links].filter(([key]) => key !== id).map(([id, value]) => ({ id, provider: value.provider })))
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
  async readSource(id: string) { return this.links.get(id)?.feed.readSource() ?? { text: '', downloadedAt: 0, error: '该订阅来源不存在。' } }
  stop() { this.stopped = true; this.adding?.stop(); for (const item of this.links.values()) item.feed.stop() }
}
