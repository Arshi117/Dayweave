import type { SubscriptionSnapshot } from './focus'

export interface ImportLink {
  provider: 'google' | 'ticktick' | 'microsoft' | 'calendar'
  mode: 'feed' | 'account'
  label: string
}
export interface CalendarLinkSource { id: string; provider: 'ical' | 'ticktick'; kind?: 'feed' | 'file'; snapshot: SubscriptionSnapshot }
export interface CalendarLinksState { sources: CalendarLinkSource[]; error: string }
export interface CalendarLinkResult extends CalendarLinksState { addedId?: string; pdf?: { name: string; base64: string } }
export interface SourceRenameResult { error: string; subscription?: SubscriptionSnapshot; links?: CalendarLinksState }

export function normalizedSourceName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return name.length > 0 && name.length <= 200 ? name : null
}

// Validate only the address here. Whether a valid URL returns a supported
// calendar/PDF is checked after reading it, not guessed from the hostname.
export function importLinkInputError(value: string): string {
  const address = value.trim()
  if (!address) return '请先粘贴日历、PDF 或待办链接。'
  if (address.length > 8192) return '链接过长，请重新复制来源提供的完整链接。'
  if (/\s/.test(address)) return '链接中有空格或换行，请只粘贴一个完整链接。'
  if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) return /^(?:www\.|[^/]+\.[a-z]{2,}(?:[/?#]|$))/i.test(address)
    ? '链接不完整，请复制包含 https:// 的完整地址。' : '链接格式不正确，请重新复制完整地址。'
  let url: URL
  try { url = new URL(address.replace(/^webcal:/i, 'https:')) }
  catch { return '链接格式不正确，请重新复制完整地址。' }
  if (url.protocol === 'http:') return '暂不支持 HTTP 链接，请使用 HTTPS 地址，或下载文件后导入。'
  if (url.protocol !== 'https:') return '暂不支持这种链接，请使用 HTTPS 或 webcal 地址。'
  if (!/^(?:https|webcal):\/\//i.test(address)) return '链接格式不正确，请重新复制完整地址。'
  if (url.username || url.password) return '链接包含账号或密码，请使用不带登录信息的链接。'
  return ''
}

// Host boundaries prevent lookalike domains from being treated as account links.
export function identifyImportLink(value: string): ImportLink | null {
  if (importLinkInputError(value)) return null
  try {
    const url = new URL(value.trim().replace(/^webcal:/i, 'https:'))
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 8192) return null
    const host = url.hostname.toLowerCase(), path = url.pathname.toLowerCase()
    if (host === 'calendar.google.com' || host === 'www.google.com' && path.startsWith('/calendar')) {
      return { provider: 'google', mode: path.startsWith('/calendar/ical/') ? 'feed' : 'account', label: 'Google 日历' }
    }
    if (host === 'ticktick.com' || host.endsWith('.ticktick.com') || host === 'dida365.com' || host.endsWith('.dida365.com')) {
      // An ordinary app/share page is not an outgoing calendar feed.
      const feed = path.includes('/calendar/') || path.includes('/ical/') || path.endsWith('.ics')
      return { provider: 'ticktick', mode: feed ? 'feed' : 'account', label: 'TickTick' }
    }
    if (['to-do.office.com', 'to-do.live.com', 'todo.microsoft.com', 'to-do.microsoft.com'].includes(host)) return { provider: 'microsoft', mode: 'account', label: 'Microsoft To Do' }
    return { provider: 'calendar', mode: 'feed', label: '日历订阅' }
  } catch { return null }
}
