import { BrowserWindow, dialog, ipcMain } from 'electron'
import { getDb } from '../storage/StorageService'
import * as contentRepo from '../storage/repositories/contentRepo'
import { importQuestionAssetFromPath, saveQuestionAsset } from '../files/ContentAssetService'
import type { QuestionContentInput } from '../../shared/editable'

export function registerEditableIpc(): void {
  ipcMain.handle('editable:get', (_event, questionId: number) => contentRepo.getEditableQuestion(getDb(), questionId))
  ipcMain.handle('editable:save', (_event, questionId: number, content: QuestionContentInput, expectedRevision: number) =>
    contentRepo.saveQuestionContent(getDb(), questionId, content, expectedRevision))
  ipcMain.handle('editable:revisions', (_event, questionId: number) => contentRepo.listContentRevisions(getDb(), questionId))
  ipcMain.handle('editable:revision', (_event, questionId: number, revision: number) => contentRepo.getContentRevision(getDb(), questionId, revision))
  ipcMain.handle('editable:restore', (_event, questionId: number, revision: number, expectedRevision: number) =>
    contentRepo.restoreContentRevision(getDb(), questionId, revision, expectedRevision))
  ipcMain.handle('editable:importAsset', async (event, questionId: number) => {
    contentRepo.requireEditableQuestion(getDb(), questionId)
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '添加题目配图', filters: [{ name: 'PNG / JPEG 图片', extensions: ['png', 'jpg', 'jpeg'] }], properties: ['openFile']
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths.length) return null
    return importQuestionAssetFromPath(getDb(), questionId, result.filePaths[0])
  })
  ipcMain.handle('editable:saveAsset', (_event, questionId: number, data: ArrayBuffer, name: string) =>
    saveQuestionAsset(getDb(), questionId, data, name))
}
