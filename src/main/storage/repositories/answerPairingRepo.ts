import type { DB } from '../StorageService'
import type { AnswerBindingDTO, AnswerPairingDTO } from '../../../shared/types'

export function getAnswerPairings(db: DB, paperId: number): AnswerPairingDTO[] {
  const rows = db.prepare(`SELECT a.question_id, a.segment_ids FROM answer_pairings a
    JOIN questions q ON q.id = a.question_id WHERE q.paper_id = ? ORDER BY q.id`)
    .all(paperId) as { question_id: number; segment_ids: string }[]
  return rows.map((r) => ({ questionId: r.question_id, segmentIds: JSON.parse(r.segment_ids) }))
}

/** 配对和图片元数据在同一事务提交，失败时保留整卷旧版本。 */
export function commitAnswerBindings(db: DB, paperId: number, answerPaperId: number, bindings: AnswerBindingDTO[]): void {
  db.transaction(() => {
    const source = db.prepare("SELECT id FROM papers WHERE id = ? AND kind = 'answer' AND parent_paper_id = ?")
      .get(answerPaperId, paperId)
    if (!source) throw new Error('答案卷不属于此试卷，请重新载入')
    const questions = db.prepare("SELECT q.id FROM questions q JOIN papers p ON p.id = q.paper_id WHERE p.id = ? AND p.kind = 'paper'")
      .all(paperId) as { id: number }[]
    const expected = new Set(questions.map((q) => q.id))
    if (bindings.length !== expected.size) throw new Error('题目数量已变化，请重新载入后配对')
    const segment = db.prepare('SELECT id FROM segments WHERE id = ? AND paper_id = ? AND is_deleted = 0')
    const save = db.prepare(`INSERT INTO answer_pairings VALUES (?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET answer_paper_id=excluded.answer_paper_id, segment_ids=excluded.segment_ids`)
    const image = db.prepare(`UPDATE questions SET answer_image_path=?, answer_width_px=?, answer_height_px=?, updated_at=? WHERE id=?`)
    for (const b of bindings) {
      if (!expected.delete(b.questionId)) throw new Error('存在重复或不属于此卷的题目')
      if (!Array.isArray(b.segmentIds) || new Set(b.segmentIds).size !== b.segmentIds.length ||
          b.segmentIds.some((id) => !Number.isInteger(id) || !segment.get(id, answerPaperId))) {
        throw new Error('答案片段已变化，请重新载入后配对')
      }
      if (b.segmentIds.length === 0) {
        if (b.imagePath !== null || b.widthPx !== null || b.heightPx !== null) throw new Error('空配对不能保留答案图')
      } else if (!b.imagePath?.startsWith(`projects/${paperId}/images/a_${b.questionId}_`) ||
          !Number.isInteger(b.widthPx) || !Number.isInteger(b.heightPx) || b.widthPx! <= 0 || b.heightPx! <= 0) {
        throw new Error('答案图信息不完整')
      }
      save.run(b.questionId, answerPaperId, JSON.stringify(b.segmentIds))
      image.run(b.imagePath, b.widthPx, b.heightPx, new Date().toISOString(), b.questionId)
    }
  })()
}
