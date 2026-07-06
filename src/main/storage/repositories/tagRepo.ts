import type { DB } from '../StorageService'

// ---- chapters ----
export interface ChapterRow {
  id: number
  name: string
}
export function listChapters(db: DB): ChapterRow[] {
  return db.prepare(`SELECT * FROM chapters ORDER BY id ASC`).all() as ChapterRow[]
}
export function createChapter(db: DB, name: string): number {
  return Number(db.prepare(`INSERT INTO chapters (name) VALUES (?)`).run(name).lastInsertRowid)
}
export function deleteChapter(db: DB, id: number): void {
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
  return Number(
    db
      .prepare(`INSERT INTO knowledge_points (name, chapter_id) VALUES (?, ?)`)
      .run(name, chapterId).lastInsertRowid
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
