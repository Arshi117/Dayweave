import type { BrowserWindow } from 'electron'
import type { DockCover } from '../shared/dock-visibility'

// Only read HWND ownership, classes and hit testing. No hooks are installed in
// Explorer or another app, and no titles, account data or screenshots are read.
export function createTaskbarProbe(window: BrowserWindow): (() => DockCover[]) | null {
  if (process.platform !== 'win32') return null
  const koffi = require('koffi') as typeof import('koffi')
  const user32 = koffi.load('user32.dll')
  const point = koffi.struct({ x: 'long', y: 'long' })
  const rect = koffi.struct({ left: 'long', top: 'long', right: 'long', bottom: 'long' })
  const fromPoint = user32.func('__stdcall', 'WindowFromPoint', 'void *', [point])
  const ancestor = user32.func('void * __stdcall GetAncestor(void *, uint32_t)')
  const className = user32.func('int __stdcall GetClassNameW(void *, _Out_ char16_t *, int)')
  const processId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)')
  const getRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['void *', koffi.out(koffi.pointer(rect))])
  const getDpi = user32.func('uint32_t __stdcall GetDpiForWindow(void *)')
  const handle = window.getNativeWindowHandle()
  const own = handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())
  const owner = (hwnd: bigint) => { const value = [0]; processId(hwnd, value); return value[0] }
  return () => {
    const bounds: { left?: number; top?: number; right?: number; bottom?: number } = {}
    if (!getRect(own, bounds)) return ['unknown']
    const left = bounds.left!, right = bounds.right!, bottom = bounds.bottom!
    const scale = (getDpi(own) || 96) / 96
    const y = Math.round(bottom - 22 * scale)
    return [.2, .5, .8].map(fraction => {
      const hit = fromPoint({ x: Math.round(left + (right - left) * fraction), y }) as bigint | null
      if (!hit) return 'unknown'
      const root = (ancestor(hit, 2) || hit) as bigint
      if (root === own) return 'self'
      const buffer = Buffer.alloc(512)
      className(root, buffer, 256)
      const name = buffer.toString('utf16le').split('\0')[0]
      // A music widget can be parented to the taskbar. Its HWND still belongs
      // to the music process: never mistake that child for Explorer itself.
      if (/^Shell_(Secondary)?TrayWnd$/.test(name) && owner(hit) === owner(root)) return 'taskbar'
      return 'other'
    })
  }
}
