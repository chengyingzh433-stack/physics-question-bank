import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (contextIsolation 关闭时的兜底，本项目不会走到这里)
  window.api = api
}
