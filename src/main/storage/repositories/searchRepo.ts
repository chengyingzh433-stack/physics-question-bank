import type { DB } from '../StorageService'
import type { QuestionContentInput } from '../../../shared/editable'
import { hasEditableContent } from '../../../shared/editable'
import { documentSearchText, selectContent } from '../../../shared/contentSelection'

export function updateSearchContent(db: DB, id: number, revision: number, content: QuestionContentInput): void {
  const answerEdited = selectContent(content, 'answer') === 'editable'
  db.prepare(`INSERT INTO question_search (question_id, revision, question_text, answer_text, answer_edited, answer_present)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(question_id) DO UPDATE SET revision=excluded.revision,
    question_text=excluded.question_text, answer_text=excluded.answer_text,
    answer_edited=excluded.answer_edited, answer_present=excluded.answer_present`).run(
    id, revision, documentSearchText(content.questionBody), documentSearchText(content.answerBody),
    Number(answerEdited), Number(hasEditableContent(content.answerBody)))
}

/** A derived local index: failures never rewrite the source documents. */
export function initializeSearchStorage(db: DB, rebuild = false): { indexed: number; skipped: number } {
  db.exec(`CREATE TABLE IF NOT EXISTS question_search (
    question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, question_text TEXT NOT NULL, answer_text TEXT NOT NULL,
    answer_edited INTEGER NOT NULL, answer_present INTEGER NOT NULL)`)
  return db.transaction(() => {
    let indexed = 0, skipped = 0
    const rows = db.prepare(`SELECT c.question_id, c.revision, c.content_json FROM question_contents c
      LEFT JOIN question_search s ON s.question_id=c.question_id WHERE ? OR s.revision IS NULL OR s.revision<>c.revision`)
      .all(Number(rebuild)) as { question_id: number; revision: number; content_json: string }[]
    for (const row of rows) {
      let content: QuestionContentInput
      try {
        content = JSON.parse(row.content_json)
        documentSearchText(content.questionBody); documentSearchText(content.answerBody)
      } catch {
        db.prepare('DELETE FROM question_search WHERE question_id=?').run(row.question_id)
        skipped++; continue
      }
      updateSearchContent(db, row.question_id, row.revision, content); indexed++
    }
    db.exec('DELETE FROM question_search WHERE question_id NOT IN (SELECT question_id FROM question_contents)')
    return { indexed, skipped }
  })()
}

export function searchMatches(db: DB, id: number, term: string): { part: 'question' | 'answer' | 'metadata'; snippet: string }[] {
  const row = db.prepare('SELECT question_text, answer_text FROM question_search WHERE question_id=?').get(id) as
    { question_text: string; answer_text: string } | undefined
  const needle = term.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
  const matches: { part: 'question' | 'answer' | 'metadata'; snippet: string }[] = []
  for (const part of ['question', 'answer'] as const) {
    const text = row?.[part === 'question' ? 'question_text' : 'answer_text'] ?? ''
    const start = text.toLowerCase().indexOf(needle)
    if (start < 0) continue
    const from = Math.max(0, start - 30), end = Math.min(text.length, start + needle.length + 60)
    matches.push({ part, snippet: `${from ? '…' : ''}${text.slice(from, end)}${end < text.length ? '…' : ''}` })
  }
  return matches.length ? matches : [{ part: 'metadata', snippet: `名称、来源或标签匹配“${term}”` }]
}
