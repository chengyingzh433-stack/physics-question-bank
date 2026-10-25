import type { EditableDocument, QuestionContentInput, QuestionAssetDTO } from './editable'

export type OcrPart = 'question' | 'answer'
export type OcrJobStatus = 'submitting' | 'processing' | 'paused' | 'unknown' | 'failed' | 'ready'
export interface OcrCrop { x: number; y: number; width: number; height: number } // fractions of original pixels, 0..1
export interface OcrSettingsDTO {
  enabled: boolean
  hasKey: boolean
  remembered: boolean
  secureStorageAvailable: boolean
  keyError?: string
}
export interface OcrSettingsInput { enabled: boolean; apiKey?: string; remember?: boolean; clearKey?: boolean }
export interface OcrPreparedInput {
  token: string
  questionId: number
  part: OcrPart
  previewDataUrl: string
  bytes: number
  width: number
  height: number
  sourceFingerprint: string
  crop: OcrCrop | null
  scale: number
}
export interface OcrStartInput {
  inputToken: string
  expectedRevision: number
  draftFingerprint: string
  confirmed: true
}
export interface OcrJobDTO {
  id: string
  questionId: number
  part: OcrPart
  status: OcrJobStatus
  remoteUid: string | null
  sourceFingerprint: string
  inputFingerprint: string
  inputImagePath: string
  crop: OcrCrop | null
  scale: number
  baseRevision: number
  draftFingerprint: string
  error: string | null
  createdAt: string
  updatedAt: string
}
export interface OcrIssue {
  id: string
  kind: 'table' | 'missing_image' | 'formula' | 'unsupported' | 'conversion'
  message: string
  original: string
  resolution: string // empty until the user records how it was handled
}
export interface OcrCandidateDTO {
  jobId: string
  questionId: number
  part: OcrPart
  revision: number
  rawMarkdown: string
  document: EditableDocument
  issues: OcrIssue[]
  reviewed: boolean
  discarded: boolean
  createdAt: string
  updatedAt: string
}
export interface OcrCandidateInput {
  document: EditableDocument; issues: OcrIssue[]; reviewed: boolean
  reviewConfirmedRevision?: number
}
export interface OcrSourceDTO { sourceFingerprint: string; imagePath: string }
export interface OcrRecoveryDTO {
  id: string
  questionId: number
  content: QuestionContentInput
  reason: string
  createdAt: string
}
export interface OcrAdoptInput {
  jobId: string
  candidateRevision: number
  mode: 'replace' | 'append'
  currentContent: QuestionContentInput
  expectedRevision: number
  acceptSourceChange?: boolean
  confirmedSourceFingerprint?: string
  acceptDraftChange?: boolean
}
export interface OcrAdoptResult { content: QuestionContentInput; recoveryId: string }
/** Identical in renderer/main; a bounded content snapshot string, never a secret. */
export function ocrDraftFingerprint(content: QuestionContentInput): string {
  return JSON.stringify({ schemaVersion: content.schemaVersion, questionMode: content.questionMode,
    answerMode: content.answerMode, questionBody: content.questionBody, answerBody: content.answerBody,
    recognition: content.recognition ?? {} })
}
export interface OcrApi {
  getOcrSettings(): Promise<OcrSettingsDTO>
  saveOcrSettings(input: OcrSettingsInput): Promise<OcrSettingsDTO>
  prepareOcrInput(questionId: number, part: OcrPart, crop: OcrCrop | null, scale: number): Promise<OcrPreparedInput>
  startOcrJob(input: OcrStartInput): Promise<OcrJobDTO>
  listOcrJobs(questionId: number): Promise<OcrJobDTO[]>
  pauseOcrJob(jobId: string): Promise<OcrJobDTO>
  resumeOcrJob(jobId: string): Promise<OcrJobDTO>
  getOcrCandidate(jobId: string): Promise<OcrCandidateDTO | null>
  getOcrSource(jobId: string): Promise<OcrSourceDTO>
  saveOcrCandidate(jobId: string, input: OcrCandidateInput, expectedRevision: number): Promise<OcrCandidateDTO>
  discardOcrCandidate(jobId: string, expectedRevision: number): Promise<void>
  adoptOcrCandidate(input: OcrAdoptInput): Promise<OcrAdoptResult>
  listOcrRecoveries(questionId: number): Promise<OcrRecoveryDTO[]>
  createOcrRecovery(questionId: number, content: QuestionContentInput, reason: string): Promise<OcrRecoveryDTO>
  listOcrAssets(questionId: number): Promise<QuestionAssetDTO[]>
  openDoc2xConsole(): Promise<void>
}
