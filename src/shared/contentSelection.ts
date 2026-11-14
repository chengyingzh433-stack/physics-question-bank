import { hasEditableContent, type EditableDocument, type QuestionContentInput } from './editable'

/** `saved` preserves the explicit per-part export choices made in older versions. */
export type ContentSource = 'latest' | 'original' | 'saved'
export type ContentPart = 'question' | 'answer'
export function selectContent(content: QuestionContentInput | null | undefined, part: ContentPart, source: ContentSource = 'latest'): 'editable' | 'original' {
  if (!content || source === 'original') return 'original'
  const mode = part === 'question' ? content.questionMode : content.answerMode
  if (source === 'saved') return mode
  const document = part === 'question' ? content.questionBody : content.answerBody
  // An explicitly empty editable answer must not resurrect the original image.
  return content.editedParts?.[part] || mode === 'editable' || hasEditableContent(document) ? 'editable' : 'original'
}

export function documentSearchText(document: EditableDocument): string {
  return document.content.map((block) => block.type === 'image' ? block.attrs.caption : (block.content ?? []).map((node) =>
    node.type === 'text' ? node.text : node.type === 'inlineMath' ? node.attrs.latex : '\n').join('')).join('\n')
    .normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export const CONTENT_SOURCE_OPTIONS = [
  { value: 'latest', label: '最新保存内容（推荐）' },
  { value: 'original', label: '原始题图与答案图' },
  { value: 'saved', label: '沿用每题原有导出偏好' }
]
