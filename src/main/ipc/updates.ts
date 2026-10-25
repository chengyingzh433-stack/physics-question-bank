import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getUpdateState, saveUpdatePreferences, checkForUpdates, downloadUpdate,
  cancelUpdateDownload, installUpdate, openUpdateRelease
} from '../updates/UpdateService'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed() || !event.senderFrame || event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) {
    throw new Error('软件更新只能由本应用主窗口发起。')
  }
  const actual = new URL(event.senderFrame.url)
  const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  if (developmentUrl) {
    const expected = new URL(developmentUrl)
    if (actual.origin === expected.origin && actual.pathname === expected.pathname && !actual.username && !actual.password) return
  } else if (actual.protocol === 'file:') {
    actual.hash = ''; actual.search = ''
    if (resolve(fileURLToPath(actual)) === resolve(app.getAppPath(), 'out/renderer/index.html')) return
  }
  throw new Error('当前页面无权管理应用更新，请返回题库主窗口。')
}

export function registerUpdateIpc(): void {
  ipcMain.handle('updates:state', (event) => { assertTrustedSender(event); return getUpdateState() })
  ipcMain.handle('updates:preferences', (event, input) => { assertTrustedSender(event); return saveUpdatePreferences(input) })
  ipcMain.handle('updates:check', (event) => { assertTrustedSender(event); return checkForUpdates() })
  ipcMain.handle('updates:download', (event) => { assertTrustedSender(event); return downloadUpdate() })
  ipcMain.handle('updates:cancel', (event) => { assertTrustedSender(event); return cancelUpdateDownload() })
  ipcMain.handle('updates:install', (event) => { assertTrustedSender(event); return installUpdate() })
  ipcMain.handle('updates:openRelease', (event) => { assertTrustedSender(event); return openUpdateRelease() })
}
