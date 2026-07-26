import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
// A1: 显式指定 worker，版本与主库一致（同一个包内）。v4 兼容 Electron 31 的 Chromium。
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = PDFDocumentProxy

export interface PageSize {
  width_pt: number
  height_pt: number
  rotation: number
}

/** 加载 PDF 文档（接受 app:// 或 http URL）。返回 doc 与释放句柄。 */
export async function loadPdf(
  url: string
): Promise<{ doc: PdfDocument; destroy: () => Promise<void> }> {
  const loadingTask = pdfjsLib.getDocument({ url })
  const doc = await loadingTask.promise
  return { doc, destroy: () => doc.destroy() }
}

/** 读取某页尺寸（pt，已含旋转）。A6: 用 getViewport({scale:1, rotation: page.rotate})。 */
export async function getPageSize(
  doc: PdfDocument,
  pageIndex: number
): Promise<PageSize> {
  const page = await doc.getPage(pageIndex + 1) // pdfjs 页码从 1 开始
  // A6: 传 rotation，用 viewport 的 width/height（已含旋转）
  const vp = page.getViewport({ scale: 1, rotation: page.rotate })
  const size = { width_pt: vp.width, height_pt: vp.height, rotation: page.rotate }
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
    widthPt: number
  }
): Promise<{ result: RenderResult; cancel: () => void; done: Promise<void> }> {
  const page = await doc.getPage(pageIndex + 1)
  const scale = (opts.widthCss * opts.dpr) / opts.widthPt
  const viewport = page.getViewport({ scale, rotation: opts.rotation })

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${opts.widthCss}px`
  canvas.style.height = `${opts.heightCss}px`
  // 注意：scale 里已经乘过 dpr（viewport 直接把 pt 映射到 widthCss*dpr 物理像素），
  // 这里绝不能再 ctx.scale(dpr, dpr)——否则内容被放大 dpr² 倍，画布只装得下左上角
  // 的 1/dpr，表现为「页面只显示左边一部分且缩放无效」。dpr=1 的机器看不出来。
  const ctx = canvas.getContext('2d')!

  const renderTask = page.render({ canvasContext: ctx, viewport })
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

// ---- 渲染页面某个比例区域到缩略图（低 DPI，后期处理用）----

export interface RenderRegionResult {
  canvas: HTMLCanvasElement
  widthPx: number
  heightPx: number
}

/**
 * 渲染某页的某个比例区域 [x0,x1]×[y0,y1] 到 canvas（低 DPI，仅用于缩略图预览）。
 * A6: rotation。
 */
export async function renderPageRegion(
  doc: PdfDocument,
  pageIndex: number,
  region: { x0: number; x1: number; y0: number; y1: number },
  opts: { rotation: number; widthPt: number; heightPt: number; maxPx?: number }
): Promise<{ result: RenderRegionResult; cancel: () => void; done: Promise<void> }> {
  const page = await doc.getPage(pageIndex + 1)
  const maxPx = opts.maxPx ?? 1000
  const fullScale = Math.min(1, maxPx / opts.widthPt, maxPx / opts.heightPt)
  const viewport = page.getViewport({ scale: fullScale, rotation: opts.rotation })

  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = Math.floor(viewport.width)
  fullCanvas.height = Math.floor(viewport.height)
  const ctx = fullCanvas.getContext('2d')!

  const renderTask = page.render({ canvasContext: ctx, viewport })
  const cancel = () => renderTask.cancel()

  // 必须等渲染完成后再裁剪，否则 drawImage 时 fullCanvas 还是空白
  const done = renderTask.promise.then(() => {
    page.cleanup()
  })

  const result = renderTask.promise.then(() => {
    const fw = fullCanvas.width
    const fh = fullCanvas.height
    const sx = Math.floor(region.x0 * fw)
    const sy = Math.floor(region.y0 * fh)
    const sw = Math.max(1, Math.floor(region.x1 * fw) - sx)
    const sh = Math.max(1, Math.floor(region.y1 * fh) - sy)

    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const octx = out.getContext('2d')!
    octx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
    // 释放整页 canvas（A11）
    fullCanvas.width = 0
    fullCanvas.height = 0
    return { canvas: out, widthPx: sw, heightPx: sh }
  })

  const rendered = await result
  return {
    result: rendered,
    cancel,
    done
  }
}

// ---- 高 DPI 渲染页面比例区域（入库/出图用，300 DPI）----

/**
 * 按 dpi 渲染某页的某比例区域到离屏 canvas，返回裁剪后的小 canvas。
 * A6 rotation。释放：调用方用完把 canvas 置空（A11）。
 */
export async function renderPageRegionAtDpi(
  doc: PdfDocument,
  pageIndex: number,
  region: { x0: number; x1: number; y0: number; y1: number },
  opts: { rotation: number; widthPt: number; heightPt: number; dpi: number }
): Promise<{ canvas: HTMLCanvasElement; widthPx: number; heightPx: number }> {
  const page = await doc.getPage(pageIndex + 1)
  const scale = opts.dpi / 72 // R8
  const viewport = page.getViewport({ scale, rotation: opts.rotation })

  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = Math.floor(viewport.width)
  fullCanvas.height = Math.floor(viewport.height)
  const ctx = fullCanvas.getContext('2d')!
  const renderTask = page.render({ canvasContext: ctx, viewport })
  try {
    await renderTask.promise
  } finally {
    page.cleanup()
  }

  const fw = fullCanvas.width
  const fh = fullCanvas.height
  const sx = Math.floor(region.x0 * fw)
  const sy = Math.floor(region.y0 * fh)
  const sw = Math.max(1, Math.floor(region.x1 * fw) - sx)
  const sh = Math.max(1, Math.floor(region.y1 * fh) - sy)

  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const octx = out.getContext('2d')!
  octx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
  fullCanvas.width = 0
  fullCanvas.height = 0
  return { canvas: out, widthPx: sw, heightPx: sh }
}
