import type { CalendarRange, FocusEvent, SubscriptionSnapshot } from './focus'
import type { GoogleCalendarState } from './google-calendar'
import type { CalendarLinkSource } from './import-links'

export type TaskProvider = 'ticktick' | 'microsoft-todo' | 'ical'
export function taskProviderName(task: ImportedTask): string { return task.provider === 'ticktick' ? 'TickTick' : task.provider === 'microsoft-todo' ? 'Microsoft To Do' : task.listName || '日历订阅' }
export interface ImportedTask {
  id: string
  title: string
  provider: TaskProvider
  listId: string
  listName: string
  description?: string
  dueDate?: string
  dueAt?: number
}
export interface TodoList { id: string; name: string; selected: boolean }
export interface MicrosoftTodoState {
  configured: boolean
  connected: boolean
  authorizing: boolean
  refreshing: boolean
  reconnectRequired: boolean
  lists: TodoList[]
  tasks: ImportedTask[]
  lastSynced: number | null
  error: string
}
export const EMPTY_MICROSOFT: MicrosoftTodoState = {
  configured: false, connected: false, authorizing: false, refreshing: false, reconnectRequired: false,
  lists: [], tasks: [], lastSynced: null, error: '',
}
export const EMPTY_SUBSCRIPTION: SubscriptionSnapshot = { configured: false, sourceLabel: '', events: [], tasks: [], lastSynced: null, refreshing: false, error: '' }

// A legacy Google availability feed remains a fallback; independent sources coexist.
export function combinedImports(google: GoogleCalendarState, legacy: SubscriptionSnapshot, ticktick: SubscriptionSnapshot, microsoft: MicrosoftTodoState, links: CalendarLinkSource[] = []): SubscriptionSnapshot {
  const sources: { label: string; snapshot: SubscriptionSnapshot; provider: FocusEvent['provider'] }[] = []
  if (google.connected) sources.push({ label: 'Google 日历' + (google.calendars.some(calendar => calendar.selected) ? ' · ' + google.calendars.filter(calendar => calendar.selected).map(calendar => calendar.name).join('、') : ''), provider: 'google', snapshot: {
    ...EMPTY_SUBSCRIPTION, configured: true, events: google.events, lastSynced: google.lastSynced,
    refreshing: google.refreshing, error: google.error, range: google.range,
  } })
  if (legacy.configured && !(google.connected && /(^|\.)google\.com$/i.test(legacy.sourceLabel))) sources.push({ label: legacy.calendarName || '日历订阅', snapshot: legacy, provider: 'ical' })
  if (ticktick.configured) sources.push({ label: 'TickTick', snapshot: ticktick, provider: 'ticktick' })
  for (const link of links) if (link.snapshot.configured) sources.push({ label: link.snapshot.calendarName || (link.provider === 'ticktick' ? 'TickTick' : link.snapshot.sourceLabel), snapshot: link.snapshot, provider: link.provider })
  const events = new Map<string, FocusEvent>()
  for (const { label, snapshot, provider } of sources) for (const event of snapshot.events) {
    const value = { ...event, provider, calendarName: event.calendarName || label }
    const old = events.get(event.id)
    if (!old || /^(busy|忙碌|忙碌（名称未提供）)$/i.test(old.title.trim())) events.set(event.id, value)
  }
  const labels = sources.map(source => source.label)
  if (microsoft.connected) labels.push('Microsoft To Do')
  const dates = [...sources.map(source => source.snapshot.lastSynced), microsoft.connected ? microsoft.lastSynced : null].filter((value): value is number => typeof value === 'number')
  const range: CalendarRange | undefined = sources[0]?.snapshot.range
  const covered = range && sources.every(source => source.snapshot.range?.from === range.from && source.snapshot.range?.to === range.to)
  const error = [...sources.filter(source => source.snapshot.error).map(source => source.label + '：' + source.snapshot.error), microsoft.connected && microsoft.error ? 'Microsoft To Do：' + microsoft.error : ''].filter(Boolean).join(' ')
  return { configured: labels.length > 0, calendarName: labels.join('、'), sourceLabel: labels.join('、'),
    events: [...events.values()], tasks: [...new Map([...sources.flatMap(source => source.snapshot.tasks || []), ...(microsoft.connected ? microsoft.tasks : [])].map(task => [task.id, task])).values()],
    lastSynced: dates.length ? Math.min(...dates) : null, refreshing: sources.some(source => source.snapshot.refreshing) || microsoft.refreshing,
    range: covered ? range : undefined, error, hasTimedSource: sources.length > 0,
    importWarnings: [...new Set(sources.flatMap(source => source.snapshot.importWarnings || []))],
    redactedCount: [...events.values()].filter(event => /^(busy|忙碌|忙碌（名称未提供）)$/i.test(event.title.trim())).length }
}
