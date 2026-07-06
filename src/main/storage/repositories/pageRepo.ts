import type { DB } from '../StorageService'
import type { ColumnDividerDTO, CutLineDTO, PageDTO } from '../../../shared/types'

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

/** 撤销最近一刀（按 created_seq 最大）。返回被删的 id 或 null。 */
export function undoLastCutLine(db: DB, pageId: number): number | null {
  const last = db
    .prepare(
      `SELECT id FROM cut_lines WHERE page_id = ? ORDER BY created_seq DESC LIMIT 1`
    )
    .get(pageId) as { id: number } | undefined
  if (!last) return null
  db.prepare(`DELETE FROM cut_lines WHERE id = ?`).run(last.id)
  return last.id
}

/** 删除指定横切线。 */
export function deleteCutLine(db: DB, cutLineId: number): void {
  db.prepare(`DELETE FROM cut_lines WHERE id = ?`).run(cutLineId)
}

// ---- 页查询（复用 paperRepo 已有，这里只补按 id 取单页）----

export function getPage(db: DB, pageId: number): PageDTO | null {
  return (db.prepare(`SELECT * FROM pages WHERE id = ?`).get(pageId) as PageDTO | undefined) ?? null
}
