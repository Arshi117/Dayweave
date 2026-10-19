import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutDay, dateKey, startOfWeek, addDays, toMinutes, timeLabel, isTimedEntry } from '../src/renderer/src/calendar.ts'
const event = (id, startTime, endTime) => ({ id, title: id, date: '2026-10-19', kind: 'block', completed: false, startTime, endTime })
test('overlapping appointments stay side by side; adjacent appointments can share a lane', () => {
  const result = layoutDay([event('a', '09:00', '11:00'), event('b', '10:00', '10:30'), event('c', '10:30', '12:00'), event('d', '12:00', '13:00')])
  const byId = Object.fromEntries(result.map(item => [item.entry.id, item]))
  assert.equal(byId.a.laneCount, 2)
  assert.notEqual(byId.a.lane, byId.b.lane)
  assert.notEqual(byId.a.lane, byId.c.lane)
  assert.equal(byId.b.lane, byId.c.lane)
  assert.equal(byId.d.laneCount, 1)
})
test('a chain of overlaps stays in one group, with three columns only when needed', () => {
  const result = layoutDay([event('a', '09:00', '10:00'), event('b', '09:30', '11:00'), event('c', '09:45', '10:15'), event('d', '10:15', '12:00')])
  assert.ok(result.every(item => item.laneCount === 3))
  for (const a of result) for (const b of result) {
    if (a === b) continue
    const overlaps = toMinutes(a.entry.startTime) < toMinutes(b.entry.endTime) && toMinutes(b.entry.startTime) < toMinutes(a.entry.endTime)
    if (overlaps) assert.notEqual(a.lane, b.lane)
  }
})
test('week navigation crosses the year using local calendar days', () => {
  const start = startOfWeek(new Date(2027, 0, 1))
  assert.equal(dateKey(start), '2026-12-27')
  assert.equal(dateKey(addDays(start, 6)), '2027-01-02')
})
test('midnight boundaries and invalid time ranges are handled', () => {
  assert.equal(timeLabel(1440), '24:00')
  assert.equal(toMinutes('24:00'), 1440)
  assert.ok(Number.isNaN(toMinutes('24:15')))
  assert.ok(Number.isNaN(toMinutes('09:75')))
  assert.equal(isTimedEntry(event('zero', '10:00', '10:00')), false)
  assert.equal(isTimedEntry(event('backward', '11:00', '10:00')), false)
  assert.equal(isTimedEntry(event('midnight', '23:00', '24:00')), true)
  assert.equal(isTimedEntry({ ...event('task', '09:00', '10:00'), kind: 'deadline' }), false)
})
