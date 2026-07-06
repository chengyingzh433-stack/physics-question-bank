import type { DB } from '../StorageService'

export interface PaperSetRow {
  id: number
  name: string | null
  title: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface PaperSetItemRow {
  id: number
  set_id: number
  question_id: number
  order_index: number | null
  group_header: string | null
  display_number: string | null
}

/** 取当前 draft 篮（不存在则建）。返回 set id。 */
export function getOrCreateDraftSet(db: DB): number {
  const row = db
    .prepare(`SELECT id FROM paper_sets WHERE status = 'draft' ORDER BY id ASC LIMIT 1`)
    .get() as { id: number } | undefined
  if (row) return row.id
  const ts = new Date().toISOString()
  const r = db
    .prepare(
      `INSERT INTO paper_sets (name, title, status, created_at, updated_at) VALUES ('当前组卷篮', NULL, 'draft', ?, ?)`
    )
    .run(ts, ts)
  return Number(r.lastInsertRowid)
}

/** 列篮内条目（按 order_index）。 */
export function listSetItems(db: DB, setId: number): PaperSetItemRow[] {
  return db
    .prepare(`SELECT * FROM paper_set_items WHERE set_id = ? ORDER BY order_index ASC, id ASC`)
    .all(setId) as PaperSetItemRow[]
}

/**
 * 加入篮（R6: 同篮去重，已存在则忽略）。返回条目 id（新建或已存在）。
 */
export function addToSet(db: DB, setId: number, questionId: number): number {
  // R6 去重：已存在则忽略
  const existing = db
    .prepare(`SELECT id FROM paper_set_items WHERE set_id = ? AND question_id = ?`)
    .get(setId, questionId) as { id: number } | undefined
  if (existing) return existing.id
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM paper_set_items WHERE set_id = ?`)
    .get(setId) as { m: number }
  const r = db
    .prepare(
      `INSERT INTO paper_set_items (set_id, question_id, order_index) VALUES (?, ?, ?)`
    )
    .run(setId, questionId, maxOrder.m + 1)
  return Number(r.lastInsertRowid)
}

/** 是否在篮中。 */
export function isInSet(db: DB, setId: number, questionId: number): boolean {
  return (
    db
      .prepare(`SELECT 1 FROM paper_set_items WHERE set_id = ? AND question_id = ?`)
      .get(setId, questionId) != null
  )
}

/** 从篮移除。 */
export function removeFromSet(db: DB, itemId: number): void {
  db.prepare(`DELETE FROM paper_set_items WHERE id = ?`).run(itemId)
}

/** 更新条目 order_index / group_header / display_number。 */
export function updateSetItem(
  db: DB,
  itemId: number,
  fields: { order_index?: number; group_header?: string | null; display_number?: string | null }
): void {
  const sets: string[] = []
  const params: (string | number | null)[] = []
  if (fields.order_index !== undefined) {
    sets.push('order_index = ?')
    params.push(fields.order_index)
  }
  if (fields.group_header !== undefined) {
    sets.push('group_header = ?')
    params.push(fields.group_header)
  }
  if (fields.display_number !== undefined) {
    sets.push('display_number = ?')
    params.push(fields.display_number)
  }
  if (sets.length === 0) return
  params.push(itemId)
  db.prepare(`UPDATE paper_set_items SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

/** 获取篮内所有 question_id（用于 BankView 标记已加入）。 */
export function listSetQuestionIds(db: DB, setId: number): number[] {
  return (
    db
      .prepare(`SELECT question_id FROM paper_set_items WHERE set_id = ?`)
      .all(setId) as { question_id: number }[]
  ).map((r) => r.question_id)
}
