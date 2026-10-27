import test from 'node:test'
import assert from 'node:assert/strict'
import { cornerControlBounds } from '../src/shared/desktop-layout.ts'
import { defaultFrame, changeFrame, fitFrame } from '../src/shared/calendar-frame.ts'

test('the mode icon stays inside the calendar after moving, resizing and display changes', () => {
  const area = { width: 1920, height: 1080 }
  const initial = defaultFrame(area)
  const moved = changeFrame(initial, 'move', 300, -100, area)
  const resized = changeFrame(moved, 'se', -500, -350, area)
  const smaller = fitFrame(resized, { width: 800, height: 600 })
  for (const frame of [initial, moved, resized, smaller]) {
    const icon = cornerControlBounds(frame)
    assert.equal(icon.width, 32)
    assert.equal(icon.height, 32)
    assert.ok(icon.x >= frame.x && icon.y >= frame.y)
    assert.ok(icon.x + icon.width < frame.x + frame.width)
    assert.ok(icon.y + icon.height < frame.y + frame.height)
  }
})
