import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopState } from '../renderer/src/types'
contextBridge.exposeInMainWorld('desktopControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  editCalendar: () => ipcRenderer.invoke('desktop:edit'),
  reportEditorBusy: (busy: boolean) => ipcRenderer.send('desktop:editor-busy', busy),
  onPrepare: (listener: () => void | Promise<void>) => {
    const handler = async (_event: Electron.IpcRendererEvent, token: number) => {
      try {
        await listener()
        requestAnimationFrame(() => requestAnimationFrame(() => ipcRenderer.send('desktop:prepared', token)))
      } catch { ipcRenderer.send('desktop:prepare-failed', token) }
    }
    ipcRenderer.on('desktop:prepare', handler)
    return () => ipcRenderer.removeListener('desktop:prepare', handler)
  },
  pinToDesktop: () => ipcRenderer.invoke('desktop:pin'),
  retryDesktop: () => ipcRenderer.invoke('desktop:retry'),
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  onState: (listener: (state: DesktopState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: DesktopState) => listener(state)
    ipcRenderer.on('desktop:state', handler)
    return () => ipcRenderer.removeListener('desktop:state', handler)
  },
})
