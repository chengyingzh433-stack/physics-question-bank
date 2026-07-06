import { app, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { PDFDocument, PDFImage, rgb, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getDb } from '../storage/StorageService'
import * as setRepo from '../storage/repositories/setRepo'
import { imagesDir } from '../files/FileService'
import { A4_WIDTH_PT, A4_HEIGHT_PT, EXPORT_MARGIN_PT, EXPORT_DPI } from '../../shared/constants'

/** 找中文字体 TTF：dev 下 assets，打包后 extraResources，最后 userData 自定义。 */
async function findCjkFont(): Promise<Buffer> {
  const candidates = [
    join(app.getAppPath(), 'src/renderer/src/assets/fonts/NotoSansSC-Regular.ttf'),
    // 打包后 extraResources 把字体放到 resources/fonts/
    join(process.resourcesPath ?? '', 'fonts/NotoSansSC-Regular.ttf'),
    join(app.getPath('userData'), 'fonts/NotoSansSC-Regular.ttf')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFile(p)
  }
  throw new Error(
    '未找到中文字体 NotoSansSC-Regular.ttf。请下载并放到 src/renderer/src/assets/fonts/ 下。'
  )
}

/**
 * 导出当前组卷篮为 PDF（M10）。
 * - A4 竖向，边距 15mm（R4）。
 * - 顶部试卷标题（内嵌中文字体）。
 * - 每题：连续编号 1..N（R7，不因分组重置）+ 可选 group_header + 题图（按内容宽度等比缩放；高于一页内容区则等比缩小到一页内，R4）。
 * - 自动分页。
 * 返回保存的文件路径；用户取消返回 null。
 */
export async function exportBasketPdf(
  setId: number,
  title: string
): Promise<string | null> {
  const db = getDb()
  const items = setRepo.listSetItems(db, setId)
  if (items.length === 0) throw new Error('组卷篮为空，无法导出。')

  // 读各题 PNG 字节
  type Item = {
    questionId: number
    order: number
    groupHeader: string | null
    pngBytes: Buffer | null
    widthPx: number
    heightPx: number
  }
  const richItems: Item[] = []
  for (const it of items) {
    const question = db
      .prepare(`SELECT image_path, width_px, height_px, paper_id FROM questions WHERE id = ?`)
      .get(it.question_id) as
      | { image_path: string | null; width_px: number | null; height_px: number | null; paper_id: number }
      | undefined
    let pngBytes: Buffer | null = null
    if (question?.image_path) {
      const parts = question.image_path.split('/')
      const filename = parts[parts.length - 1]
      const abs = join(imagesDir(question.paper_id), filename)
      if (existsSync(abs)) pngBytes = await readFile(abs)
    }
    richItems.push({
      questionId: it.question_id,
      order: it.order_index ?? richItems.length,
      groupHeader: it.group_header,
      pngBytes,
      widthPx: question?.width_px ?? 0,
      heightPx: question?.height_px ?? 0
    })
  }

  // 构建 PDF
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const cjkFontBytes = await findCjkFont()
  const cjkFont = await doc.embedFont(cjkFontBytes, { subset: true })
  const helv = await doc.embedFont(StandardFonts.Helvetica)

  const margin = EXPORT_MARGIN_PT
  const contentW = A4_WIDTH_PT - margin * 2
  const contentH = A4_HEIGHT_PT - margin * 2

  let page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
  let y = A4_HEIGHT_PT - margin // A2: pdf-lib y 向上，从顶部开始

  // 标题
  const titleSize = 18
  const titleW = cjkFont.widthOfTextAtSize(title || '物理试卷', titleSize)
  page.drawText(title || '物理试卷', {
    x: (A4_WIDTH_PT - titleW) / 2,
    y: y - titleSize,
    size: titleSize,
    font: cjkFont,
    color: rgb(0, 0, 0)
  })
  y -= titleSize + 16

  const labelSize = 11
  const groupSize = 13

  // 逐题
  for (let idx = 0; idx < richItems.length; idx++) {
    const it = richItems[idx]
    const num = idx + 1 // R7: 全卷连续编号

    // group_header（若有）
    if (it.groupHeader) {
      const ghW = cjkFont.widthOfTextAtSize(it.groupHeader, groupSize)
      if (y - groupSize - 8 < margin) {
        page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
        y = A4_HEIGHT_PT - margin
      }
      page.drawText(it.groupHeader, {
        x: margin,
        y: y - groupSize,
        size: groupSize,
        font: cjkFont,
        color: rgb(0.2, 0.2, 0.6)
      })
      y -= groupSize + 8
      void ghW
    }

    // 编号 "1."
    const numText = `${num}.`
    const numW = helv.widthOfTextAtSize(numText, labelSize)
    if (y - labelSize < margin) {
      page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
      y = A4_HEIGHT_PT - margin
    }
    page.drawText(numText, {
      x: margin,
      y: y - labelSize,
      size: labelSize,
      font: helv,
      color: rgb(0, 0, 0)
    })
    y -= labelSize + 4
    void numW

    // 题图
    if (it.pngBytes) {
      let img: PDFImage
      try {
        img = await doc.embedPng(it.pngBytes)
      } catch {
        continue
      }
      let drawW = contentW
      let drawH = (img.height / img.width) * drawW
      const maxH = contentH - 20
      if (drawH > maxH) {
        const s = maxH / drawH
        drawH *= s
        drawW *= s
      }
      if (y - drawH < margin) {
        page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
        y = A4_HEIGHT_PT - margin
      }
      page.drawImage(img, {
        x: margin,
        y: y - drawH,
        width: drawW,
        height: drawH
      })
      y -= drawH + 12
    }
  }

  const bytes = await doc.save()

  // 保存对话框
  const safeTitle = (title || '试卷').replace(/[\\/:*?"<>|]/g, '_') // A14
  const result = await dialog.showSaveDialog({
    title: '导出试卷 PDF',
    defaultPath: join(app.getPath('documents'), `${safeTitle}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, bytes)
  return result.filePath
}

void EXPORT_DPI // R7 集中定义（导出图已按 300DPI 生成，此处仅引用常量）
