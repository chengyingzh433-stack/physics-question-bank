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
  console.time('[import] loadPdf')
  const { doc, destroy } = await loadPdf(url).catch((e) => {
    console.error('[import] loadPdf 失败', e)
    throw e
  })
  console.timeEnd('[import] loadPdf')
  console.log('[import] doc loaded, numPages=', doc.numPages)
  try {
    console.time('[import] getAllPageSizes')
    const sizes = await getAllPageSizes(doc)
    console.timeEnd('[import] getAllPageSizes')
    const pages: NewPageDTO[] = sizes.map((s, i) => ({
      paper_id: paper.id,
      page_index: i,
      width_pt: s.width_pt,
      height_pt: s.height_pt
    }))
    console.time('[import] bulkAddPages')
    await window.api.bulkAddPages(pages)
    console.timeEnd('[import] bulkAddPages')
    console.time('[import] setPageCount')
    await window.api.setPageCount(paper.id, pages.length)
    console.timeEnd('[import] setPageCount')
    return pages.length
  } finally {
    await destroy()
  }
}
