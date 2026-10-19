// Shared DIP coordinates keep the native desktop button and editor button aligned.
export function cornerControlBounds(viewportWidth: number) {
  const width = 112, height = 36
  const right = viewportWidth <= 1100 ? 28 : 40
  return { x: Math.max(0, viewportWidth - right - width), y: 26, width, height }
}
