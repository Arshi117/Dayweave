import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { net, shell } from 'electron'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]
export interface GoogleClient { clientId: string; clientSecret?: string }
export interface GoogleTokens { accessToken: string; refreshToken: string; expiresAt: number }
export class GoogleConnectionError extends Error {
  constructor(readonly reason: string, readonly status = 0) { super(reason) }
}

export async function googleJSON(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Record<string, any>> {
  const response = await net.fetch(url, { ...init, credentials: 'omit', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) })
  if (!response.body) throw new GoogleConnectionError('network')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 8 * 1024 * 1024) throw new GoogleConnectionError('size')
      chunks.push(chunk.value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  let body: Record<string, any>
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new GoogleConnectionError('response', response.status) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GoogleConnectionError('response')
  if (!response.ok) {
    const reason = typeof body.error === 'string' ? body.error : body.error?.errors?.[0]?.reason || body.error?.status || 'request'
    throw new GoogleConnectionError(String(reason), response.status)
  }
  return body
}

export function googleErrorMessage(error: unknown): string {
  if (error instanceof GoogleConnectionError) {
    switch (error.reason) {
      case 'client': return '请选择 Google Cloud 下载的“桌面应用”配置 JSON 文件。'
      case 'storage': return '无法加密保存 Google 连接，请检查本机存储后重试。'
      case 'cancelled': return '已取消 Google 连接。'
      case 'timeout': return '等待 Google 授权超时，请重新连接。'
      case 'access_denied': return 'Google 授权未完成。请确认已将学校邮箱加入应用的测试用户。'
      case 'admin_policy_enforced': return '学校管理员限制了此应用访问日历，需要管理员允许该应用。'
      case 'org_internal': return '该应用只允许特定组织账号，请检查应用的 Audience 设置。'
      case 'invalid_grant': case 'unauthorized': return 'Google 授权已失效，请重新连接账号。'
      case 'invalid_client': case 'deleted_client': return 'Google 应用配置无效，请重新下载“桌面应用”配置。'
      case 'accessNotConfigured': case 'SERVICE_DISABLED': return '请在创建该应用的 Google Cloud 项目中启用 Google Calendar API。'
      case 'insufficient_scope': case 'insufficientPermissions': return '缺少日历只读权限，请重新授权并勾选所需的两项日历权限。'
      case 'calendars': return '最多选择 20 本日历，请减少所选日历后重试。'
      case 'events': case 'size': return '日历数据量超过本版的读取上限，请减少所选日历。'
    }
    if (error.status === 403) return 'Google 拒绝读取这本日历，请检查账号权限或学校的应用访问限制。'
    if (error.status === 404) return '所选 Google 日历已不存在或当前账号无法访问，请刷新日历列表。'
    if (error.status === 429) return 'Google 暂时限制请求频率，请稍后重试。'
  }
  return '无法连接 Google，请检查网络和系统代理后重试。'
}

export function tokenResult(body: Record<string, any>, previousRefresh = ''): GoogleTokens {
  if (typeof body.access_token !== 'string' || !body.access_token || !Number.isFinite(body.expires_in)) throw new GoogleConnectionError('response')
  const refreshToken = typeof body.refresh_token === 'string' && body.refresh_token || previousRefresh
  if (!refreshToken) throw new GoogleConnectionError('invalid_grant')
  return { accessToken: body.access_token, refreshToken, expiresAt: Date.now() + Math.max(1, body.expires_in) * 1000 }
}
export async function refreshGoogleToken(client: GoogleClient, tokens: GoogleTokens, signal: AbortSignal) {
  const body = new URLSearchParams({ client_id: client.clientId, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' })
  if (client.clientSecret) body.set('client_secret', client.clientSecret)
  return tokenResult(await googleJSON('https://oauth2.googleapis.com/token', { method: 'POST', body }, signal), tokens.refreshToken)
}
export async function revokeGoogleToken(token: string, signal: AbortSignal) {
  const response = await net.fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token }),
    credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
  await response.body?.cancel()
  if (!response.ok && response.status !== 400) throw new GoogleConnectionError('request', response.status)
}

// The login stays in the system browser. Only a state-checked callback is accepted
// on a random loopback port; authorization codes and tokens never enter the renderer.
export function authorizeGoogle(client: GoogleClient) {
  return authorizeDesktop(client, { authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenURL: 'https://oauth2.googleapis.com/token', scopes: GOOGLE_SCOPES, host: '127.0.0.1',
    extra: { access_type: 'offline', prompt: 'consent select_account' },
    allowedScopes: scope => GOOGLE_SCOPES.every(value => scope.split(' ').includes(value)) })
}
interface DesktopAuthorization {
  authorizationURL: string; tokenURL: string; scopes: string[]; host: '127.0.0.1' | 'localhost'
  extra?: Record<string, string>; allowedScopes: (scope: string) => boolean
}
// Providers use the same PKCE listener; all endpoints come from application code.
export function authorizeDesktop(client: GoogleClient, options: DesktopAuthorization) {
  const verifier = randomBytes(48).toString('base64url'), state = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const controller = new AbortController()
  let cancel = () => {}
  const promise = new Promise<GoogleTokens>((resolve, reject) => {
    let finished = false
    let accepted = false
    let timer: NodeJS.Timeout | undefined
    const finish = (error?: unknown, tokens?: GoogleTokens) => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      try { server.close(); server.closeAllConnections() } catch { /* The listener may have failed before it bound. */ }
      if (error) { controller.abort(); reject(error) }
      else resolve(tokens!)
    }
    cancel = () => finish(new GoogleConnectionError('cancelled'))
    const server = createServer(async (request, response) => {
      const address = server.address()
      if (!address || typeof address === 'string') return
      const expectedHost = options.host + ':' + address.port
      let url: URL
      try { url = new URL(request.url || '/', 'http://' + expectedHost) }
      catch { response.writeHead(400); response.end(); return }
      const supplied = url.searchParams.get('state') || ''
      if (request.method !== 'GET' || request.headers.host !== expectedHost || url.pathname !== '/oauth2callback') {
        response.writeHead(404); response.end(); return
      }
      if (Buffer.byteLength(supplied) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(state))) {
        response.writeHead(400); response.end('Invalid authorization state.'); return
      }
      if (accepted || finished) { response.writeHead(409); response.end('Authorization already handled.'); return }
      accepted = true
      const error = url.searchParams.get('error'), code = url.searchParams.get('code')
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'", 'Referrer-Policy': 'no-referrer' })
      response.end('<!doctype html><html lang="zh"><meta charset="utf-8"><title>Dayweave</title><h2>' + (error || !code ? '授权未完成，请返回 Dayweave 查看提示。' : '正在连接账号，请返回 Dayweave。可以关闭此页面。') + '</h2></html>')
      if (error || !code) { finish(new GoogleConnectionError(error || 'access_denied')); return }
      try {
        const body = new URLSearchParams({ client_id: client.clientId, code, code_verifier: verifier,
          redirect_uri: 'http://' + expectedHost + '/oauth2callback', grant_type: 'authorization_code' })
        if (client.clientSecret) body.set('client_secret', client.clientSecret)
        const result = await googleJSON(options.tokenURL, { method: 'POST', body }, controller.signal)
        if (typeof result.scope === 'string' && !options.allowedScopes(result.scope)) throw new GoogleConnectionError('insufficient_scope')
        finish(undefined, tokenResult(result))
      } catch (error) { finish(error) }
    })
    server.maxHeadersCount = 30
    server.requestTimeout = 10_000
    server.on('error', () => finish(new GoogleConnectionError('network')))
    timer = setTimeout(() => finish(new GoogleConnectionError('timeout')), 5 * 60_000)
    server.listen(0, '127.0.0.1', () => {
      if (finished) { server.close(); return }
      const address = server.address()
      if (!address || typeof address === 'string') return
      const url = new URL(options.authorizationURL)
      url.search = new URLSearchParams({ ...options.extra, client_id: client.clientId, redirect_uri: 'http://' + options.host + ':' + address.port + '/oauth2callback',
        response_type: 'code', scope: options.scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state }).toString()
      void shell.openExternal(url.href).catch(() => finish(new GoogleConnectionError('network')))
    })
  })
  return { promise, cancel: () => cancel() }
}
