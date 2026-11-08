import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldRecoverDock } from '../src/shared/dock-visibility.ts'

const dock = { docked:true,visible:true,minimized:false,moving:false }
test('recover when another dock moves away and only the taskbar covers the strip', () => {
  assert.equal(shouldRecoverDock({...dock,samples:['other','other','other']}),false)
  assert.equal(shouldRecoverDock({...dock,samples:['taskbar','taskbar','taskbar']}),true)
  assert.equal(shouldRecoverDock({...dock,samples:['self','self','self']}),false)
})
test('do not fight a partially covering music widget, menus or fullscreen windows', () => {
  for(const samples of [['other','taskbar','taskbar'],['self','other','self'],['unknown','taskbar','taskbar'],[]]) assert.equal(shouldRecoverDock({...dock,samples}),false)
})
test('explicit hiding, minimizing, dragging or detaching cannot trigger recovery', () => {
  const samples = ['taskbar','taskbar','taskbar']
  for(const change of [{visible:false},{minimized:true},{moving:true},{docked:false}]) assert.equal(shouldRecoverDock({...dock,...change,samples}),false)
})
