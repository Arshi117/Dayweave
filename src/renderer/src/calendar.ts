import type { EventColor, PlannerEntry, TimedEntry } from './types'
export const HOUR_HEIGHT = 72
export const DAY_MINUTES = 1440
export const COLORS: { id: EventColor; name: string; rgb: string }[] = [
  { id: 'blue', name: '蓝色', rgb: '42, 126, 222' },
  { id: 'mint', name: '绿色', rgb: '19, 139, 114' },
  { id: 'violet', name: '紫色', rgb: '128, 85, 207' },
  { id: 'amber', name: '橙色', rgb: '183, 106, 29' },
  { id: 'rose', name: '粉色', rgb: '190, 69, 110' },
]
export function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
export function addDays(date: Date, count: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - start.getDay())
  return start
}
export function toMinutes(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN
  const [h, m] = value.split(':').map(Number)
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return NaN
  return h * 60 + m
}
export function timeLabel(minutes: number): string {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}
export function snapMinutes(minutes: number): number { return Math.round(minutes / 15) * 15 }
export function isTimedEntry(entry: PlannerEntry): entry is TimedEntry {
  if (entry.kind !== 'block' || !entry.startTime || !entry.endTime) return false
  const start = toMinutes(entry.startTime), end = toMinutes(entry.endTime)
  return start >= 0 && start < end && end <= DAY_MINUTES
}
export function colorRgb(color?: EventColor): string { return (COLORS.find(item => item.id === color) ?? COLORS[0]).rgb }
export interface PositionedEntry { entry: TimedEntry; lane: number; laneCount: number }
// Adjacent events share a lane. Each connected overlap group gets its own lanes.
export function layoutDay(entries: TimedEntry[]): PositionedEntry[] {
  const sorted = [...entries].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)
    || toMinutes(b.endTime) - toMinutes(a.endTime) || a.id.localeCompare(b.id))
  const output: PositionedEntry[] = []
  let group: PositionedEntry[] = [], ends: number[] = [], groupEnd = -1
  const flush = () => {
    for (const item of group) output.push({ ...item, laneCount: ends.length })
    group = []; ends = []
  }
  for (const entry of sorted) {
    const start = toMinutes(entry.startTime), end = toMinutes(entry.endTime)
    if (start >= groupEnd) flush()
    let lane = ends.findIndex(lastEnd => lastEnd <= start)
    if (lane < 0) lane = ends.length
    ends[lane] = end
    group.push({ entry, lane, laneCount: 1 })
    groupEnd = group.length === 1 ? end : Math.max(groupEnd, end)
  }
  flush()
  return output
}
