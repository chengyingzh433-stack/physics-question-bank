import { basename, extname, isAbsolute } from 'node:path'
import { stat } from 'node:fs/promises'
import { getDb } from '../storage/StorageService'
import * as paperRepo from '../storage/repositories/paperRepo'
import { copySourcePdf, deletePaperDir } from './FileService'
import type { PaperDTO, PaperKind } from '../../shared/types'

/** 文件选择与拖放共用的导入入口；页解析仍由渲染进程完成。 */
export async function importPaperFromPath(
  sourcePath: string,
  name = '',
  options?: { kind?: Exclude<PaperKind, 'intake'>; parentPaperId?: number | null }
): Promise<PaperDTO> {
  if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath) || extname(sourcePath).toLowerCase() !== '.pdf') {
    throw new Error('请选择本机的 PDF 文件，暂不支持其他格式或文件夹。')
  }
  const info = await stat(sourcePath)
  if (!info.isFile()) throw new Error('请拖入 PDF 文件，不能拖入文件夹。')
  const db = getDb()
  const id = paperRepo.createPaper(db, name.trim() || basename(sourcePath, extname(sourcePath)), options)
  try {
    const destPath = await copySourcePdf(id, sourcePath)
    db.prepare('UPDATE papers SET source_pdf_path = ?, original_filename = ?, updated_at = ? WHERE id = ?')
      .run(destPath, basename(sourcePath), new Date().toISOString(), id)
    return paperRepo.getPaper(db, id)!
  } catch (error) {
    paperRepo.deletePaper(db, id)
    await deletePaperDir(id).catch((cleanupError) => console.error('[import] 清理失败', cleanupError))
    throw error
  }
}
