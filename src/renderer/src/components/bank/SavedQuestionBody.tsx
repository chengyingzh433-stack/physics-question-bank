import { Text } from '@mantine/core'
import { assetUrl, hasEditableContent, type EditableQuestionDTO } from '@shared/editable'
import { DocumentPreview } from '../editor/DocumentPreview'
import { selectContent, type ContentSource } from '@shared/contentSelection'

export function savedQuestionHasAnswer(detail: EditableQuestionDTO): boolean {
  return selectContent(detail.content, 'answer') === 'editable'
    ? Boolean(detail.content && hasEditableContent(detail.content.answerBody)) : Boolean(detail.question.answer_image_path)
}

/** Cards show saved edits independently of the user's separate Word export mode. */
export function SavedQuestionBody({ detail, answer = false, original = false, source = 'latest' }: { detail: EditableQuestionDTO; answer?: boolean; original?: boolean; source?: ContentSource }) {
  const body = answer ? detail.content?.answerBody : detail.content?.questionBody
  const path = answer ? detail.question.answer_image_path : detail.question.image_path
  if (selectContent(detail.content, answer ? 'answer' : 'question', original ? 'original' : source) === 'editable' && body) {
    return hasEditableContent(body) ? <DocumentPreview document={body} assets={detail.assets} />
      : <Text size="sm" c="dimmed">{answer ? '暂无参考答案（已保存为空）' : '编辑稿为空，请补充题目内容'}</Text>
  }
  if (path) return <img className="saved-question-original" src={assetUrl(path)} alt={answer ? '原始答案图' : '原始题图'} />
  return <Text size="sm" c="dimmed">{original ? '没有对应原图，手工录入的内容请查看最新题卡。' : answer ? '暂无参考答案' : '暂无题目内容'}</Text>
}
