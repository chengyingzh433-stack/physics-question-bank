import type { DB } from '../StorageService'
import type { SegmentDTO } from '../../../shared/types'
import type { QuestionFilterCriteria } from '../questionFilter'

/** 题目（含合并信息）的查询结果。 */
export interface QuestionRow {
  id: number
  paper_id: number
  order_in_paper: number | null
  type_id: number | null
  chapter_id: number | null
  difficulty_id: number | null
  is_merged: number
  image_path: string | null
  width_px: number | null
  height_px: number | null
  year_override: number | null
  source_override: string | null
  effective_year: number | null
  effective_source: string | null
  answer_image_path: string | null
  answer_width_px: number | null
  answer_height_px: number | null
  created_at: string | null
  updated_at: string | null
}

/**
 * 题目查询的统一选择列（M13）。
 * 年份/出处的"继承+覆盖"口径只在这里实现一次：COALESCE(单题覆盖, 试卷默认)。
 * 前端拿到 effective_* 直接显示，不再自行计算继承。
 * 调用方必须 JOIN papers p ON p.id = q.paper_id。
 */
const QUESTION_COLUMNS = `q.id, q.paper_id, q.order_in_paper, q.type_id, q.chapter_id,
  q.difficulty_id, q.is_merged, q.image_path, q.width_px, q.height_px,
  q.year_override, q.source_override,
  COALESCE(q.year_override, p.year) AS effective_year,
  COALESCE(q.source_override, p.source) AS effective_source,
  q.answer_image_path, q.answer_width_px, q.answer_height_px,
  q.created_at, q.updated_at`

/** 取某试卷所有题目（按 order_in_paper）。 */
export function listQuestionsByPaper(db: DB, paperId: number): QuestionRow[] {
  return db
    .prepare(
      `SELECT ${QUESTION_COLUMNS} FROM questions q
       JOIN papers p ON p.id = q.paper_id
       WHERE q.paper_id = ? ORDER BY q.order_in_paper ASC`
    )
    .all(paperId) as QuestionRow[]
}

/** 题库浏览：按筛选条件查所有已入库题（image_path 非空），带来源试卷名。 */
export function listBankQuestions(
  db: DB,
  criteria: QuestionFilterCriteria
): (QuestionRow & { paper_name: string })[] {
  const { where, params } = buildQuestionFilterWithJoin(criteria)
  const sql = `SELECT DISTINCT ${QUESTION_COLUMNS}, p.name AS paper_name FROM questions q JOIN papers p ON p.id = q.paper_id ${where} ORDER BY q.paper_id ASC, q.order_in_paper ASC`
  return db.prepare(sql).all(...params) as (QuestionRow & { paper_name: string })[]
}

/** 题库筛选可选的年份/出处清单（distinct，按 effective 口径）。 */
export function listYearSources(db: DB): { years: number[]; sources: string[] } {
  const years = db
    .prepare(
      `SELECT DISTINCT COALESCE(q.year_override, p.year) AS y FROM questions q
       JOIN papers p ON p.id = q.paper_id
       WHERE q.image_path IS NOT NULL AND p.kind = 'paper'
         AND COALESCE(q.year_override, p.year) IS NOT NULL
       ORDER BY y DESC`
    )
    .all() as { y: number }[]
  const sources = db
    .prepare(
      `SELECT DISTINCT COALESCE(q.source_override, p.source) AS s FROM questions q
       JOIN papers p ON p.id = q.paper_id
       WHERE q.image_path IS NOT NULL AND p.kind = 'paper'
         AND COALESCE(q.source_override, p.source) IS NOT NULL
         AND COALESCE(q.source_override, p.source) <> ''
       ORDER BY s ASC`
    )
    .all() as { s: string }[]
  return { years: years.map((r) => r.y), sources: sources.map((r) => r.s) }
}

// buildQuestionFilterWithJoin 把 kp 命中放进 EXISTS 子查询，避免 JOIN 放大行数。
function buildQuestionFilterWithJoin(c: QuestionFilterCriteria): {
  where: string
  params: (string | number)[]
} {
  // p.kind = 'paper' 确保答案卷的 question 行不进题库（M14.5 B2）。
  // 答案卷的 question 行本来就没有 image_path，但那是巧合防护，不能依赖。
  const conditions: string[] = ['q.image_path IS NOT NULL', "p.kind = 'paper'"]
  const params: (string | number)[] = []
  if (c.type_id != null) {
    conditions.push('q.type_id = ?')
    params.push(c.type_id)
  }
  if (c.paper_id != null) {
    conditions.push('q.paper_id = ?')
    params.push(c.paper_id)
  }
  if (c.chapter_id != null) {
    conditions.push('q.chapter_id = ?')
    params.push(c.chapter_id)
  }
  if (c.difficulty_id != null) {
    conditions.push('q.difficulty_id = ?')
    params.push(c.difficulty_id)
  }
  // 年份/出处走 effective 口径（M13）：单题覆盖优先于试卷默认
  if (c.year != null) {
    conditions.push('COALESCE(q.year_override, p.year) = ?')
    params.push(c.year)
  }
  if (c.source != null && c.source !== '') {
    conditions.push('COALESCE(q.source_override, p.source) = ?')
    params.push(c.source)
  }
  if (c.kp_ids && c.kp_ids.length > 0) {
    const placeholders = c.kp_ids.map(() => '?').join(',')
    conditions.push(
      `EXISTS (SELECT 1 FROM question_knowledge_points qkp WHERE qkp.question_id = q.id AND qkp.kp_id IN (${placeholders}))`
    )
    c.kp_ids.forEach((k) => params.push(k))
  }
  return { where: 'WHERE ' + conditions.join(' AND '), params }
}

/** 取某题的所有 segment（按 merge_order）。 */
export function getQuestionSegments(db: DB, questionId: number): SegmentDTO[] {
  return db
    .prepare(
      `SELECT s.* FROM segments s
       JOIN question_segments qs ON qs.segment_id = s.id
       WHERE qs.question_id = ?
       ORDER BY qs.merge_order ASC`
    )
    .all(questionId) as SegmentDTO[]
}

/** 取某题的 segment→merge_order 映射。 */
export function getQuestionSegmentMap(
  db: DB,
  questionId: number
): { segment_id: number; merge_order: number }[] {
  return db
    .prepare(
      `SELECT segment_id, merge_order FROM question_segments WHERE question_id = ? ORDER BY merge_order ASC`
    )
    .all(questionId) as { segment_id: number; merge_order: number }[]
}

/**
 * 创建一道题（占位或正式），绑定若干 segment（按 merge_order）。
 * A10: 事务。is_merged 由 segments.length>1 决定。
 * 返回新 question id。
 */
export function createQuestionWithSegments(
  db: DB,
  paperId: number,
  segmentIds: number[],
  orderInPaper: number | null = null
): number {
  const ts = new Date().toISOString()
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO questions (paper_id, order_in_paper, is_merged, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(paperId, orderInPaper, segmentIds.length > 1 ? 1 : 0, ts, ts)
    const qid = Number(r.lastInsertRowid)
    const insertMap = db.prepare(
      `INSERT INTO question_segments (question_id, segment_id, merge_order) VALUES (?, ?, ?)`
    )
    segmentIds.forEach((sid, i) => insertMap.run(qid, sid, i))
    return qid
  })
  return tx()
}

/** 取消合并 / 删除占位题：删 question 行（级联删 question_segments）。 */
export function deleteQuestion(db: DB, questionId: number): void {
  db.prepare(`DELETE FROM questions WHERE id = ?`).run(questionId)
}

/** 按 order_in_paper 连续重排某试卷的所有题（1,2,3…）。 */
export function renumberQuestions(db: DB, paperId: number): void {
  const rows = db
    .prepare(`SELECT id FROM questions WHERE paper_id = ? ORDER BY order_in_paper ASC, id ASC`)
    .all(paperId) as { id: number }[]
  const tx = db.transaction(() => {
    const upd = db.prepare(`UPDATE questions SET order_in_paper = ? WHERE id = ?`)
    rows.forEach((r, i) => upd.run(i + 1, r.id))
  })
  tx()
}

/** 入库时写图信息。 */
export function setQuestionImage(
  db: DB,
  questionId: number,
  imagePath: string,
  widthPx: number,
  heightPx: number
): void {
  db.prepare(
    `UPDATE questions SET image_path = ?, width_px = ?, height_px = ?, updated_at = ? WHERE id = ?`
  ).run(imagePath, widthPx, heightPx, new Date().toISOString(), questionId)
}

/** 标记试卷状态。 */
export function setPaperStatus(
  db: DB,
  paperId: number,
  status: 'importing' | 'cropping' | 'processing' | 'done'
): void {
  db.prepare(`UPDATE papers SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    new Date().toISOString(),
    paperId
  )
}

/** 设置某题的 order_in_paper。 */
export function setQuestionOrder(db: DB, questionId: number, orderInPaper: number): void {
  db.prepare(`UPDATE questions SET order_in_paper = ?, updated_at = ? WHERE id = ?`).run(
    orderInPaper,
    new Date().toISOString(),
    questionId
  )
}

/**
 * 绑定答案图到题目（M14）。imagePath 为 null 时解绑。
 */
export function setQuestionAnswer(
  db: DB,
  questionId: number,
  imagePath: string | null,
  widthPx: number | null,
  heightPx: number | null
): void {
  db.prepare(
    `UPDATE questions SET answer_image_path = ?, answer_width_px = ?, answer_height_px = ?, updated_at = ? WHERE id = ?`
  ).run(imagePath, widthPx, heightPx, new Date().toISOString(), questionId)
}

/**
 * 批量清空某题目卷下所有题的答案图绑定（M14）。
 * 用于「重新导入答案」/「清除全部绑定」，避免 DB 里留孤儿引用。
 * 只筛 answer_image_path IS NOT NULL，返回值才等于真正被清掉的题数（供 UI 提示）。
 * 磁盘上的 a_*.png 不在这里删——由调用方（IPC handler）清理。
 */
export function clearAnswersByPaper(db: DB, paperId: number): number {
  const info = db
    .prepare(
      `UPDATE questions SET answer_image_path = NULL, answer_width_px = NULL, answer_height_px = NULL,
         updated_at = ? WHERE paper_id = ? AND answer_image_path IS NOT NULL`
    )
    .run(new Date().toISOString(), paperId)
  return info.changes
}

/**
 * 设置单题的年份/出处覆盖（M13）。
 * null 表示清除覆盖、回退继承试卷默认值。
 */
export function updateQuestionSourceOverride(
  db: DB,
  questionId: number,
  fields: { year_override?: number | null; source_override?: string | null }
): void {
  const sets: string[] = []
  const params: (string | number | null)[] = []
  if ('year_override' in fields) {
    sets.push('year_override = ?')
    params.push(fields.year_override ?? null)
  }
  if ('source_override' in fields) {
    sets.push('source_override = ?')
    // 空串按"清除覆盖"处理，保持 NULL = 继承的语义
    const v = fields.source_override
    params.push(v == null || v.trim() === '' ? null : v.trim())
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(new Date().toISOString(), questionId)
  db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

/**
 * M17: 批量获取多个题目的知识点（避免 N+1 查询）。
 * 返回 Map<questionId, KnowledgePointDTO[]>。
 */
export function batchGetQuestionKnowledgePoints(
  db: DB,
  questionIds: number[]
): Map<number, { id: number; name: string; created_at: string; updated_at: string }[]> {
  if (questionIds.length === 0) return new Map()
  const placeholders = questionIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT qkp.question_id, kp.id, kp.name, kp.created_at, kp.updated_at
       FROM question_knowledge_points qkp
       JOIN knowledge_points kp ON qkp.kp_id = kp.id
       WHERE qkp.question_id IN (${placeholders})
       ORDER BY qkp.question_id, kp.name`
    )
    .all(...questionIds) as Array<{
    question_id: number
    id: number
    name: string
    created_at: string
    updated_at: string
  }>

  const map = new Map<number, { id: number; name: string; created_at: string; updated_at: string }[]>()
  for (const row of rows) {
    const qid = row.question_id
    if (!map.has(qid)) map.set(qid, [])
    const { question_id, ...kp } = row
    map.get(qid)!.push(kp)
  }
  return map
}
