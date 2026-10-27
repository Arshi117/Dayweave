import type { SubscriptionSnapshot } from './focus'

export interface ImportLink {
  provider: 'google' | 'ticktick' | 'microsoft' | 'calendar'
  mode: 'feed' | 'account'
  label: string
}
export interface CalendarLinkSource { id: string; provider: 'ical' | 'ticktick'; snapshot: SubscriptionSnapshot }
export interface CalendarLinksState { sources: CalendarLinkSource[]; error: string }
export interface CalendarLinkResult extends CalendarLinksState { addedId?: string }

// Host boundaries prevent lookalike domains from being treated as account links.
export function identifyImportLink(value: string): ImportLink | null {
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
