import { ipcMain, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { getDb } from '../storage/StorageService'
import * as paperRepo from '../storage/repositories/paperRepo'
import * as pageRepo from '../storage/repositories/pageRepo'
import * as segmentRepo from '../storage/repositories/segmentRepo'
import * as fileService from '../files/FileService'
import type { NewPageDTO, SegmentDTO } from '../../shared/types'

/** 注册所有 IPC handler。在 app.whenReady 后调用一次。 */
export function registerIpc(): void {
  // ---- app ----
  ipcMain.handle('app:ping', () => 'pong')

  // ---- papers ----
  ipcMain.handle('papers:list', () => {
    return paperRepo.listPapers(getDb())
  })

  ipcMain.handle('papers:get', (_e, id: number) => {
    return paperRepo.getPaper(getDb(), id)
  })

  /** 导入试卷：弹文件选择框 → createPaper → 复制 source.pdf。
   *  页尺寸由渲染进程后续用 pdfjs 读取并回写（pages:bulkAdd）。 */
  ipcMain.handle('papers:import', async (e, name: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: '选择试卷 PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const srcPath = result.filePaths[0]
    const db = getDb()
    const paperName = name?.trim() || basename(srcPath, '.pdf')
    const paperId = paperRepo.createPaper(db, paperName)

    try {
      const destPath = await fileService.copySourcePdf(paperId, srcPath)
      // 记录来源路径与原始文件名
      db.prepare(
        `UPDATE papers SET source_pdf_path = ?, original_filename = ?, updated_at = ? WHERE id = ?`
      ).run(destPath, basename(srcPath), new Date().toISOString(), paperId)
      return paperRepo.getPaper(db, paperId)
    } catch (err) {
      // 复制失败：回滚（删除刚建的 paper，级联清理）
      paperRepo.deletePaper(db, paperId)
      throw err
    }
  })

  ipcMain.handle('papers:delete', (_e, id: number) => {
    paperRepo.deletePaper(getDb(), id)
    // 注意：图片目录的清理由调用方/后续 FileService 负责（M2+ 再补）
    return
  })

  // ---- pages ----
  ipcMain.handle('pages:bulkAdd', (_e, pages: NewPageDTO[]) => {
    paperRepo.addPages(getDb(), pages)
  })

  ipcMain.handle('pages:setCount', (_e, paperId: number, n: number) => {
    paperRepo.setPageCount(getDb(), paperId, n)
  })

  ipcMain.handle('pages:list', (_e, paperId: number) => {
    return paperRepo.getPages(getDb(), paperId)
  })

  // ---- files ----
  ipcMain.handle('files:sourcePdfPath', async (_e, paperId: number) => {
    return fileService.getSourcePdfPath(paperId)
  })

  // ---- pages crop ----
  ipcMain.handle('pages:get', (_e, pageId: number) => {
    return pageRepo.getPage(getDb(), pageId)
  })

  ipcMain.handle('pages:setColumnMode', (_e, pageId: number, mode: number) => {
    pageRepo.setColumnMode(getDb(), pageId, mode)
  })

  ipcMain.handle('dividers:list', (_e, pageId: number) => {
    return pageRepo.listDividers(getDb(), pageId)
  })

  ipcMain.handle('dividers:replace', (_e, pageId: number, xRatios: number[]) => {
    pageRepo.replaceDividers(getDb(), pageId, xRatios)
  })

  ipcMain.handle('cutlines:list', (_e, pageId: number) => {
    return pageRepo.listCutLines(getDb(), pageId)
  })

  ipcMain.handle('cutlines:add', (_e, pageId: number, colIndex: number, yRatio: number) => {
    return pageRepo.addCutLine(getDb(), pageId, colIndex, yRatio)
  })

  ipcMain.handle('cutlines:undo', (_e, pageId: number) => {
    return pageRepo.undoLastCutLine(getDb(), pageId)
  })

  ipcMain.handle('cutlines:delete', (_e, cutLineId: number) => {
    pageRepo.deleteCutLine(getDb(), cutLineId)
  })

  // ---- segments ----
  ipcMain.handle('segments:byPage', (_e, pageId: number) => {
    return segmentRepo.getSegmentsByPage(getDb(), pageId)
  })

  ipcMain.handle('segments:byPaper', (_e, paperId: number) => {
    return segmentRepo.getSegmentsByPaper(getDb(), paperId)
  })

  ipcMain.handle(
    'segments:replaceForPage',
    (_e, pageId: number, paperId: number, segments: Omit<SegmentDTO, 'id' | 'page_id' | 'paper_id'>[]) => {
      segmentRepo.replaceSegmentsForPage(getDb(), pageId, paperId, segments)
    }
  )
}
