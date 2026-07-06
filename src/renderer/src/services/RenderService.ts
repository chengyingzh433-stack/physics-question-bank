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

// ---- 整页渲染（显示用，低 DPI）----

export interface RenderResult {
  canvas: HTMLCanvasElement
  widthCss: number
  heightCss: number
}

/**
 * 渲染某页到 canvas。
 * - renderScale: pdfjs 渲染缩放（含 dpr，用于清晰度）。
 * - displayWidth/Height: CSS 显示尺寸（px）。
 * A3: 返回 renderTask 与 cancel；A4: canvas 缓冲 = cssW*dpr × cssH*dpr。
 * A6: viewport 传 rotation。
 */
export async function renderPage(
  doc: PdfDocument,
  pageIndex: number,
  opts: {
    widthCss: number
    heightCss: number
    dpr: number
    rotation: number
    /** 0..1 的页面比例宽高，渲染底层用 pdfjs viewport scale = widthCss*dpr / width_pt */
    widthPt: number
  }
): Promise<{ result: RenderResult; cancel: () => void; done: Promise<void> }> {
  const page = await doc.getPage(pageIndex + 1)
  // pdfjs scale: 让缓冲宽度 = widthCss * dpr
  const scale = (opts.widthCss * opts.dpr) / opts.widthPt
  const viewport = page.getViewport({ scale, rotation: opts.rotation })

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${opts.widthCss}px`
  canvas.style.height = `${opts.heightCss}px`
  const ctx = canvas.getContext('2d')!
  ctx.scale(opts.dpr, opts.dpr) // A4: 让绘图坐标用 CSS px

  const renderTask = page.render({ canvas, canvasContext: ctx, viewport })
  const done = renderTask.promise.then(() => {
    page.cleanup()
  })
  return {
    result: { canvas, widthCss: opts.widthCss, heightCss: opts.heightCss },
    cancel: () => renderTask.cancel(),
    done
  }
}

export { pdfjsLib }


