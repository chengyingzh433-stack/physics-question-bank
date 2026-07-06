import type { DB } from '../StorageService'

export interface QuestionTypeRow {
  id: number
  name: string
  is_builtin: number
}

export function listQuestionTypes(db: DB): QuestionTypeRow[] {
  return db.prepare(`SELECT * FROM question_types ORDER BY id ASC`).all() as QuestionTypeRow[]
}

export function createQuestionType(db: DB, name: string): number {
  const r = db
    .prepare(`INSERT INTO question_types (name, is_builtin) VALUES (?, 0)`)
    .run(name)
  return Number(r.lastInsertRowid)
}

export function renameQuestionType(db: DB, id: number, name: string): void {
  db.prepare(`UPDATE question_types SET name = ? WHERE id = ? AND is_builtin = 0`).run(name, id)
}

/** 内置题型不可删（返回是否真的删了）。 */
export function deleteQuestionType(db: DB, id: number): boolean {
  const r = db
    .prepare(`DELETE FROM question_types WHERE id = ? AND is_builtin = 0`)
    .run(id)
  return r.changes > 0
}

export function setQuestionType(db: DB, questionId: number, typeId: number | null): void {
  db.prepare(`UPDATE questions SET type_id = ?, updated_at = ? WHERE id = ?`).run(
    typeId,
    new Date().toISOString(),
    questionId
  )
}
