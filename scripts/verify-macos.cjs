const { app, screen } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
console.log('macOS smoke: bootstrap')
assert.equal(process.platform,'darwin')
assert.equal(process.arch,process.env.EXPECTED_ARCH)
assert.ok(process.env.DAYWEAVE_TEST_APP_ROOT)
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
      assert.equal(await evaluate('Boolean(document.querySelector(".focus-shell.is-docked"))'),false)
      await wait('Promise.all([window.focusControls.getGoogle(),window.focusControls.getMicrosoft()]).then(([g,m])=>Boolean(g?.configured && m?.configured))')
      const google=await evaluate('window.focusControls.getGoogle()')
      const microsoft=await evaluate('window.focusControls.getMicrosoft()')
      assert.equal(google.configured,true);assert.equal(google.connected,false)
      assert.equal(microsoft.configured,true);assert.equal(microsoft.connected,false)
      assert.equal((await evaluate('window.focusControls.getCalendarLinks()')).sources.length,0)
      await evaluate('document.querySelector(".focus-pull-handle").click()')
      await wait('Boolean(document.querySelector(".focus-details"))')
      win.webContents.send('focus:open-calendar')
      await wait('Boolean(document.querySelector(".week-calendar"))')
      const b=win.getContentBounds(), area=screen.getDisplayMatching(b).workArea
      assert.ok(b.x>=area.x-1 && b.y>=area.y-1)
      assert.ok(b.x+b.width<=area.x+area.width+1)
      console.log(JSON.stringify({passed:true,platform:process.platform,architecture:process.arch,checks:['packaged renderer launches','native preload bridge','empty isolated profile','public account registration','floating strip expansion','calendar drawer','screen bounds']}))
      clearTimeout(timeout);app.exit(0)
    }catch(error){console.error(error);clearTimeout(timeout);app.exit(1)}
  })
})
try { require(resolve(process.env.DAYWEAVE_TEST_APP_ROOT,'out/main/index.js')) }
catch(error) { console.error(error);clearTimeout(timeout);app.exit(1) }
