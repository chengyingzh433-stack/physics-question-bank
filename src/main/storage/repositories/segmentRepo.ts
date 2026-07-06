import type { DB } from '../StorageService'
import type { SegmentDTO } from '../../../shared/types'

/** 取某页所有派生片段（按 order_index）。 */
export function getSegmentsByPage(db: DB, pageId: number): SegmentDTO[] {
  return db
    .prepare(`SELECT * FROM segments WHERE page_id = ? ORDER BY order_index ASC`)
    .all(pageId) as SegmentDTO[]
}

/** 取某试卷所有片段（按 order_index）。 */
export function getSegmentsByPaper(db: DB, paperId: number): SegmentDTO[] {
  return db
    .prepare(`SELECT * FROM segments WHERE paper_id = ? ORDER BY order_index ASC`)
    .all(paperId) as SegmentDTO[]
}

/**
 * 重算并替换某页的派生片段（R2 整页重建策略）。
 * 先删除该页所有派生段，再插入新段。A10: 事务包裹。
 *
 * 注意（R2/A12）：若该页已有片段被合并进 questions（question_segments 有引用），
 * 第一阶段策略是整页重建——调用方应在"重新裁切"流程里先作废相关 questions（M3+ 处理）。
 * 此处仅负责 segments 表本身。
 */
export function replaceSegmentsForPage(
  db: DB,
  pageId: number,
  paperId: number,
  segments: Omit<SegmentDTO, 'id' | 'page_id' | 'paper_id'>[]
): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM segments WHERE page_id = ?`).run(pageId)
    const insert = db.prepare(
      `INSERT INTO segments
        (paper_id, page_id, col_index, x_start_ratio, x_end_ratio, y_start_ratio, y_end_ratio, order_index, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const s of segments) {
      insert.run(
        paperId,
        pageId,
        s.col_index,
        s.x_start_ratio,
        s.x_end_ratio,
        s.y_start_ratio,
        s.y_end_ratio,
        s.order_index ?? 0,
        s.is_deleted ?? 0
      )
    }
  })
  tx()
}

/** 软删除/恢复片段。 */
export function setSegmentDeleted(db: DB, segmentId: number, isDeleted: boolean): void {
  db.prepare(`UPDATE segments SET is_deleted = ? WHERE id = ?`).run(isDeleted ? 1 : 0, segmentId)
}
