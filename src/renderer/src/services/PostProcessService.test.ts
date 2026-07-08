import { describe, it, expect } from 'vitest'
import { derivePreviewQuestions, derivePreviewItems } from './PostProcessService'
import type { SegmentDTO, QuestionDTO } from '@shared/types'

function seg(id: number, orderIndex: number, pageId: number, overrides?: Partial<SegmentDTO>): SegmentDTO {
  return {
    id,
    paper_id: 1,
    page_id: pageId,
    col_index: 0,
    x_start_ratio: 0,
    x_end_ratio: 1,
    y_start_ratio: 0,
    y_end_ratio: 1,
    order_index: orderIndex,
    is_deleted: 0,
    ...overrides
  }
}

function q(id: number, isMerged: number): QuestionDTO {
  return {
    id,
    paper_id: 1,
    order_in_paper: null,
    type_id: null,
    chapter_id: null,
    difficulty_id: null,
    is_merged: isMerged,
    image_path: null,
    width_px: null,
    height_px: null,
    created_at: null,
    updated_at: null
  }
}

describe('derivePreviewQuestions', () => {
  it('3 个独立片段 → 3 道题，题号 1/2/3', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10)]
    const result = derivePreviewQuestions(segments, {}, [])
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ key: 's1', previewNumber: 1, questionId: null, isMerged: false })
    expect(result[1]).toMatchObject({ key: 's2', previewNumber: 2, questionId: null, isMerged: false })
    expect(result[2]).toMatchObject({ key: 's3', previewNumber: 3, questionId: null, isMerged: false })
  })

  it('2 片段合并 + 1 独立 → 2 道题，合并组排在其首片段位置', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10)]
    const segToQuestion = { 1: 10, 2: 10 }
    const questions = [q(10, 1)]
    const result = derivePreviewQuestions(segments, segToQuestion, questions)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ key: 'q10', previewNumber: 1, questionId: 10, isMerged: true, segments: [segments[0], segments[1]] })
    expect(result[1]).toMatchObject({ key: 's3', previewNumber: 2, questionId: null, isMerged: false })
  })

  it('已删除片段不计入', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10, { is_deleted: 1 }), seg(3, 2, 10)]
    const result = derivePreviewQuestions(segments, {}, [])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ key: 's1', previewNumber: 1 })
    expect(result[1]).toMatchObject({ key: 's3', previewNumber: 2 })
  })

  it('合并组排在其首片段的位置（中间插入场景）', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10), seg(4, 3, 10)]
    const segToQuestion = { 2: 20, 4: 20 }
    const questions = [q(20, 1)]
    const result = derivePreviewQuestions(segments, segToQuestion, questions)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ key: 's1', previewNumber: 1 })
    expect(result[1]).toMatchObject({ key: 'q20', previewNumber: 2, isMerged: true })
    expect(result[1].segments).toHaveLength(2)
    expect(result[2]).toMatchObject({ key: 's3', previewNumber: 3 })
  })

  it('空片段列表返回空', () => {
    expect(derivePreviewQuestions([], {}, [])).toHaveLength(0)
  })

  it('单片段单题', () => {
    const segments = [seg(1, 0, 10)]
    const result = derivePreviewQuestions(segments, {}, [])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ key: 's1', previewNumber: 1, isMerged: false })
  })

  it('跨页排序：先 page_index 再 order_index（order_index 是页内序号，跨页不可直接比）', () => {
    // page_id 10 → page_index 0；page_id 20 → page_index 1
    // 两页各有 order_index 0,1,2，若直接按 order_index 排会交错乱序
    const segments = [
      seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10),
      seg(4, 0, 20), seg(5, 1, 20), seg(6, 2, 20)
    ]
    const pageIndexMap = new Map([[10, 0], [20, 1]])
    const result = derivePreviewQuestions(segments, {}, [], pageIndexMap)
    expect(result).toHaveLength(6)
    // 第1页三题在前，第2页三题在后
    expect(result.map((pq) => pq.key)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6'])
    expect(result.map((pq) => pq.previewNumber)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('跨页合并组：组跨两页时排在首片段所在页位置', () => {
    // seg 3（page 10 末尾）与 seg 4（page 20 开头）合并
    const segments = [
      seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10),
      seg(4, 0, 20), seg(5, 1, 20)
    ]
    const segToQuestion = { 3: 30, 4: 30 }
    const questions = [q(30, 1)]
    const pageIndexMap = new Map([[10, 0], [20, 1]])
    const result = derivePreviewQuestions(segments, segToQuestion, questions, pageIndexMap)
    expect(result).toHaveLength(4)
    // seg1, seg2, [seg3+seg4合并], seg5
    expect(result.map((pq) => pq.key)).toEqual(['s1', 's2', 'q30', 's5'])
    expect(result.map((pq) => pq.previewNumber)).toEqual([1, 2, 3, 4])
    expect(result[2].segments).toHaveLength(2)
  })
})

describe('derivePreviewItems', () => {
  it('无已删除片段 → kind:question 项与 derivePreviewQuestions 结果一致', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10)]
    const result = derivePreviewItems(segments, {}, [])
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.kind === 'question')).toBe(true)
    expect(result.map((r) => (r as any).previewNumber)).toEqual([1, 2, 3])
    expect(result.map((r) => (r as any).key)).toEqual(['s1', 's2', 's3'])
  })

  it('一个已删除片段 → 产出 kind:deleted 占位，穿插在正确位置', () => {
    // seg2 被删除，应在 seg1 和 seg3 之间
    const segments = [seg(1, 0, 10), seg(2, 1, 10, { is_deleted: 1 }), seg(3, 2, 10)]
    const result = derivePreviewItems(segments, {}, [])
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ kind: 'question', key: 's1', previewNumber: 1 })
    expect(result[1]).toMatchObject({ kind: 'deleted', key: 'd2' })
    expect(result[2]).toMatchObject({ kind: 'question', key: 's3', previewNumber: 2 })
  })

  it('已删除片段不占题号：删中间片段后，后续题目 previewNumber 连续递减', () => {
    // 5 个片段，删掉第 2 和第 4
    const segments = [
      seg(1, 0, 10),
      seg(2, 1, 10, { is_deleted: 1 }),
      seg(3, 2, 10),
      seg(4, 3, 10, { is_deleted: 1 }),
      seg(5, 4, 10)
    ]
    const result = derivePreviewItems(segments, {}, [])
    const questions = result.filter((r) => r.kind === 'question')
    expect(questions.map((q) => (q as any).previewNumber)).toEqual([1, 2, 3])
    const deleted = result.filter((r) => r.kind === 'deleted')
    expect(deleted).toHaveLength(2)
  })

  it('跨页：已删除片段按 (page_index, order_index) 穿插，不因 order_index 页内序而错位', () => {
    // page 10 (index 0): seg1(oi=0), seg2(oi=1, deleted)
    // page 20 (index 1): seg3(oi=0), seg4(oi=1)
    const segments = [
      seg(1, 0, 10),
      seg(2, 1, 10, { is_deleted: 1 }),
      seg(3, 0, 20),
      seg(4, 1, 20)
    ]
    const pageIndexMap = new Map([[10, 0], [20, 1]])
    const result = derivePreviewItems(segments, {}, [], pageIndexMap)
    expect(result).toHaveLength(4)
    // 顺序：s1, d2, s3, s4
    expect(result.map((r) => r.key)).toEqual(['s1', 'd2', 's3', 's4'])
    expect(result.filter((r) => r.kind === 'question').map((q) => (q as any).previewNumber)).toEqual([1, 2, 3])
  })

  it('合并组 + 已删除片段混排：合并组按最小键定位，已删除按自身键', () => {
    // seg1(oi=0), seg2(oi=1,deleted), seg3+seg4 合并(oi=2,3), seg5(oi=4)
    const segments = [
      seg(1, 0, 10),
      seg(2, 1, 10, { is_deleted: 1 }),
      seg(3, 2, 10),
      seg(4, 3, 10),
      seg(5, 4, 10)
    ]
    const segToQuestion = { 3: 30, 4: 30 }
    const questions = [q(30, 1)]
    const result = derivePreviewItems(segments, segToQuestion, questions)
    expect(result).toHaveLength(4)
    expect(result.map((r) => r.key)).toEqual(['s1', 'd2', 'q30', 's5'])
    expect(result.filter((r) => r.kind === 'question').map((q) => (q as any).previewNumber)).toEqual([1, 2, 3])
  })

  it('只取 kind:question 项时，与 derivePreviewQuestions 完全一致', () => {
    const segments = [
      seg(1, 0, 10),
      seg(2, 1, 10, { is_deleted: 1 }),
      seg(3, 2, 10),
      seg(4, 0, 20),
      seg(5, 1, 20, { is_deleted: 1 })
    ]
    const segToQuestion = { 3: 30, 4: 30 }
    const questions = [q(30, 1)]
    const pageIndexMap = new Map([[10, 0], [20, 1]])

    const items = derivePreviewItems(segments, segToQuestion, questions, pageIndexMap)
    const pqResult = derivePreviewQuestions(segments, segToQuestion, questions, pageIndexMap)

    const questionItems = items.filter((r) => r.kind === 'question')
    expect(questionItems.map((q) => (q as any).key)).toEqual(pqResult.map((pq) => pq.key))
    expect(questionItems.map((q) => (q as any).previewNumber)).toEqual(pqResult.map((pq) => pq.previewNumber))
  })
})
