import { createHash, randomUUID } from 'node:crypto'
import type { DB } from '../StorageService'
import type {
  OcrAdoptInput, OcrAdoptResult, OcrCandidateDTO, OcrCandidateInput, OcrCrop,
  OcrIssue, OcrJobDTO, OcrJobStatus, OcrPart, OcrRecoveryDTO
} from '../../../shared/ocr'
import { ocrDraftFingerprint } from '../../../shared/ocr'
import type { EditableDocument, QuestionContentInput } from '../../../shared/editable'
import { emptyDocument, hasEditableContent } from '../../../shared/editable'
import { getQuestionContent, requireEditableQuestion, validateRecoveryDraft } from './contentRepo'

const STATUSES: readonly OcrJobStatus[] = ['submitting', 'processing', 'paused', 'unknown', 'failed', 'ready']
const MAX_DRAFT_BYTES = 2 * 1024 * 1024
const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024
const MAX_ISSUES_BYTES = 4 * 1024 * 1024
const now = (): string => new Date().toISOString()

/** OCR 的候选和恢复草稿独立于正式内容，不自动建立正式版本。 */
export function initializeOcrStorage(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ocr_jobs (
      id TEXT PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'doc2x' CHECK(provider = 'doc2x'),
      part TEXT NOT NULL CHECK(part IN ('question', 'answer')),
      status TEXT NOT NULL CHECK(status IN ('submitting', 'processing', 'paused', 'unknown', 'failed', 'ready')),
      remote_uid TEXT,
      source_fingerprint TEXT NOT NULL,
      input_fingerprint TEXT NOT NULL,
      input_image_path TEXT NOT NULL,
      crop_json TEXT,
      scale REAL NOT NULL,
      base_revision INTEGER NOT NULL,
      draft_fingerprint TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ocr_jobs_question ON ocr_jobs(question_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status);
    CREATE TABLE IF NOT EXISTS ocr_candidates (
      job_id TEXT PRIMARY KEY REFERENCES ocr_jobs(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision > 0),
      raw_markdown TEXT NOT NULL,
      document_json TEXT NOT NULL,
      issues_json TEXT NOT NULL,
      reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0, 1)),
      discarded INTEGER NOT NULL DEFAULT 0 CHECK(discarded IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ocr_candidate_revisions (
      job_id TEXT NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision > 0),
      document_json TEXT NOT NULL,
      issues_json TEXT NOT NULL,
      reviewed INTEGER NOT NULL,
      discarded INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(job_id, revision)
    );
    CREATE TABLE IF NOT EXISTS ocr_recovery_drafts (
      id TEXT PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      content_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ocr_recovery_question ON ocr_recovery_drafts(question_id, created_at);
  `)
  const columns = db.prepare('PRAGMA table_info(ocr_jobs)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'provider')) db.exec("ALTER TABLE ocr_jobs ADD COLUMN provider TEXT NOT NULL DEFAULT 'doc2x'")
  // 重开不自动重传或查询。没有远端任务号的提交只能标为状态不明。
  db.prepare(`UPDATE ocr_jobs SET status = CASE WHEN remote_uid IS NULL THEN 'unknown' ELSE 'paused' END,
    error = CASE WHEN remote_uid IS NULL THEN '应用关闭时提交尚未确认，远端可能已创建任务。请确认后再决定是否重新识别。'
      ELSE '上次等待已停止，可继续查询原任务；不会重新上传图片。' END,
    updated_at = ? WHERE status IN ('submitting', 'processing')`).run(now())
}

function positive(value: unknown, label: string, allowZero = false): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) throw new Error(`${label}无效`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效`)
  return value as Record<string, unknown>
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`${label}格式无效或长度超限`)
  return value
}

function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new Error('识别记录编号无效')
}

function fingerprint(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label}无效`)
}

function part(value: unknown): asserts value is OcrPart {
  if (value !== 'question' && value !== 'answer') throw new Error('识别对象无效，请选择题干或答案')
}

function draftHash(value: string): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_DRAFT_BYTES) throw new Error('当前编辑稿过长，无法建立识别保护记录')
  return createHash('sha256').update(value).digest('hex')
}

function validateCrop(value: unknown): OcrCrop | null {
  if (value === null) return null
  const crop = record(value, '识别选区')
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof crop[key] !== 'number' || !Number.isFinite(crop[key]) || crop[key] < 0 || crop[key] > 1) throw new Error('识别选区必须位于原图内')
  }
  const { x, y, width, height } = crop as unknown as OcrCrop
  if (width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error('识别选区必须位于原图内且不能为空')
  return { x, y, width, height }
}

type JobRow = {
  id: string; question_id: number; part: OcrPart; status: OcrJobStatus; remote_uid: string | null;
  source_fingerprint: string; input_fingerprint: string; input_image_path: string; crop_json: string | null;
  scale: number; base_revision: number; draft_fingerprint: string; error: string | null; created_at: string; updated_at: string
}

function jobDto(row: JobRow): OcrJobDTO {
  return { id: row.id, questionId: row.question_id, part: row.part, status: row.status, remoteUid: row.remote_uid,
    sourceFingerprint: row.source_fingerprint, inputFingerprint: row.input_fingerprint, inputImagePath: row.input_image_path,
    crop: row.crop_json ? JSON.parse(row.crop_json) as OcrCrop : null, scale: row.scale, baseRevision: row.base_revision,
    draftFingerprint: row.draft_fingerprint, error: row.error, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function getOcrJob(db: DB, jobId: string): OcrJobDTO {
  id(jobId)
  const row = db.prepare('SELECT * FROM ocr_jobs WHERE id = ?').get(jobId) as JobRow | undefined
  if (!row) throw new Error('识别任务不存在，题目可能已被删除')
  requireEditableQuestion(db, row.question_id)
  return jobDto(row)
}

export function listOcrJobs(db: DB, questionId: number): OcrJobDTO[] {
  requireEditableQuestion(db, questionId)
  return (db.prepare('SELECT * FROM ocr_jobs WHERE question_id = ? ORDER BY created_at DESC, id DESC').all(questionId) as JobRow[]).map(jobDto)
}

export function listActiveOcrJobs(db: DB): OcrJobDTO[] {
  return (db.prepare("SELECT * FROM ocr_jobs WHERE status IN ('submitting', 'processing') ORDER BY created_at").all() as JobRow[]).map(jobDto)
}

export function createOcrJob(db: DB, input: Omit<OcrJobDTO, 'id' | 'createdAt' | 'updatedAt'>): OcrJobDTO {
  return db.transaction(() => {
    const question = requireEditableQuestion(db, input.questionId)
    part(input.part)
    if (input.status !== 'submitting') throw new Error('新识别任务必须从提交状态开始')
    if (listActiveOcrJobs(db).length) throw new Error('已有识别任务正在提交或等待，请先处理该任务')
    fingerprint(input.sourceFingerprint, '原图指纹')
    fingerprint(input.inputFingerprint, '提交图片指纹')
    positive(input.baseRevision, '正式内容版本', true)
    const current = getQuestionContent(db, input.questionId)
    if ((current?.revision ?? 0) !== input.baseRevision) throw new Error('OCR_REVISION_CONFLICT: 题目已更新，请重新读取后再识别')
    if (input.remoteUid !== null) throw new Error('新任务不能带有旧远端任务号')
    if (typeof input.scale !== 'number' || !Number.isFinite(input.scale) || input.scale <= 0 || input.scale > 1) throw new Error('识别图片缩放比例无效')
    const imagePath = boundedText(input.inputImagePath, 240, '识别图片位置')
    if (!new RegExp(`^${question.paper_id}/(?:images|ocr)/[A-Za-z0-9_.-]+\\.png$`).test(imagePath) || imagePath.includes('..')) throw new Error('识别图片必须保存在本题所属试卷目录')
    const asset = db.prepare('SELECT question_id FROM question_assets WHERE path = ?').get(imagePath) as { question_id: number } | undefined
    if (imagePath.includes('/images/') && (!asset || asset.question_id !== input.questionId)) throw new Error('识别图片不属于当前题目')
    const crop = validateCrop(input.crop)
    const timestamp = now()
    const job: OcrJobDTO = { ...input, id: randomUUID(), crop, remoteUid: null, error: null,
      draftFingerprint: draftHash(input.draftFingerprint), createdAt: timestamp, updatedAt: timestamp }
    db.prepare(`INSERT INTO ocr_jobs (id, question_id, part, status, remote_uid, source_fingerprint,
      input_fingerprint, input_image_path, crop_json, scale, base_revision, draft_fingerprint, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(job.id, job.questionId, job.part, job.status, job.remoteUid, job.sourceFingerprint, job.inputFingerprint,
        job.inputImagePath, crop ? JSON.stringify(crop) : null, job.scale, job.baseRevision, job.draftFingerprint,
        null, timestamp, timestamp)
    return job
  })()
}

export function updateOcrJob(db: DB, jobId: string, patch: { status?: OcrJobStatus; remoteUid?: string | null; error?: string | null }): OcrJobDTO {
  return db.transaction(() => {
    const job = getOcrJob(db, jobId)
    const status = patch.status ?? job.status
    if (!STATUSES.includes(status)) throw new Error('识别任务状态无效')
    const remoteUid = patch.remoteUid === undefined ? job.remoteUid : patch.remoteUid
    if (remoteUid !== null && (!boundedText(remoteUid, 200, '远端任务号').trim() || /[\u0000-\u0020]/.test(remoteUid))) throw new Error('远端任务号无效')
    if (job.remoteUid && remoteUid !== job.remoteUid) throw new Error('不能更换已有识别任务的远端任务号')
    if (status === 'processing' && !remoteUid) throw new Error('缺少远端任务号，无法继续查询')
    if ((status === 'submitting' || status === 'processing') && listActiveOcrJobs(db).some((entry) => entry.id !== jobId)) throw new Error('已有另一个识别任务正在处理')
    const error = patch.error === undefined ? job.error : patch.error
    if (error !== null) boundedText(error, 4000, '识别错误说明')
    db.prepare('UPDATE ocr_jobs SET status = ?, remote_uid = ?, error = ?, updated_at = ? WHERE id = ?').run(status, remoteUid, error, now(), jobId)
    return getOcrJob(db, jobId)
  })()
}

type CandidateRow = {
  job_id: string; revision: number; raw_markdown: string; document_json: string; issues_json: string;
  reviewed: number; discarded: number; created_at: string; updated_at: string
}

function candidateDto(job: OcrJobDTO, row: CandidateRow): OcrCandidateDTO {
  return { jobId: job.id, questionId: job.questionId, part: job.part, revision: row.revision,
    rawMarkdown: row.raw_markdown, document: JSON.parse(row.document_json) as EditableDocument,
    issues: JSON.parse(row.issues_json) as OcrIssue[], reviewed: Boolean(row.reviewed), discarded: Boolean(row.discarded),
    createdAt: row.created_at, updatedAt: row.updated_at }
}

export function getOcrCandidate(db: DB, jobId: string): OcrCandidateDTO | null {
  const job = getOcrJob(db, jobId)
  const row = db.prepare('SELECT * FROM ocr_candidates WHERE job_id = ?').get(jobId) as CandidateRow | undefined
  return row ? candidateDto(job, row) : null
}

function validateDocument(db: DB, questionId: number, document: unknown): EditableDocument {
  return validateRecoveryDraft(db, questionId, { schemaVersion: 1, questionMode: 'original', answerMode: 'original',
    questionBody: document, answerBody: emptyDocument() }).questionBody
}

function validateIssues(raw: unknown): OcrIssue[] {
  if (!Array.isArray(raw) || raw.length > 500) throw new Error('识别待处理事项过多或格式无效')
  const seen = new Set<string>()
  const issues = Array.from(raw, (item): OcrIssue => {
    const issue = record(item, '待处理事项')
    const issueId = boundedText(issue.id, 120, '事项编号')
    if (!issueId || seen.has(issueId)) throw new Error('待处理事项编号重复或为空')
    seen.add(issueId)
    if (!['table', 'missing_image', 'formula', 'unsupported', 'conversion'].includes(issue.kind as string)) throw new Error('待处理事项类型无效')
    return { id: issueId, kind: issue.kind as OcrIssue['kind'], message: boundedText(issue.message, 4000, '事项说明'),
      original: boundedText(issue.original, 40000, '原始识别内容'), resolution: boundedText(issue.resolution, 4000, '处理决定') }
  })
  if (Buffer.byteLength(JSON.stringify(issues), 'utf8') > MAX_ISSUES_BYTES) throw new Error('识别待处理事项总长度超限')
  return issues
}

function appendCandidateRevision(db: DB, candidate: OcrCandidateDTO): void {
  db.prepare(`INSERT INTO ocr_candidate_revisions (job_id, revision, document_json, issues_json, reviewed, discarded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(candidate.jobId, candidate.revision, JSON.stringify(candidate.document),
      JSON.stringify(candidate.issues), candidate.reviewed ? 1 : 0, candidate.discarded ? 1 : 0, candidate.updatedAt)
}

/** 服务结果只首次入库；续查的重复响应不得覆盖用户已经校对的候选。 */
export function storeOcrCandidate(db: DB, jobId: string, input: { rawMarkdown: string; document: EditableDocument; issues: OcrIssue[] }): OcrCandidateDTO {
  return db.transaction(() => {
    const job = getOcrJob(db, jobId)
    const existing = getOcrCandidate(db, jobId)
    if (existing) {
      db.prepare("UPDATE ocr_jobs SET status = 'ready', error = NULL, updated_at = ? WHERE id = ?").run(now(), jobId)
      return existing
    }
    const rawMarkdown = boundedText(input.rawMarkdown, MAX_MARKDOWN_BYTES, '原始识别 Markdown')
    if (Buffer.byteLength(rawMarkdown, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('原始识别 Markdown 超过 4 MiB，未采用结果')
    const document = validateDocument(db, job.questionId, input.document)
    const issues = validateIssues(input.issues).map((issue) => ({ ...issue, resolution: '' }))
    const timestamp = now()
    const result: OcrCandidateDTO = { jobId, questionId: job.questionId, part: job.part, revision: 1,
      rawMarkdown, document, issues, reviewed: false, discarded: false, createdAt: timestamp, updatedAt: timestamp }
    db.prepare(`INSERT INTO ocr_candidates (job_id, revision, raw_markdown, document_json, issues_json,
      reviewed, discarded, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`)
      .run(jobId, result.revision, rawMarkdown, JSON.stringify(document), JSON.stringify(issues), timestamp, timestamp)
    appendCandidateRevision(db, result)
    db.prepare("UPDATE ocr_jobs SET status = 'ready', error = NULL, updated_at = ? WHERE id = ?").run(timestamp, jobId)
    return result
  })()
}

function persistCandidate(db: DB, result: OcrCandidateDTO): OcrCandidateDTO {
  db.prepare(`UPDATE ocr_candidates SET revision = ?, document_json = ?, issues_json = ?, reviewed = ?, discarded = ?, updated_at = ? WHERE job_id = ?`)
    .run(result.revision, JSON.stringify(result.document), JSON.stringify(result.issues), result.reviewed ? 1 : 0, result.discarded ? 1 : 0, result.updatedAt, result.jobId)
  appendCandidateRevision(db, result)
  return result
}

export function saveOcrCandidate(db: DB, jobId: string, input: OcrCandidateInput, expectedRevision: number): OcrCandidateDTO {
  return db.transaction(() => {
    positive(expectedRevision, '候选版本')
    const current = getOcrCandidate(db, jobId)
    if (!current) throw new Error('识别候选不存在或尚未返回')
    if (current.revision !== expectedRevision) throw new Error('候选已在其他位置修改，请重新读取后再保存')
    if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('候选版本号已达到上限')
    if (typeof input.reviewed !== 'boolean') throw new Error('候选校对状态无效')
    if (input.reviewConfirmedRevision !== undefined) positive(input.reviewConfirmedRevision, '候选校对确认版本')
    const document = validateDocument(db, current.questionId, input.document)
    const submitted = validateIssues(input.issues)
    // 转换问题的原文和类型不可被编辑器删除；用户只记录明确的处理决定。
    if (submitted.length !== current.issues.length) throw new Error('不能删除识别待处理事项，请逐项记录处理决定')
    const issues = current.issues.map((issue) => {
      const incoming = submitted.find((item) => item.id === issue.id)
      if (!incoming || incoming.kind !== issue.kind || incoming.original !== issue.original || incoming.message !== issue.message) throw new Error('识别待处理事项已改变，请重新读取候选')
      return { ...issue, resolution: incoming.resolution }
    })
    if (input.reviewed && issues.some((issue) => !issue.resolution.trim())) throw new Error('请先处理所有识别提示，再标记已校对')
    const changed = JSON.stringify(document) !== JSON.stringify(current.document) || JSON.stringify(issues) !== JSON.stringify(current.issues)
    const reviewed = input.reviewed && ((current.reviewed && !changed) || input.reviewConfirmedRevision === current.revision + 1)
    return persistCandidate(db, { ...current, document, issues, reviewed, discarded: false, revision: current.revision + 1, updatedAt: now() })
  })()
}

/** 丢弃只隐藏候选；历史、正文来源和已引用图片均保留。保存最新候选可重新启用。 */
export function discardOcrCandidate(db: DB, jobId: string, expectedRevision: number): void {
  db.transaction(() => {
    positive(expectedRevision, '候选版本')
    const current = getOcrCandidate(db, jobId)
    if (!current) throw new Error('识别候选不存在')
    if (current.revision !== expectedRevision) throw new Error('候选已改变，请重新读取后再丢弃')
    if (current.discarded) return
    if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('候选版本号已达到上限')
    persistCandidate(db, { ...current, discarded: true, revision: current.revision + 1, updatedAt: now() })
  })()
}

export function createOcrRecovery(db: DB, questionId: number, input: QuestionContentInput, reason: string): OcrRecoveryDTO {
  requireEditableQuestion(db, questionId)
  const content = validateRecoveryDraft(db, questionId, input)
  const description = boundedText(reason, 300, '恢复草稿说明').trim() || '替换编辑稿前的完整备份'
  const result: OcrRecoveryDTO = { id: randomUUID(), questionId, content, reason: description, createdAt: now() }
  db.prepare('INSERT INTO ocr_recovery_drafts (id, question_id, content_json, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(result.id, questionId, JSON.stringify(content), result.reason, result.createdAt)
  return result
}

export function listOcrRecoveries(db: DB, questionId: number): OcrRecoveryDTO[] {
  requireEditableQuestion(db, questionId)
  const rows = db.prepare('SELECT id, content_json, reason, created_at FROM ocr_recovery_drafts WHERE question_id = ? ORDER BY created_at DESC, id DESC')
    .all(questionId) as { id: string; content_json: string; reason: string; created_at: string }[]
  return rows.map((row) => ({ id: row.id, questionId, content: validateRecoveryDraft(db, questionId, JSON.parse(row.content_json)), reason: row.reason, createdAt: row.created_at }))
}

/** currentSourceFingerprint 必须由主进程服务实时读取原图获得，不接收渲染层提供的散列。 */
export function adoptOcrCandidate(db: DB, input: OcrAdoptInput, currentSourceFingerprint: string): OcrAdoptResult {
  return db.transaction(() => {
    const job = getOcrJob(db, input.jobId)
    const candidate = getOcrCandidate(db, job.id)
    positive(input.candidateRevision, '候选版本')
    positive(input.expectedRevision, '正式内容版本', true)
    if (input.expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error('正式内容版本号已达到上限')
    if (input.mode !== 'replace' && input.mode !== 'append') throw new Error('采用方式无效')
    if (input.acceptSourceChange !== undefined && typeof input.acceptSourceChange !== 'boolean') throw new Error('原图变更确认无效')
    if (input.acceptDraftChange !== undefined && typeof input.acceptDraftChange !== 'boolean') throw new Error('草稿变更确认无效')
    if (!candidate || candidate.discarded) throw new Error('识别候选不存在或已丢弃')
    if (candidate.revision !== input.candidateRevision) throw new Error('候选已改变，请重新读取并校对后再采用')
    if (candidate.issues.some((issue) => !issue.resolution.trim())) throw new Error('候选仍有未处理事项，请记录处理决定后再采用')
    if (!hasEditableContent(candidate.document)) throw new Error('候选正文为空，请补充内容后再采用')
    const current = getQuestionContent(db, job.questionId)
    if ((current?.revision ?? 0) !== input.expectedRevision) throw new Error('OCR_REVISION_CONFLICT: 正式题目已更新，请先保留当前草稿并重新读取')
    fingerprint(currentSourceFingerprint, '当前原图指纹')
    if (input.confirmedSourceFingerprint !== undefined) fingerprint(input.confirmedSourceFingerprint, '已确认原图指纹')
    if (currentSourceFingerprint !== job.sourceFingerprint && (!input.acceptSourceChange || input.confirmedSourceFingerprint !== currentSourceFingerprint)) {
      throw new Error('OCR_SOURCE_CHANGED: 原图已变化。请核对当前原图，再明确决定是否采用旧结果；此前的确认不能用于再次变化的原图')
    }
    const currentDraftHash = draftHash(ocrDraftFingerprint(input.currentContent))
    if ((job.baseRevision !== input.expectedRevision || job.draftFingerprint !== currentDraftHash) && !input.acceptDraftChange) {
      throw new Error('OCR_DRAFT_CHANGED: 当前稿与发起识别时不同。请确认采用方式；采用前会保留当前完整草稿')
    }
    const content = validateRecoveryDraft(db, job.questionId, input.currentContent)
    const recovery = createOcrRecovery(db, job.questionId, content, `采用识别候选前：${input.mode === 'replace' ? '替换' : '追加'}${job.part === 'question' ? '题干' : '答案'}`)
    const bodyKey = job.part === 'question' ? 'questionBody' : 'answerBody'
    const body: EditableDocument = input.mode === 'replace' ? candidate.document
      : { type: 'doc', content: [...content[bodyKey].content, ...candidate.document.content] }
    const reviewed = input.mode === 'replace' && candidate.reviewed && currentSourceFingerprint === job.sourceFingerprint
    const next: QuestionContentInput = { ...content, [bodyKey]: body, recognition: { ...content.recognition,
      [job.part]: { jobId: job.id, candidateRevision: candidate.revision, sourceFingerprint: job.sourceFingerprint,
        reviewState: reviewed ? 'reviewed' : 'needs_review', ...(reviewed ? { reviewConfirmedRevision: input.expectedRevision + 1 } : {}) } } }
    // 追加也受整题大小限制；不通过则连恢复快照一起回滚，编辑器原稿不动。
    return { content: validateRecoveryDraft(db, job.questionId, next), recoveryId: recovery.id }
  })()
}
