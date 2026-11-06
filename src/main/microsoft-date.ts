import { sync, type VEvent } from 'node-ical'

// Graph returns a clock value and its source zone, not a local date string.
// Convert to the device zone before extracting the date used by the task UI.
export function microsoftDueDate(value: unknown): string | undefined {
  if (value == null) return undefined
  const { dateTime, timeZone } = value as { dateTime?: unknown; timeZone?: unknown }
  if (typeof dateTime !== 'string') throw new Error('Invalid Microsoft due date')
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTime)) return dateTime
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|[+-]\d{2}:\d{2})?$/.exec(dateTime)
  if (!match) throw new Error('Invalid Microsoft due date')
  const zone = typeof timeZone === 'string' ? timeZone.trim() : ''
  let instant: Date
  if (match[7] || /^(UTC|Etc\/UTC|GMT)$/i.test(zone)) {
    instant = new Date(dateTime.replace(/\.\d+/, '') + (match[7] ? '' : 'Z'))
  } else {
    if (!zone || /[\r\n";]/.test(zone)) throw new Error('Invalid Microsoft due timezone')
    // Reuse the calendar parser's IANA and Windows timezone support.
    const stamp = match.slice(1, 4).join('') + 'T' + match.slice(4, 7).join('')
    const event = sync.parseICS('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:due\r\nDTSTART;TZID="' + zone + '":' + stamp + '\r\nEND:VEVENT\r\nEND:VCALENDAR').due as VEvent
    if (!event?.start?.tz) throw new Error('Unsupported Microsoft due timezone')
    new Intl.DateTimeFormat('en', { timeZone: event.start.tz })
    instant = event.start
  }
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid Microsoft due date')
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const get = (type: string) => parts.find(part => part.type === type)!.value
  return get('year') + '-' + get('month') + '-' + get('day')
}
