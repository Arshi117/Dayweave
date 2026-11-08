import test from 'node:test'
import assert from 'node:assert/strict'
import { identifyImportLink, importLinkInputError } from '../src/shared/import-links.ts'
import { CalendarImportError, calendarErrorMessage } from '../src/main/calendar-errors.ts'

test('address validation distinguishes typos, incomplete links and unsupported schemes without echoing input', () => {
  for (const value of ['https://school.example/calendar', 'webcal://school.example/feed.ics', ' https://school.example/export?type=pdf ']) {
    assert.equal(importLinkInputError(value), ''); assert.ok(identifyImportLink(value))
  }
  for (const [value, reason] of [
    ['', /请先粘贴/], ['不是链接', /格式不正确/], ['https://', /格式不正确/],
    ['https:school.example', /格式不正确/], ['school.example/calendar.ics', /链接不完整/],
    ['https://school.example/a https://school.example/b', /空格或换行/],
    ['http://school.example/', /不支持 HTTP/], ['ftp://school.example/calendar.ics', /不支持这种链接/],
    ['file:///private/calendar.ics', /不支持这种链接/], ['https://user:secret@school.example/', /账号或密码/],
    ['https://school.example/' + 'a'.repeat(8192), /链接过长/],
  ]) {
    const error = importLinkInputError(value)
    assert.match(error, reason); assert.equal(identifyImportLink(value), null)
    assert.ok(!error.includes('secret'))
  }
})
test('valid account links remain separate from feed content detection', () => {
  assert.equal(identifyImportLink('https://calendar.google.com/calendar/u/0/r').mode, 'account')
  assert.equal(identifyImportLink('https://calendar.google.com/calendar/ical/a/basic.ics').mode, 'feed')
  assert.equal(identifyImportLink('https://to-do.microsoft.com/tasks').provider, 'microsoft')
  assert.equal(identifyImportLink('https://calendar.google.com.lookalike.example/calendar').provider, 'calendar')
  assert.equal(identifyImportLink('https://school.example/opaque-download').mode, 'feed')
})
test('feedback separates unsupported content, missing links, permissions and network failures', () => {
  const feedback = (code, detail) => calendarErrorMessage(new CalendarImportError(code, detail), false)
  assert.match(feedback('html'), /网页链接.*当前不支持/)
  assert.match(feedback('format'), /暂不支持.*内容/)
  assert.match(feedback('http', '404'), /不存在或已失效/)
  assert.match(feedback('http', '403'), /需要登录或没有访问权限/)
  assert.match(calendarErrorMessage({ code: 'ENOTFOUND' }, false), /检查网址是否拼写正确/)
  assert.match(calendarErrorMessage({ code: 'ERR_CERT_DATE_INVALID' }, false), /无法安全连接/)
  assert.match(calendarErrorMessage(new Error('https://school.example/private-token'), false), /检查网络/)
  assert.ok(!calendarErrorMessage(new Error('https://school.example/private-token'), false).includes('private-token'))
  assert.match(calendarErrorMessage(new Error(), true), /读取超时/)
})
