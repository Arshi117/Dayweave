const { app, screen } = require('electron')
const { mkdtempSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
console.log('macOS smoke: bootstrap')
assert.equal(process.platform,process.env.EXPECTED_PLATFORM || 'darwin')
assert.equal(process.arch,process.env.EXPECTED_ARCH)
assert.ok(process.env.DAYWEAVE_TEST_APP_ROOT)
const applicationRoot = resolve(process.env.DAYWEAVE_TEST_APP_ROOT)
// The harness runs under the development Electron binary. Match the packaged
// bootstrap's app path so bundled registration is read from the actual ASAR.
const metadata = JSON.parse(readFileSync(join(applicationRoot,'package.json'),'utf8'))
assert.equal(metadata.version,require('../package.json').version)
app.getAppPath = () => applicationRoot
app.commandLine.appendSwitch('user-data-dir',mkdtempSync(join(tmpdir(),'dayweave-mac-smoke-')))
const timeout=setTimeout(()=>{console.error('macOS smoke timed out');app.exit(1)},30000)
app.on('ready',()=>console.log('macOS smoke: app ready'))
let inspected=false
app.on('browser-window-created',(_,win)=>{
  if(inspected)return
  inspected=true
  console.log('macOS smoke: window created')
  win.setFocusable(false);win.setOpacity(0)
  win.webContents.once('did-finish-load',async()=>{
    console.log('macOS smoke: renderer loaded')
    const evaluate=code=>win.webContents.executeJavaScript(code)
    const wait=async predicate=>{const until=Date.now()+10000;while(Date.now()<until){if(await evaluate(predicate))return;await new Promise(r=>setTimeout(r,50))}throw Error('macOS renderer check timed out')}
    try{
      await wait('Boolean(window.focusControls && document.querySelector(".focus-pill"))')
      await wait(process.platform === 'darwin' ? 'Boolean(document.querySelector(".focus-shell.is-menu-bar"))' : 'Boolean(document.querySelector(".focus-shell.is-docked"))')
      if(process.platform === 'darwin') {
        assert.equal(win.isVisible(),false)
        assert.equal(await evaluate('Boolean(document.querySelector(".focus-shell.is-docked"))'),false)
      }
      await wait('Promise.all([window.focusControls.getGoogle(),window.focusControls.getMicrosoft()]).then(([g,m])=>Boolean(g?.configured && m?.configured))')
      const google=await evaluate('window.focusControls.getGoogle()')
      const microsoft=await evaluate('window.focusControls.getMicrosoft()')
      assert.equal(google.configured,true);assert.equal(google.connected,false)
      assert.equal(microsoft.configured,true);assert.equal(microsoft.connected,false)
      assert.equal((await evaluate('window.focusControls.getCalendarLinks()')).sources.length,0)
      if(process.platform === 'darwin')win.webContents.send('focus:open-details')
      else await evaluate('document.querySelector(".focus-pull-handle").click()')
      await wait('Boolean(document.querySelector(".focus-details"))')
      await wait('Boolean(document.querySelector(".focus-shell.opens-above")) === '+(process.platform === 'win32'))
      win.webContents.send('focus:open-calendar')
      await wait('Boolean(document.querySelector(".week-calendar"))')
      const b=win.getContentBounds(), area=screen.getDisplayMatching(b).workArea
      assert.ok(b.x>=area.x-1 && b.y>=area.y-1)
      assert.ok(b.x+b.width<=area.x+area.width+1)
      if(process.platform === 'darwin') assert.ok(b.y+b.height<=area.y+area.height+1)
      await new Promise(r=>setTimeout(r,250))
      console.log(JSON.stringify({passed:true,platform:process.platform,architecture:process.arch,checks:['packaged renderer launches','native preload bridge','empty isolated profile','public account registration','platform placement','arrangement expansion','calendar drawer','screen bounds']}))
      clearTimeout(timeout);app.exit(0)
    }catch(error){console.error(error);clearTimeout(timeout);app.exit(1)}
  })
})
try { require(join(applicationRoot,'out/main/index.js')) }
catch(error) { console.error(error);clearTimeout(timeout);app.exit(1) }
