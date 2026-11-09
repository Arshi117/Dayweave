import test from 'node:test'
import assert from 'node:assert/strict'
import { bottomDockAnchor, bottomDockLayout, isBottomDockCandidate, focusWindowLayout, platformDockLayout, menuBarWindowLayout } from '../src/shared/focus-window-layout.ts'

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

test('Mac docking avoids bottom/side Docks and the menu bar on every display', () => {
  for (const [bounds, work] of [
    [{ x: 0, y: 0, width: 1440, height: 900 }, { x: 0, y: 25, width: 1440, height: 805 }],
    [{ x: -1440, y: 0, width: 1440, height: 900 }, { x: -1360, y: 25, width: 1360, height: 875 }],
    [{ x: 0, y: -900, width: 1440, height: 900 }, { x: 0, y: -875, width: 1360, height: 875 }],
    [{ x: 0, y: 0, width: 800, height: 600 }, { x: 0, y: 25, width: 800, height: 575 }],
  ]) {
    const compact = platformDockLayout('darwin', 44, bounds, work)
    for (const height of [44, 330, 1000]) {
      const layout = platformDockLayout('darwin', height, bounds, work, 1068)
      assert.equal(layout.anchor.y, compact.anchor.y)
      assert.ok(layout.anchor.x <= compact.anchor.x, 'a narrow screen must keep the strip on the left')
      assert.equal(layout.above, true)
      assert.ok(layout.bounds.x >= work.x && layout.bounds.y >= work.y)
      assert.ok(layout.bounds.x + layout.bounds.width <= work.x + work.width)
      assert.equal(layout.bounds.y + layout.bounds.height, work.y + work.height)
    }
    assert.deepEqual(platformDockLayout('win32', 330, bounds, work), bottomDockLayout(330, bounds, work))
  }
})

test('menu-bar panels open downwards and stay in the selected display work area', () => {
  for (const work of [{ x: 0, y: 25, width: 1440, height: 805 }, { x: -800, y: -600, width: 800, height: 575 }]) {
    for (const trayX of [work.x + 10, work.x + work.width - 100]) {
      for (const width of [300, 1068]) {
        const layout = menuBarWindowLayout({ x: trayX, y: work.y - 25, width: 70, height: 25 }, 1000, work, width)
        assert.equal(layout.above, false)
        assert.equal(layout.bounds.y, work.y + 6, 'a tall panel must keep its position below the menu bar')
        assert.ok(layout.bounds.x >= work.x && layout.bounds.y >= work.y)
        assert.ok(layout.bounds.x + layout.bounds.width <= work.x + work.width)
        assert.ok(layout.bounds.y + layout.bounds.height <= work.y + work.height)
      }
    }
  }
})
