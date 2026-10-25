import type { EditableQuestionDTO, QuestionContentInput, QuestionMetadataInput } from '@shared/editable'

export interface LocalEditRecovery {
  version: 1
  baseRevision: number
  baseMetadata: QuestionMetadataInput
  content: QuestionContentInput
  metadata: QuestionMetadataInput
  updatedAt: string
}
// Include the immutable source identity so switching storage libraries cannot restore an unrelated question.
export const recoveryKey = (data: EditableQuestionDTO) =>
  `question-edit-recovery:v1:${data.question.id}:${data.question.image_path ?? data.question.paper_name}`
export function readLocalEdit(key: string): LocalEditRecovery | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const value = JSON.parse(raw) as LocalEditRecovery
  if (value.version !== 1 || !Number.isSafeInteger(value.baseRevision) ||
      value.content?.schemaVersion !== 1 || value.content.questionBody?.type !== 'doc' || value.content.answerBody?.type !== 'doc' ||
      !Array.isArray(value.metadata?.knowledgePointIds) || !Array.isArray(value.baseMetadata?.knowledgePointIds)) {
    throw new Error('本机恢复副本格式无法读取。已保存的题目不受影响，请先保留此页并暂存当前修改。')
  }
  return value
}
export function writeLocalEdit(key: string, value: LocalEditRecovery) { localStorage.setItem(key, JSON.stringify(value)) }
export function clearLocalEdit(key: string) { localStorage.removeItem(key) }
