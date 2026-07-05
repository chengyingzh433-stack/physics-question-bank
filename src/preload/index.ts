import { contextBridge, ipcRenderer } from 'electron'

// M0-5 会在此暴露类型化 api；M0-1 先留空桥，确保 contextIsolation 链路通。
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
