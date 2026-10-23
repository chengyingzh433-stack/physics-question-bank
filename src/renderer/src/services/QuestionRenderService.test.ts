import { describe, it, expect, vi } from 'vitest'
import type { PageDTO, SegmentDTO } from '@shared/types'
import { createPageGeometryMap, renderSegmentsAtDpi } from './QuestionRenderService'
import { renderPageRegionAtDpi, type PdfDocument } from './RenderService'

vi.mock('./RenderService', () => ({ renderPageRegionAtDpi: vi.fn(async () => ({ canvas: {}, widthPx: 100, heightPx: 50 })) }))
const doc = {} as PdfDocument
const segment: SegmentDTO = { id: 7, page_id: 1, col_index: 0, x_start_ratio: 0.2, x_end_ratio: 0.8, y_start_ratio: 0.1, y_end_ratio: 0.4 }
describe('高清出图保持裁切使用的旋转坐标系', () => {
  for (const rotation of [0, 90, 180, 270]) {
    it(`${rotation} 度传入 PDF 渲染器`, async () => {
      const page: PageDTO = { id: 1, paper_id: 1, page_index: 2, width_pt: 600, height_pt: 400, rotation, column_mode: 1 }
      await renderSegmentsAtDpi(doc, [segment], createPageGeometryMap([page]), 300, new Map([[7, 0]]))
      expect(renderPageRegionAtDpi).toHaveBeenLastCalledWith(doc, 2, { x0: 0.2, x1: 0.8, y0: 0.1, y1: 0.4 },
        { rotation, widthPt: 600, heightPt: 400, dpi: 300 })
    })
  }
  it('缺页时拒绝生成空题图', async () => {
    await expect(renderSegmentsAtDpi(doc, [segment], new Map(), 300, new Map())).rejects.toThrow('找不到')
  })
})
