import type { CalendarRange, FocusEvent, SubscriptionSnapshot } from './focus'

export interface GoogleCalendarItem {
  id: string
  name: string
  selected: boolean
  primary: boolean
  accessRole: string
}
export interface GoogleCalendarState {
  configured: boolean
  connected: boolean
  authorizing: boolean
  refreshing: boolean
  reconnectRequired: boolean
  calendars: GoogleCalendarItem[]
  events: FocusEvent[]
  lastSynced: number | null
  range?: CalendarRange
  error: string
}
export const EMPTY_GOOGLE: GoogleCalendarState = {
  configured: false, connected: false, authorizing: false, refreshing: false,
  reconnectRequired: false, calendars: [], events: [], lastSynced: null, error: '',
}
export function googleSubscription(state: GoogleCalendarState): SubscriptionSnapshot {
  return { configured: state.connected, sourceLabel: 'Google Calendar', connectionType: 'google',
    calendarName: state.calendars.filter(calendar => calendar.selected).map(calendar => calendar.name).join('、'),
    events: state.events, lastSynced: state.lastSynced, refreshing: state.refreshing,
    error: state.error, range: state.range,
    redactedCount: state.events.filter(event => /^(Busy|忙碌|忙碌（名称未提供）)$/i.test(event.title.trim())).length }
}
