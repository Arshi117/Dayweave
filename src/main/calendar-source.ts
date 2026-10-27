import type { VEvent, DateWithTimeZone } from 'node-ical'

export function calendarDateKey(value: DateWithTimeZone): string {
  let parts: Intl.DateTimeFormatPart[]
  // node-ical represents floating DATE values at local midnight, without a tz property.
  try { parts = new Intl.DateTimeFormat('en-CA', { timeZone: value.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value) }
  catch { parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value) }
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? ''
  return get('year') + '-' + get('month') + '-' + get('day')
}
export function localCalendarDay(value: DateWithTimeZone): number {
  const [year, month, day] = calendarDateKey(value).split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}
const labels: Record<string, string> = { uid: '事件标识', status: '状态', organizer: '组织者', attendee: '参与者', categories: '分类', url: '相关链接', rrule: '重复规则', exdate: '排除日期', recurrenceid: '单次变更', sequence: '修订版本', lastmodified: '最后修改', created: '创建时间', alarms: '来源提醒', class: '公开范围', transparency: '忙闲状态' }
function fieldText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '日期无法识别'
  if (typeof value !== 'object') return String(value)
  if (depth > 3) return '嵌套内容请查看完整源文件'
  if (Array.isArray(value)) return value.map(item => fieldText(item, depth + 1)).join('\n')
  if ('val' in value) return fieldText(value.val, depth + 1) + ('params' in value ? '\n' + fieldText(value.params, depth + 1) : '')
  if ('toText' in value && typeof value.toString === 'function') return value.toString()
  return Object.entries(value).map(([key, item]) => key + ': ' + fieldText(item, depth + 1)).join('\n')
}
// The complete input is archived separately; these fields form a readable projection.
export function calendarEventInfo(event: VEvent) {
  const ignored = new Set(['type', 'start', 'end', 'datetype', 'summary', 'description', 'location', 'recurrences', 'params', 'dtstamp'])
  const fields = Object.entries(event).filter(([key]) => !ignored.has(key)).map(([key, value]) => ({ label: labels[key] || key, value: fieldText(value).slice(0, 4000) })).filter(field => field.value)
  if (event.start?.tz) fields.unshift({ label: '来源时区', value: event.start.tz })
  return fields
}
export function calendarSourceCounts(text: string) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  let tasks = 0, other = 0
  const stack: string[] = []
  for (const line of lines) {
    const begin = /^BEGIN:([^;:]+)$/i.exec(line)
    if (begin) {
      const kind = begin[1].toUpperCase()
      if (stack.at(-1) === 'VCALENDAR') {
        if (kind === 'VTODO') tasks++
        else if (!['VEVENT', 'VTIMEZONE'].includes(kind)) other++
      }
      stack.push(kind)
    } else if (/^END:/i.test(line)) stack.pop()
  }
  const warnings: string[] = []
  if (other) warnings.push('另有 ' + other + ' 条日志、忙闲或扩展记录，保留在完整源文件中，不会作为时间块显示。')
  return { sourceTaskCount: tasks, sourceOtherCount: other, importWarnings: warnings }
}
