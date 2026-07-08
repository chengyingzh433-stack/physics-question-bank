import type { SegmentDTO, QuestionDTO } from '@shared/types'

export interface PreviewQuestion {
  /** 稳定 key：已有 question 用 `q{id}`，未合并独立片段用 `s{segId}` */
  key: string
  /** 预览题号（从 1 递增，按视觉顺序） */
  previewNumber: number
  /** 组成这道题的片段（按 merge_order 或 order_index 排序） */
  segments: SegmentDTO[]
  /** 已有 question id（合并组有，独立片段为 null） */
  questionId: number | null
  /** 是否合并组 */
  isMerged: boolean
}

/**
 * 统一预览项：题目 或 已删除占位。
 * - kind:'question' — 正常题目，占题号
 * - kind:'deleted'  — 已删除片段占位，不占题号，原位半透明显示
 */
export type PreviewItem =
  | { kind: 'question'; key: string; previewNumber: number; segments: SegmentDTO[]; questionId: number | null; isMerged: boolean }
  | { kind: 'deleted'; key: string; segment: SegmentDTO }

/**
 * 从 segments + 合并关系推导"预览题目"列表。
 *
 * 排序：按 (page_index 升序, order_index 升序)。
 * 注意：order_index 是【页内】序号（deriveSegments 每页从 0 开始），
 * 跨页不可直接比——必须先按 page_index 排，同页内再按 order_index。
 * 合并组取组内最小 (page_index, order_index) 的位置。
 *
 * 这与 handleFinalize 的题号排序逻辑一致（都按页→页内序）。
 */
export function derivePreviewQuestions(
  segments: SegmentDTO[],
  segToQuestion: Record<number, number>,
  questions: QuestionDTO[],
  pageIndexMap?: Map<number, number>
): PreviewQuestion[] {
  // page_id → page_index 映射；未提供时退化为 0（单页场景或测试）
  const pageIndexOf = (pageId: number | undefined): number => {
    if (pageId == null) return 0
    return pageIndexMap?.get(pageId) ?? 0
  }

  const live = segments
    .filter((s) => !s.is_deleted && s.id !== undefined)
    .sort((a, b) => {
      const pa = pageIndexOf(a.page_id)
      const pb = pageIndexOf(b.page_id)
      if (pa !== pb) return pa - pb
      return (a.order_index ?? 0) - (b.order_index ?? 0)
    })

  const groups = new Map<string, SegmentDTO[]>()
  for (const s of live) {
    const qid = segToQuestion[s.id!]
    const key = qid !== undefined ? `q${qid}` : `s${s.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  const qById = new Map(questions.map((q) => [q.id, q]))
  let n = 1
  const result: PreviewQuestion[] = []
  for (const [key, segs] of groups) {
    const qid = key.startsWith('q') ? Number(key.slice(1)) : null
    result.push({
      key,
      previewNumber: n++,
      segments: segs,
      questionId: qid,
      isMerged: qid !== null && (qById.get(qid)?.is_merged ?? 0) === 1
    })
  }
  return result
}

/**
 * 从 segments + 合并关系推导"统一预览项"列表（含已删除占位）。
 *
 * 与 derivePreviewQuestions 的区别：
 * - 已删除片段不丢弃，而是作为 kind:'deleted' 占位穿插在原位
 * - 题号（previewNumber）只对 kind:'question' 递增，已删除占位不占号
 * - 排序键仍是 (page_index, order_index)，已删除片段用自身键
 *
 * 红线：derivePreviewQuestions 纯函数不动（8 个单测覆盖）。
 */
export function derivePreviewItems(
  segments: SegmentDTO[],
  segToQuestion: Record<number, number>,
  questions: QuestionDTO[],
  pageIndexMap?: Map<number, number>
): PreviewItem[] {
  const pageIndexOf = (pageId: number | undefined): number => {
    if (pageId == null) return 0
    return pageIndexMap?.get(pageId) ?? 0
  }

  // 分成已删除和未删除两组
  const deleted = segments.filter((s) => s.is_deleted && s.id !== undefined)
  const live = segments.filter((s) => !s.is_deleted && s.id !== undefined)

  // 未删除片段：按 derivePreviewQuestions 同样逻辑分组
  const sortedLive = [...live].sort((a, b) => {
    const pa = pageIndexOf(a.page_id)
    const pb = pageIndexOf(b.page_id)
    if (pa !== pb) return pa - pb
    return (a.order_index ?? 0) - (b.order_index ?? 0)
  })

  const groups = new Map<string, SegmentDTO[]>()
  for (const s of sortedLive) {
    const qid = segToQuestion[s.id!]
    const key = qid !== undefined ? `q${qid}` : `s${s.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  // 为每个 question 组计算排序键（取组内最小 page_index, order_index）
  const qById = new Map(questions.map((q) => [q.id, q]))
  const questionItems: Array<{
    sortKey: [number, number]
    item: PreviewItem
  }> = []
  let n = 1
  for (const [key, segs] of groups) {
    const qid = key.startsWith('q') ? Number(key.slice(1)) : null
    // 合并组取最小键，独立片段取自身键
    const minSortKey: [number, number] = segs.reduce(
      (acc, s) => {
        const pk = pageIndexOf(s.page_id)
        const oi = s.order_index ?? 0
        if (pk < acc[0] || (pk === acc[0] && oi < acc[1])) return [pk, oi] as [number, number]
        return acc
      },
      [Infinity, Infinity] as [number, number]
    )
    questionItems.push({
      sortKey: minSortKey,
      item: {
        kind: 'question',
        key,
        previewNumber: n++,
        segments: segs,
        questionId: qid,
        isMerged: qid !== null && (qById.get(qid)?.is_merged ?? 0) === 1
      }
    })
  }

  // 已删除片段：各自作为独立占位
  const deletedItems: Array<{
    sortKey: [number, number]
    item: PreviewItem
  }> = deleted.map((s) => ({
    sortKey: [pageIndexOf(s.page_id), s.order_index ?? 0] as [number, number],
    item: { kind: 'deleted', key: `d${s.id}`, segment: s }
  }))

  // 合并两组，按 sortKey 排序
  const all = [...questionItems, ...deletedItems].sort((a, b) => {
    if (a.sortKey[0] !== b.sortKey[0]) return a.sortKey[0] - b.sortKey[0]
    return a.sortKey[1] - b.sortKey[1]
  })

  // 重新编号：题号只对 kind:'question' 递增
  let num = 1
  return all.map((entry) => {
    if (entry.item.kind === 'question') {
      return { ...entry.item, previewNumber: num++ }
    }
    return entry.item
  })
}
