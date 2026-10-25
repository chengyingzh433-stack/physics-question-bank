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
  metadata: QuestionMetadataInput
}
export interface QuestionMetadataInput {
  typeId: number | null
  chapterId: number | null
  difficultyId: number | null
  knowledgePointIds: number[]
  year: number | null
  source: string | null
}
export const emptyQuestionMetadata = (): QuestionMetadataInput => ({
  typeId: null, chapterId: null, difficultyId: null, knowledgePointIds: [], year: null, source: null
})
export const metadataFingerprint = (value: QuestionMetadataInput): string => JSON.stringify([
  value.typeId, value.chapterId, value.difficultyId, [...new Set(value.knowledgePointIds)].sort((a, b) => a - b),
  value.year, value.source?.trim() || null
])
export interface SaveQuestionEditsInput {
  content: QuestionContentInput
  expectedRevision: number
  metadata: QuestionMetadataInput
  expectedMetadata: QuestionMetadataInput
  publish?: { draftId: string; confirmed: boolean }
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
/** Empty editor documents may omit content in their JSON representation. */
export function normalizeEditableDocument(doc: EditableDocument | null | undefined): EditableDocument {
  return doc?.type === 'doc' && Array.isArray(doc.content) && doc.content.length
    ? doc : emptyDocument()
}
export function hasEditableContent(doc: EditableDocument | null | undefined): boolean {
  return (doc?.content ?? []).some((block) => block.type === 'image' || block.content?.some((node) =>
    node.type === 'inlineMath' ? Boolean(node.attrs.latex.trim()) : node.type === 'text' && Boolean(node.text.trim())))
}
export const assetUrl = (path: string): string => `app://projects/${path.replace(/^projects\//, '').split('/').map(encodeURIComponent).join('/')}`

export interface EditableApi {
  getEditableQuestion(questionId: number): Promise<EditableQuestionDTO>
  saveQuestionEdits(questionId: number, input: SaveQuestionEditsInput): Promise<EditableQuestionDTO>
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
