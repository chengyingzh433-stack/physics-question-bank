import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import * as intake from '../intake/IntakeService'
import type { IntakeComponent } from '../../shared/intake'
import type { OcrCrop } from '../../shared/ocr'

export function registerIntakeIpc(): void {
  ipcMain.handle('intake:list', () => intake.listDrafts())
  ipcMain.handle('intake:create', (_e, from?: string, components?: boolean) => intake.createDraft(from, components))
  ipcMain.handle('intake:get', (_e, id: string) => intake.getDraft(id))
  ipcMain.handle('intake:question', (_e, id: number) => intake.draftForQuestion(id))
  ipcMain.handle('intake:save', (_e, id: string, revision: number, title: string, components: IntakeComponent[]) => intake.saveDraft(id, revision, title, components))
  ipcMain.handle('intake:path', (_e, id: string, path: string) => intake.importPath(id, path))
  ipcMain.handle('intake:bytes', (_e, id: string, data: ArrayBuffer, name: string) => intake.importBytes(id, data, name))
  ipcMain.handle('intake:files', async (e, id: string) => {
    intake.getDraft(id)
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = { title: '选择录题原稿', properties: ['openFile', 'multiSelections'], filters: [
      { name: '图片、PDF、Word', extensions: ['png', 'jpg', 'jpeg', 'pdf', 'docx'] }
    ] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const errors: string[] = []
    for (const path of result.filePaths.slice(0, 40)) {
      try { await intake.importPath(id, path) } catch (e) { errors.push(`${path.split(/[\\/]/).pop()}：${e instanceof Error ? e.message : '导入失败'}`) }
    }
    if (result.filePaths.length > 40) errors.push('每次最多导入 40 个文件，其余未导入')
    return { draft: intake.getDraft(id), errors }
  })
  ipcMain.handle('intake:clipboard', async (_e, id: string) => {
    intake.getDraft(id)
    const items = await clipboard.read()
    for (const item of items) {
      const mime = item.types.find((t) => t === 'image/png' || t === 'image/jpeg')
      if (!mime) continue
      const blob = await item.getType(mime)
      if (blob.size > 20 * 1024 * 1024) throw new Error('剪贴板图片超过 20 MiB')
      const draft = await intake.importBytes(id, await blob.arrayBuffer(), `粘贴截图-${Date.now()}.${mime === 'image/png' ? 'png' : 'jpg'}`)
      return { draft, text: null }
    }
    const text = await clipboard.readText()
    if (!text.trim()) throw new Error('剪贴板没有 PNG/JPEG 图片或文字，请先复制截图或文字')
    if (text.length > 20000) throw new Error('剪贴板文字超过 2 万字，请分段粘贴')
    return { draft: intake.getDraft(id), text }
  })
  ipcMain.handle('intake:crop', (_e, id: string, source: string, page: number, crop: OcrCrop | null, data: ArrayBuffer) => intake.addCrop(id, source, page, crop, data))
  ipcMain.handle('intake:prepare', (_e, id: string, revision: number, q: ArrayBuffer, a: ArrayBuffer | null) => intake.prepareQuestion(id, revision, q, a))
  ipcMain.handle('intake:publish', (_e, id: string, revision: number, confirmed: boolean) => intake.publishQuestion(id, revision, confirmed))
  ipcMain.handle('intake:archive', (_e, id: string, revision: number, archived: boolean) => intake.archiveDraft(id, revision, archived))
  ipcMain.handle('intake:reveal', (_e, id: string, source: string) => intake.revealSource(id, source))
}
