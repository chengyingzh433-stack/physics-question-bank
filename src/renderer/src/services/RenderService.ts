import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
// A1: 显式指定 worker，版本与主库一致（同一个包内）
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = PDFDocumentProxy

export interface PageSize {
  width_pt: number
  height_pt: number
}

/** 加载 PDF 文档（接受 app:// 或 http URL）。返回 doc 与释放句柄。 */
export async function loadPdf(
  url: string
): Promise<{ doc: PdfDocument; destroy: () => Promise<void> }> {
  const loadingTask = pdfjsLib.getDocument({ url })
  const doc = await loadingTask.promise
  return { doc, destroy: () => loadingTask.destroy() }
}

/** 读取某页尺寸（pt，已含旋转）。A6: 用 getViewport({scale:1, rotation: page.rotate})。 */
export async function getPageSize(
  doc: PdfDocument,
  pageIndex: number
): Promise<PageSize> {
  const page = await doc.getPage(pageIndex + 1) // pdfjs 页码从 1 开始
  // A6: 传 rotation，用 viewport 的 width/height（已含旋转）
  const vp = page.getViewport({ scale: 1, rotation: page.rotate })
  const size = { width_pt: vp.width, height_pt: vp.height }
  page.cleanup()
  return size
}

/** 遍历所有页取尺寸。 */
export async function getAllPageSizes(doc: PdfDocument): Promise<PageSize[]> {
  const out: PageSize[] = []
  for (let i = 0; i < doc.numPages; i++) {
    out.push(await getPageSize(doc, i))
  }
  return out
}

export { pdfjsLib }


