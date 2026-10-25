import type { DB } from '../StorageService'
import type { BankQuestionDTO } from '../../../shared/types'
import type {
  ContentRecognition, ContentRevisionDTO, EditableBlock, EditableDocument, EditableInline, EditableQuestionDTO,
  QuestionAssetDTO, QuestionContentDTO, QuestionContentInput
} from '../../../shared/editable'
import { hasEditableContent } from '../../../shared/editable'
import { initializeQuestionIdSequence } from './questionRepo'

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
const MAX_BLOCKS = 2000
const MAX_INLINE_NODES = 20000
const MAX_TEXT_LENGTH = 500000

/** 独立于原题图的内容与追加式版本记录；建表可重复执行。 */
export function initializeContentStorage(db: DB): void {
  initializeQuestionIdSequence(db)
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_contents (
      question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision > 0),
      content_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS question_content_revisions (
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision > 0),
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(question_id, revision)
    );
    CREATE TABLE IF NOT EXISTS question_assets (
      id TEXT PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      width_px INTEGER NOT NULL CHECK(width_px > 0),
      height_px INTEGER NOT NULL CHECK(height_px > 0),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_question_assets_question ON question_assets(question_id);
  `)
}

function positiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${label}无效`)
}

/** 编辑器仅接收已入库的题目卷题目，拒绝答案切块和未完成占位题。 */
export function requireEditableQuestion(db: DB, questionId: number): BankQuestionDTO {
  positiveInteger(questionId, '题目编号')
  const question = db.prepare(`
    SELECT q.id, q.paper_id, q.order_in_paper, q.type_id, q.chapter_id, q.difficulty_id,
      q.is_merged, q.image_path, q.width_px, q.height_px, q.year_override, q.source_override,
      COALESCE(q.year_override, p.year) AS effective_year,
      COALESCE(q.source_override, p.source) AS effective_source,
      q.answer_image_path, q.answer_width_px, q.answer_height_px, p.name AS paper_name
    FROM questions q JOIN papers p ON p.id = q.paper_id
    WHERE q.id = ? AND p.kind = 'paper' AND NULLIF(q.image_path, '') IS NOT NULL
  `).get(questionId) as BankQuestionDTO | undefined
  if (!question) throw new Error('题目不存在或尚未入库，请返回题库重新选择')
  return question
}

type ContentRow = { revision: number; content_json: string; updated_at: string }

function contentDto(db: DB, questionId: number, row: ContentRow): QuestionContentDTO {
  let input: QuestionContentInput
  try {
    input = validateQuestionContent(db, questionId, JSON.parse(row.content_json))
  } catch {
    throw new Error('可编辑内容记录损坏，请保留原数据并联系维护者')
  }
  return { ...input, questionId, revision: row.revision, updatedAt: row.updated_at }
}

export function getQuestionContent(db: DB, questionId: number): QuestionContentDTO | null {
  requireEditableQuestion(db, questionId)
  const row = db.prepare('SELECT revision, content_json, updated_at FROM question_contents WHERE question_id = ?')
    .get(questionId) as ContentRow | undefined
  return row ? contentDto(db, questionId, row) : null
}

export function listQuestionAssets(db: DB, questionId: number): QuestionAssetDTO[] {
  requireEditableQuestion(db, questionId)
  return db.prepare(`SELECT id, question_id AS questionId, path, width_px AS widthPx,
    height_px AS heightPx, name FROM question_assets WHERE question_id = ? ORDER BY created_at, id`)
    .all(questionId) as QuestionAssetDTO[]
}

export function getEditableQuestion(db: DB, questionId: number): EditableQuestionDTO {
  return {
    question: requireEditableQuestion(db, questionId),
    content: getQuestionContent(db, questionId),
    assets: listQuestionAssets(db, questionId)
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效`)
  return value as Record<string, unknown>
}

function validText(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`${label}为空或超出长度限制`)
  // Word XML 不能携带控制字符或不完整的 UTF-16 代理项。
  for (const character of value) {
    const cp = character.codePointAt(0)!
    if ((cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0xfffe || cp === 0xffff) {
      throw new Error(`${label}包含无法保存的控制字符，请删除后重试`)
    }
  }
  return value
}

function validateRecognition(db: DB, questionId: number, raw: unknown): QuestionContentInput['recognition'] {
  if (raw === undefined) return undefined
  const value = object(raw, '识别来源')
  const result: NonNullable<QuestionContentInput['recognition']> = {}
  for (const part of ['question', 'answer'] as const) {
    if (value[part] === undefined) continue
    const entry = object(value[part], '识别来源')
    if (typeof entry.jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(entry.jobId) ||
      typeof entry.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sourceFingerprint) ||
      (entry.reviewState !== 'reviewed' && entry.reviewState !== 'needs_review')) throw new Error('识别来源格式无效')
    positiveInteger(entry.candidateRevision, '识别候选版本')
    if (entry.reviewConfirmedRevision !== undefined) positiveInteger(entry.reviewConfirmedRevision, '校对确认版本')
    const source = db.prepare(`SELECT j.question_id, j.part, j.source_fingerprint FROM ocr_jobs j
      JOIN ocr_candidate_revisions c ON c.job_id = j.id AND c.revision = ? WHERE j.id = ? AND j.provider = 'doc2x'`)
      .get(entry.candidateRevision, entry.jobId) as { question_id: number; part: string; source_fingerprint: string } | undefined
    if (!source || source.question_id !== questionId || source.part !== part || source.source_fingerprint !== entry.sourceFingerprint) {
      throw new Error('识别来源不属于这道题目或对应部分，无法保存')
    }
    result[part] = { jobId: entry.jobId, candidateRevision: entry.candidateRevision,
      sourceFingerprint: entry.sourceFingerprint, reviewState: entry.reviewState,
      ...(entry.reviewConfirmedRevision !== undefined ? { reviewConfirmedRevision: entry.reviewConfirmedRevision as number } : {}) }
  }
  return Object.keys(result).length ? result : undefined
}

/** 不存储任意 HTML / URL，只保留共用文档契约内的数据。 */
export function validateQuestionContent(
  db: DB, questionId: number, input: unknown, options: { allowIncomplete?: boolean } = {}
): QuestionContentInput {
  const value = object(input, '题目内容')
  if (value.schemaVersion !== 1) throw new Error('可编辑内容版本不受支持')
  if ((value.questionMode !== 'original' && value.questionMode !== 'editable') || (value.answerMode !== 'original' && value.answerMode !== 'editable')) {
    throw new Error('题目或答案的导出方式无效')
  }
  const assetIds = new Set(listQuestionAssets(db, questionId).map((asset) => asset.id))
  let textLength = 0
  let inlineCount = 0
  const documentText = (raw: unknown, limit: number, label: string): string => {
    if (!options.allowIncomplete) return validText(raw, limit, label)
    if (typeof raw !== 'string' || raw.length > limit) throw new Error(`${label}格式无效或超出长度限制`)
    return raw
  }
  const countText = (text: string): void => {
    textLength += text.length
    if (textLength > MAX_TEXT_LENGTH) throw new Error('题目内容过长，请精简后保存')
  }
  const document = (raw: unknown, label: string): EditableDocument => {
    const doc = object(raw, label)
    if (doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length > MAX_BLOCKS) {
      throw new Error(`${label}格式无效或段落过多（最多 ${MAX_BLOCKS} 个）`)
    }
    const content: EditableBlock[] = Array.from(doc.content, (rawBlock: unknown): EditableBlock => {
      const block = object(rawBlock, '段落')
      if (block.type === 'paragraph') {
        if (block.content !== undefined && !Array.isArray(block.content)) throw new Error('段落内容格式无效')
        const nodes = (block.content ?? []) as unknown[]
        inlineCount += nodes.length
        if (inlineCount > MAX_INLINE_NODES) throw new Error('题目内容过长，请分成多道题目')
        const inline: EditableInline[] = Array.from(nodes, (rawNode: unknown): EditableInline => {
          const node = object(rawNode, '段落内容')
          if (node.type === 'hardBreak') return { type: 'hardBreak' }
          if (node.type === 'inlineMath') {
            const attrs = object(node.attrs, '公式')
            const rawLatex = documentText(attrs.latex, 8192, '公式')
            const latex = options.allowIncomplete ? rawLatex : rawLatex.trim()
            if (!options.allowIncomplete && !latex) throw new Error('公式不能为空，请补充公式或删除空公式')
            countText(latex)
            return { type: 'inlineMath', attrs: { latex } }
          }
          if (node.type !== 'text') throw new Error('段落包含不支持的内容，请只使用文字、公式和换行')
          const text = documentText(node.text, MAX_TEXT_LENGTH, '文字')
          countText(text)
          if (node.marks !== undefined && (!Array.isArray(node.marks) || node.marks.length > 2)) throw new Error('文字格式无效')
          const marks: { type: 'bold' | 'italic' }[] = []
          for (const rawMark of (node.marks ?? []) as unknown[]) {
            const mark = object(rawMark, '文字样式')
            if (mark.type !== 'bold' && mark.type !== 'italic') throw new Error('不支持的文字样式')
            if (!marks.some((item) => item.type === mark.type)) marks.push({ type: mark.type })
          }
          return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
        })
        return inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }
      }
      if (block.type === 'image') {
        const attrs = object(block.attrs, '配图')
        if (typeof attrs.assetId !== 'string' || !assetIds.has(attrs.assetId)) throw new Error('配图不属于这道题目，请重新添加配图')
        if (typeof attrs.widthPercent !== 'number' || !Number.isFinite(attrs.widthPercent) || attrs.widthPercent < 5 || attrs.widthPercent > 100) {
          throw new Error('配图宽度应在 5% 到 100% 之间')
        }
        if (attrs.align !== 'left' && attrs.align !== 'center' && attrs.align !== 'right') throw new Error('配图对齐方式无效')
        const caption = documentText(attrs.caption, 2000, '图注')
        countText(caption)
        return { type: 'image', attrs: { assetId: attrs.assetId, widthPercent: attrs.widthPercent, align: attrs.align, caption } }
      }
      throw new Error('文档包含不支持的段落类型')
    })
    return { type: 'doc', content }
  }
  const result: QuestionContentInput = {
    schemaVersion: 1,
    questionMode: value.questionMode as QuestionContentInput['questionMode'],
    answerMode: value.answerMode as QuestionContentInput['answerMode'],
    questionBody: document(value.questionBody, '题干'),
    answerBody: document(value.answerBody, '答案')
  }
  const recognition = validateRecognition(db, questionId, value.recognition)
  if (recognition) result.recognition = recognition
  if (textLength > MAX_TEXT_LENGTH || Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new Error('题目内容过长，请精简后保存')
  }
  if (!options.allowIncomplete && result.questionMode === 'editable' && !hasEditableContent(result.questionBody)) throw new Error('题干没有可编辑内容，请输入内容或选择使用原图')
  if (!options.allowIncomplete && result.answerMode === 'editable' && !hasEditableContent(result.answerBody)) throw new Error('答案没有可编辑内容，请输入内容或选择使用原图')
  return result
}

/** 恢复草稿允许未完成输入，但仍受文档大小、节点类型和本题配图归属约束。 */
export function validateRecoveryDraft(db: DB, questionId: number, input: unknown): QuestionContentInput {
  return validateQuestionContent(db, questionId, input, { allowIncomplete: true })
}

export function saveQuestionContent(
  db: DB, questionId: number, input: QuestionContentInput, expectedRevision: number,
  options: { restoreMetadata?: boolean } = {}
): QuestionContentDTO {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error('当前版本号无效，请重新打开编辑器')
  return db.transaction(() => {
    requireEditableQuestion(db, questionId)
    const current = db.prepare('SELECT revision, content_json, updated_at FROM question_contents WHERE question_id = ?').get(questionId) as ContentRow | undefined
    if ((current?.revision ?? 0) !== expectedRevision) throw new Error('该题已在其他窗口更新；请先复制尚未保存的文字，再重新打开题目，避免覆盖新版本')
    const content = validateQuestionContent(db, questionId, input)
    const revision = expectedRevision + 1
    const previous = current ? contentDto(db, questionId, current) : null
    const recognition: NonNullable<QuestionContentInput['recognition']> = {}
    for (const part of ['question', 'answer'] as const) {
      const prior = previous?.recognition?.[part]
      // 输入是完整编辑稿快照。恢复到识别前的草稿时，缺少来源就是无来源，不能继承后来版本。
      const source = content.recognition?.[part]
      if (!source) continue
      const bodyKey = part === 'question' ? 'questionBody' : 'answerBody'
      const changed = JSON.stringify(content[bodyKey]) !== JSON.stringify(previous?.[bodyKey])
      const sameOrigin = prior?.jobId === source.jobId && prior.candidateRevision === source.candidateRevision && prior.sourceFingerprint === source.sourceFingerprint
      const confirmed = source.reviewConfirmedRevision === revision
      const stillReviewed = prior?.reviewState === 'reviewed' && !changed && sameOrigin
      const reviewed = source.reviewState === 'reviewed' && (options.restoreMetadata || confirmed || stillReviewed)
      const metadata: ContentRecognition = { jobId: source.jobId, candidateRevision: source.candidateRevision,
        sourceFingerprint: source.sourceFingerprint, reviewState: reviewed ? 'reviewed' : 'needs_review' }
      if (reviewed) metadata.reviewConfirmedRevision = revision
      recognition[part] = metadata
    }
    if (Object.keys(recognition).length) content.recognition = recognition
    else delete content.recognition
    const json = JSON.stringify(content)
    if (Buffer.byteLength(json, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('题目内容过长，请精简后保存')
    const updatedAt = new Date().toISOString()
    db.prepare(`INSERT INTO question_content_revisions (question_id, revision, content_json, created_at) VALUES (?, ?, ?, ?)`)
      .run(questionId, revision, json, updatedAt)
    db.prepare(`INSERT INTO question_contents (question_id, revision, content_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET revision = excluded.revision, content_json = excluded.content_json, updated_at = excluded.updated_at`)
      .run(questionId, revision, json, updatedAt)
    return { ...content, questionId, revision, updatedAt }
  })()
}

export function listContentRevisions(db: DB, questionId: number): ContentRevisionDTO[] {
  requireEditableQuestion(db, questionId)
  return db.prepare(`SELECT revision, created_at AS createdAt,
    json_extract(content_json, '$.questionMode') AS questionMode,
    json_extract(content_json, '$.answerMode') AS answerMode
    FROM question_content_revisions WHERE question_id = ? ORDER BY revision DESC`)
    .all(questionId) as ContentRevisionDTO[]
}

export function getContentRevision(db: DB, questionId: number, revision: number): QuestionContentDTO {
  requireEditableQuestion(db, questionId)
  positiveInteger(revision, '历史版本号')
  const row = db.prepare('SELECT revision, content_json, created_at AS updated_at FROM question_content_revisions WHERE question_id = ? AND revision = ?')
    .get(questionId, revision) as ContentRow | undefined
  if (!row) throw new Error('找不到该历史版本')
  return contentDto(db, questionId, row)
}

export function restoreContentRevision(db: DB, questionId: number, revision: number, expectedRevision: number): QuestionContentDTO {
  // 恢复仍调用保存链路，保留当前版本及此前所有版本。
  return db.transaction(() => saveQuestionContent(db, questionId, getContentRevision(db, questionId, revision), expectedRevision, { restoreMetadata: true }))()
}

export function insertQuestionAsset(db: DB, asset: QuestionAssetDTO): void {
  requireEditableQuestion(db, asset.questionId)
  db.prepare(`INSERT INTO question_assets (id, question_id, path, width_px, height_px, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(asset.id, asset.questionId, asset.path, asset.widthPx, asset.heightPx, asset.name, new Date().toISOString())
}
