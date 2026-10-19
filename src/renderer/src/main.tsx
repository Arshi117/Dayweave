import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DesktopControl } from './DesktopControl'
import './styles.css'

function BrowserPreview() {
  return <main className="browser-preview">
    <div className="browser-preview-content">
      <span className="browser-preview-label">Dayweave 桌面版</span>
      <h1>请从文件夹启动桌面日历</h1>
      <p>当前打开的是网页预览，无法嵌入电脑桌面。</p>
      <p>前往 Dayweave 文件夹，双击<strong>Open Dayweave.cmd</strong>。日历会出现在 Windows 桌面上。</p>
    </div>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.desktopControls
      ? new URLSearchParams(window.location.search).get('surface') === 'control' ? <DesktopControl /> : <App />
      : <BrowserPreview />}
  </React.StrictMode>,
)
