import type { FocusEvent } from '../../shared/focus'
import type { TimedEntry } from './types'
import { addDays, dateKey, timeLabel } from './calendar'

// Split timed subscriptions at local midnight without copying them into editable local storage.
export function importedCalendarEntries(events: FocusEvent[], days: Date[]): TimedEntry[] {
  const entries: TimedEntry[] = []
  for (const day of days) {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
    const end = addDays(new Date(start), 1).getTime()
    for (const event of events) {
      if (!Number.isFinite(event.start) || !Number.isFinite(event.end) || event.start >= end || event.end <= start) continue
      const from = new Date(Math.max(start, event.start)), to = new Date(Math.min(end, event.end))
      const first = from.getHours() * 60 + from.getMinutes()
      const last = event.end >= end ? 1440 : to.getHours() * 60 + to.getMinutes()
      if (last <= first) continue
      entries.push({ id: event.id + '@' + dateKey(day), title: event.title, date: dateKey(day),
        startTime: timeLabel(first), endTime: timeLabel(last), kind: 'block', completed: false, color: 'mint', readOnly: true,
        allDay: event.allDay, sourceDetails: event.sourceDetails, sourceTitle: event.sourceTitle, description: event.description, location: event.location, calendarName: event.calendarName, sourceEventId: event.id, webUrl: event.webUrl, provider: event.provider })
    }
  }
  return entries
}
