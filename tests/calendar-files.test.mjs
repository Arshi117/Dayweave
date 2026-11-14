import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { teachingWeeks, timetableCalendar } from '../src/shared/calendar-files.ts'
import { parseSubscription } from '../src/main/calendar-feed.ts'

// The production encryption boundary is Electron safeStorage; no network or OS
// credential store is needed for lifecycle tests against a temporary profile.
registerHooks({ load(url, context, next) {
  if (url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true }
  return next(url, context)
}, resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: 'data:text/javascript,' + encodeURIComponent(`
    export const safeStorage = { isEncryptionAvailable: () => true,
      encryptString: text => Buffer.from(text).map(byte => byte ^ 90),
      decryptString: data => Buffer.from(data).map(byte => byte ^ 90).toString('utf8') };
    export const net = { fetch: (...args) => { if (globalThis.__dayweaveTestFetch) return globalThis.__dayweaveTestFetch(...args); throw new Error('File imports must not fetch'); } };
  `), shortCircuit: true }
  return next(specifier, context)
} })
const { CalendarLinks } = await import('../src/main/calendar-links.ts')
const { previewCalendarFile } = await import('../src/main/calendar-file.ts')
const { downloadCalendarResource } = await import('../src/main/calendar-download.ts')
const monday = '2026-09-07'
const course = (patch = {}) => ({ id: 'math-1', title: '高等数学', weekday: 1, startTime: '08:05', endTime: '09:40', weeks: '1-16单', location: '教学楼 301', ...patch })
const calendar = (title = '高等数学') => timetableCalendar('学期课表', monday, [course({ title })])

test('Chinese teaching weeks handle ranges, odd/even weeks and explicit exceptions', () => {
  assert.deepEqual(teachingWeeks('1-6单,8,10-12双'), [1, 3, 5, 8, 10, 12])
  assert.deepEqual(teachingWeeks('2～6双周、9'), [2, 4, 6, 9])
  for (const invalid of ['', '0-16', '16-1', '1-31', '第1周', '2-2单', '1-2,']) assert.throws(() => teachingWeeks(invalid))
})
test('semester classes anchor to the first teaching Monday and preserve China time', async () => {
  const text = calendar()
  const from = Date.parse('2026-09-07T00:00:00+08:00')
  const events = await parseSubscription(text, from, { from, to: from + 7 * 86400000 })
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 8)
  assert.equal(events[0].start, Date.parse('2026-09-07T08:05:00+08:00'))
  assert.equal(events[0].end, Date.parse('2026-09-07T09:40:00+08:00'))
  assert.equal(events[0].location, '教学楼 301')
  assert.ok(!events.some(event => new Date(event.start).toISOString().startsWith('2026-09-14')))
  assert.throws(() => timetableCalendar('课表', '2026-09-08', [course()]), /周一/)
  assert.throws(() => timetableCalendar('课表', '2026-02-30', [course()]))
  assert.throws(() => timetableCalendar('课表', monday, [course({ endTime: '08:00' })]))
})
test('calendar text cannot inject components through course names or classrooms', async () => {
  const title = '线性代数, A;B\r\nBEGIN:VEVENT'
  const text = timetableCalendar('名称\rEND:VCALENDAR', monday, [course({ title, weeks: '1' })])
  assert.equal((text.match(/^BEGIN:VEVENT$/gm) || []).length, 1)
  const preview = await previewCalendarFile(text, '课表.pdf', 'test')
  assert.equal(preview.eventCount, 1)
  assert.equal(preview.examples[0].title, title.replace('\r\n', '\n'))
})
test('preview, cancel, commit, dedup, restart, replacement and removal keep independent sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dayweave-files-'))
  const links = new CalendarLinks(directory, () => {})
  let restarted
  try {
    let preview = await links.previewFile('课表.ics', calendar())
    assert.equal(preview.error, '')
    assert.equal(preview.eventCount, 8)
    assert.ok(preview.examples.length)
    assert.equal(links.state().sources.length, 0)
    assert.deepEqual(await readdir(directory), [])
    links.cancelFile()
    assert.ok((await links.commitFile(preview.token)).error)
    preview = await links.previewFile('课表.ics', calendar())
    const imported = await links.commitFile(preview.token)
    assert.equal(imported.error, '')
    const id = imported.addedId
    assert.equal(imported.sources[0].kind, 'file')
    const stored = await readFile(join(directory, id + '.json'), 'utf8')
    assert.ok(!stored.includes('高等数学'))
    assert.ok((await links.previewFile('另一个名字.ics', calendar())).error)
    restarted = new CalendarLinks(directory, () => {})
    await restarted.load()
    assert.equal(restarted.state().sources[0].snapshot.connectionType, 'file')
    const range = { from: Date.parse('2026-09-07T00:00:00+08:00'), to: Date.parse('2026-09-14T00:00:00+08:00') }
    await restarted.setRange(range)
    const originalId = restarted.state().sources[0].snapshot.events.find(event => event.title === '高等数学').id
    const second = await restarted.previewFile('其他课.ics', calendar('大学英语'))
    await restarted.commitFile(second.token)
    assert.equal(restarted.state().sources.length, 2)
    const bad = await restarted.previewFile('无效.ics', '<html>登录</html>', id)
    assert.ok(bad.error)
    assert.equal(restarted.state().sources[0].snapshot.events[0].title, '高等数学')
    const replacement = await restarted.previewFile('新课表.ics', calendar('调整后数学'), id)
    const replaced = await restarted.commitFile(replacement.token)
    assert.equal(replaced.sources.length, 2)
    assert.equal(replaced.addedId, id)
    assert.equal(replaced.sources[0].snapshot.events.find(event => event.title === '调整后数学').id, originalId)
    const source = await restarted.readSource(id)
    assert.ok(source.text.includes('调整后数学'))
    await restarted.remove(id)
    assert.equal(restarted.state().sources.length, 1)
    assert.equal(restarted.state().sources[0].snapshot.events[0].title, '大学英语')
    assert.equal(await readFile(join(directory, id + '.json'), 'utf8'), '{}')
  } finally { links.stop(); restarted?.stop(); await rm(directory, { recursive: true, force: true }) }
})
test('invalid names, oversized content and malformed calendars never create sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dayweave-files-'))
  const links = new CalendarLinks(directory, () => {})
  try {
    for (const [name, text] of [['../secret.ics', calendar()], ['large.ics', 'x'.repeat(8 * 1024 * 1024 + 1)], ['empty.ics', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'], ['网页.ics', '<html>Login</html>']]) assert.ok((await links.previewFile(name, text)).error)
    assert.equal(links.state().sources.length, 0)
    assert.deepEqual(await readdir(directory), [])
  } finally { links.stop(); await rm(directory, { recursive: true, force: true }) }
})

test('link content is detected independently of extension or content-type, with safe download filenames', async () => {
  const signal = new AbortController().signal
  const ics = await downloadCalendarResource(new URL('https://school.example/export'), signal, true, async (_url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'manual')
    return new Response(calendar(), { headers: { 'content-type': 'application/octet-stream' } })
  })
  assert.equal(ics.kind, 'calendar'); assert.equal(ics.text, calendar())
  const pdfText = '%PDF-1.7\nfixture'
  const pdf = await downloadCalendarResource(new URL('https://school.example/export?secret=private'), signal, true, async () => new Response(pdfText, { headers: { 'content-type': 'text/plain', 'content-disposition': "attachment; filename*=UTF-8''%E8%AF%BE%E8%A1%A8.pdf" } }))
  assert.deepEqual(pdf, { kind: 'pdf', name: '课表.pdf', base64: Buffer.from(pdfText).toString('base64') })
  const opaquePdf = await downloadCalendarResource(new URL('https://school.example/export?secret=private'), signal, true, async () => new Response(pdfText))
  assert.equal(opaquePdf.name, '课表.pdf')
  for (const body of ['<!DOCTYPE html><html>Login</html>', '<html>%PDF-1.7</html>']) await assert.rejects(downloadCalendarResource(new URL('https://school.example/timetable.pdf'), signal, true, async () => new Response(body)), error => error.code === 'html')
  await assert.rejects(downloadCalendarResource(new URL('https://school.example/export'), signal, true, async () => new Response('some csv, data')), error => error.code === 'format')
})
test('redirects retain validation, HTTP failures are explicit, and oversized downloads cancel their stream', async () => {
  const signal = new AbortController().signal
  let calls = 0
  const result = await downloadCalendarResource(new URL('https://school.example/export'), signal, true, async url => {
    calls++
    return url.endsWith('/export') ? new Response(null, { status: 302, headers: { location: '/actual.pdf' } }) : new Response('%PDF-1.7\nfixture')
  })
  assert.equal(calls, 2); assert.equal(result.name, 'actual.pdf')
  for (const target of ['http://school.example/file', 'file:///secret', 'https://user:pass@school.example/file']) await assert.rejects(downloadCalendarResource(new URL('https://school.example/export'), signal, true, async () => new Response(null, { status: 302, headers: { location: target } })), error => error.code === 'invalid-url')
  await assert.rejects(downloadCalendarResource(new URL('https://school.example/export'), signal, true, async () => new Response(null, { status: 403 })), error => error.code === 'http' && error.detail === '403')
  for (const [prefix, size, detail] of [['BEGIN:VCALENDAR\r\n', 8 * 1024 * 1024, ''], ['%PDF-1.7\n', 20 * 1024 * 1024, 'pdf']]) {
    let cancelled = false
    const stream = new ReadableStream({ start(controller) { controller.enqueue(Buffer.concat([Buffer.from(prefix), Buffer.alloc(size)])) }, cancel() { cancelled = true } })
    await assert.rejects(downloadCalendarResource(new URL('https://school.example/export'), signal, true, async () => new Response(stream)), error => error.code === 'size' && error.detail === detail)
    assert.equal(cancelled, true)
  }
})
test('adding links routes PDF to preview without persistence, subscribes ICS once, and leaves sources intact on failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dayweave-links-'))
  const links = new CalendarLinks(directory, () => {})
  let calls = 0
  globalThis.__dayweaveTestFetch = async url => {
    calls++
    if (url.endsWith('/calendar')) return new Response(calendar())
    if (url.endsWith('/pdf')) return new Response('%PDF-1.7\nfixture')
    if (url.endsWith('/forbidden')) return new Response(null, { status: 403 })
    if (url.endsWith('/network')) throw new Error('failed https://school.example/private-secret')
    return new Response('<html>Login</html>')
  }
  try {
    const pdf = await links.add('https://school.example/pdf')
    assert.equal(pdf.error, ''); assert.ok(pdf.pdf); assert.equal(pdf.sources.length, 0)
    assert.deepEqual(await readdir(directory), [])
    calls = 0
    const added = await links.add('https://school.example/calendar')
    assert.equal(added.error, ''); assert.ok(added.addedId); assert.equal(calls, 1)
    const refreshed = await links.add('https://school.example/calendar')
    assert.equal(refreshed.sources.length, 1); assert.equal(refreshed.addedId, added.addedId); assert.equal(calls, 2)
    for (const path of ['/page.pdf', '/forbidden', '/network']) {
      const rejected = await links.add('https://school.example' + path)
      assert.ok(rejected.error); assert.ok(!rejected.error.includes('private-secret'))
      assert.equal(rejected.sources.length, 1); assert.equal(rejected.sources[0].id, added.addedId)
    }
    assert.match((await links.add('https://school.example/page.pdf')).error, /教务网页|登录页面/)
  } finally { delete globalThis.__dayweaveTestFetch; links.stop(); await rm(directory, { recursive: true, force: true }) }
})
