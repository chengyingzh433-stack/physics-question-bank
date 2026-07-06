import { ipcMain, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { getDb } from '../storage/StorageService'
import * as paperRepo from '../storage/repositories/paperRepo'
import * as pageRepo from '../storage/repositories/pageRepo'
import * as segmentRepo from '../storage/repositories/segmentRepo'
import * as questionRepo from '../storage/repositories/questionRepo'
import * as questionTypeRepo from '../storage/repositories/questionTypeRepo'
import * as templateRepo from '../storage/repositories/templateRepo'
import * as tagRepo from '../storage/repositories/tagRepo'
import * as setRepo from '../storage/repositories/setRepo'
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
}
