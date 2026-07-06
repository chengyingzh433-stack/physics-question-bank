import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  ping: () => ipcRenderer.invoke('app:ping'),
  // papers
  listPapers: () => ipcRenderer.invoke('papers:list'),
  getPaper: (id) => ipcRenderer.invoke('papers:get', id),
  importPaper: (name) => ipcRenderer.invoke('papers:import', name),
  deletePaper: (id) => ipcRenderer.invoke('papers:delete', id),
  // pages
  bulkAddPages: (pages) => ipcRenderer.invoke('pages:bulkAdd', pages),
  setPageCount: (paperId, n) => ipcRenderer.invoke('pages:setCount', paperId, n),
  getPages: (paperId) => ipcRenderer.invoke('pages:list', paperId),
  // files
  getSourcePdfPath: (paperId) => ipcRenderer.invoke('files:sourcePdfPath', paperId)
}

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
