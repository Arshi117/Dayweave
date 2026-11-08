// Visible, non-focusing native fixture: simulate another player's dock, then
// demote only our own fixture beneath Explorer and verify focus-safe recovery.
const { app, BrowserWindow, screen } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const koffi = require('koffi')
const u = koffi.load('user32.dll')
const point = koffi.struct({x:'long',y:'long'})
const rectType = koffi.struct({left:'long',top:'long',right:'long',bottom:'long'})
const hit = u.func('__stdcall','WindowFromPoint','void *',[point])
const root = u.func('void * __stdcall GetAncestor(void *, uint32_t)')
const getRect = u.func('__stdcall','GetWindowRect','int',['void *',koffi.out(koffi.pointer(rectType))])
const getClass = u.func('int __stdcall GetClassNameW(void *, _Out_ char16_t *, int)')
const foreground = u.func('void * __stdcall GetForegroundWindow()')
const dpi = u.func('uint32_t __stdcall GetDpiForWindow(void *)')
app.commandLine.appendSwitch('user-data-dir',mkdtempSync(join(tmpdir(),'dayweave-zorder-')))
let main = null, cover = null
const timeout = setTimeout(()=>{console.error('Dock visibility fixture timed out');app.exit(1)},30000)
const pause = ms => new Promise(r=>setTimeout(r,ms))
app.on('browser-window-created',(_,win)=>{
  if(main)return
  main=win; win.setFocusable(false)
  win.webContents.once('did-finish-load',async()=>{
    const evalJs=code=>win.webContents.executeJavaScript(code)
    const wait=async predicate=>{const end=Date.now()+8000;while(Date.now()<end){if(await predicate())return;await pause(50)}throw Error('Visibility condition timed out')}
    try {
      await wait(()=>evalJs('Boolean(document.querySelector(".focus-shell.is-docked"))'))
      await evalJs('localStorage.setItem("dayweave.hints.seen.v1",JSON.stringify({move:true,pull:true})); window.dispatchEvent(new StorageEvent("storage",{key:null}));')
      // Dismiss any already-mounted hint through the normal UI.
      await evalJs('document.querySelector(".first-use-hint button")?.click()')
      await pause(250)
      const d=screen.getDisplayMatching(win.getBounds()), b=win.getContentBounds()
      const hwnd=win.getNativeWindowHandle().readBigUInt64LE()
      let raises=0
      const moveTop=win.moveTop.bind(win)
      win.moveTop=()=>{raises++;return moveTop()}
      const samples=()=>{const r={};getRect(hwnd,r);return [.2,.5,.8].map(f=>({x:Math.round(r.left+(r.right-r.left)*f),y:Math.round(r.bottom-22*(dpi(hwnd)||96)/96)}))}
      const classAt=p=>{const h=hit(p),r=root(h,2)||h,buf=Buffer.alloc(512);getClass(r,buf,256);return buf.toString('utf16le').split('\0')[0]}
      // Pick Explorer-owned taskbar space, avoiding any actual music window.
      let free=false
      win.hide()
      for(let x=d.bounds.x+8;x<d.bounds.x+d.bounds.width-300;x+=320){
        win.setPosition(x,b.y)
        if(samples().every(p=>/^Shell_(Secondary)?TrayWnd$/.test(classAt(p)))){free=true;break}
      }
      assert.equal(free,true,'fixture needs an unobstructed taskbar region')
      win.showInactive();await pause(250)
      const original=win.getContentBounds()
      cover=new BrowserWindow({x:original.x,y:original.y,width:original.width,height:original.height,frame:false,show:false,focusable:false,skipTaskbar:true,backgroundColor:'#e4edf0'})
      await cover.loadURL('data:text/html,<body style="margin:0;background:%23e4edf0;color:%23345160;font:12px sans-serif">Dock coexistence fixture</body>')
      cover.setAlwaysOnTop(true,'screen-saver');cover.showInactive();cover.moveTop()
      win.setAlwaysOnTop(false)
      const beforeRaises=raises
      await pause(1100)
      assert.equal(raises,beforeRaises,'must not fight another widget')
      const foregroundBefore=foreground()
      cover.hide()
      await wait(()=>raises>beforeRaises)
      await wait(()=>samples().every(p=>(root(hit(p),2)||hit(p))===hwnd))
      assert.equal(foreground(),foregroundBefore,'recovery must not steal keyboard focus')
      win.hide();const hiddenRaises=raises;await pause(1100)
      assert.equal(win.isVisible(),false,'explicit hiding must be preserved')
      assert.equal(raises,hiddenRaises)
      console.log(JSON.stringify({passed:true,checks:['no z-order fight with overlapping widget','restore after widget leaves and Explorer covers dock','native hit testing confirms strip visible','foreground focus preserved','explicit hide preserved'],raises}))
      cover.destroy();clearTimeout(timeout);app.exit(0)
    }catch(error){console.error(error);cover?.destroy();clearTimeout(timeout);app.exit(1)}
  })
})
require(process.env.DAYWEAVE_TEST_APP_ROOT ? join(process.env.DAYWEAVE_TEST_APP_ROOT,'out/main/index.js') : resolve(__dirname,'../out/main/index.js'))
