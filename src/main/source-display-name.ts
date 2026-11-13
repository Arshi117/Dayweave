import { readFile, writeFile, rename } from 'node:fs/promises'
import { safeStorage } from 'electron'
import type { SubscriptionSnapshot } from '../shared/focus'
import { normalizedSourceName } from '../shared/import-links'

// Store a local alias separately from downloaded data, so refreshes and file
// replacements cannot overwrite it. Names use the same OS encryption boundary.
export class SourceDisplayName {
  private name = ''
  private writes: Promise<void> = Promise.resolve()
  constructor(private file: string) {}
  async load() {
    try {
      const stored = JSON.parse(await readFile(this.file, 'utf8'))
      this.name = normalizedSourceName(safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))) || ''
    } catch { /* Older sources have no local alias. */ }
  }
  async save(value: unknown) {
    const name = normalizedSourceName(value)
    if (!name) throw new Error('来源名称需为 1～200 个字符。')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('无法安全保存来源名称，请检查本机存储后重试。')
    const body = JSON.stringify({ encrypted: safeStorage.encryptString(name).toString('base64') })
    const action = this.writes.then(async () => {
      await writeFile(this.file + '.tmp', body, 'utf8'); await rename(this.file + '.tmp', this.file)
      this.name = name
    })
    this.writes = action.catch(() => {})
    await action
  }
  async clear() {
    const action = this.writes.then(async () => { await writeFile(this.file, '{}', 'utf8'); this.name = '' })
    this.writes = action.catch(() => {})
    await action
  }
  apply(snapshot: SubscriptionSnapshot): SubscriptionSnapshot {
    if (!this.name || !snapshot.configured) return snapshot
    return { ...snapshot, calendarName: this.name,
      events: snapshot.events.map(event => ({ ...event, calendarName: this.name })),
      tasks: snapshot.tasks?.map(task => ({ ...task, listName: this.name })) }
  }
}
