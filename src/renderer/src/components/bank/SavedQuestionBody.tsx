import { Text } from '@mantine/core'
import { assetUrl, hasEditableContent, type EditableQuestionDTO } from '@shared/editable'
import { DocumentPreview } from '../editor/DocumentPreview'

export function savedQuestionHasAnswer(detail: EditableQuestionDTO): boolean {
  return Boolean(detail.question.answer_image_path || detail.content && hasEditableContent(detail.content.answerBody))
}

/** Cards show saved edits independently of the user's separate Word export mode. */
export function SavedQuestionBody({ detail, answer = false, original = false }: { detail: EditableQuestionDTO; answer?: boolean; original?: boolean }) {
  const body = answer ? detail.content?.answerBody : detail.content?.questionBody
  const path = answer ? detail.question.answer_image_path : detail.question.image_path
  if (!original && body && hasEditableContent(body)) return <DocumentPreview document={body} assets={detail.assets} />
  if (path) return <img className="saved-question-original" src={assetUrl(path)} alt={answer ? '原始答案图' : '原始题图'} />
  return <Text size="sm" c="dimmed">{original ? '没有对应原图，手工录入的内容请查看最新题卡。' : answer ? '暂无参考答案' : '暂无题目内容'}</Text>
}
