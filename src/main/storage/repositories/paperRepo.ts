import type { DB } from '../StorageService'
import type { PaperDTO, PaperStatus, PageDTO, NewPageDTO } from '../../../shared/types'

const now = (): string => new Date().toISOString()

/** 创建一份试卷（status='importing'），返回新 id。
 *  M14: kind='answer' + parentPaperId 时建的是挂在题目卷下的答案卷。 */
export function createPaper(
  db: DB,
  name: string,
  options?: { kind?: 'paper' | 'answer'; parentPaperId?: number | null }
): number {
  const ts = now()
  const kind = options?.kind ?? 'paper'
  const parent = kind === 'answer' ? (options?.parentPaperId ?? null) : null
  const r = db
    .prepare(
      `INSERT INTO papers (name, status, kind, parent_paper_id, created_at, updated_at)
       VALUES (?, 'importing', ?, ?, ?, ?)`
    )
    .run(name, kind, parent, ts, ts)
  return Number(r.lastInsertRowid)
}

/** 批量插入某试卷的页（带尺寸）。A10: 事务包裹。 */
export function addPages(db: DB, pages: NewPageDTO[]): void {
  if (pages.length === 0) return
  const insert = db.prepare(
    `INSERT INTO pages (paper_id, page_index, width_pt, height_pt, rotation) VALUES (?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((rows: NewPageDTO[]) => {
    for (const p of rows) insert.run(p.paper_id, p.page_index, p.width_pt, p.height_pt, p.rotation)
  })
  tx(pages)
}

/** 设置试卷总页数（导入完成后）。同时更新 updated_at 与 status。 */
export function setPageCount(db: DB, paperId: number, n: number, status?: PaperStatus): void {
  db.prepare(
    `UPDATE papers SET page_count = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(n, status ?? 'cropping', now(), paperId)
}

/**
 * 列出所有【题目卷】（M14 红线 1）。
 * 答案卷（kind='answer'）不在这里出现——它们只通过 getAnswerPaper 按父卷取，
 * 否则会污染主页试卷列表和题库的"来源试卷"筛选下拉。
 */
export function listPapers(db: DB): PaperDTO[] {
  return db
    .prepare(`SELECT * FROM papers WHERE kind = 'paper' ORDER BY created_at DESC`)
    .all() as PaperDTO[]
}

/** 取某题目卷的答案卷（M14）。无则 null。 */
export function getAnswerPaper(db: DB, parentPaperId: number): PaperDTO | null {
  return (
    (db
      .prepare(`SELECT * FROM papers WHERE kind = 'answer' AND parent_paper_id = ? LIMIT 1`)
      .get(parentPaperId) as PaperDTO | undefined) ?? null
  )
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
 *  调用方负责二次确认（R3）。
 *  M14: 老库迁移出的 parent_paper_id 没有 FK 约束（SQLite ADD COLUMN 限制），
 *  所以这里显式先删子答案卷，保证不留孤儿。返回被删掉的答案卷 id（供调用方清磁盘）。 */
export function deletePaper(db: DB, id: number): number[] {
  const children = db
    .prepare(`SELECT id FROM papers WHERE kind = 'answer' AND parent_paper_id = ?`)
    .all(id) as { id: number }[]
  const childIds = children.map((c) => c.id)
  const tx = db.transaction(() => {
    for (const cid of childIds) {
      db.prepare(`DELETE FROM papers WHERE id = ?`).run(cid)
    }
    db.prepare(`DELETE FROM papers WHERE id = ?`).run(id)
  })
  tx()
  return childIds
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
