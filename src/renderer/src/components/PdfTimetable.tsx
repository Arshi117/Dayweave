import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerURL from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { TimetableCourse, TimetableUnscheduledCourse } from '../../../shared/calendar-files'
import { timetableCalendar } from '../../../shared/calendar-files'
import { pdfResourceOptions, readPdfTimetable } from '../pdf-timetable-reader'

GlobalWorkerOptions.workerSrc = workerURL
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const newCourse = (): TimetableCourse => ({ id: crypto.randomUUID(), title: '', weekday: 1, startTime: '', endTime: '', weeks: '', location: '' })

export default function PdfTimetable({ file, busy, onPreview }: { file: File; busy: boolean; onPreview: (name: string, text: string) => Promise<void> }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1), [pageText, setPageText] = useState('')
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [firstMonday, setFirstMonday] = useState(''), [name, setName] = useState(file.name.replace(/\.pdf$/i, ''))
  const [courses, setCourses] = useState<TimetableCourse[]>([newCourse()])
  const [recognizing, setRecognizing] = useState(false), [recognized, setRecognized] = useState<number | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [unscheduled, setUnscheduled] = useState<TimetableUnscheduledCourse[]>([])
  const [excluded, setExcluded] = useState<string[]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let disposed = false
    let task: ReturnType<typeof getDocument> | undefined
    void file.arrayBuffer().then(data => {
      if (disposed) return
      task = getDocument({ data, ...pdfResourceOptions() })
      return task.promise.then(pdf => {
        if (disposed) return
        if (pdf.numPages > 30) { void task?.destroy(); throw new Error('too many pages') }
        setDocument(pdf); setLoading(false)
      })
    }).catch(() => { if (!disposed) { setError('PDF 无法打开，可能已加密、损坏或超过 30 页。请重新导出课表。'); setLoading(false) } })
    return () => { disposed = true; if (task) void task.destroy() }
  }, [file])
  useEffect(() => {
    if (!document) return
    let disposed = false
    setRecognizing(true)
    void readPdfTimetable(document).then(result => {
      if (disposed) return
      setRecognized(result.courses.length); setWarnings(result.warnings); setUnscheduled(result.unscheduled)
      if (result.courses.length) setCourses(result.courses)
      if (result.name) setName(result.name)
    }).catch(() => { if (!disposed) { setRecognized(0); setWarnings(['未能提取完整的课程文字，请对照 PDF 手动填写；扫描件目前不支持自动识别。']) } })
      .finally(() => { if (!disposed) setRecognizing(false) })
    return () => { disposed = true }
  }, [document])
  useEffect(() => {
    if (!document) return
    let disposed = false
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    setLoading(true); setPageText('')
    void document.getPage(pageNumber).then(async page => {
      if (disposed || !canvas.current) return
      const viewport = page.getViewport({ scale: Math.min(1.5, 1600 / page.getViewport({ scale: 1 }).width) })
      const target = canvas.current
      target.width = Math.floor(viewport.width); target.height = Math.floor(viewport.height)
      render = page.render({ canvas: target, viewport })
      await render.promise
      const content = await page.getTextContent()
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').slice(0, 20000)
      if (!disposed) { setPageText(text); setLoading(false) }
    }).catch(() => { if (!disposed) { setError('这一页无法预览，请尝试其他页或重新导出 PDF。'); setLoading(false) } })
    return () => { disposed = true; render?.cancel() }
  }, [document, pageNumber])
  function change(id: string, patch: Partial<TimetableCourse>) { setCourses(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)) }
  async function preview() {
    setError('')
    try { await onPreview(file.name, timetableCalendar(name || file.name, firstMonday, courses, unscheduled.filter(item => !excluded.includes(item.id)))) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '请核对课程信息。') }
  }
  return <div className="pdf-timetable">
    <h3>识别并核对 PDF 课表</h3>
    <p>自动填写可识别的文字课表，再对照原文核对。其他版式或扫描件仍可手动填写，确认后才生成日程。</p>
    <p>原 PDF 仅用于本次对照，保存的是整理后的课表，请自行保留原文件。</p>
    {recognizing && <p role="status">正在识别全部页面的课程、周次与节次时间…</p>}
    {recognized !== null && <div className="pdf-recognition-result" role="status" data-recognized-count={recognized}>
      <p>{recognized ? '已识别 ' + recognized + ' 个固定上课时段、' + unscheduled.length + ' 门无固定时段课程。请核对信息，并填写教学第 1 周的周一。' : '暂未识别到固定课程，请对照原文手动填写。'}</p>
      {warnings.map(warning => <p key={warning}>{warning}</p>)}
    </div>}
    <div className="pdf-reference">
      {loading && <p role="status">正在打开 PDF…</p>}
      <div className="pdf-reference-scroll"><canvas ref={canvas} aria-label="PDF 课表原文预览" /></div>
      {document && document.numPages > 1 && <div className="pdf-page-controls"><button disabled={loading || pageNumber <= 1} onClick={() => setPageNumber(page => page - 1)}>上一页</button><span>{pageNumber} / {document.numPages}</span><button disabled={loading || pageNumber >= document.numPages} onClick={() => setPageNumber(page => page + 1)}>下一页</button></div>}
      {pageText.trim() && <details><summary>查看本页可复制文字</summary><pre tabIndex={0}>{pageText}</pre></details>}
    </div>
    <fieldset disabled={busy || recognizing}>
      <label>课表名称<input maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>教学第 1 周的周一<input type="date" required value={firstMonday} onChange={event => setFirstMonday(event.target.value)} /></label>
      <p>学期名称或打印日期不能确定开学日期，请按学校校历填写首周。上课时间使用中国标准时间（Asia/Shanghai）。</p>
      {courses.map((course, index) => <div className="timetable-course" key={course.id}>
        <div className="timetable-course-heading"><strong>课程 {index + 1}</strong><button disabled={courses.length === 1} onClick={() => setCourses(rows => rows.filter(row => row.id !== course.id))}>删除</button></div>
        {course.periods && <p>来源：星期{weekdays[course.weekday - 1]} · 第 {course.periods} 节{course.teacher ? ' · ' + course.teacher : ''}</p>}
        <label>课程名称<input maxLength={300} value={course.title} placeholder="例如 高等数学" onChange={event => change(course.id, { title: event.target.value })} /></label>
        <div className="timetable-pair"><label>星期<select value={course.weekday} onChange={event => change(course.id, { weekday: Number(event.target.value) })}>{weekdays.map((day, i) => <option key={day} value={i + 1}>星期{day}</option>)}</select></label>
          <label>上课周次<input value={course.weeks} placeholder="1-16 或 1-16单" onChange={event => change(course.id, { weeks: event.target.value })} /></label></div>
        <div className="timetable-pair"><label>开始时间<input type="time" value={course.startTime} onChange={event => change(course.id, { startTime: event.target.value })} /></label><label>结束时间<input type="time" value={course.endTime} onChange={event => change(course.id, { endTime: event.target.value })} /></label></div>
        <label>教室（选填）<input maxLength={500} value={course.location} onChange={event => change(course.id, { location: event.target.value })} /></label>
        {course.sourceText && <details className="timetable-source-text"><summary>查看本条课程原文</summary><pre tabIndex={0}>{course.sourceText}</pre></details>}
      </div>)}
      <p>周次支持 1-16、1-16单、2-16双、1,3,5。同一门课有多个上课时段时，分别添加；节次请换成学校作息表中的实际时间。</p>
      <button className="unified-text-button" disabled={courses.length >= 100} onClick={() => setCourses(rows => [...rows, newCourse()])}>添加上课时段</button>
      {unscheduled.length > 0 && <div className="timetable-unscheduled"><h3>没有固定时段的课程</h3><p>选中的课程会作为无截止日期的待办导入，不会占用日历时间。</p>{unscheduled.map(item => <div key={item.id}><label><input type="checkbox" checked={!excluded.includes(item.id)} onChange={event => setExcluded(ids => event.target.checked ? ids.filter(id => id !== item.id) : [...ids, item.id])} />{item.title}</label><details className="timetable-source-text"><summary>查看课程说明</summary><pre tabIndex={0}>{item.description}</pre></details></div>)}</div>}
    </fieldset>
    <button className="google-connect-button" disabled={busy || loading || recognizing || !document} onClick={() => { void preview() }}>{busy ? '生成预览中…' : '预览学期日程'}</button>
    {error && <p className="google-connection-error" role="alert">{error}</p>}
  </div>
}
