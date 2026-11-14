const { spawn } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, createWriteStream } = require('node:fs')
const { resolve, join } = require('node:path')

const root = resolve(__dirname, '..')
const cache = join(root, 'node_modules/.cache/dayweave-dev')
mkdirSync(cache, { recursive: true })
const pidFile = join(cache, 'launcher.pid')
const environment = { ...process.env, DAYWEAVE_DEV: '1' }
delete environment.ELECTRON_RUN_AS_NODE
let previous = 0
try { previous = Number(readFileSync(pidFile, 'utf8')); if (previous > 0) process.kill(previous, 0) } catch { previous = 0 }
if (previous) {
  // A second instance reveals the development window through its own profile
  // lock, without touching the installed application's process or profile.
  const electron = require('electron')
  const child = spawn(electron, ['.'], { cwd: root, env: { ...environment, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' }, detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
} else {
  const log = createWriteStream(join(cache, 'development.log'), { flags: 'a' })
  log.write('\nStarting Dayweave development: ' + new Date().toISOString() + '\n')
  writeFileSync(pidFile, String(process.pid))
  const child = spawn(process.execPath, [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', '--watch'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
  const finish = () => { try { if (Number(readFileSync(pidFile, 'utf8')) === process.pid) unlinkSync(pidFile) } catch {} log.end() }
  child.on('error', error => { log.write(String(error) + '\n'); finish(); process.exitCode = 1 })
  child.on('exit', code => { finish(); process.exitCode = code || 0 })
}
