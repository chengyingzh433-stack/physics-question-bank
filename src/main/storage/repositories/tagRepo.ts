import type { DB } from '../StorageService'
import type { ChapterDTO } from '../../../shared/types'

// ---- chapters ----
export type ChapterRow = ChapterDTO
export function listChapters(db: DB): ChapterRow[] {
  return db.prepare(`SELECT * FROM chapters ORDER BY id ASC`).all() as ChapterRow[]
}
function normalizeName(name: string, label: string): string {
  const normalized = typeof name === 'string' ? name.trim() : ''
  if (!normalized) throw new Error(`${label}不能为空`)
  if (normalized.length > 100) throw new Error(`${label}不能超过100个字`)
  return normalized
}

export function createChapter(db: DB, name: string, parentId: number | null = null): number {
  const normalized = normalizeName(name, '章节名称')
  const parent = parentId === null ? null : db.prepare('SELECT name FROM chapters WHERE id = ?').get(parentId) as { name: string } | undefined
  if (parentId !== null && !parent) throw new Error('上级章节不存在，请重新选择')
  const fullName = parent ? `${parent.name} / ${normalized}` : normalized
  if (fullName.length > 1000) throw new Error('章节层级过长，请选择更高一级的章节')
  const existing = db.prepare('SELECT id FROM chapters WHERE parent_id IS ? AND name = ? ORDER BY id LIMIT 1')
    .get(parentId, fullName) as { id: number } | undefined
  if (existing) return existing.id
  return Number(db.prepare('INSERT INTO chapters (name, parent_id) VALUES (?, ?)').run(fullName, parentId).lastInsertRowid)
}
export function deleteChapter(db: DB, id: number): void {
  const chapter = db.prepare('SELECT template_key FROM chapters WHERE id = ?').get(id) as { template_key: string | null } | undefined
  if (chapter?.template_key) throw new Error('预设模板章节不能删除')
  if (db.prepare('SELECT 1 FROM chapters WHERE parent_id = ? LIMIT 1').get(id)) {
    throw new Error('请先删除该章节下的自定义子章节')
  }
  db.prepare(`DELETE FROM chapters WHERE id = ?`).run(id)
}

// ---- knowledge_points ----
export interface KnowledgePointRow {
  id: number
  name: string
  chapter_id: number | null
}
export function listKnowledgePoints(db: DB): KnowledgePointRow[] {
  return db.prepare(`SELECT * FROM knowledge_points ORDER BY id ASC`).all() as KnowledgePointRow[]
}
export function createKnowledgePoint(db: DB, name: string, chapterId: number | null): number {
  const normalized = normalizeName(name, '知识点名称')
  if (chapterId !== null && !db.prepare('SELECT 1 FROM chapters WHERE id = ?').get(chapterId)) {
    throw new Error('所属章节不存在，请重新选择')
  }
  const existing = db.prepare('SELECT id FROM knowledge_points WHERE chapter_id IS ? AND name = ? ORDER BY id LIMIT 1')
    .get(chapterId, normalized) as { id: number } | undefined
  if (existing) return existing.id
  return Number(
    db
      .prepare(`INSERT INTO knowledge_points (name, chapter_id) VALUES (?, ?)`)
      .run(normalized, chapterId).lastInsertRowid
  )
}
export function deleteKnowledgePoint(db: DB, id: number): void {
  db.prepare(`DELETE FROM knowledge_points WHERE id = ?`).run(id)
}

// ---- difficulties ----
export interface DifficultyRow {
  id: number
  name: string
  sort_order: number
}
export function listDifficulties(db: DB): DifficultyRow[] {
  return db
    .prepare(`SELECT * FROM difficulties ORDER BY sort_order ASC, id ASC`)
    .all() as DifficultyRow[]
}
export function createDifficulty(db: DB, name: string, sortOrder: number): number {
  return Number(
    db
      .prepare(`INSERT INTO difficulties (name, sort_order) VALUES (?, ?)`)
      .run(name, sortOrder).lastInsertRowid
  )
}
export function deleteDifficulty(db: DB, id: number): void {
  db.prepare(`DELETE FROM difficulties WHERE id = ?`).run(id)
}

// ---- 题目赋标签 ----
export function setQuestionChapter(db: DB, questionId: number, chapterId: number | null): void {
  db.prepare(`UPDATE questions SET chapter_id = ?, updated_at = ? WHERE id = ?`).run(
    chapterId,
    new Date().toISOString(),
    questionId
  )
}
export function setQuestionDifficulty(db: DB, questionId: number, difficultyId: number | null): void {
  db.prepare(`UPDATE questions SET difficulty_id = ?, updated_at = ? WHERE id = ?`).run(
    difficultyId,
    new Date().toISOString(),
    questionId
  )
}
/** 知识点多选：替换某题的全部知识点关联。A10 事务。 */
export function setQuestionKnowledgePoints(db: DB, questionId: number, kpIds: number[]): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM question_knowledge_points WHERE question_id = ?`).run(questionId)
    const ins = db.prepare(
      `INSERT OR IGNORE INTO question_knowledge_points (question_id, kp_id) VALUES (?, ?)`
    )
    for (const kp of kpIds) ins.run(questionId, kp)
  })
  tx()
}
export function getQuestionKnowledgePoints(db: DB, questionId: number): number[] {
  return (
    db
      .prepare(`SELECT kp_id FROM question_knowledge_points WHERE question_id = ?`)
      .all(questionId) as { kp_id: number }[]
  ).map((r) => r.kp_id)
}
