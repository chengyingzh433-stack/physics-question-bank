import { ipcMain, shell } from 'electron'
import { getDb } from '../storage/StorageService'
import { withStorageUse } from '../storage/activity'
import * as repo from '../storage/repositories/ocrRepo'
import { listQuestionAssets } from '../storage/repositories/contentRepo'
import { getOcrSettings, saveOcrSettings } from '../ocr/OcrCredentials'
import { prepareOcrInput } from '../ocr/OcrInput'
import { adoptOcrCandidate, getOcrSource, initializeOcrRuntime, pauseAllOcr, pauseOcrJob, resumeOcrJob, startOcrJob } from '../ocr/Doc2xService'

export function registerOcrIpc(): void {
  initializeOcrRuntime()
  ipcMain.handle('ocr:getSettings', () => getOcrSettings())
  ipcMain.handle('ocr:saveSettings', async (_event, input) => {
    if (input?.enabled === false || input?.clearKey === true) pauseAllOcr()
    const result = await saveOcrSettings(input)
    if (!result.enabled || !result.hasKey) pauseAllOcr()
    return result
  })
  ipcMain.handle('ocr:prepare', (event, questionId, part, crop, scale) => withStorageUse(async () => prepareOcrInput(event.sender.id, questionId, part, crop, scale)))
  ipcMain.handle('ocr:start', (event, input) => startOcrJob(event.sender.id, input))
  ipcMain.handle('ocr:list', (_event, questionId) => repo.listOcrJobs(getDb(), questionId))
  ipcMain.handle('ocr:pause', (_event, jobId) => pauseOcrJob(jobId))
  ipcMain.handle('ocr:resume', (_event, jobId) => resumeOcrJob(jobId))
  ipcMain.handle('ocr:candidate', (_event, jobId) => repo.getOcrCandidate(getDb(), jobId))
  ipcMain.handle('ocr:source', (_event, jobId) => withStorageUse(async () => getOcrSource(jobId)))
  ipcMain.handle('ocr:saveCandidate', (_event, jobId, input, revision) => repo.saveOcrCandidate(getDb(), jobId, input, revision))
  ipcMain.handle('ocr:discardCandidate', (_event, jobId, revision) => repo.discardOcrCandidate(getDb(), jobId, revision))
  ipcMain.handle('ocr:adopt', (_event, input) => adoptOcrCandidate(input))
  ipcMain.handle('ocr:recoveries', (_event, questionId) => repo.listOcrRecoveries(getDb(), questionId))
  ipcMain.handle('ocr:createRecovery', (_event, questionId, content, reason) => repo.createOcrRecovery(getDb(), questionId, content, reason))
  ipcMain.handle('ocr:assets', (_event, questionId) => listQuestionAssets(getDb(), questionId))
  ipcMain.handle('ocr:openConsole', () => shell.openExternal('https://open.noedgeai.com/'))
}
