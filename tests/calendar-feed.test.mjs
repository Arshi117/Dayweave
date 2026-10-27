import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSubscription, subscriptionURL } from '../src/main/calendar-feed.ts'

const calendar = events => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+events+'\r\nEND:VCALENDAR'
const event = lines => 'BEGIN:VEVENT\r\n'+lines.join('\r\n')+'\r\nEND:VEVENT'
const now=Date.parse('2026-10-24T00:00:00Z')
test('subscription addresses accept HTTPS and webcal, reject other schemes and embedded credentials', () => {
  assert.equal(subscriptionURL('webcal://example.com/feed.ics').href,'https://example.com/feed.ics')
  for (const url of ['file:///secret','http://example.com','javascript:alert(1)','https://user:password@example.com/']) assert.throws(()=>subscriptionURL(url))
})
test('UTC events have stable identifiers; all-day and cancelled events do not become timed tasks', async () => {
  const text=calendar([
    event(['UID:a','DTSTART:20261024T090000Z','DTEND:20261024T100000Z','SUMMARY:Study']),
    event(['UID:b','DTSTART;VALUE=DATE:20261024','DTEND;VALUE=DATE:20261025','SUMMARY:Holiday']),
    event(['UID:c','DTSTART:20261024T120000Z','DTEND:20261024T130000Z','STATUS:CANCELLED'])
  ].join('\r\n'))
  const result=await parseSubscription(text,now)
  assert.equal(result.length,1)
  assert.equal(result[0].start,Date.parse('2026-10-24T09:00:00Z'))
  assert.equal(result[0].id,(await parseSubscription(text,now))[0].id)
})
test('recurrence exceptions and moved instances are honored',async()=>{
  const text=calendar([
    event(['UID:weekly','DTSTART:20261024T090000Z','DTEND:20261024T100000Z','RRULE:FREQ=DAILY;COUNT=3','EXDATE:20261025T090000Z','SUMMARY:Base']),
    event(['UID:weekly','RECURRENCE-ID:20261026T090000Z','DTSTART:20261026T110000Z','DTEND:20261026T120000Z','SUMMARY:Moved'])
  ].join('\r\n'))
  const result=await parseSubscription(text,now)
  assert.equal(result.length,2)
  assert.equal(result[1].start,Date.parse('2026-10-26T11:00:00Z'))
  assert.equal(result[1].title,'Moved')
})
test('recurring events keep their wall-clock time over daylight saving transitions',async()=>{
  const text=calendar(event(['UID:dst','DTSTART;TZID=America/New_York:20261031T090000','DTEND;TZID=America/New_York:20261031T100000','RRULE:FREQ=DAILY;COUNT=3','SUMMARY:Morning']))
  const result=await parseSubscription(text,Date.parse('2026-10-30T00:00:00Z'))
  assert.equal(result.length,3)
  assert.equal(result[0].start,Date.parse('2026-10-31T13:00:00Z'))
  assert.equal(result[1].start,Date.parse('2026-11-01T14:00:00Z'))
})
test('HTML login pages and high-frequency recurrence fail explicitly', async()=>{
  await assert.rejects(parseSubscription('<html>Sign in</html>',now))
  await assert.rejects(parseSubscription(calendar(event(['UID:fast','DTSTART:20261024T090000Z','DTEND:20261024T090001Z','RRULE:FREQ=SECONDLY'])),now))
})
