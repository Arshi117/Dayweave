export type DockCover = 'self' | 'taskbar' | 'other' | 'unknown'

// Recover only from the shell covering the entire strip. A music widget, menu
// or full-screen app may temporarily cover it; do not fight those windows.
export function shouldRecoverDock(state: { docked: boolean; visible: boolean; minimized: boolean; moving: boolean; samples: DockCover[] }) {
  return state.docked && state.visible && !state.minimized && !state.moving && state.samples.length > 0 && state.samples.every(sample => sample === 'taskbar')
}
