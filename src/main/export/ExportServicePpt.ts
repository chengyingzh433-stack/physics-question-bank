import { app, dialog } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { existsSync } from 'fs'
import pptxgen from 'pptxgenjs'
import { getDb } from '../storage/StorageService'
import { imagesDir } from '../files/FileService'

/**
 * 导出当前组卷篮为 PowerPoint（M16）。
 * - 16:9 宽屏布局
 * - 每题一页：题号标题（可编辑）+ 题图（等比缩放居中）+ 出处角标
 * - answerMode 控制答案：'none'=不含，'inline'=每题后紧跟答案页，'append'=末尾集中参考答案
 * 返回保存的文件路径；用户取消返回 null。
 */
export async function exportBasketPptx(
  setId: number,
  title: string,
  answerMode: 'none' | 'append' | 'inline' = 'none'
): Promise<string | null> {
  const db = getDb()

  // 查询题目数据（题号、题图、答案图、出处年份、题型）
  const items = db
    .prepare(
      `SELECT
        q.id, q.image_path, q.answer_image_path,
        q.width_px, q.height_px, q.answer_width_px, q.answer_height_px,
        COALESCE(q.year_override, p.year) AS effective_year,
        COALESCE(q.source_override, p.source) AS effective_source,
        qt.name AS type_name,
        i.order_index, i.display_number, q.paper_id
      FROM paper_set_items i
      JOIN questions q ON i.question_id = q.id
      LEFT JOIN papers p ON q.paper_id = p.id
      LEFT JOIN question_types qt ON q.type_id = qt.id
      WHERE i.set_id = ?
      ORDER BY i.order_index ASC`
    )
    .all(setId) as Array<{
    id: number
    image_path: string | null
    answer_image_path: string | null
    width_px: number | null
    height_px: number | null
    answer_width_px: number | null
    answer_height_px: number | null
    effective_year: number | null
    effective_source: string | null
    type_name: string | null
    order_index: number | null
    display_number: string | null
    paper_id: number
  }>

  if (items.length === 0) throw new Error('组卷篮为空，无法导出 PPT。')

  // 创建 PPT 实例
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9' // 16:9 宽屏（10 x 5.625 英寸）
  pptx.author = 'Physics Question Bank'
  pptx.title = title

  // 逐题添加 slide
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const slide = pptx.addSlide()

    // 题号标题（可编辑文本框）
    const titleText = item.display_number || `${idx + 1}`
    slide.addText(titleText, {
      x: 0.5,
      y: 0.3,
      w: 8,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: '363636'
    })

    // 出处角标（右上角小字）
    const source = item.effective_source?.trim() || ''
    const year = item.effective_year ? String(item.effective_year) : ''
    if (source || year) {
      const caption = `${source} ${year}`.trim()
      slide.addText(caption, {
        x: 8.5,
        y: 0.3,
        w: 1.2,
        h: 0.4,
        fontSize: 10,
        color: '999999',
        align: 'right'
      })
    }

    // 题图（居中，等比缩放到最大 w=8, h=4.5）
    if (item.image_path && item.width_px && item.height_px) {
      const parts = item.image_path.split('/')
      const filename = parts[parts.length - 1]
      const absPath = join(imagesDir(item.paper_id), filename)

      if (existsSync(absPath)) {
        try {
          const imgData = readFileSync(absPath).toString('base64')
          const aspectRatio = item.width_px / item.height_px

          let imgW = 8
          let imgH = imgW / aspectRatio
          const maxH = 4.5
          if (imgH > maxH) {
            imgH = maxH
            imgW = imgH * aspectRatio
          }

          slide.addImage({
            data: `data:image/png;base64,${imgData}`,
            x: (10 - imgW) / 2, // 居中
            y: 1.2,
            w: imgW,
            h: imgH
          })
        } catch (e) {
          console.warn(`[exportBasketPptx] 题图读取失败: ${absPath}`, e)
        }
      }
    }

    // 答案逻辑（inline 模式：每题后紧跟答案页）
    if (answerMode === 'inline' && item.answer_image_path && item.answer_width_px && item.answer_height_px) {
      const parts = item.answer_image_path.split('/')
      const filename = parts[parts.length - 1]
      const absPath = join(imagesDir(item.paper_id), filename)

      if (existsSync(absPath)) {
        try {
          const ansSlide = pptx.addSlide()

          // 答案标题
          ansSlide.addText(`${titleText} 答案`, {
            x: 0.5,
            y: 0.3,
            w: 9,
            h: 0.5,
            fontSize: 20,
            bold: true,
            color: '0066CC'
          })

          // 答案图
          const ansData = readFileSync(absPath).toString('base64')
          const ansRatio = item.answer_width_px / item.answer_height_px

          let ansW = 8
          let ansH = ansW / ansRatio
          if (ansH > 5) {
            ansH = 5
            ansW = ansH * ansRatio
          }

          ansSlide.addImage({
            data: `data:image/png;base64,${ansData}`,
            x: (10 - ansW) / 2,
            y: 1,
            w: ansW,
            h: ansH
          })
        } catch (e) {
          console.warn(`[exportBasketPptx] 答案图读取失败: ${absPath}`, e)
        }
      }
    }
  }

  // 答案末尾集中模式
  if (answerMode === 'append') {
    let ansSlide = pptx.addSlide()
    ansSlide.addText('参考答案', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 28,
      bold: true,
      color: '0066CC'
    })

    let yOffset = 1.2

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]
      if (!item.answer_image_path || !item.answer_width_px || !item.answer_height_px) continue

      const parts = item.answer_image_path.split('/')
      const filename = parts[parts.length - 1]
      const absPath = join(imagesDir(item.paper_id), filename)

      if (!existsSync(absPath)) continue

      try {
        const titleText = item.display_number || `${idx + 1}`

        // 题号
        ansSlide.addText(`${titleText}.`, {
          x: 0.5,
          y: yOffset,
          w: 1,
          h: 0.4,
          fontSize: 14,
          bold: true
        })

        // 答案图（缩小版）
        const ansData = readFileSync(absPath).toString('base64')
        const ansRatio = item.answer_width_px / item.answer_height_px

        let ansW = 3
        let ansH = ansW / ansRatio
        if (ansH > 1.5) {
          ansH = 1.5
          ansW = ansH * ansRatio
        }

        ansSlide.addImage({
          data: `data:image/png;base64,${ansData}`,
          x: 1.5,
          y: yOffset,
          w: ansW,
          h: ansH
        })

        yOffset += ansH + 0.3

        // 换新页
        if (yOffset > 4.8) {
          ansSlide = pptx.addSlide()
          ansSlide.addText('参考答案（续）', {
            x: 0.5,
            y: 0.3,
            w: 9,
            h: 0.6,
            fontSize: 24,
            bold: true,
            color: '0066CC'
          })
          yOffset = 1.2
        }
      } catch (e) {
        console.warn(`[exportBasketPptx] 答案图读取失败: ${absPath}`, e)
      }
    }
  }

  // 保存对话框
  const safeTitle = (title || '试卷').replace(/[\\/:*?"<>|]/g, '_')
  const result = await dialog.showSaveDialog({
    title: '导出 PowerPoint',
    defaultPath: join(app.getPath('documents'), `${safeTitle}.pptx`),
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
  })

  if (result.canceled || !result.filePath) return null

  await pptx.writeFile({ fileName: result.filePath })
  return result.filePath
}
