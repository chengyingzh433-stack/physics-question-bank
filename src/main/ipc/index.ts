import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { basename, join } from 'path'
import { getDb } from '../storage/StorageService'
import * as paperRepo from '../storage/repositories/paperRepo'
import * as pageRepo from '../storage/repositories/pageRepo'
import * as segmentRepo from '../storage/repositories/segmentRepo'
import * as questionRepo from '../storage/repositories/questionRepo'
import * as questionTypeRepo from '../storage/repositories/questionTypeRepo'
import * as templateRepo from '../storage/repositories/templateRepo'
import * as tagRepo from '../storage/repositories/tagRepo'
import * as setRepo from '../storage/repositories/setRepo'
import * as exportService from '../export/ExportService'
import * as fileService from '../files/FileService'
import type { NewPageDTO, SegmentDTO, QuestionFilterCriteria } from '../../shared/types'

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

  ipcMain.handle('papers:delete', async (_e, id: number) => {
    // 先删 DB 行（级联清理 pages/cut_lines/segments/questions 等），再删磁盘文件。
    // 顺序：DB 是真值——磁盘删失败不影响一致性，仅留孤儿文件；DB 绝不能留悬空引用。
    paperRepo.deletePaper(getDb(), id)
    await fileService.deletePaperDir(id)
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

  // ---- manual boxes ----
  ipcMain.handle('manualboxes:list', (_e, pageId: number) => {
    return pageRepo.listManualBoxes(getDb(), pageId)
  })

  ipcMain.handle(
    'manualboxes:add',
    (_e, pageId: number, paperId: number, x0: number, y0: number, x1: number, y1: number, isExcluded: number) => {
      return pageRepo.addManualBox(getDb(), pageId, paperId, x0, y0, x1, y1, isExcluded)
    }
  )

  ipcMain.handle('manualboxes:delete', (_e, boxId: number) => {
    pageRepo.deleteManualBox(getDb(), boxId)
  })

  ipcMain.handle('manualboxes:undo', (_e, pageId: number) => {
    return pageRepo.undoLastManualBox(getDb(), pageId)
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

  ipcMain.handle('segments:setDeleted', (_e, segmentId: number, isDeleted: boolean) => {
    segmentRepo.setSegmentDeleted(getDb(), segmentId, isDeleted)
  })

  // ---- questions ----
  ipcMain.handle('questions:listByPaper', (_e, paperId: number) => {
    return questionRepo.listQuestionsByPaper(getDb(), paperId)
  })

  ipcMain.handle('questions:getSegments', (_e, questionId: number) => {
    return questionRepo.getQuestionSegments(getDb(), questionId)
  })

  ipcMain.handle('questions:getSegmentMap', (_e, questionId: number) => {
    return questionRepo.getQuestionSegmentMap(getDb(), questionId)
  })

  ipcMain.handle(
    'questions:createWithSegments',
    (_e, paperId: number, segmentIds: number[], orderInPaper: number | null) => {
      return questionRepo.createQuestionWithSegments(getDb(), paperId, segmentIds, orderInPaper)
    }
  )

  ipcMain.handle('questions:delete', (_e, questionId: number) => {
    questionRepo.deleteQuestion(getDb(), questionId)
  })

  ipcMain.handle('questions:renumber', (_e, paperId: number) => {
    questionRepo.renumberQuestions(getDb(), paperId)
  })

  ipcMain.handle('questions:setOrder', (_e, questionId: number, orderInPaper: number) => {
    questionRepo.setQuestionOrder(getDb(), questionId, orderInPaper)
  })

  ipcMain.handle(
    'questions:setImage',
    (_e, questionId: number, imagePath: string, widthPx: number, heightPx: number) => {
      questionRepo.setQuestionImage(getDb(), questionId, imagePath, widthPx, heightPx)
    }
  )

  ipcMain.handle(
    'papers:setStatus',
    (_e, paperId: number, status: 'importing' | 'cropping' | 'processing' | 'done') => {
      questionRepo.setPaperStatus(getDb(), paperId, status)
    }
  )

  ipcMain.handle(
    'files:saveQuestionPng',
    async (_e, paperId: number, questionId: number, data: ArrayBuffer) => {
      return fileService.saveQuestionPng(paperId, questionId, data)
    }
  )

  // ---- question types ----
  ipcMain.handle('types:list', () => {
    return questionTypeRepo.listQuestionTypes(getDb())
  })
  ipcMain.handle('types:create', (_e, name: string) => {
    return questionTypeRepo.createQuestionType(getDb(), name)
  })
  ipcMain.handle('types:rename', (_e, id: number, name: string) => {
    questionTypeRepo.renameQuestionType(getDb(), id, name)
  })
  ipcMain.handle('types:delete', (_e, id: number) => {
    return questionTypeRepo.deleteQuestionType(getDb(), id)
  })
  ipcMain.handle('questions:setType', (_e, questionId: number, typeId: number | null) => {
    questionTypeRepo.setQuestionType(getDb(), questionId, typeId)
  })

  // ---- templates ----
  ipcMain.handle('templates:list', () => {
    return templateRepo.listTemplates(getDb())
  })
  ipcMain.handle('templates:create', (_e, name: string) => {
    return templateRepo.createTemplate(getDb(), name)
  })
  ipcMain.handle('templates:delete', (_e, id: number) => {
    templateRepo.deleteTemplate(getDb(), id)
  })
  ipcMain.handle('templates:listRules', (_e, templateId: number) => {
    return templateRepo.listRules(getDb(), templateId)
  })
  ipcMain.handle(
    'templates:addRule',
    (_e, templateId: number, rule: { from_no: number; to_no: number; type_id: number; rule_order?: number }) => {
      return templateRepo.addRule(getDb(), templateId, rule)
    }
  )
  ipcMain.handle('templates:deleteRule', (_e, ruleId: number) => {
    templateRepo.deleteRule(getDb(), ruleId)
  })

  // ---- tags ----
  ipcMain.handle('chapters:list', () => tagRepo.listChapters(getDb()))
  ipcMain.handle('chapters:create', (_e, name: string) => tagRepo.createChapter(getDb(), name))
  ipcMain.handle('chapters:delete', (_e, id: number) => tagRepo.deleteChapter(getDb(), id))
  ipcMain.handle('kps:list', () => tagRepo.listKnowledgePoints(getDb()))
  ipcMain.handle('kps:create', (_e, name: string, chapterId: number | null) =>
    tagRepo.createKnowledgePoint(getDb(), name, chapterId)
  )
  ipcMain.handle('kps:delete', (_e, id: number) => tagRepo.deleteKnowledgePoint(getDb(), id))
  ipcMain.handle('diffs:list', () => tagRepo.listDifficulties(getDb()))
  ipcMain.handle('diffs:create', (_e, name: string, sortOrder: number) =>
    tagRepo.createDifficulty(getDb(), name, sortOrder)
  )
  ipcMain.handle('diffs:delete', (_e, id: number) => tagRepo.deleteDifficulty(getDb(), id))
  ipcMain.handle('questions:setChapter', (_e, qid: number, cid: number | null) =>
    tagRepo.setQuestionChapter(getDb(), qid, cid)
  )
  ipcMain.handle('questions:setDifficulty', (_e, qid: number, did: number | null) =>
    tagRepo.setQuestionDifficulty(getDb(), qid, did)
  )
  ipcMain.handle('questions:setKps', (_e, qid: number, kpIds: number[]) =>
    tagRepo.setQuestionKnowledgePoints(getDb(), qid, kpIds)
  )
  ipcMain.handle('questions:getKps', (_e, qid: number) =>
    tagRepo.getQuestionKnowledgePoints(getDb(), qid)
  )

  // ---- bank ----
  ipcMain.handle('bank:list', (_e, criteria: QuestionFilterCriteria) => {
    return questionRepo.listBankQuestions(getDb(), criteria)
  })

  // ---- basket (paper_set draft) ----
  ipcMain.handle('sets:getDraft', () => {
    return setRepo.getOrCreateDraftSet(getDb())
  })
  ipcMain.handle('sets:listItems', (_e, setId: number) => {
    return setRepo.listSetItems(getDb(), setId)
  })
  ipcMain.handle('sets:listQuestionIds', (_e, setId: number) => {
    return setRepo.listSetQuestionIds(getDb(), setId)
  })
  ipcMain.handle('sets:add', (_e, setId: number, questionId: number) => {
    return setRepo.addToSet(getDb(), setId, questionId)
  })
  ipcMain.handle('sets:remove', (_e, itemId: number) => {
    setRepo.removeFromSet(getDb(), itemId)
  })
  ipcMain.handle(
    'sets:updateItem',
    (
      _e,
      itemId: number,
      fields: {
        order_index?: number
        group_header?: string | null
        display_number?: string | null
      }
    ) => {
      setRepo.updateSetItem(getDb(), itemId, fields)
    }
  )

  // ---- export ----
  ipcMain.handle('export:basket', async (_e, setId: number, title: string) => {
    return exportService.exportBasketPdf(setId, title)
  })

  // ---- db 维护（M12-2）----
  /** 备份数据库：弹保存框 → better-sqlite3 的 backup()（安全处理 WAL，避免裸 copy 读到半写状态）。
   *  返回保存路径，用户取消返回 null。 */
  ipcMain.handle('db:backup', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showSaveDialog(win!, {
      title: '备份数据库',
      defaultPath: `题库备份-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return null
    const db = getDb()
    // backup() 在另一个连接上逐页复制，不阻塞主连接读写，且保证一致性快照
    await db.backup(result.filePath)
    return result.filePath
  })

  // ---- app 设置（M12-2，R7：导出 DPI 可调）----
  ipcMain.handle('settings:get', (_e, key: string, defaultValue: string) => {
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? defaultValue
  })
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    getDb()
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
    return
  })

  // ---- 存储位置 ----
  /** 弹出选择目录对话框，返回用户选的路径或 null（取消）。 */
  ipcMain.handle('dialog:openDirectory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: '选择数据存储位置',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  /** 迁移项目文件到新存储路径。 */
  ipcMain.handle('storage:migrate', async (_e, newPath: string) => {
    return fileService.migrateStorage(newPath)
  })

  /** 返回默认存储路径（userData/projects/），供前端恢复默认用。 */
  ipcMain.handle('storage:getDefaultPath', () => {
    return join(app.getPath('userData'), 'projects')
  })

  /** 返回当前存储路径（读 app_settings，空则返回默认路径）。 */
  ipcMain.handle('storage:getCurrentPath', () => {
    return fileService.getProjectsRoot()
  })
}
