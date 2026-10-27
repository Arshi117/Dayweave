export interface FocusEvent {
  id: string
  title: string
  sourceTitle?: string
  allDay?: boolean
  sourceDetails?: { label: string; value: string }[]
  start: number
  end: number
  source: 'local' | 'subscription'
  calendarId?: string
  calendarName?: string
  description?: string
  location?: string
  webUrl?: string
  provider?: 'google' | 'ical' | 'ticktick' | 'microsoft-todo'
}
export interface FocusSession {
  eventId: string
  extendedUntil?: number
}
export interface SubscriptionSnapshot {
  configured: boolean
  sourceLabel: string
  events: FocusEvent[]
  lastSynced: number | null
  refreshing: boolean
  error: string
  calendarName?: string
  timeZone?: string
  range?: CalendarRange
  redactedCount?: number
  addressKind?: 'public' | 'private' | 'other'
  sourceEventCount?: number
  sourceBusyCount?: number
  sourceTaskCount?: number
  sourceOtherCount?: number
  importWarnings?: string[]
  connectionType?: 'ical' | 'google'
  tasks?: import('./imports').ImportedTask[]
  hasTimedSource?: boolean
}
export interface CalendarRange { from: number; to: number }
export interface CalendarSource { text: string; downloadedAt: number; error: string; redacted?: boolean }
interface LocalEntry {
  id: string; title: string; date: string; kind: string; completed?: boolean
  startTime?: string; endTime?: string
}

export function localFocusEvents(entries: unknown): FocusEvent[] {
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry: LocalEntry) => {
    if (!entry || entry.kind !== 'block' || entry.completed || typeof entry.id !== 'string' || typeof entry.title !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !entry.startTime || !entry.endTime) return []
    const minutes = (time: string) => {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== '24:00') return NaN
      const [hour, minute] = time.split(':').map(Number)
      return hour * 60 + minute
    }
    const startMinute = minutes(entry.startTime), endMinute = minutes(entry.endTime)
    if (!(startMinute < endMinute && startMinute < 1440)) return []
    const [year, month, day] = entry.date.split('-').map(Number)
    const base = new Date(year, month - 1, day)
    if (base.getFullYear() !== year || base.getMonth() !== month - 1 || base.getDate() !== day) return []
    const at = (minute: number) => new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60).getTime()
    return [{ id: 'local:' + entry.id + ':' + entry.date + ':' + entry.startTime, title: entry.title, start: at(startMinute), end: at(endMinute), source: 'local' as const }]
  })
}

export function focusView(events: FocusEvent[], session: FocusSession | null, completed: Record<string, number>, now: number) {
  const available = events.filter(event => !event.allDay && event.end > event.start && Number.isFinite(event.start) && Number.isFinite(event.end) && !completed[event.id])
  // A saved selection only holds an event while its time interval is active.
  // Explicit extensions move that boundary; missing completion clicks never do.
  const endOf = (event: FocusEvent) => Math.max(event.end, session?.eventId === event.id ? session.extendedUntil ?? 0 : 0)
  const active = available.filter(event => event.start <= now && endOf(event) > now)
    .sort((a, b) => endOf(a) - endOf(b) || a.start - b.start || a.id.localeCompare(b.id))
  const selected = session ? active.find(event => event.id === session.eventId) : undefined
  const current = selected ?? active[0] ?? null
  const end = current ? endOf(current) : 0
  const concurrent = active.filter(event => event.id !== current?.id)
  // An event that has already started is concurrent, never the next arrangement.
  const next = available.filter(event => event.id !== current?.id && event.start > now).sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))[0] ?? null
  const conflicts = current ? available.filter(event => event.id !== current.id && endOf(event) > now && event.start < end) : []
  return { current, concurrent, next, end, conflicts, progress: current ? Math.max(0, Math.min(1, (now - current.start) / (end - current.start))) : 0 }
}

export function extendFocus(current: FocusEvent, end: number, now: number): FocusSession {
  return { eventId: current.id, extendedUntil: Math.max(end, now) + 15 * 60_000 }
}
