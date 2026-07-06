import { loadPdf, getAllPageSizes } from './RenderService'
import type { PaperDTO, NewPageDTO } from '@shared/types'

/** app:// URL 指向某试卷的 source.pdf（主进程已注册 app:// 协议映射 projects/）。 */
export function sourcePdfUrl(paperId: number): string {
  return `app://projects/${paperId}/source.pdf`
}

/**
 * 完成导入的后半段：渲染进程用 pdfjs 读取 source.pdf 各页尺寸，
 * 通过 IPC 回写 pages + setPageCount。返回页数。
 * 失败时抛出，调用方负责提示。
 */
export async function importPagesFromPdf(paper: PaperDTO): Promise<number> {
  const url = sourcePdfUrl(paper.id)
  const { doc, destroy } = await loadPdf(url)
  try {
    const sizes = await getAllPageSizes(doc)
    const pages: NewPageDTO[] = sizes.map((s, i) => ({
      paper_id: paper.id,
      page_index: i,
      width_pt: s.width_pt,
      height_pt: s.height_pt
    }))
    await window.api.bulkAddPages(pages)
    await window.api.setPageCount(paper.id, pages.length)
    return pages.length
  } finally {
    await destroy()
  }
}
