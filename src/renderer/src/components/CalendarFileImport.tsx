import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { CalendarFilePreview } from '../../../shared/calendar-files'
import type { CalendarLinksState } from '../../../shared/import-links'

const PdfTimetable = lazy(() => import('./PdfTimetable'))
export function CalendarFileImport({ replaceId, initialPdf, onState, onDone }: { replaceId?: string; initialPdf?: File | null; onState: (value: CalendarLinksState) => void; onDone: (id: string) => void }) {
  const [preview, setPreview] = useState<CalendarFilePreview | null>(null)
  const [pdf, setPdf] = useState<File | null>(initialPdf || null)
  const [pdfVersion, setPdfVersion] = useState(0)
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { ++request.current; void window.focusControls?.cancelCalendarFile().catch(() => {}) }, [])
  async function loadPreview(name: string, text: string) {
    const api = window.focusControls
    if (!api) { setError('请在 Dayweave 桌面应用中导入文件。'); return }
    const current = ++request.current
    setPending(true); setError(''); setPreview(null)
    try {
      const result = await api.previewCalendarFile(name, text, replaceId)
      if (current !== request.current) return
      if (!result || result.error) setError(result?.error || '无法预览文件，请重试。')
      else setPreview(result)
    } catch { if (current === request.current) setError('无法预览文件，请重试。') }
    finally { if (current === request.current) setPending(false) }
  }
  async function select(file: File | undefined) {
    if (!file || pending) return
    setPreview(null); setPdf(null); setError('')
    void window.focusControls?.cancelCalendarFile()
    const isPdf = /\.pdf$/i.test(file.name)
    if (!/\.(ics|ical|pdf)$/i.test(file.name)) { setError('请选择 ICS 日历文件或 PDF 课表。'); return }
    if (file.size > (isPdf ? 20 : 8) * 1024 * 1024) { setError(isPdf ? 'PDF 课表不能超过 20 MB。' : 'ICS 文件不能超过 8 MB。'); return }
    if (isPdf) { setPdfVersion(version => version + 1); setPdf(file); return }
    setPending(true)
    try {
      const data = await file.arrayBuffer()
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(data) }
      catch { text = new TextDecoder('gb18030', { fatal: true }).decode(data) }
      await loadPreview(file.name, text)
    } catch { setError('文件文字编码无法读取，请重新导出 UTF-8 格式的 ICS 文件。') }
    finally { setPending(false) }
  }
  async function commit() {
    if (!preview || pending) return
    setPending(true); setError('')
    try {
      const result = await window.focusControls?.commitCalendarFile(preview.token)
      if (!result || result.error || !result.addedId) { setError(result?.error || '未能保存此课表，请重试。'); return }
      onState(result); onDone(result.addedId)
    } catch { setError('未能保存此课表，请重试。') }
    finally { setPending(false) }
  }
  return <div className="calendar-file-import">
    <h3>{replaceId ? '替换文件' : '导入文件'}</h3>
    <label className="calendar-file-picker">{pending ? '正在读取…' : '选择文件'}<input type="file" aria-label="选择文件" accept=".ics,.ical,.pdf" disabled={pending} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file) }} /></label>
    {initialPdf && pdf === initialPdf && <p role="status">{initialPdf.name}</p>}
    {pdf && <div hidden={Boolean(preview)}><Suspense fallback={<p role="status">正在加载 PDF 阅读器…</p>}><PdfTimetable key={pdfVersion} file={pdf} busy={pending} onPreview={loadPreview} /></Suspense></div>}
    {preview && <div className="calendar-file-preview">
      <h3>确认导入</h3><p>{preview.name}</p>
      <p>源文件包含 {preview.eventCount} 条事件、{preview.taskCount} 条待办。重复课程会按查看的日期展开，取消或已完成的记录不会恢复。</p>
      {replaceId && <p>确认后替换该来源的全部内容，其他来源不受影响。</p>}
      <p>部分日程示例（按电脑时区显示）：</p>
      {preview.examples.length ? <ul>{preview.examples.map(event => <li key={event.id}><strong>{event.title}</strong><span>{new Date(event.start).toLocaleString('zh-CN')} — {new Date(event.end).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{event.allDay ? ' · 全天' : ''}</span>{event.location && <span>{event.location}</span>}</li>)}</ul> : <p>近期与源文件首周没有可显示的时间块，导入后可翻到对应日期查看。</p>}
      {preview.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <div className="google-connection-actions"><button disabled={pending} onClick={() => { void commit() }}>{pending ? '保存中…' : replaceId ? '确认替换' : '确认导入'}</button><button disabled={pending} onClick={() => { setPreview(null); void window.focusControls?.cancelCalendarFile() }}>{pdf ? '返回修改课程' : '取消预览'}</button></div>
    </div>}
    {error && <p className="google-connection-error" role="alert">{error}</p>}
  </div>
}
