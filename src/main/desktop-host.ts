import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import type { Rectangle } from 'electron'
import scriptPath from './native/desktop-host.ps1?asset'
import sourcePath from './native/DesktopHost.cs?asset'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/** A local, hidden helper; no administrator rights or installed native modules. */
export class DesktopHost {
  private process: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number, Pending>()
  private sequence = 0
  private stopped = false
  private ready = false
  private stderr = ''

  constructor(private readonly onFailure: (error: Error) => void) {}

  async start(handle: Buffer): Promise<void> {
    if (process.platform !== 'win32') throw new Error('Desktop attachment requires Windows.')
    const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString()
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const startup = this.waitFor(0, 20000)
    try {
      this.process = spawn(powershell, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-WindowHandle', hwnd, '-OwnerProcessId', String(process.pid), '-SourcePath', sourcePath,
      ], { windowsHide: true, stdio: 'pipe', shell: false })
      this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + String(chunk)).slice(-4000) })
      this.process.stdin.on('error', error => this.fail(error))
      this.process.on('error', error => this.fail(error))
      this.process.on('exit', code => this.fail(new Error(`Desktop helper exited (${code}): ${this.stderr}`)))
      const lines = createInterface({ input: this.process.stdout })
      lines.on('line', line => {
        try {
          const reply = JSON.parse(line.replace(/^\uFEFF/, '')) as { id: number; ok: boolean; result?: unknown; error?: string }
          const pending = this.pending.get(reply.id)
          if (!pending) return
          clearTimeout(pending.timer)
          this.pending.delete(reply.id)
          if (reply.ok) pending.resolve(reply.result)
          else pending.reject(new Error(reply.error || 'Desktop helper command failed.'))
        } catch { console.warn('Unexpected desktop helper output:', line.slice(0, 250)) }
      })
      await startup
      this.ready = true
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
      // Consume startup rejection as well if spawning failed synchronously.
      await startup.catch(() => {})
      await this.stop()
      throw error
    }
  }

  private waitFor(id: number, timeout: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Windows desktop did not respond in time.'))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
    })
  }

  private fail(error: Error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
    if (!this.stopped && this.ready) { this.ready = false; this.onFailure(error) }
  }

  private async request(command: string, data: Record<string, unknown> = {}): Promise<unknown> {
    if (this.stopped || !this.ready || !this.process?.stdin.writable) throw new Error('Desktop helper is unavailable.')
    const id = ++this.sequence
    const reply = this.waitFor(id, 5000)
    this.process.stdin.write(JSON.stringify({ id, command, ...data }) + '\n', error => { if (error) this.fail(error) })
    return reply
  }

  attach(bounds: Rectangle) { return this.request('attach', { ...bounds }) }
  attachControl(handle: Buffer, bounds: Rectangle) {
    const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString()
    return this.request('attach-control', { handle: hwnd, ...bounds })
  }
  resizeControl(bounds: Rectangle) { return this.request('resize-control', { ...bounds }) }
  resize(bounds: Rectangle) { return this.request('resize', { ...bounds }) }
  setVisible(visible: boolean) { return this.request('visible', { visible }) }
  showDesktopView() { return this.request('show-desktop') }
  async isAttached() { return await this.request('status') === true }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.fail(new Error('Desktop helper stopped.'))
    const child = this.process
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { child.kill(); resolve() }, 1500)
      child.once('exit', () => { clearTimeout(timeout); resolve() })
      child.stdin.end() // EOF lets the helper detach only our window and exit.
    })
  }
}
