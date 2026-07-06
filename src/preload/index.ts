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
  getSourcePdfPath: (paperId) => ipcRenderer.invoke('files:sourcePdfPath', paperId),
  // pages crop
  getPage: (pageId) => ipcRenderer.invoke('pages:get', pageId),
  setColumnMode: (pageId, mode) => ipcRenderer.invoke('pages:setColumnMode', pageId, mode),
  listDividers: (pageId) => ipcRenderer.invoke('dividers:list', pageId),
  replaceDividers: (pageId, xRatios) => ipcRenderer.invoke('dividers:replace', pageId, xRatios),
  listCutLines: (pageId) => ipcRenderer.invoke('cutlines:list', pageId),
  addCutLine: (pageId, colIndex, yRatio) => ipcRenderer.invoke('cutlines:add', pageId, colIndex, yRatio),
  undoLastCutLine: (pageId) => ipcRenderer.invoke('cutlines:undo', pageId),
  deleteCutLine: (cutLineId) => ipcRenderer.invoke('cutlines:delete', cutLineId),
  // segments
  getSegmentsByPage: (pageId) => ipcRenderer.invoke('segments:byPage', pageId),
  getSegmentsByPaper: (paperId) => ipcRenderer.invoke('segments:byPaper', paperId),
  replaceSegmentsForPage: (pageId, paperId, segments) =>
    ipcRenderer.invoke('segments:replaceForPage', pageId, paperId, segments),
  setSegmentDeleted: (segmentId, isDeleted) =>
    ipcRenderer.invoke('segments:setDeleted', segmentId, isDeleted),
  // questions
  listQuestionsByPaper: (paperId) => ipcRenderer.invoke('questions:listByPaper', paperId),
  getQuestionSegments: (questionId) => ipcRenderer.invoke('questions:getSegments', questionId),
  getQuestionSegmentMap: (questionId) => ipcRenderer.invoke('questions:getSegmentMap', questionId),
  createQuestionWithSegments: (paperId, segmentIds, orderInPaper) =>
    ipcRenderer.invoke('questions:createWithSegments', paperId, segmentIds, orderInPaper),
  deleteQuestion: (questionId) => ipcRenderer.invoke('questions:delete', questionId),
  renumberQuestions: (paperId) => ipcRenderer.invoke('questions:renumber', paperId),
  setQuestionOrder: (questionId, orderInPaper) =>
    ipcRenderer.invoke('questions:setOrder', questionId, orderInPaper),
  setQuestionImage: (questionId, imagePath, widthPx, heightPx) =>
    ipcRenderer.invoke('questions:setImage', questionId, imagePath, widthPx, heightPx),
  setPaperStatus: (paperId, status) =>
    ipcRenderer.invoke('papers:setStatus', paperId, status),
  saveQuestionPng: (paperId, questionId, data) =>
    ipcRenderer.invoke('files:saveQuestionPng', paperId, questionId, data),
  // question types
  listQuestionTypes: () => ipcRenderer.invoke('types:list'),
  createQuestionType: (name) => ipcRenderer.invoke('types:create', name),
  renameQuestionType: (id, name) => ipcRenderer.invoke('types:rename', id, name),
  deleteQuestionType: (id) => ipcRenderer.invoke('types:delete', id),
  setQuestionType: (questionId, typeId) =>
    ipcRenderer.invoke('questions:setType', questionId, typeId),
  // templates
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  createTemplate: (name) => ipcRenderer.invoke('templates:create', name),
  deleteTemplate: (id) => ipcRenderer.invoke('templates:delete', id),
  listRules: (templateId) => ipcRenderer.invoke('templates:listRules', templateId),
  addRule: (templateId, rule) => ipcRenderer.invoke('templates:addRule', templateId, rule),
  deleteRule: (ruleId) => ipcRenderer.invoke('templates:deleteRule', ruleId)
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
