import { createHash } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { authorizeDesktop, GoogleConnectionError, googleJSON, tokenResult, type GoogleTokens } from './google-oauth'
import { EMPTY_MICROSOFT, type ImportedTask, type MicrosoftTodoState, type TodoList } from '../shared/imports'

const scopes = ['https://graph.microsoft.com/Tasks.Read', 'offline_access']
const tokenURL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const validId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.slice(0, max) : ''
function errorMessage(error: unknown) {
  if (error instanceof GoogleConnectionError) {
    if (error.reason === 'cancelled') return '已取消微软账号连接。'
    if (error.reason === 'timeout') return '等待微软授权超时，请重新连接。'
    if (error.reason === 'storage') return '无法保存微软连接，请检查本机存储。'
    if (error.reason === 'client' || error.reason === 'invalid_client' || error.reason === 'unauthorized_client') return '微软应用配置无效，请由开发者检查桌面应用注册和账号类型。'
    if (error.reason === 'access_denied') return '未获得微软账号授权；组织账号可能需要管理员允许。'
    if (error.reason === 'insufficient_scope') return '缺少任务只读权限，请重新连接微软账号。'
    if (error.reason === 'invalid_grant' || error.status === 401) return '微软授权已失效，请重新连接。'
    if (error.reason === 'limit') return '超出读取上限：最多 20 个清单、5000 条未完成任务。'
    if (error.status === 403) return '微软拒绝读取任务，请检查账号权限或组织限制。'
    if (error.status === 400) return 'Microsoft To Do 拒绝了读取请求（HTTP 400）。请刷新后重试；若仍失败，请反馈此提示。'
    if (error.status === 404) return '微软未找到对应的待办清单，请刷新清单后重试。'
    if (error.status === 429) return '微软暂时限制请求频率，请稍后重试。'
    if (error.status >= 500) return '微软待办服务暂时不可用（HTTP ' + error.status + '），请稍后刷新。'
    if (error.reason === 'response') return '无法识别微软返回的待办数据，请刷新后重试。'
  }
  return '无法连接 Microsoft To Do，请检查网络后重试。'
}
export class MicrosoftTodoConnection {
  private snapshot: MicrosoftTodoState = { ...EMPTY_MICROSOFT, lists: [], tasks: [] }
  private clientId = ''
  private tokens: GoogleTokens | null = null
  private authorization: ReturnType<typeof authorizeDesktop> | null = null
  private controller = new AbortController()
  private revision = 0
  private timer: NodeJS.Timeout | undefined
  private writes: Promise<void> = Promise.resolve()
  private readonly config: string
  private readonly token: string
  private readonly cache: string
  constructor(directory: string, private changed: (state: MicrosoftTodoState) => void) {
    this.config = join(directory, 'microsoft-client.json')
    this.token = join(directory, 'microsoft-authorization.json')
    this.cache = join(directory, 'microsoft-tasks.json')
  }
  state() { return this.snapshot }
  private publish() { this.changed(this.snapshot) }
  private async write(file: string, value: unknown, revision: number, encrypted = false) {
    if (encrypted && !safeStorage.isEncryptionAvailable()) throw new GoogleConnectionError('storage')
    const data = encrypted ? { encrypted: safeStorage.encryptString(JSON.stringify(value)).toString('base64') } : value
    const action = this.writes.then(async () => {
      if (revision !== this.revision) return
      await writeFile(file + '.tmp', JSON.stringify(data), 'utf8'); await rename(file + '.tmp', file)
    })
    this.writes = action.catch(() => {})
    try { await action } catch { throw new GoogleConnectionError('storage') }
  }
  private saveCache(revision: number) { return this.write(this.cache, { lists: this.snapshot.lists, tasks: this.snapshot.tasks, lastSynced: this.snapshot.lastSynced }, revision) }
  async load() {
    const supplied = process.env.DAYWEAVE_MICROSOFT_CLIENT_ID
    if (validId(supplied)) this.clientId = supplied
    else try { const config = JSON.parse(await readFile(this.config, 'utf8')); if (validId(config.clientId)) this.clientId = config.clientId } catch { /* No developer configuration yet. */ }
    if (this.clientId) try {
      const file = JSON.parse(await readFile(this.token, 'utf8'))
      const tokens = JSON.parse(safeStorage.decryptString(Buffer.from(file.encrypted, 'base64')))
      if (typeof tokens.refreshToken === 'string' && tokens.refreshToken) this.tokens = { ...tokens, expiresAt: 0 }
    } catch { /* The user must connect in the system browser. */ }
    if (this.tokens) try {
      const cache = JSON.parse(await readFile(this.cache, 'utf8'))
      const lists = Array.isArray(cache.lists) ? cache.lists.filter((list: TodoList) => list && typeof list.id === 'string' && typeof list.name === 'string').slice(0, 1000) : []
      const tasks = Array.isArray(cache.tasks) ? cache.tasks.filter((task: ImportedTask) => task && typeof task.id === 'string' && typeof task.title === 'string' && task.provider === 'microsoft-todo').slice(0, 5000) : []
      this.snapshot = { ...this.snapshot, lists, tasks, lastSynced: Number.isFinite(cache.lastSynced) ? cache.lastSynced : null }
    } catch { /* A failed cache read does not invalidate authorization. */ }
    this.snapshot = { ...this.snapshot, configured: Boolean(this.clientId), connected: Boolean(this.tokens) }; this.publish()
    if (this.tokens) void this.refresh()
    this.timer = setInterval(() => { if (this.tokens && !this.snapshot.reconnectRequired) void this.refresh() }, 5 * 60_000)
  }
  async configure(clientId: string) {
    if (this.snapshot.connected || this.snapshot.authorizing) return this.snapshot
    try {
      if (!validId(clientId)) throw new GoogleConnectionError('client')
      const revision = ++this.revision
      await this.write(this.config, { clientId }, revision)
      if (revision !== this.revision) return this.snapshot
      this.clientId = clientId
      this.snapshot = { ...this.snapshot, configured: true, error: '' }
    } catch (error) { this.snapshot = { ...this.snapshot, error: errorMessage(error) } }
    this.publish(); return this.snapshot
  }
  async connect() {
    if (!this.clientId || this.authorization) return this.snapshot
    const revision = ++this.revision
    this.controller.abort(); this.controller = new AbortController()
    const authorization = authorizeDesktop({ clientId: this.clientId }, {
      authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenURL, scopes, host: 'localhost',
      extra: { prompt: 'select_account', response_mode: 'query' }, allowedScopes: scope => scope.split(' ').some(value => /^(https:\/\/graph\.microsoft\.com\/)?Tasks\.Read$/i.test(value)),
    })
    this.authorization = authorization
    this.snapshot = { ...this.snapshot, authorizing: true, refreshing: false, error: '' }; this.publish()
    try {
      const tokens = await authorization.promise
      if (revision !== this.revision) return this.snapshot
      await this.write(this.token, tokens, revision, true)
      if (revision !== this.revision) return this.snapshot
      this.tokens = tokens
      this.snapshot = { ...this.snapshot, connected: true, reconnectRequired: false, authorizing: false, lists: [], tasks: [], lastSynced: null }
      await this.saveCache(revision); this.publish()
      return await this.refresh()
    } catch (error) { if (revision === this.revision) this.snapshot = { ...this.snapshot, authorizing: false, error: errorMessage(error) } }
    finally { if (this.authorization === authorization) this.authorization = null; this.publish() }
    return this.snapshot
  }
  cancel() { this.authorization?.cancel(); return this.snapshot }
  private async access(revision: number) {
    if (!this.tokens) throw new GoogleConnectionError('unauthorized', 401)
    if (this.tokens.expiresAt > Date.now() + 60_000) return this.tokens.accessToken
    const previous = this.tokens
    const result = await googleJSON(tokenURL, { method: 'POST', body: new URLSearchParams({ client_id: this.clientId,
      grant_type: 'refresh_token', refresh_token: previous.refreshToken, scope: scopes.join(' ') }) }, this.controller.signal)
    const tokens = tokenResult(result, previous.refreshToken)
    if (revision !== this.revision) throw new GoogleConnectionError('cancelled')
    await this.write(this.token, tokens, revision, true)
    if (revision !== this.revision) throw new GoogleConnectionError('cancelled')
    this.tokens = tokens
    return tokens.accessToken
  }
  private async collection(path: string, revision: number) {
    // To Do rejects $select for some accounts. Read each page without field projection.
    let next = 'https://graph.microsoft.com/v1.0/' + path + '?$top=100'
    const items: Record<string, any>[] = [], seen = new Set<string>()
    while (next) {
      const url = new URL(next)
      if (url.origin !== 'https://graph.microsoft.com' || url.pathname !== '/v1.0/' + path || seen.has(next)) throw new GoogleConnectionError('response')
      seen.add(next)
      let data: Record<string, any> | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await this.access(revision)
        if (revision !== this.revision) throw new GoogleConnectionError('cancelled')
        try { data = await googleJSON(next, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }, this.controller.signal); break }
        catch (error) { if (!(error instanceof GoogleConnectionError) || error.status !== 401 || attempt > 0) throw error; if (this.tokens) this.tokens.expiresAt = 0 }
      }
      if (!data || !Array.isArray(data.value)) throw new GoogleConnectionError('response')
      items.push(...data.value)
      if (items.length > 10000 || seen.size > 100) throw new GoogleConnectionError('limit')
      next = typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : ''
    }
    return items
  }
  async refresh() {
    if (!this.tokens || this.snapshot.refreshing || this.snapshot.authorizing) return this.snapshot
    const revision = ++this.revision
    this.controller.abort(); this.controller = new AbortController()
    this.snapshot = { ...this.snapshot, refreshing: true, error: '' }; this.publish()
    try {
      const previous = new Map(this.snapshot.lists.map(list => [list.id, list.selected]))
      const items = await this.collection('me/todo/lists', revision)
      const lists = items.filter(item => typeof item.id === 'string').map(item => ({ id: item.id as string, name: text(item.displayName) || '未命名清单', selected: previous.has(item.id) ? Boolean(previous.get(item.id)) : true }))
      if (lists.length > 1000) throw new GoogleConnectionError('limit')
      if (revision !== this.revision) return this.snapshot
      this.snapshot = { ...this.snapshot, lists }; this.publish()
      const selected = lists.filter(list => list.selected)
      if (selected.length > 20) throw new GoogleConnectionError('limit')
      const tasks: ImportedTask[] = [], errors: string[] = []
      for (const list of selected) {
        try {
          const items = await this.collection('me/todo/lists/' + encodeURIComponent(list.id) + '/tasks', revision)
          for (const item of items) {
            if (!item || item.status === 'completed' || typeof item.id !== 'string') continue
            const id = 'microsoft-task:' + createHash('sha256').update(list.id + ':' + item.id).digest('hex').slice(0, 32)
            const date = text(item.dueDateTime?.dateTime).slice(0, 10)
            tasks.push({ id, title: text(item.title) || '未命名任务', provider: 'microsoft-todo', listId: list.id, listName: list.name,
              dueDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
              description: text(item.body?.content, 12000).replace(/<br\s*\/?\s*>|<\/p\s*>/gi, '\n').replace(/<[^>]*>/g, '') })
          }
        } catch (error) {
          if (error instanceof GoogleConnectionError && (error.status === 401 || ['invalid_grant', 'limit'].includes(error.reason))) throw error
          errors.push(list.name + '：' + errorMessage(error))
          tasks.push(...this.snapshot.tasks.filter(task => task.listId === list.id))
        }
        if (tasks.length > 5000) throw new GoogleConnectionError('limit')
      }
      if (revision !== this.revision) return this.snapshot
      this.snapshot = { ...this.snapshot, tasks, refreshing: false, reconnectRequired: false,
        lastSynced: errors.length && errors.length === selected.length ? this.snapshot.lastSynced : Date.now(), error: errors[0] || '' }
      await this.saveCache(revision)
    } catch (error) {
      if (revision === this.revision) {
        this.controller.abort()
        this.snapshot = { ...this.snapshot, refreshing: false, error: errorMessage(error),
          reconnectRequired: error instanceof GoogleConnectionError && (error.status === 401 || error.reason === 'invalid_grant') }
      }
    }
    if (revision === this.revision) this.publish()
    return this.snapshot
  }
  async select(ids: string[]) {
    if (this.snapshot.refreshing || this.snapshot.authorizing) return this.snapshot
    if (ids.length > 20) { this.snapshot = { ...this.snapshot, error: errorMessage(new GoogleConnectionError('limit')) }; this.publish(); return this.snapshot }
    const selected = new Set(ids)
    this.snapshot = { ...this.snapshot, lists: this.snapshot.lists.map(list => ({ ...list, selected: selected.has(list.id) })) }
    this.publish(); return this.refresh()
  }
  async disconnect() {
    const revision = ++this.revision
    this.authorization?.cancel(); this.authorization = null; this.controller.abort(); this.tokens = null
    this.snapshot = { ...EMPTY_MICROSOFT, configured: Boolean(this.clientId), lists: [], tasks: [] }
    try { await this.write(this.token, {}, revision); await this.write(this.cache, {}, revision) }
    catch { if (revision === this.revision) this.snapshot = { ...this.snapshot, error: '保存断开状态失败，请重试。' } }
    // Microsoft offers no app-scoped token revocation endpoint; remote consent remains in account settings.
    if (revision === this.revision) this.publish()
    return this.snapshot
  }
  stop() { ++this.revision; if (this.timer) clearInterval(this.timer); this.authorization?.cancel(); this.controller.abort() }
}
