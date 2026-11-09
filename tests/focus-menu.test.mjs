import test from 'node:test'
import assert from 'node:assert/strict'
import { focusMenuLabel, readFocusMenuStatus } from '../src/shared/focus-menu.ts'

test('the Mac menu bar shows the event and timer, truncating long names without breaking emoji', () => {
  assert.equal(focusMenuLabel({ title: '小组讨论', timer: '22:15' }), '小组讨论 · 22:15')
  assert.equal(focusMenuLabel({ title: '下节课', timer: '' }), '下节课')
  const title = '👨‍👩‍👧‍👦'.repeat(13)
  assert.equal(focusMenuLabel({ title, timer: '01:00' }), '👨‍👩‍👧‍👦'.repeat(12) + '… · 01:00')
  assert.deepEqual(readFocusMenuStatus({ title: '课程\n答疑', timer: '10:00' }), { title: '课程 答疑', timer: '10:00' })
})
