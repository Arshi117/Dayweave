// Isolated native renderer/IPC regression. All tokens and responses are fixtures.
const { app, session, safeStorage } = require('electron')
const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const directory = mkdtempSync(join(tmpdir(), 'dayweave-source-management-'))
app.commandLine.appendSwitch('user-data-dir', directory)
const timeout = setTimeout(() => { console.error('Source management check timed out'); app.exit(1) }, 40000)
let holdMicrosoft = false, releaseMicrosoft, revoked = 0
const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:TickTick\r\nBEGIN:VEVENT\r\nUID:fixture\r\nDTSTART:20261113T080000Z\r\nDTEND:20261113T090000Z\r\nSUMMARY:Source fixture\r\nEND:VEVENT\r\nEND:VCALENDAR'
app.whenReady().then(() => {
  const encrypted = value => ({ encrypted: safeStorage.encryptString(JSON.stringify(value)).toString('base64') })
  const token = { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3600000 }
  writeFileSync(join(directory, 'google-client.json'), JSON.stringify(encrypted({ clientId: 'fixture.apps.googleusercontent.com' })))
  writeFileSync(join(directory, 'google-authorization.json'), JSON.stringify(encrypted(token)))
  writeFileSync(join(directory, 'microsoft-client.json'), JSON.stringify({ clientId: '11111111-1111-1111-1111-111111111111' }))
  writeFileSync(join(directory, 'microsoft-authorization.json'), JSON.stringify(encrypted(token)))
  session.defaultSession.protocol.handle('https', request => {
    const url = new URL(request.url)
    if (url.hostname === 'ticktick.com' && url.pathname === '/calendar/dayweave-fixture.ics') return new Response(ics)
    if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'Bearer' })
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') { revoked++; return new Response('') }
    if (holdMicrosoft && url.hostname === 'graph.microsoft.com') return new Promise(resolve => { releaseMicrosoft = resolve })
    return Response.json({ error: { message: 'Fixture service unavailable' } }, { status: 503 })
  })
})
app.on('browser-window-created', (_, win) => {
  win.setFocusable(false); win.setIgnoreMouseEvents(true); win.setOpacity(0)
  win.webContents.once('did-finish-load', async () => {
    const evaluate = async code => {
      try { return await win.webContents.executeJavaScript(code) }
      catch (error) { console.error('Failed check:', code, '\nVisible fixture UI:', await win.webContents.executeJavaScript('document.body.innerText')); throw error }
    }
    const wait = async condition => {
      const until = Date.now() + 10000
      while (Date.now() < until) { if (await evaluate(condition)) return; await new Promise(resolve => setTimeout(resolve, 30)) }
      throw Error('Source management check failed: ' + condition)
    }
    const click = text => evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)} || e.querySelector('strong')?.textContent===${JSON.stringify(text)}); if(!button||button.disabled)throw Error('Unavailable control: '+${JSON.stringify(text)}); button.click()})()`)
    const input = value => evaluate(`(() => {const e=document.querySelector('.source-name-editor input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    try {
      await wait('Boolean(window.focusControls && document.querySelector(".focus-shell"))')
      await wait('Promise.all([window.focusControls.getGoogle(),window.focusControls.getMicrosoft()]).then(states=>states.every(state=>state.connected && !state.refreshing && state.error))')
      win.webContents.send('focus:open-settings')
      await wait('Boolean(document.querySelector(".unified-import-summary"))')
      await evaluate('document.querySelector(".unified-import-summary").click()')
      await click('Microsoft To Do')
      await wait('Boolean(document.querySelector(".task-connection .google-connection-error"))')
      assert.equal(await evaluate('[...document.querySelectorAll("button")].find(e=>e.textContent==="断开连接").disabled'), false)
      writeFileSync(join(directory, 'microsoft-read-failure.png'), (await win.webContents.capturePage()).toPNG())
      holdMicrosoft = true
      await click('刷新')
      for (let i = 0; i < 100 && !releaseMicrosoft; i++) await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(releaseMicrosoft, 'refresh should still be in flight')
      await click('断开连接')
      await wait('Boolean(document.querySelector(".unified-source-list"))')
      assert.equal((await evaluate('window.focusControls.getMicrosoft()')).connected, false)
      releaseMicrosoft(Response.json({ value: [{ id: 'old-list', displayName: 'Do not restore' }] }))
      await new Promise(resolve => setTimeout(resolve, 80))
      assert.equal((await evaluate('window.focusControls.getMicrosoft()')).connected, false)
      assert.deepEqual(JSON.parse(readFileSync(join(directory, 'microsoft-authorization.json'), 'utf8')), {})
      await click('Google 日历'); await click('断开连接')
      await wait('Boolean(document.querySelector(".unified-source-list"))')
      assert.equal((await evaluate('window.focusControls.getGoogle()')).connected, false)
      assert.equal(revoked, 1)
      const added = await evaluate('window.focusControls.addCalendarLink("https://ticktick.com/calendar/dayweave-fixture.ics")')
      assert.equal(added.error, '')
      await wait('Boolean(document.querySelector(".unified-source-list strong"))')
      await click('TickTick'); await wait('Boolean(document.querySelector(".unified-source-detail"))'); await click('重命名'); await input('工作安排'); await click('保存名称')
      await wait('document.querySelector(".unified-source-detail h3")?.textContent === "工作安排"')
      await click('刷新')
      await wait('!document.querySelector(".source-name-editor") && document.querySelector(".unified-source-detail h3")?.textContent === "工作安排" && [...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="刷新" && !button.disabled)')
      assert.equal((await evaluate('window.focusControls.getCalendarLinks()')).sources[0].snapshot.calendarName, '工作安排')
      await click('重命名'); await input('  ')
      assert.equal(await evaluate('document.querySelector(".source-name-editor button[type=submit]").disabled'), true)
      await click('取消重命名')
      writeFileSync(join(directory, 'renamed-ticktick.png'), (await win.webContents.capturePage()).toPNG())
      await click('返回来源管理')
      assert.equal(await evaluate('document.querySelector(".unified-source-list").textContent.includes("工作安排")'), true)
      await click('工作安排'); await click('移除来源')
      await wait('window.focusControls.getCalendarLinks().then(state=>state.sources.length===0)')
      console.log(JSON.stringify({ passed: true, directory, checks: ['authorized read failure remains disconnectable','disconnect interrupts refresh','late response cannot restore Microsoft source','local token cleared','Google disconnect and fixture revoke','TickTick rename through real IPC','name survives refresh','blank name rejected','source list reflects rename','source removal'] }))
      clearTimeout(timeout); app.exit(0)
    } catch (error) { console.error(error); clearTimeout(timeout); releaseMicrosoft?.(new Response('', { status: 503 })); app.exit(1) }
  })
})
require(process.env.DAYWEAVE_TEST_APP_ROOT ? join(process.env.DAYWEAVE_TEST_APP_ROOT, 'out/main/index.js') : resolve(__dirname, '../out/main/index.js'))
