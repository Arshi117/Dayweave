import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultFrame, fitFrame, changeFrame } from '../src/renderer/src/calendar-frame.ts'

const viewport = { width: 1920, height: 1080 }
const frame = { x: 200, y: 120, width: 1000, height: 700 }
test('initial calendar leaves desktop space visible', () => {
  const initial = defaultFrame(viewport)
  assert.ok(initial.width < viewport.width && initial.height < viewport.height)
  assert.ok(initial.x > 0 && initial.y >= 76)
})
test('moving cannot leave the calendar outside the visible desktop', () => {
  assert.deepEqual(changeFrame(frame, 'move', -300, 2000, viewport), { ...frame, x: 0, y: 380 })
})
test('northwest resizing keeps the opposite corner anchored and enforces readable minimums', () => {
  const next = changeFrame(frame, 'nw', 999, 999, viewport)
  assert.equal(next.width, 660)
  assert.equal(next.height, 380)
  assert.equal(next.x + next.width, frame.x + frame.width)
  assert.equal(next.y + next.height, frame.y + frame.height)
})
test('southeast resizing stops at screen edges', () => {
  const next = changeFrame(frame, 'se', 3000, 3000, viewport)
  assert.equal(next.x, frame.x)
  assert.equal(next.y, frame.y)
  assert.equal(next.x + next.width, viewport.width)
  assert.equal(next.y + next.height, viewport.height)
})
test('saved layouts remain reachable after a display becomes smaller', () => {
  assert.deepEqual(fitFrame(frame, { width: 600, height: 350 }), { x: 0, y: 0, width: 600, height: 350 })
})
