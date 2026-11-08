import test from 'node:test'
import assert from 'node:assert/strict'
import { bottomDockAnchor, bottomDockLayout, isBottomDockCandidate, focusWindowLayout } from '../src/shared/focus-window-layout.ts'

test('the dock occupies the bottom taskbar, with its strip anchored while details expand upward', () => {
  for (const [x, y, width, height, taskbar] of [[0,0,1920,1080,48],[-1280,0,1280,720,40],[0,-900,1440,900,64]]) {
    const bounds = { x, y, width, height }, work = { x, y, width, height: height-taskbar }
    const compact = bottomDockLayout(44, bounds, work)
    const expanded = bottomDockLayout(330, bounds, work)
    const calendar = bottomDockLayout(650, bounds, work, 1068)
    assert.ok(compact.bounds.y + compact.bounds.height > work.y + work.height, 'must reach the actual taskbar, not stop at workArea')
    for (const layout of [compact,expanded,calendar]) {
      assert.equal(layout.above, true)
      assert.deepEqual(layout.anchor, compact.anchor)
      assert.equal(layout.bounds.y + layout.bounds.height, compact.bounds.y + 44)
      assert.ok(layout.bounds.y >= bounds.y)
      assert.ok(layout.bounds.x + layout.bounds.width <= bounds.x + bounds.width)
    }
  }
})
test('a native drag near the bottom docks, and dragging out leaves a downward-opening floating strip', () => {
  const work = { x:0, y:0, width:1920, height:1032 }
  assert.equal(isBottomDockCandidate({x:1200,y:970},work),true)
  assert.equal(isBottomDockCandidate({x:71,y:942},work),true)
  assert.equal(isBottomDockCandidate({x:100,y:620},work),false)
  const floating = focusWindowLayout({x:100,y:620},250,work,300,300,undefined,false)
  assert.equal(floating.above,false)
  assert.equal(floating.bounds.y,620)
})
test('an auto-hidden taskbar still leaves an accessible bottom dock on a small display', () => {
  const bounds = {x:0,y:0,width:320,height:240}
  const layout = bottomDockLayout(1000,bounds,bounds,1068)
  assert.deepEqual(bottomDockAnchor(bounds,bounds),{x:8,y:196})
  assert.equal(layout.bounds.y,0)
  assert.equal(layout.bounds.height,240)
  assert.equal(layout.bounds.width,320)
})
