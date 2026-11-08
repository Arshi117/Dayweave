import type { FocusEvent } from './focus'

export interface CalendarFilePreview {
  token: string
  name: string
  eventCount: number
  taskCount: number
  examples: FocusEvent[]
  warnings: string[]
  error: string
  existingId?: string
}
export interface TimetableCourse {
  id: string
  title: string
  weekday: number
  startTime: string
  endTime: string
  weeks: string
  location: string
  sourceText?: string
  periods?: string
  teacher?: string
}
export interface TimetableUnscheduledCourse { id: string; title: string; description: string }

// Week numbers refer to the school's first teaching week, not ISO week numbers.
export function teachingWeeks(value: string): number[] {
  const weeks = new Set<number>()
  const normalized = value.trim().replace(/[，、]/g, ',').replace(/[—–~～至]/g, '-').replace(/周/g, '')
  if (!normalized) throw new Error('请填写上课周次，例如 1-16、1-16单 或 2,4,6。')
  for (const part of normalized.split(',')) {
    const match = /^(\d{1,2})(?:-(\d{1,2}))?\s*(单|双)?$/.exec(part.trim())
    if (!match) throw new Error('周次格式无法识别，请使用 1-16、1-16单 或 2,4,6。')
    const from = Number(match[1]), to = Number(match[2] || match[1])
    if (from < 1 || to > 30 || from > to) throw new Error('上课周次需要在第 1 至 30 周之间。')
    for (let week = from; week <= to; week++) if (!match[3] || week % 2 === (match[3] === '单' ? 1 : 0)) weeks.add(week)
  }
  if (!weeks.size) throw new Error('所填周次没有上课日期，请检查单双周。')
  return [...weeks].sort((a, b) => a - b)
}
const escapeICS = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')

// Use an explicit school timezone. Moving the computer must not move Chinese classes.
export function timetableCalendar(name: string, firstMonday: string, courses: TimetableCourse[], unscheduled: TimetableUnscheduledCourse[] = []): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstMonday)) throw new Error('请填写教学第 1 周的周一日期。')
  const base = new Date(firstMonday + 'T00:00:00Z')
  if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== firstMonday || base.getUTCDay() !== 1) throw new Error('教学第 1 周的起始日期必须是周一。')
  if (!courses.length || courses.length > 100) throw new Error('请填写 1 至 100 条课程。')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dayweave//Timetable//ZH', 'X-WR-CALNAME:' + escapeICS(name.slice(0, 200)), 'X-WR-TIMEZONE:Asia/Shanghai']
  const ids = new Set<string>()
  for (const course of courses) {
    if (!course || typeof course.title !== 'string' || !course.title.trim() || course.title.length > 300 || typeof course.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(course.id) || ids.has(course.id)) throw new Error('请填写课程名称，每条课程需有独立标识。')
    ids.add(course.id)
    if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7) throw new Error('请选择上课的星期。')
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
    if (!time.test(course.startTime) || !time.test(course.endTime) || course.endTime <= course.startTime) throw new Error('请填写有效的开始和结束时间，结束需晚于开始。')
    for (const week of teachingWeeks(course.weeks)) {
      const day = new Date(base); day.setUTCDate(day.getUTCDate() + (week - 1) * 7 + course.weekday - 1)
      const date = day.toISOString().slice(0, 10).replace(/-/g, '')
      lines.push('BEGIN:VEVENT', 'UID:dayweave-' + course.id + '-w' + week, 'DTSTAMP:20260101T000000Z',
        'DTSTART;TZID=Asia/Shanghai:' + date + 'T' + course.startTime.replace(':', '') + '00',
        'DTEND;TZID=Asia/Shanghai:' + date + 'T' + course.endTime.replace(':', '') + '00',
        'SUMMARY:' + escapeICS(course.title.trim()), 'LOCATION:' + escapeICS(course.location.slice(0, 500)), 'DESCRIPTION:' + escapeICS('教学第 ' + week + ' 周' + (course.sourceText ? '\n' + course.sourceText.slice(0, 12000) : '')), 'END:VEVENT')
    }
  }
  if (unscheduled.length > 100) throw new Error('无固定时段课程最多支持 100 条。')
  for (const item of unscheduled) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || !item.title.trim() || item.title.length > 300) throw new Error('请核对无固定时段课程的名称和标识。')
    ids.add(item.id)
    lines.push('BEGIN:VTODO', 'UID:dayweave-' + item.id, 'DTSTAMP:20260101T000000Z', 'SUMMARY:' + escapeICS(item.title.trim()), 'DESCRIPTION:' + escapeICS(item.description.slice(0, 12000)), 'END:VTODO')
  }
  return lines.concat('END:VCALENDAR', '').join('\r\n')
}
