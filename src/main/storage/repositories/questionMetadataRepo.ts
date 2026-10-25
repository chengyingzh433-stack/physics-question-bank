import type { DB } from '../StorageService'
import { metadataFingerprint, type QuestionMetadataInput } from '../../../shared/editable'

export function getQuestionMetadata(db: DB, questionId: number): QuestionMetadataInput {
  const row = db.prepare(`SELECT type_id AS typeId, chapter_id AS chapterId, difficulty_id AS difficultyId,
    year_override AS year, source_override AS source FROM questions WHERE id = ?`).get(questionId) as Omit<QuestionMetadataInput, 'knowledgePointIds'> | undefined
  if (!row) throw new Error('题目不存在，请重新打开')
  const points = db.prepare('SELECT kp_id FROM question_knowledge_points WHERE question_id = ? ORDER BY kp_id').all(questionId) as { kp_id: number }[]
  return { ...row, knowledgePointIds: points.map((point) => point.kp_id) }
}

function normalize(raw: QuestionMetadataInput, historical = false): QuestionMetadataInput {
  if (!raw || typeof raw !== 'object') throw new Error('标签内容无效')
  for (const value of [raw.typeId, raw.chapterId, raw.difficultyId]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 1)) throw new Error('标签编号无效')
  }
  if (!Array.isArray(raw.knowledgePointIds) || raw.knowledgePointIds.length > 100 ||
    raw.knowledgePointIds.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error('知识点选择无效（最多 100 项）')
  if (raw.year !== null && (!Number.isSafeInteger(raw.year) || !historical && (raw.year < 1900 || raw.year > 2100))) throw new Error('年份应为 1900 至 2100 之间的整数，或留空')
  if (raw.source !== null && (typeof raw.source !== 'string' || !historical && (raw.source.length > 300 || /[\u0000-\u001f\u007f]/.test(raw.source)))) throw new Error('出处不能超过 300 字或包含控制字符')
  return { typeId: raw.typeId, chapterId: raw.chapterId, difficultyId: raw.difficultyId,
    knowledgePointIds: [...new Set(raw.knowledgePointIds)].sort((a, b) => a - b), year: raw.year, source: raw.source?.trim() || null }
}

/** Called inside the same transaction as content save/publication. */
export function saveQuestionMetadata(db: DB, questionId: number, raw: QuestionMetadataInput, expected: QuestionMetadataInput): void {
  if (metadataFingerprint(getQuestionMetadata(db, questionId)) !== metadataFingerprint(normalize(expected, true))) {
    throw new Error('标签已在其他窗口更新。当前填写仍保留，请重新读取最新标签后再保存')
  }
  const value = normalize(raw)
  for (const [table, id] of [['question_types', value.typeId], ['chapters', value.chapterId], ['difficulties', value.difficultyId]] as const) {
    if (id !== null && !db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) throw new Error('所选标签已不存在，请重新选择')
  }
  for (const id of value.knowledgePointIds) if (!db.prepare('SELECT 1 FROM knowledge_points WHERE id = ?').get(id)) throw new Error('所选知识点已不存在，请重新选择')
  db.prepare(`UPDATE questions SET type_id=?,chapter_id=?,difficulty_id=?,year_override=?,source_override=?,updated_at=? WHERE id=?`)
    .run(value.typeId, value.chapterId, value.difficultyId, value.year, value.source, new Date().toISOString(), questionId)
  db.prepare('DELETE FROM question_knowledge_points WHERE question_id=?').run(questionId)
  const insert = db.prepare('INSERT INTO question_knowledge_points(question_id,kp_id) VALUES (?,?)')
  for (const id of value.knowledgePointIds) insert.run(questionId, id)
}
