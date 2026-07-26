import type { DB } from '../StorageService'
import type { PaperDTO, PaperStatus, PageDTO, NewPageDTO } from '../../../shared/types'

const now = (): string => new Date().toISOString()

/** 创建一份试卷（status='importing'），返回新 id。 */
export function createPaper(db: DB, name: string): number {
  const ts = now()
  const r = db
    .prepare(
      `INSERT INTO papers (name, status, created_at, updated_at) VALUES (?, 'importing', ?, ?)`
    )
    .run(name, ts, ts)
  return Number(r.lastInsertRowid)
}

/** 批量插入某试卷的页（带尺寸）。A10: 事务包裹。 */
export function addPages(db: DB, pages: NewPageDTO[]): void {
  if (pages.length === 0) return
  const insert = db.prepare(
    `INSERT INTO pages (paper_id, page_index, width_pt, height_pt) VALUES (?, ?, ?, ?)`
  )
  const tx = db.transaction((rows: NewPageDTO[]) => {
    for (const p of rows) insert.run(p.paper_id, p.page_index, p.width_pt, p.height_pt)
  })
  tx(pages)
}

/** 设置试卷总页数（导入完成后）。同时更新 updated_at 与 status。 */
export function setPageCount(db: DB, paperId: number, n: number, status?: PaperStatus): void {
  db.prepare(
    `UPDATE papers SET page_count = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(n, status ?? 'cropping', now(), paperId)
}

export function listPapers(db: DB): PaperDTO[] {
  return db
    .prepare(`SELECT * FROM papers ORDER BY created_at DESC`)
    .all() as PaperDTO[]
}

export function getPaper(db: DB, id: number): PaperDTO | null {
  return (db.prepare(`SELECT * FROM papers WHERE id = ?`).get(id) as PaperDTO | undefined) ?? null
}

export function getPages(db: DB, paperId: number): PageDTO[] {
  return db
    .prepare(`SELECT * FROM pages WHERE paper_id = ? ORDER BY page_index ASC`)
    .all(paperId) as PageDTO[]
}

/** 级联删除试卷（A10: foreign_keys=ON 时 pages/cut_lines/segments/questions 等自动级联）。
 *  调用方负责二次确认（R3）。 */
export function deletePaper(db: DB, id: number): void {
  db.prepare(`DELETE FROM papers WHERE id = ?`).run(id)
}

/**
 * 更新试卷的默认年份/出处（M13）。
 * null / 空串表示清空，题目届时 COALESCE 后也为 null。
 */
export function updatePaperMeta(
  db: DB,
  paperId: number,
  fields: { year?: number | null; source?: string | null }
): void {
  const sets: string[] = []
  const params: (string | number | null)[] = []
  if ('year' in fields) {
    sets.push('year = ?')
    params.push(fields.year ?? null)
  }
  if ('source' in fields) {
    sets.push('source = ?')
    const v = fields.source
    params.push(v == null || v.trim() === '' ? null : v.trim())
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(now(), paperId)
  db.prepare(`UPDATE papers SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}
