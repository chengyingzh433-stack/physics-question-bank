import type { QuestionMetadataInput } from './editable'
import type { OcrCrop } from './ocr'

export type IntakeRole = 'question' | 'stem' | 'option' | 'answer' | 'analysis' | 'figure' | 'answerFigure'
export type IntakeStatus = 'editing' | 'reviewing' | 'published' | 'archived'
export interface IntakeSource {
  id: string; name: string; kind: 'image' | 'pdf' | 'docx'; originalPath: string; previewPath: string
  bytes: number; warning: string | null
}
export interface IntakeViewport { page: number; zoom: number; left: number; top: number }
export type IntakeInheritance = Record<keyof QuestionMetadataInput, boolean>
export const defaultIntakeInheritance = (): IntakeInheritance => ({ source: true, year: true, typeId: false, chapterId: false, difficultyId: false, knowledgePointIds: false })
export const intakeInheritanceLabels: Record<keyof QuestionMetadataInput, string> = { source: '来源', year: '年份', typeId: '题型', chapterId: '章节', difficultyId: '难度', knowledgePointIds: '知识点' }
export interface IntakeContext { activeSourceId: string | null; views: Record<string, IntakeViewport>; inherit: IntakeInheritance }
export const emptyIntakeContext = (): IntakeContext => ({ activeSourceId: null, views: {}, inherit: defaultIntakeInheritance() })
export interface IntakeComponent {
  id: string; role: IntakeRole; label: string; text: string; assetId: string | null
  /** Original selection for adopted local text; excluded from editable body. */
  textSourceAssetId?: string
}
export interface IntakeAsset {
  id: string; path: string; width: number; height: number
  sourceId: string | null; page: number | null; crop: OcrCrop | null
}
export interface IntakeDraft {
  id: string; paperId: number; questionId: number; title: string; revision: number; status: IntakeStatus
  context: IntakeContext; inherited: QuestionMetadataInput | null
  sources: IntakeSource[]; components: IntakeComponent[]; assets: IntakeAsset[]; updatedAt: string
}
export interface IntakeSummary {
  id: string; title: string; status: IntakeStatus; questionId: number; updatedAt: string; componentCount: number
}
export interface IntakeApi {
  saveIntakeContext(id: string, context: IntakeContext): Promise<void>
  nextIntakeDraft(id: string, inherit: IntakeInheritance): Promise<IntakeDraft>
  listIntakeSession(id: string): Promise<IntakeSummary[]>
  listIntakeDrafts(): Promise<IntakeSummary[]>
  createIntakeDraft(copyFrom?: string, includeComponents?: boolean): Promise<IntakeDraft>
  getIntakeDraft(id: string): Promise<IntakeDraft>
  getIntakeForQuestion(questionId: number): Promise<IntakeDraft | null>
  saveIntakeDraft(id: string, revision: number, title: string, components: IntakeComponent[]): Promise<IntakeDraft>
  importIntakeFiles(id: string): Promise<{ draft: IntakeDraft; errors: string[] }>
  importIntakeFile(id: string, file: File): Promise<IntakeDraft>
  importIntakeBytes(id: string, data: ArrayBuffer, name: string): Promise<IntakeDraft>
  pasteIntakeClipboard(id: string): Promise<{ draft: IntakeDraft; text: string | null }>
  addIntakeCrop(id: string, sourceId: string, page: number, crop: OcrCrop | null, data: ArrayBuffer): Promise<IntakeAsset>
  prepareIntakeQuestion(id: string, revision: number, question: ArrayBuffer, answer: ArrayBuffer | null): Promise<IntakeDraft>
  publishIntakeQuestion(id: string, contentRevision: number, confirmed: boolean): Promise<IntakeDraft>
  archiveIntakeDraft(id: string, revision: number, archived: boolean): Promise<IntakeDraft>
  revealIntakeSource(id: string, sourceId: string): Promise<void>
}
