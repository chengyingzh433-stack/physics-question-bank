import { loadPdf, getAllPageSizes } from './RenderService'
import type { PaperDTO, NewPageDTO } from '@shared/types'

/** app:// URL 指向某试卷的 source.pdf（主进程已注册 app:// 协议映射 projects/）。 */
export function sourcePdfUrl(paperId: number): string {
  return `app://projects/${paperId}/source.pdf`
}

/** 把 pdfjs/未知错误归类成友好中文消息（T7）。 */
export function describeImportError(e: unknown): string {
  const name = (e as { name?: string })?.name
  const msg = e instanceof Error ? e.message : String(e)
  if (name === 'PasswordException' || /password/i.test(msg)) {
    return '该 PDF 已加密，请先解除密码保护后再导入。'
  }
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(msg)) {
    return '该 PDF 文件已损坏或格式不正确，无法打开。'
  }
  if (name === 'MissingPDFException' || /missing pdf/i.test(msg)) {
    return '找不到 PDF 文件，可能已被移动或删除。'
  }
  return `导入失败：${msg}`
}

/**
 * 完成导入的后半段：渲染进程用 pdfjs 读取 source.pdf 各页尺寸，
 * 通过 IPC 回写 pages + setPageCount。返回页数。
 * 失败时抛出带友好中文 message 的 Error（T7），调用方负责提示并回滚已建 paper。
 */
export async function importPagesFromPdf(paper: PaperDTO): Promise<number> {
  const url = sourcePdfUrl(paper.id)
  let doc
  let destroy
  try {
    const loaded = await loadPdf(url).catch((e) => {
      console.error('[import] loadPdf 失败', e)
      throw new Error(describeImportError(e))
    })
    doc = loaded.doc
    destroy = loaded.destroy
  } catch (e) {
    throw e
  }
  console.log('[import] doc loaded, numPages=', doc.numPages)
  try {
    const sizes = await getAllPageSizes(doc)
    const pages: NewPageDTO[] = sizes.map((s, i) => ({
      paper_id: paper.id,
      page_index: i,
      width_pt: s.width_pt,
      height_pt: s.height_pt,
      rotation: s.rotation
    }))
    await window.api.bulkAddPages(pages)
    await window.api.setPageCount(paper.id, pages.length)
    return pages.length
  } catch (e) {
    throw new Error(describeImportError(e))
  } finally {
    await destroy()
  }
}
