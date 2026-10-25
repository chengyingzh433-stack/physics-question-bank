import type { DB } from '../StorageService'
import type { QuestionFolderDTO } from '../../../shared/types'

function folderName(name: string): string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
    throw new Error('题夹名称须为 1–60 个字')
  }
  return name.trim()
}

function requireFolder(db: DB, id: number): void {
  if (!db.prepare('SELECT id FROM question_folders WHERE id = ?').get(id)) {
    throw new Error('题夹不存在，请刷新后重试')
  }
}

/** 批量操作只接受已入库题目，防止将答案卷的中间数据加入题夹/篮。 */
export function validateBankQuestionIds(db: DB, ids: number[]): number[] {
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('题目编号无效')
  }
  const unique = [...new Set(ids)]
  const check = db.prepare(`SELECT q.id FROM questions q JOIN papers p ON p.id = q.paper_id
    WHERE q.id = ? AND q.image_path IS NOT NULL AND (p.kind = 'paper' OR (p.kind = 'intake' AND p.status = 'done'))`)
  for (const id of unique) {
    if (!check.get(id)) throw new Error(`题目 ${id} 不存在或尚未入库，请刷新后重试`)
  }
  return unique
}

export function listFolders(db: DB): QuestionFolderDTO[] {
  return db.prepare(`SELECT f.id, f.name,
    (SELECT COUNT(*) FROM question_folder_items fi JOIN questions q ON q.id = fi.question_id
      JOIN papers p ON p.id = q.paper_id
      WHERE fi.folder_id = f.id AND q.image_path IS NOT NULL AND (p.kind = 'paper' OR (p.kind = 'intake' AND p.status = 'done'))) AS question_count
    FROM question_folders f ORDER BY f.id`).all() as QuestionFolderDTO[]
}

function ensureUniqueName(db: DB, name: string, exceptId = -1): string {
  const value = folderName(name)
  if (db.prepare('SELECT id FROM question_folders WHERE name = ? AND id <> ?').get(value, exceptId)) {
    throw new Error('已有同名题夹，请换一个名称')
  }
  return value
}

export function createFolder(db: DB, name: string): number {
  return Number(db.prepare('INSERT INTO question_folders (name) VALUES (?)')
    .run(ensureUniqueName(db, name)).lastInsertRowid)
}

export function renameFolder(db: DB, id: number, name: string): void {
  requireFolder(db, id)
  db.prepare('UPDATE question_folders SET name = ? WHERE id = ?').run(ensureUniqueName(db, name, id), id)
}

export function deleteFolder(db: DB, id: number): void {
  db.prepare('DELETE FROM question_folders WHERE id = ?').run(id)
}

export function addQuestionsToFolder(db: DB, folderId: number, ids: number[]): number {
  return db.transaction(() => {
    requireFolder(db, folderId)
    const valid = validateBankQuestionIds(db, ids)
    const insert = db.prepare('INSERT OR IGNORE INTO question_folder_items (folder_id, question_id) VALUES (?, ?)')
    return valid.reduce((count, id) => count + insert.run(folderId, id).changes, 0)
  })()
}

export function removeQuestionsFromFolder(db: DB, folderId: number, ids: number[]): number {
  return db.transaction(() => {
    requireFolder(db, folderId)
    const valid = validateBankQuestionIds(db, ids)
    const remove = db.prepare('DELETE FROM question_folder_items WHERE folder_id = ? AND question_id = ?')
    return valid.reduce((count, id) => count + remove.run(folderId, id).changes, 0)
  })()
}
