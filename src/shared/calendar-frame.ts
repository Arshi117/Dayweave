export interface CalendarFrame { x: number; y: number; width: number; height: number }
export interface Viewport { width: number; height: number }
export type FrameHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function fitFrame(frame: CalendarFrame, viewport: Viewport): CalendarFrame {
  const width = clamp(frame.width, Math.min(660, viewport.width), viewport.width)
  const height = clamp(frame.height, Math.min(380, viewport.height), viewport.height)
  return { width, height, x: clamp(frame.x, 0, viewport.width - width), y: clamp(frame.y, 0, viewport.height - height) }
}
export function defaultFrame(viewport: Viewport): CalendarFrame {
  const width = Math.min(1160, viewport.width * .8)
  const height = Math.min(800, viewport.height * .78)
  return fitFrame({ x: (viewport.width - width) / 2, y: Math.max(76, (viewport.height - height) / 2), width, height }, viewport)
}
export function changeFrame(frame: CalendarFrame, handle: FrameHandle, dx: number, dy: number, viewport: Viewport): CalendarFrame {
  if (handle === 'move') return fitFrame({ ...frame, x: frame.x + dx, y: frame.y + dy }, viewport)
  let left = frame.x, top = frame.y, right = frame.x + frame.width, bottom = frame.y + frame.height
  const minWidth = Math.min(660, viewport.width), minHeight = Math.min(380, viewport.height)
  if (handle.includes('w')) left = clamp(left + dx, 0, right - minWidth)
  if (handle.includes('e')) right = clamp(right + dx, left + minWidth, viewport.width)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - minHeight)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minHeight, viewport.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
