import type { BankQuestionDTO } from './types'

/** 可编辑内容的受限文档格式，与编辑器、存储和 Word 导出共用。 */
export type ContentMode = 'original' | 'editable'
export type ImageAlignment = 'left' | 'center' | 'right'
export type EditableInline =
  | { type: 'text'; text: string; marks?: { type: 'bold' | 'italic' }[] }
  | { type: 'inlineMath'; attrs: { latex: string } }
  | { type: 'hardBreak' }
export type EditableBlock =
  | { type: 'paragraph'; content?: EditableInline[] }
  | { type: 'image'; attrs: { assetId: string; widthPercent: number; align: ImageAlignment; caption: string } }
export interface EditableDocument {
  type: 'doc'
  content: EditableBlock[]
}
export interface ContentRecognition {
  jobId: string
  candidateRevision: number
  sourceFingerprint: string
  reviewState: 'reviewed' | 'needs_review'
  /** 主动校对当前编辑稿时指向预期的新正式版本；修改正文后须清除。 */
  reviewConfirmedRevision?: number
}
export interface QuestionContentInput {
  schemaVersion: 1
  questionMode: ContentMode
  answerMode: ContentMode
  questionBody: EditableDocument
  answerBody: EditableDocument
  recognition?: { question?: ContentRecognition; answer?: ContentRecognition }
}
export interface QuestionContentDTO extends QuestionContentInput {
  questionId: number
  revision: number
  updatedAt: string
}
export interface QuestionAssetDTO {
  id: string
  questionId: number
  path: string
  widthPx: number
  heightPx: number
  name: string
}
export interface ContentRevisionDTO {
  revision: number
  createdAt: string
  questionMode: ContentMode
  answerMode: ContentMode
}
export interface EditableQuestionDTO {
  question: BankQuestionDTO
  content: QuestionContentDTO | null
  assets: QuestionAssetDTO[]
}
export interface WordExportOptions {
  title: string
  subtitle: string
  answerMode: 'none' | 'append' | 'inline'
  fontSize: number
  marginMm: number
  questionSpacing: number
  questionStartNewPage: boolean
}
export const DEFAULT_WORD_OPTIONS: WordExportOptions = {
  title: '物理试卷', subtitle: '', answerMode: 'none', fontSize: 12,
  marginMm: 20, questionSpacing: 12, questionStartNewPage: false
}
export const emptyDocument = (): EditableDocument => ({ type: 'doc', content: [{ type: 'paragraph' }] })
export const newQuestionContent = (): QuestionContentInput => ({
  schemaVersion: 1, questionMode: 'original', answerMode: 'original',
  questionBody: emptyDocument(), answerBody: emptyDocument()
})
export function hasEditableContent(doc: EditableDocument): boolean {
  return doc.content.some((block) => block.type === 'image' || block.content?.some((node) =>
    node.type === 'inlineMath' ? Boolean(node.attrs.latex.trim()) : node.type === 'text' && Boolean(node.text.trim())))
}
export const assetUrl = (path: string): string => `app://projects/${path.replace(/^projects\//, '').split('/').map(encodeURIComponent).join('/')}`

export interface EditableApi {
  getEditableQuestion(questionId: number): Promise<EditableQuestionDTO>
  saveQuestionContent(questionId: number, content: QuestionContentInput, expectedRevision: number): Promise<QuestionContentDTO>
  listContentRevisions(questionId: number): Promise<ContentRevisionDTO[]>
  getContentRevision(questionId: number, revision: number): Promise<QuestionContentDTO>
  restoreContentRevision(questionId: number, revision: number, expectedRevision: number): Promise<QuestionContentDTO>
  importQuestionAsset(questionId: number): Promise<QuestionAssetDTO | null>
  saveQuestionAsset(questionId: number, data: ArrayBuffer, name: string): Promise<QuestionAssetDTO>
  exportBasketDocx(setId: number, options: WordExportOptions): Promise<string | null>
  getWordExportOptions(setId: number): Promise<WordExportOptions>
  saveWordExportOptions(setId: number, options: WordExportOptions): Promise<void>
  reorderBasketItems(setId: number, itemIds: number[]): Promise<void>
}
