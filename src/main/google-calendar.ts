import { createHash } from 'node:crypto'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeStorage, shell } from 'electron'
import { applicationClients } from './application-clients'
import type { CalendarRange, FocusEvent } from '../shared/focus'
import { EMPTY_GOOGLE, type GoogleCalendarItem, type GoogleCalendarState } from '../shared/google-calendar'
import { validCalendarRange } from './calendar-subscription'
import { authorizeGoogle, GoogleConnectionError, googleErrorMessage, googleJSON, refreshGoogleToken, revokeGoogleToken, type GoogleClient, type GoogleTokens } from './google-oauth'

const equalRange = (a?: CalendarRange, b?: CalendarRange) => a?.from === b?.from && a?.to === b?.to
const text = (value: unknown, maximum: number) => typeof value === 'string' ? value.slice(0, maximum) : ''
const canRead = (role: string) => ['reader', 'writer', 'writerWithoutPrivateAccess', 'owner'].includes(role)
function mergeEvent(events: Map<string, FocusEvent>, event: FocusEvent) {
  const previous = events.get(event.id)
  const busy = (title: string) => /^(busy|忙碌|忙碌（名称未提供）)$/i.test(title.trim())
  if (!previous || busy(previous.title) && !busy(event.title)) events.set(event.id, event)
  else if (!busy(previous.title) && busy(event.title)) return
  else events.set(event.id, { ...event, description: event.description || previous.description,
    location: event.location || previous.location, webUrl: event.webUrl || previous.webUrl })
}
function plainText(value: unknown) {
  return text(value, 20_000).replace(/<br\s*\/?\s*>|<\/p\s*>|<\/div\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").slice(0, 12_000)
}
function windows(viewed?: CalendarRange) {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - from.getDay())
  const to = new Date(from); to.setDate(to.getDate() + 21)
  const ranges = [{ from: from.getTime(), to: to.getTime() }]
  if (viewed && (viewed.from < from.getTime() || viewed.to > to.getTime())) ranges.push(viewed)
  return ranges
}
function mapEvent(item: Record<string, any>, calendar: GoogleCalendarItem): FocusEvent | null {
  if (!item || item.status === 'cancelled' || typeof item.start?.dateTime !== 'string' || typeof item.end?.dateTime !== 'string') return null
  const start = Date.parse(item.start.dateTime), end = Date.parse(item.end.dateTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || typeof item.id !== 'string') return null
  // Use the iCalendar identity when available so an existing focus session can survive a connection upgrade.
  const identity = text(item.iCalUID, 1000) || calendar.id + ':' + item.id
  const id = 'subscription:' + createHash('sha256').update(identity + ':' + start).digest('hex').slice(0, 32)
  return { id, start, end, title: text(item.summary, 300) || '忙碌（名称未提供）', source: 'subscription',
    calendarId: calendar.id, calendarName: calendar.name, description: plainText(item.description),
    location: text(item.location, 2000), webUrl: text(item.htmlLink, 4096) }
}

export class GoogleCalendarConnection {
  private snapshot: GoogleCalendarState = { ...EMPTY_GOOGLE, calendars: [], events: [] }
  private client: GoogleClient | null = null
  private tokens: GoogleTokens | null = null
  private tokenRefresh: Promise<string> | null = null
  private authorization: ReturnType<typeof authorizeGoogle> | null = null
  private controller = new AbortController()
  private revision = 0
  private viewed: CalendarRange | undefined
  private timer: NodeJS.Timeout | null = null
  private writes: Promise<void> = Promise.resolve()
  private readonly clientFile: string
  private readonly tokenFile: string
  private readonly cacheFile: string
  constructor(directory: string, private changed: (state: GoogleCalendarState) => void) {
    this.clientFile = join(directory, 'google-client.json')
    this.tokenFile = join(directory, 'google-authorization.json')
    this.cacheFile = join(directory, 'google-calendar-cache.json')
  }
  state() { return this.snapshot }
  private publish() { this.changed(this.snapshot) }
  private async secret<T>(file: string): Promise<T> {
    const data = JSON.parse(await readFile(file, 'utf8'))
    return JSON.parse(safeStorage.decryptString(Buffer.from(data.encrypted, 'base64')))
  }
  private async write(file: string, data: unknown, revision: number, encrypted = false) {
    if (encrypted && !safeStorage.isEncryptionAvailable()) throw new GoogleConnectionError('storage')
    const body = encrypted ? JSON.stringify({ encrypted: safeStorage.encryptString(JSON.stringify(data)).toString('base64') }) : JSON.stringify(data)
    const action = this.writes.then(async () => {
      if (revision !== this.revision) return
      await writeFile(file + '.tmp', body, 'utf8')
      await rename(file + '.tmp', file)
    })
    this.writes = action.catch(() => {})
    try { await action } catch { throw new GoogleConnectionError('storage') }
  }
  private cache(revision: number) {
    return this.write(this.cacheFile, { calendars: this.snapshot.calendars, events: this.snapshot.events,
      lastSynced: this.snapshot.lastSynced, range: this.snapshot.range }, revision)
  }
  async load() {
    try {
      const client = await this.secret<GoogleClient>(this.clientFile)
      if (typeof client.clientId === 'string' && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(client.clientId)) this.client = client
    } catch { /* First connection has no imported application configuration. */ }
    this.client ??= applicationClients().google ?? null
    if (this.client) {
      try {
        const tokens = await this.secret<GoogleTokens>(this.tokenFile)
        if (typeof tokens.refreshToken === 'string' && tokens.refreshToken) this.tokens = { ...tokens, expiresAt: 0 }
      } catch { /* Authorization must be completed by the user in the browser. */ }
    }
    if (this.tokens) {
      try {
        const cache = JSON.parse(await readFile(this.cacheFile, 'utf8'))
        const calendars = Array.isArray(cache.calendars) ? cache.calendars.filter((item: GoogleCalendarItem) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.accessRole === 'string').slice(0, 1000) : []
        const events = Array.isArray(cache.events) ? cache.events.filter((event: FocusEvent) => event && typeof event.id === 'string' && typeof event.title === 'string' && event.source === 'subscription' && typeof event.calendarId === 'string' && Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > event.start).slice(0, 5000) : []
        this.snapshot = { ...this.snapshot, calendars, events, range: validCalendarRange(cache.range) ? cache.range : undefined, lastSynced: Number.isFinite(cache.lastSynced) ? cache.lastSynced : null }
      } catch { /* A damaged cache does not invalidate a valid encrypted authorization. */ }
    }
    this.snapshot = { ...this.snapshot, configured: Boolean(this.client), connected: Boolean(this.tokens) }
    this.publish()
    if (this.tokens) void this.refresh()
    this.timer = setInterval(() => { if (this.tokens && !this.snapshot.refreshing && !this.snapshot.authorizing && !this.snapshot.reconnectRequired) void this.refresh() }, 5 * 60_000)
  }
  async configure(file: string) {
    if (this.snapshot.connected || this.snapshot.authorizing) return this.snapshot
    try {
      if ((await stat(file)).size > 64 * 1024) throw new GoogleConnectionError('client')
      const data = JSON.parse(await readFile(file, 'utf8'))
      const installed = data.installed
      if (!installed || typeof installed.client_id !== 'string' || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(installed.client_id)) throw new GoogleConnectionError('client')
      const client: GoogleClient = { clientId: installed.client_id, clientSecret: text(installed.client_secret, 4096) || undefined }
      const revision = ++this.revision
      await this.write(this.clientFile, client, revision, true)
      if (revision !== this.revision) return this.snapshot
      this.client = client
      this.snapshot = { ...this.snapshot, configured: true, error: '' }
    } catch (error) { this.snapshot = { ...this.snapshot, error: error instanceof GoogleConnectionError ? googleErrorMessage(error) : googleErrorMessage(new GoogleConnectionError('client')) } }
    this.publish(); return this.snapshot
  }
  async connect() {
    if (this.authorization || !this.client) return this.snapshot
    const revision = ++this.revision
    this.controller.abort(); this.controller = new AbortController()
    const authorization = authorizeGoogle(this.client)
    this.authorization = authorization
    this.snapshot = { ...this.snapshot, authorizing: true, refreshing: false, error: '' }
    this.publish()
    try {
      const tokens = await authorization.promise
      if (revision !== this.revision) return this.snapshot
      await this.write(this.tokenFile, tokens, revision, true)
      if (revision !== this.revision) return this.snapshot
      this.tokens = tokens
      this.snapshot = { ...this.snapshot, connected: true, reconnectRequired: false, authorizing: false,
        calendars: [], events: [], range: undefined, lastSynced: null, error: '' }
      await this.cache(revision)
      this.publish()
      return await this.refresh()
    } catch (error) {
      if (revision === this.revision) this.snapshot = { ...this.snapshot, authorizing: false, error: googleErrorMessage(error) }
    } finally {
      if (this.authorization === authorization) this.authorization = null
      this.publish()
    }
    return this.snapshot
  }
  cancel() { this.authorization?.cancel(); return this.snapshot }
  private async access(revision: number): Promise<string> {
    if (!this.tokens || !this.client) throw new GoogleConnectionError('unauthorized', 401)
    if (this.tokens.expiresAt > Date.now() + 60_000) return this.tokens.accessToken
    if (this.tokenRefresh) return this.tokenRefresh
    const pending = (async () => {
      const tokens = await refreshGoogleToken(this.client!, this.tokens!, this.controller.signal)
      if (revision !== this.revision) throw new GoogleConnectionError('cancelled')
      await this.write(this.tokenFile, tokens, revision, true)
      if (revision !== this.revision) throw new GoogleConnectionError('cancelled')
      this.tokens = tokens
      return tokens.accessToken
    })()
    this.tokenRefresh = pending
    try { return await pending } finally { if (this.tokenRefresh === pending) this.tokenRefresh = null }
  }
  private async api(path: string, params: URLSearchParams, revision: number): Promise<Record<string, any>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.access(revision)
      if (revision !== this.revision) throw new GoogleConnectionError('cancelled')
      try {
        return await googleJSON('https://www.googleapis.com/calendar/v3/' + path + '?' + params.toString(),
          { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }, this.controller.signal)
      } catch (error) {
        if (!(error instanceof GoogleConnectionError) || error.status !== 401) throw error
        if (attempt === 1) throw new GoogleConnectionError('unauthorized', 401)
        if (this.tokens?.accessToken === token) this.tokens.expiresAt = 0
      }
    }
    throw new GoogleConnectionError('unauthorized', 401)
  }
  private async list(revision: number): Promise<GoogleCalendarItem[]> {
    const previous = new Map(this.snapshot.calendars.map(item => [item.id, item.selected]))
    const result: GoogleCalendarItem[] = [], pages = new Set<string>()
    let page = ''
    do {
      const params = new URLSearchParams({ maxResults: '250', showHidden: 'true', fields: 'nextPageToken,items(id,summary,summaryOverride,selected,primary,accessRole,deleted)' })
      if (page) params.set('pageToken', page)
      const data = await this.api('users/me/calendarList', params, revision)
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (item.deleted || typeof item.id !== 'string') continue
        const role = text(item.accessRole, 100)
        result.push({ id: item.id, name: text(item.summaryOverride || item.summary, 200) || '未命名日历', primary: Boolean(item.primary), accessRole: role,
          selected: canRead(role) && (previous.has(item.id) ? Boolean(previous.get(item.id)) : typeof item.selected === 'boolean' ? item.selected : Boolean(item.primary)) })
      }
      page = text(data.nextPageToken, 4096)
      if (result.length > 1000 || pages.has(page) && page) throw new GoogleConnectionError('calendars')
      pages.add(page)
    } while (page)
    return result
  }
  private async calendarEvents(calendar: GoogleCalendarItem, ranges: CalendarRange[], revision: number) {
    const result = new Map<string, FocusEvent>()
    for (const range of ranges) {
      const pages = new Set<string>()
      let page = ''
      do {
        const params = new URLSearchParams({ timeMin: new Date(range.from).toISOString(), timeMax: new Date(range.to).toISOString(),
          singleEvents: 'true', showDeleted: 'false', orderBy: 'startTime', maxResults: '2500',
          fields: 'nextPageToken,items(id,iCalUID,summary,description,location,htmlLink,status,start,end)' })
        if (page) params.set('pageToken', page)
        const data = await this.api('calendars/' + encodeURIComponent(calendar.id) + '/events', params, revision)
        for (const item of Array.isArray(data.items) ? data.items : []) {
          const event = mapEvent(item, calendar)
          if (event) result.set(event.id, event)
        }
        page = text(data.nextPageToken, 4096)
        if (result.size > 5000 || pages.size > 20 || pages.has(page) && page) throw new GoogleConnectionError('events')
        pages.add(page)
      } while (page)
    }
    return [...result.values()]
  }
  async refresh() {
    if (!this.tokens || this.snapshot.authorizing || this.snapshot.refreshing) return this.snapshot
    const revision = ++this.revision
    this.controller.abort(); this.controller = new AbortController()
    this.snapshot = { ...this.snapshot, refreshing: true, error: '' }; this.publish()
    let succeeded = false
    try {
      const calendars = await this.list(revision)
      if (revision !== this.revision) return this.snapshot
      this.snapshot = { ...this.snapshot, calendars }; this.publish()
      const selected = calendars.filter(calendar => calendar.selected)
      if (selected.length > 20) throw new GoogleConnectionError('calendars')
      const range = this.viewed && { ...this.viewed }, ranges = windows(range)
      const events = new Map<string, FocusEvent>(), failed: string[] = []
      let cursor = 0
      await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
        while (cursor < selected.length) {
          const calendar = selected[cursor++]
          try {
            for (const event of await this.calendarEvents(calendar, ranges, revision)) {
              mergeEvent(events, event)
              if (events.size > 5000) throw new GoogleConnectionError('events')
            }
          } catch (error) {
            if (error instanceof GoogleConnectionError && (error.status === 401 || ['invalid_grant', 'unauthorized', 'events'].includes(error.reason))) throw error
            failed.push(calendar.name + '：' + googleErrorMessage(error))
            for (const event of this.snapshot.events.filter(event => event.calendarId === calendar.id)) mergeEvent(events, event)
          }
        }
      }))
      if (revision !== this.revision) return this.snapshot
      if (events.size > 5000) throw new GoogleConnectionError('events')
      this.snapshot = { ...this.snapshot, events: [...events.values()].sort((a, b) => a.start - b.start), range: failed.length ? this.snapshot.range : range,
        refreshing: false, reconnectRequired: false, lastSynced: failed.length === selected.length && failed.length > 0 ? this.snapshot.lastSynced : Date.now(),
        error: failed.length ? '部分日历未更新，已保留可用缓存。' + failed[0] : '' }
      await this.cache(revision)
      succeeded = failed.length === 0
    } catch (error) {
      if (revision === this.revision) {
        this.controller.abort()
        this.snapshot = { ...this.snapshot, refreshing: false, error: googleErrorMessage(error),
          reconnectRequired: error instanceof GoogleConnectionError && (error.status === 401 || ['invalid_grant', 'unauthorized'].includes(error.reason)) }
      }
    } finally {
      if (revision === this.revision) {
        this.publish()
        if (succeeded && !equalRange(this.snapshot.range, this.viewed)) queueMicrotask(() => { if (revision === this.revision) void this.refresh() })
      }
    }
    return this.snapshot
  }
  async select(ids: string[]) {
    if (this.snapshot.authorizing || this.snapshot.refreshing) return this.snapshot
    if (ids.length > 20) { this.snapshot = { ...this.snapshot, error: googleErrorMessage(new GoogleConnectionError('calendars')) }; this.publish(); return this.snapshot }
    const selected = new Set(ids)
    this.snapshot = { ...this.snapshot, calendars: this.snapshot.calendars.map(calendar => ({ ...calendar, selected: canRead(calendar.accessRole) && selected.has(calendar.id) })) }
    this.publish()
    return this.refresh()
  }
  async setRange(range: CalendarRange) {
    if (!validCalendarRange(range) || equalRange(this.viewed, range) && equalRange(this.snapshot.range, range)) return this.snapshot
    this.viewed = { ...range }
    return this.refresh()
  }
  async disconnect() {
    const revision = ++this.revision, token = this.tokens?.refreshToken
    this.authorization?.cancel(); this.authorization = null
    this.controller.abort(); this.controller = new AbortController()
    this.tokens = null
    this.snapshot = { ...EMPTY_GOOGLE, configured: Boolean(this.client), calendars: [], events: [] }
    try {
      await this.write(this.tokenFile, {}, revision)
      await this.write(this.cacheFile, {}, revision)
      if (token) {
        // Revocation is requested only after the user's explicit Disconnect action.
        await revokeGoogleToken(token, this.controller.signal)
      }
    } catch {
      if (revision === this.revision) this.snapshot = { ...this.snapshot, error: '本机连接已断开。若网络或存储异常，请重试断开，并在 Google 账号的第三方连接中检查授权。' }
    }
    if (revision === this.revision) this.publish()
    return this.snapshot
  }
  async openEvent(id: string) {
    const link = this.snapshot.events.find(event => event.id === id)?.webUrl
    if (!link) return
    try {
      const url = new URL(link)
      const official = url.hostname === 'calendar.google.com' || url.hostname === 'www.google.com' && url.pathname.startsWith('/calendar/')
      if (url.protocol === 'https:' && official) await shell.openExternal(url.href)
    } catch { /* An invalid original-event link must not interrupt the calendar. */ }
  }
  stop() {
    ++this.revision
    if (this.timer) clearInterval(this.timer)
    this.authorization?.cancel(); this.controller.abort()
  }
}
