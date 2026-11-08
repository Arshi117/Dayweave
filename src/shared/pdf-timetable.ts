import { teachingWeeks, type TimetableCourse, type TimetableUnscheduledCourse } from './calendar-files'

export interface PdfTextItem { str: string; x: number; y: number; width: number; height: number }
export interface PdfTextPage { width: number; height: number; items: PdfTextItem[] }
export interface TimetableRecognition {
  courses: TimetableCourse[]
  unscheduled: TimetableUnscheduledCourse[]
  warnings: string[]
  periods: { number: number; startTime: string; endTime: string }[]
  name: string
}
interface Line { text: string; y: number; page: number; height: number }
const days = '一二三四五六日'
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/
function linesOf(items: PdfTextItem[], page: number): Line[] {
  const lines: { items: PdfTextItem[]; y: number }[] = []
  for (const item of items.filter(item => item.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = lines.at(-1)
    if (previous && Math.abs(previous.y - item.y) <= 2) previous.items.push(item)
    else lines.push({ items: [item], y: item.y })
  }
  return lines.map(line => ({ text: line.items.sort((a, b) => a.x - b.x).map(item => item.str).join('').trim(), y: line.y, page, height: Math.max(...line.items.map(item => item.height), 1) }))
}
function normalizedWeeks(value: string): string {
  return value.replace(/[（(]([单双])(?:周)?[）)]/g, '$1').replace(/周/g, '').replace(/\s+/g, '').replace(/[，、]/g, ',').replace(/[—–~～至]/g, '-')
}

// Recognize explicit timetable metadata, never course descriptions or the
// visual height of a merged cell. Coordinates are already rotated to page space.
export function recognizePdfTimetable(pages: PdfTextPage[]): TimetableRecognition {
  const result: TimetableRecognition = { courses: [], unscheduled: [], warnings: [], periods: [], name: '' }
  const headerPage = pages.findIndex(page => page.items.filter(item => /^星期[一二三四五六日天]$/.test(item.str.trim())).length === 7)
  if (headerPage < 0) { result.warnings.push('未找到完整的星期表头，暂时无法自动识别此版式；可以对照 PDF 手动填写课程。'); return result }
  const reference = pages[headerPage]
  const headers = reference.items.filter(item => /^星期[一二三四五六日天]$/.test(item.str.trim())).sort((a, b) => a.x - b.x)
  if (headers.some((item, i) => (item.str.trim().at(-1) === '天' ? '日' : item.str.trim().at(-1)) !== days[i]) || Math.max(...headers.map(item => item.y)) - Math.min(...headers.map(item => item.y)) > 3) {
    result.warnings.push('星期列的位置不明确，请对照原文手动填写。'); return result
  }
  const centers = headers.map(item => (item.x + item.width / 2) / reference.width)
  const step = (centers[6] - centers[0]) / 6
  if (step <= 0 || centers.some((value, i) => i > 0 && Math.abs(value - centers[i - 1] - step) > step * .15)) {
    result.warnings.push('星期列间距不一致，请对照原文手动填写。'); return result
  }
  const periodHeader = reference.items.find(item => item.str.trim() === '节次')
  const term = reference.items.find(item => /\d{4}-\d{4}学年第[12一二]学期/.test(item.str))
  result.name = term ? term.str.trim() + '课表' : ''
  const columns: Line[][] = Array.from({ length: 7 }, () => [])
  const periodTokens: { text: string; page: number; y: number }[] = []
  const notes: string[] = []
  for (let pageIndex = headerPage; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]
    if (Math.abs(page.width / page.height - reference.width / reference.height) > .05) { result.warnings.push('第 ' + (pageIndex + 1) + ' 页的版式发生变化，未自动处理，请核对原文。'); continue }
    const scale = page.width / reference.width
    const header = page.items.filter(item => /^星期[一二三四五六日天]$/.test(item.str.trim()))
    const top = header.length ? Math.max(...header.map(item => item.y)) + 3 : -Infinity
    const footer = page.items.find(item => /^其他课程[：:]/.test(item.str.trim()))
    const bottom = footer?.y ?? Infinity
    if (footer) notes.push(...linesOf(page.items.filter(item => item.y >= bottom - 1 && item.y < bottom + 35 * scale && !/打印时间|★\s*[：:]/.test(item.str)), pageIndex).map(line => line.text))
    const body = page.items.filter(item => item.y > top && item.y < bottom - 1)
    if (periodHeader) {
      const center = (periodHeader.x + periodHeader.width / 2) * scale
      for (const item of body) if (Math.abs(item.x + item.width / 2 - center) <= 18 * scale && (/^\d{1,2}$/.test(item.str.trim()) || clock.test(item.str.trim()))) periodTokens.push({ text: item.str.trim(), page: pageIndex, y: item.y })
    }
    for (let day = 0; day < 7; day++) {
      const left = (centers[day] - step / 2) * page.width, right = (centers[day] + step / 2) * page.width
      columns[day].push(...linesOf(body.filter(item => item.x >= left - 2 && item.x < right - 2 && item.width < page.width * step * 1.25), pageIndex))
    }
  }
  let pending: { number: number; times: string[] } | undefined
  const periodMap = new Map<number, { startTime: string; endTime: string }>()
  const conflictingPeriods = new Set<number>()
  for (const token of periodTokens.sort((a, b) => a.page - b.page || a.y - b.y)) {
    if (/^\d{1,2}$/.test(token.text)) { pending = { number: Number(token.text), times: [] }; continue }
    if (!pending || pending.number < 1 || pending.number > 30) continue
    pending.times.push(token.text)
    if (pending.times.length === 2) {
      const [startTime, endTime] = pending.times
      if (startTime < endTime) {
        const old = periodMap.get(pending.number)
        if (old && (old.startTime !== startTime || old.endTime !== endTime)) {
          periodMap.delete(pending.number); conflictingPeriods.add(pending.number); result.warnings.push('第 ' + pending.number + ' 节有不同的作息时间，请手动核对。')
        } else if (!conflictingPeriods.has(pending.number)) periodMap.set(pending.number, { startTime, endTime })
      }
      pending = undefined
    }
  }
  result.periods = [...periodMap].map(([number, times]) => ({ number, ...times })).sort((a, b) => a.number - b.number)
  for (let day = 0; day < 7; day++) {
    const lines = columns[day]
    const candidates: { index: number; titleIndex: number; title: string; from: number; to: number; weeks: string }[] = []
    for (let i = 1; i < lines.length; i++) {
      const meta = /^[（(](\d{1,2})(?:[-~～—至](\d{1,2}))?节[）)]([^/]{1,80}周(?:[（(]?[单双](?:周)?[）)]?)?)(?:\/|$)/.exec(lines[i].text.replace(/\s+/g, ''))
      if (!meta) continue
      const title = lines[i - 1].text
      if (!/[★○●◆]$/.test(title) || lines[i - 1].page !== lines[i].page || lines[i].y - lines[i - 1].y > 3 * lines[i].height) {
        result.warnings.push('第 ' + (lines[i].page + 1) + ' 页有课程节次但名称位置不明确，未自动填写，请核对。'); continue
      }
      candidates.push({ index: i, titleIndex: i - 1, title: title.replace(/[★○●◆]+$/, '').trim(), from: Number(meta[1]), to: Number(meta[2] || meta[1]), weeks: normalizedWeeks(meta[3]) })
    }
    for (let i = 0; i < candidates.length && result.courses.length < 100; i++) {
      const candidate = candidates[i], source = lines.slice(candidate.titleIndex, candidates[i + 1]?.titleIndex ?? lines.length).map(line => line.text)
      const text = source.join(''), field = (label: string) => new RegExp('(?:^|/)' + label + '[:：]([^/]+)').exec(text)?.[1]?.trim() || ''
      try { teachingWeeks(candidate.weeks) } catch { result.warnings.push(candidate.title + '的周次需要手动核对。') }
      const startTime = periodMap.get(candidate.from)?.startTime || '', endTime = periodMap.get(candidate.to)?.endTime || ''
      if (!startTime || !endTime || candidate.to < candidate.from || endTime <= startTime) result.warnings.push(candidate.title + '的节次时间不完整，请手动填写。')
      result.courses.push({ id: 'pdf-' + day + '-' + lines[candidate.index].page + '-' + candidate.index,
        title: candidate.title, weekday: day + 1, weeks: candidate.weeks, startTime, endTime,
        location: [field('校区'), field('场地')].filter(Boolean).join(' · '),
        sourceText: source.join('\n').slice(0, 12000), periods: candidate.from + '-' + candidate.to, teacher: field('教师') })
      if (candidate.to - candidate.from >= 5) result.warnings.push(candidate.title + '（星期' + days[day] + '，第' + candidate.from + '-' + candidate.to + '节）跨度较长，时间包含课间或午间间隔，请核对是否需要拆分。')
    }
  }
  const note = notes.join('').replace(/^其他课程[：:]/, '')
  for (const item of note.split(/[;；]/).map(value => value.trim()).filter(Boolean)) {
    const match = /^(.{1,100}?)[★○●◆]/.exec(item)
    if (match) result.unscheduled.push({ id: 'pdf-unscheduled-' + result.unscheduled.length, title: match[1], description: item.slice(0, 12000) })
    else if (result.unscheduled.length) { const previous = result.unscheduled.at(-1)!; previous.description = (previous.description + '；' + item).slice(0, 12000) }
  }
  if (!result.courses.length) result.warnings.push('没有识别到带明确节次、周次的课程，请手动填写。')
  return result
}
