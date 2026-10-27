import React from 'react'
import ReactDOM from 'react-dom/client'
import { FocusBar } from './FocusBar'
import './styles.css'

function BrowserPreview() {
  return <main className="browser-preview">
    <div className="browser-preview-content">
      <span className="browser-preview-label">Dayweave</span>
      <h1>从悬浮条开始安排一天</h1>
      <p>请在 Dayweave 文件夹中双击 <strong>Open Dayweave.cmd</strong> 启动桌面应用。</p>
      <p>拉开长条下沿查看操作，点击日历图标展开时间表。</p>
    </div>
  </main>
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.focusControls ? <FocusBar /> : <BrowserPreview />}</React.StrictMode>,
)
