import test from 'node:test'
import assert from 'node:assert/strict'
import { localFocusEvents, focusView, extendFocus } from '../src/shared/focus.ts'

const at = hour => new Date(2026, 9, 24, hour).getTime()
const event = (id, start, end) => ({ id, title: id, start: at(start), end: at(end), source: 'local' })
test('local schedules ignore completed, deadline-only and malformed entries, while preserving midnight', () => {
  const base = { id:'a', title:'Study', kind:'block', date:'2026-10-24', startTime:'23:00', endTime:'24:00' }
  const entries = localFocusEvents([base, {...base,id:'done',completed:true}, {...base,kind:'deadline'}, {...base,date:'2026-02-30'}, {...base,startTime:'25:00'}, null])
  assert.equal(entries.length,1)
  assert.equal(new Date(entries[0].end).getDate(),25)
  assert.equal(localFocusEvents({}).length,0)
})
test('time progress, current event and next event use real time', () => {
  const events = [event('a',14,15),event('b',15,16)]
  const view = focusView(events,null,{},at(14)+20*60_000)
  assert.equal(view.current.id,'a')
  assert.equal(view.next.id,'b')
  assert.ok(Math.abs(view.progress-1/3)<.00001)
  assert.equal(view.conflicts.length,0)
})
test('ended schedules yield to the next active event without requiring completion', () => {
  const view = focusView([event('a',14,15),event('b',15,16)],{eventId:'a'},{},at(15)+5*60_000)
  assert.equal(view.current.id,'b')
  assert.equal(view.next,null)
  assert.equal(view.end,at(16))
  assert.ok(Math.abs(view.progress-1/12)<.00001)
  assert.equal(focusView([event('a',14,15)],{eventId:'a'},{},at(15)).current,null)
})
test('extension reports conflict and does not move original calendar events', () => {
  const a = Object.freeze(event('a',14,15)), b=Object.freeze(event('b',15,16))
  const session = extendFocus(a,a.end,at(15)+5*60_000)
  const view = focusView([a,b],session,{},at(15)+5*60_000)
  assert.equal(view.end,at(15)+20*60_000)
  assert.equal(view.conflicts[0].id,'b')
  assert.equal(a.end,at(15)); assert.equal(b.start,at(15))
})
test('completing a task advances to the active next one and cancellation drops selection', () => {
  const view = focusView([event('a',14,16),event('b',15,16)],{eventId:'a'},{a:at(15)},at(15))
  assert.equal(view.current.id,'b')
  assert.equal(focusView([event('b',15,16)],{eventId:'cancelled'}, {},at(15)).current.id,'b')
})
test('already-started overlapping events are concurrent, not the next event', () => {
  const b = {...event('b',14,16),start:at(14)+30*60_000}
  const view = focusView([event('a',14,15),b,event('c',17,18)],null,{},at(14)+45*60_000)
  assert.equal(view.current.id,'a')
  assert.deepEqual(view.concurrent.map(item=>item.id),['b'])
  assert.equal(view.next.id,'c')
})
