import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  ping: () => ipcRenderer.invoke('app:ping'),
  // papers
  listPapers: () => ipcRenderer.invoke('papers:list'),
  getPaper: (id) => ipcRenderer.invoke('papers:get', id),
  importPaper: (name, options) => ipcRenderer.invoke('papers:import', name, options),
  getAnswerPaper: (parentPaperId) => ipcRenderer.invoke('papers:getAnswerPaper', parentPaperId),
  deletePaper: (id) => ipcRenderer.invoke('papers:delete', id),
  updatePaperMeta: (paperId, fields) => ipcRenderer.invoke('papers:updateMeta', paperId, fields),
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
  undoLastCutLine: (paperId) => ipcRenderer.invoke('cutlines:undo', paperId),
  deleteCutLine: (cutLineId) => ipcRenderer.invoke('cutlines:delete', cutLineId),
  // manual boxes
  listManualBoxes: (pageId) => ipcRenderer.invoke('manualboxes:list', pageId),
  addManualBox: (pageId, paperId, x0, y0, x1, y1, isExcluded) =>
    ipcRenderer.invoke('manualboxes:add', pageId, paperId, x0, y0, x1, y1, isExcluded),
  deleteManualBox: (boxId) => ipcRenderer.invoke('manualboxes:delete', boxId),
  undoLastManualBox: (paperId) => ipcRenderer.invoke('manualboxes:undo', paperId),
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
  updateQuestionSourceOverride: (questionId, fields) =>
    ipcRenderer.invoke('questions:updateSourceOverride', questionId, fields),
  setQuestionImage: (questionId, imagePath, widthPx, heightPx) =>
    ipcRenderer.invoke('questions:setImage', questionId, imagePath, widthPx, heightPx),
  setPaperStatus: (paperId, status) =>
    ipcRenderer.invoke('papers:setStatus', paperId, status),
  saveQuestionPng: (paperId, questionId, data) =>
    ipcRenderer.invoke('files:saveQuestionPng', paperId, questionId, data),
  saveAnswerPng: (paperId, questionId, data) =>
    ipcRenderer.invoke('files:saveAnswerPng', paperId, questionId, data),
  setAnswerImage: (questionId, imagePath, widthPx, heightPx) =>
    ipcRenderer.invoke('questions:setAnswerImage', questionId, imagePath, widthPx, heightPx),
  clearAnswersByPaper: (paperId) => ipcRenderer.invoke('questions:clearAnswersByPaper', paperId),
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
  deleteRule: (ruleId) => ipcRenderer.invoke('templates:deleteRule', ruleId),
  // tags
  listChapters: () => ipcRenderer.invoke('chapters:list'),
  createChapter: (name) => ipcRenderer.invoke('chapters:create', name),
  deleteChapter: (id) => ipcRenderer.invoke('chapters:delete', id),
  listKnowledgePoints: () => ipcRenderer.invoke('kps:list'),
  createKnowledgePoint: (name, chapterId) =>
    ipcRenderer.invoke('kps:create', name, chapterId),
  deleteKnowledgePoint: (id) => ipcRenderer.invoke('kps:delete', id),
  listDifficulties: () => ipcRenderer.invoke('diffs:list'),
  createDifficulty: (name, sortOrder) =>
    ipcRenderer.invoke('diffs:create', name, sortOrder),
  deleteDifficulty: (id) => ipcRenderer.invoke('diffs:delete', id),
  setQuestionChapter: (qid, cid) => ipcRenderer.invoke('questions:setChapter', qid, cid),
  setQuestionDifficulty: (qid, did) => ipcRenderer.invoke('questions:setDifficulty', qid, did),
  setQuestionKnowledgePoints: (qid, kpIds) => ipcRenderer.invoke('questions:setKps', qid, kpIds),
  getQuestionKnowledgePoints: (qid) => ipcRenderer.invoke('questions:getKps', qid),
  // bank
  listBankQuestions: (criteria) => ipcRenderer.invoke('bank:list', criteria),
  listYearSources: () => ipcRenderer.invoke('bank:listYearSources'),
  // basket
  getOrCreateDraftSet: () => ipcRenderer.invoke('sets:getDraft'),
  listSetItems: (setId) => ipcRenderer.invoke('sets:listItems', setId),
  listSetQuestionIds: (setId) => ipcRenderer.invoke('sets:listQuestionIds', setId),
  addToSet: (setId, questionId) => ipcRenderer.invoke('sets:add', setId, questionId),
  removeFromSet: (itemId) => ipcRenderer.invoke('sets:remove', itemId),
  updateSetItem: (itemId, fields) => ipcRenderer.invoke('sets:updateItem', itemId, fields),
  exportBasketPdf: (setId, title, answerMode) => ipcRenderer.invoke('export:basket', setId, title, answerMode),
  backupDatabase: () => ipcRenderer.invoke('db:backup'),
  getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  // storage
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  migrateStorage: (newPath) => ipcRenderer.invoke('storage:migrate', newPath),
  getDefaultStoragePath: () => ipcRenderer.invoke('storage:getDefaultPath'),
  getCurrentStoragePath: () => ipcRenderer.invoke('storage:getCurrentPath')
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
