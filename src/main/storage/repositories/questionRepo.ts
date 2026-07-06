import type { DB } from '../StorageService'
import type { SegmentDTO } from '../../../shared/types'

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
  created_at: string | null
  updated_at: string | null
}

/** 取某试卷所有题目（按 order_in_paper）。 */
export function listQuestionsByPaper(db: DB, paperId: number): QuestionRow[] {
  return db
    .prepare(`SELECT * FROM questions WHERE paper_id = ? ORDER BY order_in_paper ASC`)
    .all(paperId) as QuestionRow[]
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
