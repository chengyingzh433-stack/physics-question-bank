import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  listIntakeDrafts: () => ipcRenderer.invoke('intake:list'),
  createIntakeDraft: (from, components) => ipcRenderer.invoke('intake:create', from, components),
  getIntakeDraft: (id) => ipcRenderer.invoke('intake:get', id),
  getIntakeForQuestion: (id) => ipcRenderer.invoke('intake:question', id),
  saveIntakeDraft: (id, revision, title, components) => ipcRenderer.invoke('intake:save', id, revision, title, components),
  importIntakeFiles: (id) => ipcRenderer.invoke('intake:files', id),
  importIntakeFile: async (id, file) => {
    const path = webUtils.getPathForFile(file)
    if (path) return ipcRenderer.invoke('intake:path', id, path)
    if (file.size > 100 * 1024 * 1024) throw new Error('文件超过 100 MiB')
    return ipcRenderer.invoke('intake:bytes', id, await file.arrayBuffer(), file.name)
  },
  importIntakeBytes: (id, data, name) => ipcRenderer.invoke('intake:bytes', id, data, name),
  pasteIntakeClipboard: (id) => ipcRenderer.invoke('intake:clipboard', id),
  addIntakeCrop: (id, source, page, crop, data) => ipcRenderer.invoke('intake:crop', id, source, page, crop, data),
  prepareIntakeQuestion: (id, revision, q, a) => ipcRenderer.invoke('intake:prepare', id, revision, q, a),
  publishIntakeQuestion: (id, revision, confirmed) => ipcRenderer.invoke('intake:publish', id, revision, confirmed),
  archiveIntakeDraft: (id, revision, archived) => ipcRenderer.invoke('intake:archive', id, revision, archived),
  revealIntakeSource: (id, source) => ipcRenderer.invoke('intake:reveal', id, source),
  getUpdateState: () => ipcRenderer.invoke('updates:state'),
  saveUpdatePreferences: (value) => ipcRenderer.invoke('updates:preferences', value),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  cancelUpdateDownload: () => ipcRenderer.invoke('updates:cancel'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openUpdateRelease: () => ipcRenderer.invoke('updates:openRelease'),
  getOcrSettings: () => ipcRenderer.invoke('ocr:getSettings'),
  saveOcrSettings: (input) => ipcRenderer.invoke('ocr:saveSettings', input),
  prepareOcrInput: (id, part, crop, scale) => ipcRenderer.invoke('ocr:prepare', id, part, crop, scale),
  startOcrJob: (input) => ipcRenderer.invoke('ocr:start', input),
  listOcrJobs: (id) => ipcRenderer.invoke('ocr:list', id),
  pauseOcrJob: (id) => ipcRenderer.invoke('ocr:pause', id),
  resumeOcrJob: (id) => ipcRenderer.invoke('ocr:resume', id),
  getOcrCandidate: (id) => ipcRenderer.invoke('ocr:candidate', id),
  getOcrSource: (id) => ipcRenderer.invoke('ocr:source', id),
  saveOcrCandidate: (id, input, revision) => ipcRenderer.invoke('ocr:saveCandidate', id, input, revision),
  discardOcrCandidate: (id, revision) => ipcRenderer.invoke('ocr:discardCandidate', id, revision),
  adoptOcrCandidate: (input) => ipcRenderer.invoke('ocr:adopt', input),
  listOcrRecoveries: (id) => ipcRenderer.invoke('ocr:recoveries', id),
  createOcrRecovery: (id, content, reason) => ipcRenderer.invoke('ocr:createRecovery', id, content, reason),
  listOcrAssets: (id) => ipcRenderer.invoke('ocr:assets', id),
  openDoc2xConsole: () => ipcRenderer.invoke('ocr:openConsole'),
  getEditableQuestion: (id) => ipcRenderer.invoke('editable:get', id),
  saveQuestionContent: (id, content, expectedRevision) => ipcRenderer.invoke('editable:save', id, content, expectedRevision),
  listContentRevisions: (id) => ipcRenderer.invoke('editable:revisions', id),
  getContentRevision: (id, revision) => ipcRenderer.invoke('editable:revision', id, revision),
  restoreContentRevision: (id, revision, expectedRevision) => ipcRenderer.invoke('editable:restore', id, revision, expectedRevision),
  importQuestionAsset: (id) => ipcRenderer.invoke('editable:importAsset', id),
  saveQuestionAsset: (id, data, name) => ipcRenderer.invoke('editable:saveAsset', id, data, name),
  exportBasketDocx: (setId, options) => ipcRenderer.invoke('export:basketDocx', setId, options),
  getWordExportOptions: (setId) => ipcRenderer.invoke('export:wordOptions', setId),
  saveWordExportOptions: (setId, options) => ipcRenderer.invoke('export:saveWordOptions', setId, options),
  reorderBasketItems: (setId, itemIds) => ipcRenderer.invoke('sets:reorder', setId, itemIds),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  ping: () => ipcRenderer.invoke('app:ping'),
  // papers
  listPapers: () => ipcRenderer.invoke('papers:list'),
  getPaper: (id) => ipcRenderer.invoke('papers:get', id),
  importPaper: (name, options) => ipcRenderer.invoke('papers:import', name, options),
  importDroppedPaper: async (file) => {
    const path = webUtils.getPathForFile(file)
    if (!path) throw new Error('无法取得文件位置，请从文件夹拖入 PDF，或使用“导入试卷 PDF”按钮。')
    return ipcRenderer.invoke('papers:importPath', path)
  },
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
  getAnswerPairings: (paperId) => ipcRenderer.invoke('answers:getPairings', paperId),
  commitAnswerBindings: (paperId, answerPaperId, bindings) => ipcRenderer.invoke('answers:commitBindings', paperId, answerPaperId, bindings),
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
  listChapterTemplates: () => ipcRenderer.invoke('chapterTemplates:list'),
  installChapterTemplate: (key) => ipcRenderer.invoke('chapterTemplates:install', key),
  createChapter: (name, parentId) => ipcRenderer.invoke('chapters:create', name, parentId),
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
  batchQuestionKnowledgePoints: (qids) => ipcRenderer.invoke('questions:batchKps', qids),
  // bank
  listQuestionFolders: () => ipcRenderer.invoke('folders:list'),
  createQuestionFolder: (name) => ipcRenderer.invoke('folders:create', name),
  renameQuestionFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  deleteQuestionFolder: (id) => ipcRenderer.invoke('folders:delete', id),
  addQuestionsToFolder: (id, ids) => ipcRenderer.invoke('folders:addQuestions', id, ids),
  removeQuestionsFromFolder: (id, ids) => ipcRenderer.invoke('folders:removeQuestions', id, ids),
  listBankQuestions: (criteria) => ipcRenderer.invoke('bank:list', criteria),
  listYearSources: () => ipcRenderer.invoke('bank:listYearSources'),
  // basket
  addManyToSet: (setId, ids) => ipcRenderer.invoke('sets:addMany', setId, ids),
  removeQuestionFromSet: (setId, questionId) => ipcRenderer.invoke('sets:removeQuestion', setId, questionId),
  getOrCreateDraftSet: () => ipcRenderer.invoke('sets:getDraft'),
  listSetItems: (setId) => ipcRenderer.invoke('sets:listItems', setId),
  listSetQuestionIds: (setId) => ipcRenderer.invoke('sets:listQuestionIds', setId),
  addToSet: (setId, questionId) => ipcRenderer.invoke('sets:add', setId, questionId),
  removeFromSet: (itemId) => ipcRenderer.invoke('sets:remove', itemId),
  updateSetItem: (itemId, fields) => ipcRenderer.invoke('sets:updateItem', itemId, fields),
  exportBasketPdf: (setId, title, answerMode) => ipcRenderer.invoke('export:basket', setId, title, answerMode),
  exportBasketPptx: (setId, title, answerMode) => ipcRenderer.invoke('export:basketPptx', setId, title, answerMode),
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
