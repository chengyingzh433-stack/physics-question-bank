import type { DB } from '../StorageService'
import type { ColumnDividerDTO, CutLineDTO, ManualBoxDTO, PageDTO } from '../../../shared/types'

// ---- 列模式 ----

export function setColumnMode(db: DB, pageId: number, mode: number): void {
  db.prepare(`UPDATE pages SET column_mode = ? WHERE id = ?`).run(mode, pageId)
}

// ---- 列分隔线 ----

export function listDividers(db: DB, pageId: number): ColumnDividerDTO[] {
  return db
    .prepare(`SELECT * FROM column_dividers WHERE page_id = ? ORDER BY x_ratio ASC`)
    .all(pageId) as ColumnDividerDTO[]
}

/** 用一组分隔线替换某页全部分隔线（n 列 = n-1 条）。A10 事务。 */
export function replaceDividers(db: DB, pageId: number, xRatios: number[]): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM column_dividers WHERE page_id = ?`).run(pageId)
    const insert = db.prepare(
      `INSERT INTO column_dividers (page_id, x_ratio) VALUES (?, ?)`
    )
    for (const x of xRatios) insert.run(pageId, x)
  })
  tx()
}

// ---- 横切线 ----

export function listCutLines(db: DB, pageId: number): CutLineDTO[] {
  return db
    .prepare(
      `SELECT * FROM cut_lines WHERE page_id = ? ORDER BY col_index ASC, created_seq ASC`
    )
    .all(pageId) as CutLineDTO[]
}

/** 添加一条横切线，返回新 id。created_seq 自动取该页当前最大+1。 */
export function addCutLine(db: DB, pageId: number, colIndex: number, yRatio: number): number {
  const maxSeq = db
    .prepare(`SELECT COALESCE(MAX(created_seq), 0) AS m FROM cut_lines WHERE page_id = ?`)
    .get(pageId) as { m: number }
  const seq = maxSeq.m + 1
  const r = db
    .prepare(
      `INSERT INTO cut_lines (page_id, col_index, y_ratio, created_seq) VALUES (?, ?, ?, ?)`
    )
    .run(pageId, colIndex, yRatio, seq)
  return Number(r.lastInsertRowid)
}

/** 撤销最近一刀（按全局 id 最大，跨所有页）。返回被删刀所在的 page_id 或 null。 */
export function undoLastCutLine(db: DB, paperId: number): number | null {
  console.log('[undoLastCutLine] paperId =', paperId)
  const last = db
    .prepare(
      `SELECT c.id, c.page_id
       FROM cut_lines c
       JOIN pages p ON c.page_id = p.id
       WHERE p.paper_id = ?
       ORDER BY c.id DESC
       LIMIT 1`
    )
    .get(paperId) as { id: number; page_id: number } | undefined
  console.log('[undoLastCutLine] last =', last)
  if (!last) return null
  db.prepare(`DELETE FROM cut_lines WHERE id = ?`).run(last.id)
  console.log('[undoLastCutLine] deleted id =', last.id, ', returning page_id =', last.page_id)
  return last.page_id
}

/** 删除指定横切线。 */
export function deleteCutLine(db: DB, cutLineId: number): void {
  db.prepare(`DELETE FROM cut_lines WHERE id = ?`).run(cutLineId)
}

// ---- 手画框（manual_boxes）----

export function listManualBoxes(db: DB, pageId: number): ManualBoxDTO[] {
  return db
    .prepare(`SELECT * FROM manual_boxes WHERE page_id = ? ORDER BY created_seq ASC`)
    .all(pageId) as ManualBoxDTO[]
}

/** 添加一个手画框，返回新 id。created_seq 自动取该页当前最大+1。 */
export function addManualBox(
  db: DB,
  pageId: number,
  paperId: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  isExcluded: number
): number {
  const maxSeq = db
    .prepare(`SELECT COALESCE(MAX(created_seq), 0) AS m FROM manual_boxes WHERE page_id = ?`)
    .get(pageId) as { m: number }
  const seq = maxSeq.m + 1
  const r = db
    .prepare(
      `INSERT INTO manual_boxes (page_id, paper_id, x_start_ratio, x_end_ratio, y_start_ratio, y_end_ratio, is_excluded, created_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(pageId, paperId, x0, x1, y0, y1, isExcluded, seq)
  return Number(r.lastInsertRowid)
}

/** 删除指定手画框。 */
export function deleteManualBox(db: DB, boxId: number): void {
  db.prepare(`DELETE FROM manual_boxes WHERE id = ?`).run(boxId)
}

/** 撤销最近一个手画框（按全局 id 最大，跨所有页）。返回被删框所在的 page_id 或 null。 */
export function undoLastManualBox(db: DB, paperId: number): number | null {
  const last = db
    .prepare(
      `SELECT id, page_id FROM manual_boxes WHERE paper_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(paperId) as { id: number; page_id: number } | undefined
  if (!last) return null
  db.prepare(`DELETE FROM manual_boxes WHERE id = ?`).run(last.id)
  return last.page_id
}

// ---- 页查询（复用 paperRepo 已有，这里只补按 id 取单页）----

export function getPage(db: DB, pageId: number): PageDTO | null {
  return (db.prepare(`SELECT * FROM pages WHERE id = ?`).get(pageId) as PageDTO | undefined) ?? null
}
