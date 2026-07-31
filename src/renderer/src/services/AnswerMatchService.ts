import type { SegmentDTO } from '@shared/types'

/**
 * 答案卷里的一个"答案单元"（M14.5 起支持合并组）。
 *
 * 一个答案单元 = 一个或多个 segment 纵向拼在一起。合并关系存在
 * question_segments 表（答案卷的 question 行只承载合并组，不入题库）。
 * 没有 question 行的散片段退化为单 segment 单元（老数据兼容）。
 */
export interface AnswerItem {
  /** 稳定 key：合并组用 `q{questionId}`，散片段用 `a{segmentId}` */
  key: string
  /** 答案序号（从 1 递增，按视觉顺序） */
  answerNumber: number
  /** 对应答案卷的 question 行；散片段为 null */
  questionId: number | null
  /** 按 merge_order 排列的 segment id，单片段时 length=1 */
  segmentIds: number[]
  /** 与 segmentIds 同序的 segment 明细，用于渲染缩略图 */
  segments: SegmentDTO[]
}

/** 一道题与它绑定的答案片段（一题可对多段，也可以没有）。 */
export interface AnswerPairing {
  questionId: number
  /** 绑定的 segment id 列表，按绑定顺序（纵向拼合时的上下顺序）。空 = 该题无答案。 */
  segmentIds: number[]
}

/**
 * 从答案卷的 segments + 合并组映射推导有序答案单元列表。
 *
 * 排序：按【首个 segment】的 (page_index 升序, order_index 升序)——与题目侧
 * derivePreviewQuestions / handleFinalize 的排序键严格一致。
 * order_index 是【页内】序号，跨页不可直接比，必须先按 page_index。
 * 不按 questionId 排（自增 id 的创建顺序 ≠ 视觉顺序）。
 *
 * 已删除片段（is_deleted）直接排除，不占序号；一个合并组里的片段全被删则整组消失。
 *
 * @param segments 答案卷的全部 segment
 * @param segmentMap questionId → segmentIds[]（按 merge_order）。老答案卷传空 Map 即可。
 */
export function deriveAnswerItems(
  segments: SegmentDTO[],
  segmentMap: Map<number, number[]> = new Map(),
  pageIndexMap?: Map<number, number>
): AnswerItem[] {
  const pageIndexOf = (pageId: number | undefined): number => {
    if (pageId == null) return 0
    return pageIndexMap?.get(pageId) ?? 0
  }

  // 活片段索引（已删除 / 无 id 的直接不参与）
  const live = new Map<number, SegmentDTO>()
  for (const s of segments) {
    if (s.id !== undefined && !s.is_deleted) live.set(s.id, s)
  }

  const grouped = new Set<number>()
  const units: { questionId: number | null; segments: SegmentDTO[] }[] = []

  // 先收合并组：按 merge_order 顺序取活片段
  for (const [qid, segIds] of segmentMap) {
    const segs = segIds.map((id) => live.get(id)).filter((s): s is SegmentDTO => s !== undefined)
    if (segs.length === 0) continue // 整组被删
    segs.forEach((s) => grouped.add(s.id!))
    units.push({ questionId: qid, segments: segs })
  }

  // 再收散片段（不属于任何 question 行的，老数据或未合并的）
  for (const s of live.values()) {
    if (!grouped.has(s.id!)) units.push({ questionId: null, segments: [s] })
  }

  return units
    .sort((a, b) => {
      const sa = a.segments[0]
      const sb = b.segments[0]
      const pa = pageIndexOf(sa.page_id)
      const pb = pageIndexOf(sb.page_id)
      if (pa !== pb) return pa - pb
      return (sa.order_index ?? 0) - (sb.order_index ?? 0)
    })
    .map((u, i) => ({
      key: u.questionId != null ? `q${u.questionId}` : `a${u.segments[0].id}`,
      answerNumber: i + 1,
      questionId: u.questionId,
      segmentIds: u.segments.map((s) => s.id!),
      segments: u.segments
    }))
}

/**
 * 按序号做默认配对：第 1 题 ↔ 第 1 个答案单元，依此类推。
 *
 * 这覆盖绝大多数场景（答案卷题号与试卷一一对应）。数量不等时：
 * - 题多于答案 → 多出来的题 segmentIds 为空（无答案）
 * - 答案多于题 → 多出来的答案单元不进配对（用户可手动改）
 *
 * 返回的配对顺序与传入的 questions 顺序一致。
 */
export function autoPairAnswers(
  questionIds: number[],
  answerItems: AnswerItem[]
): AnswerPairing[] {
  return questionIds.map((qid, i) => ({
    questionId: qid,
    segmentIds: answerItems[i]?.segmentIds ?? []
  }))
}
