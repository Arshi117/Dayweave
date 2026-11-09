import { screen } from 'electron'

export interface PointerSample { point: { x: number; y: number }; down: boolean }

// Read only the current left-button state and cursor location. No event tap,
// keyboard listener, screen recording or input injection is required.
export function createPointerReader(): (() => PointerSample) | null {
  const koffi = require('koffi') as typeof import('koffi')
  let down: () => boolean
  if (process.platform === 'win32') {
    const keyState = koffi.load('user32.dll').func('int16_t __stdcall GetAsyncKeyState(int)')
    down = () => !!(keyState(1) & 0x8000)
  } else if (process.platform === 'darwin') {
    const buttonState = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics').func('bool CGEventSourceButtonState(int32_t, uint32_t)')
    down = () => buttonState(0, 0) // Combined session state, left mouse button.
  } else return null
  return () => ({ point: screen.getCursorScreenPoint(), down: down() })
}
