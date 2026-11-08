import test from 'node:test'
import assert from 'node:assert/strict'
import { recognizePdfTimetable } from '../src/shared/pdf-timetable.ts'
import { timetableCalendar } from '../src/shared/calendar-files.ts'
import { parseCalendarTasks } from '../src/main/task-feed.ts'
import { parseSubscription } from '../src/main/calendar-feed.ts'

// Synthetic coordinates model the three-page teaching-system layout without
// keeping a student's PDF, name, ID or teacher details in the repository.
const run = (str, x, y, width = str.length * 8, height = 8) => ({ str, x, y, width, height })
function fixture() {
  const pages = Array.from({ length: 3 }, () => ({ width: 842, height: 595, items: [] }))
  const add = (page, ...items) => pages[page].items.push(...items)
  const step = 103.845
  add(0, run('2026-2027学年第1学期', 21, 42), run('节次', 68.9, 74, 24, 12))
  ;[...'一二三四五六日'].forEach((day, i) => add(0, run('星期' + day, 133 + i * step, 74, 36, 12)))
  const times = [['08:05','08:50'],['08:55','09:40'],['09:55','10:40'],['10:45','11:30'],['11:35','12:20'],['12:20','13:05'],['13:30','14:15'],['14:20','15:05'],['15:20','16:05'],['16:10','16:55'],['17:00','17:45'],['18:30','19:15'],['19:20','20:05'],['20:10','20:55']]
  for (let number = 1; number <= 14; number++) {
    const page = number <= 6 ? 0 : number <= 13 ? 1 : 2
    const y = number <= 5 ? 89 + (number - 1) * 100 : number === 6 ? 567 : number <= 13 ? 56 + (number - 7) * 76 : 115
    add(page, run(String(number), 78, y, number < 10 ? 6 : 11, 12))
    if (number === 6) add(1, run(times[5][0], 68.39, 29, 25, 12), run(times[5][1], 68.39, 41, 25, 12))
    else add(page, run(times[number - 1][0], 68.39, y + 12, 25, 12), run(times[number - 1][1], 68.39, y + 24, 25, 12))
  }
  const course = (page, day, y, title, periods, weeks = '2-17', details = []) => {
    const x = 104.08 + (day - 1) * step
    add(page, run(title + '★', x, y, 90, 9), run('(' + periods + '节)' + weeks + '周/校区:测试校', x, y + 12, 96), run('区/场地:A101/教师:教师甲', x, y + 24, 96), ...details.map((text, i) => run(text, x, y + 36 + i * 12, 96)))
  }
  course(0, 1, 89.5, '课程A', '1-2')
  course(0, 1, 289.5, '课程B', '3-4')
  course(0, 2, 89.5, '课程C', '1-2')
  for (const day of [3,4,5]) course(0, day, 289.5, '课程' + day, '3-5')
  course(0, 6, 89.5, '集中实验', '1-11', '9-10')
  course(0, 7, 89.5, '集中实验', '1-10', '9-10')
  course(1, 3, 56.5, '下午课程', '7-8')
  course(1, 1, 208.5, '实验课程', '9-11')
  course(1, 1, 436.5, '跨页晚课', '12-14', '2-17', ['/教学班组成:测试班/选课备注:前半段'])
  course(1, 3, 436.5, '另一晚课', '12-13')
  add(2, run('跨页课程说明后半段/课程学时组成:讲课:48', 104.08, 28, 96), run('其他课程：线上专题★教师甲(共12周)/6-17周/学习平台：测试平台；视频学习时间6-17周。', 18, 151, 790, 10), run('★:讲课 ○:实验', 18, 177.5))
  return pages
}
test('three-page text timetables preserve weekday columns, split periods, continued cells and untimed courses', () => {
  const result = recognizePdfTimetable(fixture())
  assert.equal(result.courses.length, 12)
  assert.equal(result.periods.length, 14)
  assert.equal(result.name, '2026-2027学年第1学期课表')
  const evening = result.courses.find(course => course.title === '跨页晚课')
  assert.equal(evening.weekday, 1); assert.equal(evening.startTime, '18:30'); assert.equal(evening.endTime, '20:55')
  assert.equal(evening.location, '测试校区 · A101'); assert.equal(evening.teacher, '教师甲')
  assert.ok(evening.sourceText.includes('跨页课程说明后半段'))
  assert.equal(result.courses.find(course => course.title === '下午课程').weekday, 3)
  assert.deepEqual(result.courses.filter(course => course.title === '集中实验').map(course => [course.weekday, course.weeks, course.startTime, course.endTime]), [[6,'9-10','08:05','17:45'],[7,'9-10','08:05','16:55']])
  assert.equal(result.unscheduled.length, 1); assert.equal(result.unscheduled[0].title, '线上专题')
  assert.ok(result.unscheduled[0].description.includes('视频学习时间6-17周'))
  assert.equal(result.warnings.length, 2)
})
test('recognition produces 164 dated occurrences and an undated task only after a teaching-week anchor is supplied', async () => {
  const result = recognizePdfTimetable(fixture())
  assert.throws(() => timetableCalendar(result.name, '', result.courses, result.unscheduled), /周一/)
  const text = timetableCalendar(result.name, '2026-09-07', result.courses, result.unscheduled)
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 164)
  const tasks = await parseCalendarTasks(text, undefined, 'ical', result.name)
  assert.equal(tasks.length, 1); assert.equal(tasks[0].dueAt, undefined); assert.equal(tasks[0].dueDate, undefined)
  const from = Date.parse('2026-09-14T00:00:00+08:00')
  const events = await parseSubscription(text, from, { from, to: from + 7 * 86400000 })
  const evening = events.find(event => event.title === '跨页晚课')
  assert.equal(evening.start, Date.parse('2026-09-14T18:30:00+08:00'))
  assert.ok(evening.description.includes('跨页课程说明后半段'))
})
test('odd and even weeks are retained and ambiguous or absent times require review', () => {
  const pages = fixture()
  pages[0].items.find(item => item.str.startsWith('(1-2节)')).str = '(1-2节)2-17周(双)/校区:测试校'
  const result = recognizePdfTimetable(pages)
  assert.equal(result.courses[0].weeks, '2-17双')
  const missing = fixture()
  missing[2].items = missing[2].items.filter(item => item.str !== '20:55')
  const review = recognizePdfTimetable(missing)
  assert.equal(review.courses.find(course => course.title === '跨页晚课').endTime, '')
  assert.ok(review.warnings.some(warning => warning.includes('节次时间不完整')))
  const unsupported = recognizePdfTimetable([{ width: 600, height: 800, items: [run('课程说明里提到(1-2节)2-17周', 30, 50)] }])
  assert.equal(unsupported.courses.length, 0); assert.ok(unsupported.warnings.length)
})
