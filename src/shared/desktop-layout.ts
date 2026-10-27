import type { CalendarFrame } from './calendar-frame'

// Shared DIP coordinates place both mode icons inside the calendar's toolbar.
export function cornerControlBounds(frame: CalendarFrame) {
  return { x: Math.round(frame.x + frame.width - 64), y: Math.round(frame.y + 26), width: 32, height: 32 }
}
