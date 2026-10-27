import ical from 'node-ical'
import { createHash } from 'node:crypto'
import { CalendarImportError } from './calendar-errors'
import type { CalendarRange } from '../shared/focus'
import type { ImportedTask, TaskProvider } from '../shared/imports'
import { calendarDateKey } from './calendar-source'

const label = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'val' in value ? String(value.val) : ''
const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')

// Date-only calendar items remain tasks instead of filling the timetable for 24 hours.
export async function parseTickTickTasks(text: string, viewed?: CalendarRange): Promise<ImportedTask[]> {
  return parseCalendarTasks(text, viewed)
}
export async function parseCalendarTasks(text: string, viewed?: CalendarRange, provider: TaskProvider = 'ticktick', listName = 'TickTick', warnings: string[] = []): Promise<ImportedTask[]> {
  const data = await ical.async.parseICS(text).catch(() => { throw new CalendarImportError('parse') })
  const tasks = new Map<string, ImportedTask>()
  const now = new Date(); now.setHours(0, 0, 0, 0); now.setDate(now.getDate() - now.getDay())
  const end = new Date(now); end.setDate(end.getDate() + 21)
  const ranges = [{ from: now.getTime(), to: end.getTime() }]
  if (viewed && (viewed.from < ranges[0].from || viewed.to > ranges[0].to)) ranges.push(viewed)
  function add(uid: string, title: unknown, description: unknown, date?: Date, timed = false) {
    const dueDate = date && Number.isFinite(date.getTime()) ? timed ? dateKey(date) : calendarDateKey(date) : undefined
    const id = (provider === 'ticktick' ? 'ticktick-task:' : 'ical-task:') + createHash('sha256').update(uid + ':' + (timed && date ? date.getTime() : dueDate || '')).digest('hex').slice(0, 32)
    tasks.set(id, { id, title: label(title).slice(0, 300) || '未命名任务', description: label(description).slice(0, 12000),
      provider, listId: provider === 'ticktick' ? 'ticktick-feed' : 'calendar-feed', listName, dueDate, dueAt: timed && date && Number.isFinite(date.getTime()) ? date.getTime() : undefined })
    if (tasks.size > 5000) throw new CalendarImportError('events')
  }
  for (const event of Object.values(data)) {
    if (!event || event.type !== 'VTODO' && event.type !== 'VEVENT' || event.status === 'CANCELLED' || event.status === 'COMPLETED' || event.completion === '100' || 'completed' in event && event.completed) continue
    if (event.type === 'VEVENT' && (!(event.start instanceof Date) || !Number.isFinite(event.start.getTime()))) continue
    if (event.type === 'VTODO') {
      // Recurring VTODO expansion is intentionally not inferred from due dates.
      if (event.rrule && !warnings.includes('重复待办目前只显示来源给出的当前一项；完整重复规则保留在源文件中。')) warnings.push('重复待办目前只显示来源给出的当前一项；完整重复规则保留在源文件中。')
      add(event.uid, event.summary, event.description, event.due, Boolean(event.due && !event.due.dateOnly))
    } else if (event.datetype === 'date') {
      if (provider !== 'ticktick') continue
      if (!event.rrule) { add(String(event.uid), event.summary, event.description, event.start); continue }
      for (const range of ranges) for (const item of ical.expandRecurringEvent(event, { from: new Date(range.from), to: new Date(range.to), expandOngoing: true })) {
        if (item.event.status !== 'CANCELLED') add(String(event.uid), item.summary, item.event.description, item.start)
      }
    } else if (!event.end || event.end.getTime() === event.start.getTime()) {
      if (!event.rrule) add(String(event.uid), event.summary, event.description, event.start, true)
      else {
        // A one-millisecond expansion interval represents a recurring deadline,
        // never a scheduled work duration in the timetable.
        const point = { ...event, end: new Date(event.start.getTime() + 1) }
        for (const range of ranges) for (const item of ical.expandRecurringEvent(point, { from: new Date(range.from), to: new Date(range.to), expandOngoing: true })) {
          if (item.event.status !== 'CANCELLED') add(String(event.uid), item.summary, item.event.description, item.start, true)
        }
      }
    }
  }
  return [...tasks.values()]
}
