import ical from 'node-ical'
import { createHash } from 'node:crypto'
import { CalendarImportError } from './calendar-errors.ts'
import type { CalendarRange, FocusEvent } from '../shared/focus'
import { timetableEventDetails } from './timetable-event'
import { calendarEventInfo, localCalendarDay } from './calendar-source'

export function subscriptionURL(value: string): URL {
  let url: URL
  try { url = new URL(value.trim().replace(/^webcal:/i, 'https:')) }
  catch { throw new CalendarImportError('invalid-url') }
  if (url.protocol !== 'https:' || url.username || url.password || value.length > 8192) throw new CalendarImportError('invalid-url')
  if ((url.hostname === 'calendar.google.com' || url.hostname === 'www.google.com') && !url.pathname.startsWith('/calendar/ical/')) throw new CalendarImportError('page-url')
  return url
}
export function calendarMetadata(text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const header = (name: string, max: number) => (unfolded.match(new RegExp('^' + name + '(?:;[^:\\r\\n]*)?:(.*)$', 'im'))?.[1] ?? '').trim().replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').slice(0, max)
  let inside = false, sourceEventCount = 0, sourceBusyCount = 0
  for (const line of unfolded.split(/\r?\n/)) {
    if (/^BEGIN:VEVENT$/i.test(line)) { inside = true; sourceEventCount++ }
    else if (/^END:VEVENT$/i.test(line)) inside = false
    else if (inside && /^SUMMARY(?:;[^:]*)?:(?:busy|忙碌)\s*$/i.test(line)) sourceBusyCount++
  }
  return { calendarName: header('X-WR-CALNAME', 200), timeZone: header('X-WR-TIMEZONE', 100), sourceEventCount, sourceBusyCount }
}
export async function parseSubscription(text: string, now = Date.now(), viewed?: CalendarRange, excludeCompleted = false, warnings: string[] = []): Promise<FocusEvent[]> {
  if (!text.includes('BEGIN:VCALENDAR') || !text.includes('END:VCALENDAR')) {
    throw new CalendarImportError(/<\s*(?:!doctype\s+html|html|head|body)\b/i.test(text) ? 'html' : 'format')
  }
  if (/^RRULE[^\r\n]*\bFREQ=(SECONDLY|MINUTELY)\b/im.test(text)) throw new CalendarImportError('recurrence')
  try {
    const data = await ical.async.parseICS(text)
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - start.getDay())
    const end = new Date(start)
    end.setDate(end.getDate() + 21)
    // Keep the entire current week, plus upcoming focus events. Expand any viewed
    // week separately so browsing old dates does not expand years of recurrence.
    const ranges: CalendarRange[] = [{ from: start.getTime(), to: end.getTime() }]
    if (viewed && (viewed.from < start.getTime() || viewed.to > end.getTime())) ranges.push(viewed)
    const output = new Map<string, FocusEvent>()
    let invalidDates = 0
    for (const event of Object.values(data)) {
      if (!event || event.type !== 'VEVENT' || event.status === 'CANCELLED' || excludeCompleted && event.datetype === 'date') continue
      if (!(event.start instanceof Date) || !Number.isFinite(event.start.getTime()) || event.end && (!Number.isFinite(event.end.getTime()) || event.end < event.start)) { invalidDates++; continue }
      if (excludeCompleted && (String(event.status) === 'COMPLETED' || event.completion === '100' || 'completed' in event && event.completed)) continue
      for (const range of ranges) {
        for (const instance of ical.expandRecurringEvent(event, { from: new Date(range.from), to: new Date(range.to), expandOngoing: true })) {
          if (excludeCompleted && instance.isFullDay || instance.event.status === 'CANCELLED') continue
          if (excludeCompleted && (String(instance.event.status) === 'COMPLETED' || instance.event.completion === '100' || 'completed' in instance.event && instance.event.completed)) continue
          const start = instance.isFullDay ? localCalendarDay(instance.start) : instance.start.getTime()
          const end = instance.isFullDay ? localCalendarDay(instance.end) : instance.end.getTime()
          if (!(Number.isFinite(start) && Number.isFinite(end) && end > start && end > range.from && start < range.to)) continue
          const id = 'subscription:' + createHash('sha256').update(String(event.uid) + ':' + start).digest('hex').slice(0, 32)
          const details = timetableEventDetails(instance.summary, instance.event.description ?? event.description, instance.event.location ?? event.location)
          output.set(id, { id, ...details, start, end, allDay: instance.isFullDay || undefined, sourceDetails: calendarEventInfo({ ...event, ...instance.event }), source: 'subscription' })
          if (output.size > 5000) throw new CalendarImportError('events')
        }
      }
    }
    if (invalidDates) warnings.push('有 ' + invalidDates + ' 条安排的日期无效，未放入时间表；原文仍保留在完整源文件中。')
    return [...output.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  } catch (error) {
    if (error instanceof CalendarImportError) throw error
    throw new CalendarImportError('parse')
  }
}

