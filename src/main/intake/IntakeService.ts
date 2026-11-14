import { nativeImage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { mkdir, readFile, stat, writeFile, copyFile, rm } from 'node:fs/promises'
import { getDb, type DB } from '../storage/StorageService'
import { getProjectsRoot, imagesDir, ensurePaperDir } from '../files/FileService'
import { inspectImage } from '../files/ContentAssetService'
import { withStorageUse } from '../storage/activity'
import { createQuestionWithSegments } from '../storage/repositories/questionRepo'
import { getQuestionContent, insertQuestionAsset, saveQuestionContent } from '../storage/repositories/contentRepo'
import { emptyQuestionMetadata, newQuestionContent, type EditableBlock } from '../../shared/editable'
import { emptyIntakeContext, defaultIntakeInheritance } from '../../shared/intake'
import { getQuestionMetadata, saveQuestionMetadata } from '../storage/repositories/questionMetadataRepo'
import type { IntakeContext, IntakeInheritance, IntakeAsset, IntakeComponent, IntakeDraft, IntakeSource, IntakeSummary } from '../../shared/intake'
import type { OcrCrop } from '../../shared/ocr'
import { prepareDocxPreview } from './DocxPreview'

const busy = new Set<string>()
const roles = new Set(['question', 'stem', 'option', 'answer', 'analysis', 'figure', 'answerFigure'])
const now = () => new Date().toISOString()
interface DraftRow { id: string; paperId: number; questionId: number; title: string; revision: number; status: IntakeDraft['status']; components: string; updatedAt: string }
const selectDraft = `SELECT id, paper_id AS paperId, question_id AS questionId, title, revision, status, components_json AS components, updated_at AS updatedAt FROM intake_drafts`
export function initializeIntakeStorage(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS intake_sources (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, original_path TEXT NOT NULL,
    preview_path TEXT NOT NULL, bytes INTEGER NOT NULL, warning TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS intake_drafts (
    id TEXT PRIMARY KEY, paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
    title TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'editing',
    components_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS intake_draft_sources (
    draft_id TEXT NOT NULL REFERENCES intake_drafts(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES intake_sources(id), PRIMARY KEY(draft_id,source_id));
    CREATE TABLE IF NOT EXISTS intake_assets (
    id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES intake_drafts(id) ON DELETE CASCADE,
    path TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
    source_id TEXT REFERENCES intake_sources(id), page INTEGER, crop_json TEXT);
    CREATE TABLE IF NOT EXISTS intake_context (
      draft_id TEXT PRIMARY KEY REFERENCES intake_drafts(id) ON DELETE CASCADE, context_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS intake_next (
      previous_id TEXT PRIMARY KEY REFERENCES intake_drafts(id) ON DELETE CASCADE,
      next_id TEXT NOT NULL UNIQUE REFERENCES intake_drafts(id) ON DELETE CASCADE, inherited_json TEXT NOT NULL);`)
}
export function getDraft(id: string): IntakeDraft {
  const db = getDb(), row = db.prepare(`${selectDraft} WHERE id=?`).get(id) as DraftRow | undefined
  if (!row) throw new Error('录题草稿不存在，请返回录题工作台')
  const sources = db.prepare(`SELECT s.id,s.name,s.kind,s.original_path AS originalPath,s.preview_path AS previewPath,s.bytes,s.warning
    FROM intake_sources s JOIN intake_draft_sources ds ON ds.source_id=s.id WHERE ds.draft_id=? ORDER BY s.created_at,s.id`).all(id) as IntakeSource[]
  const assets = (db.prepare(`SELECT id,path,width,height,source_id AS sourceId,page,crop_json AS crop FROM intake_assets WHERE draft_id=?`).all(id) as (Omit<IntakeAsset, 'crop'> & { crop: string | null })[])
    .map((a) => ({ ...a, crop: a.crop ? JSON.parse(a.crop) as OcrCrop : null }))
  const state = db.prepare('SELECT context_json FROM intake_context WHERE draft_id=?').get(id) as { context_json: string } | undefined
  const prior = db.prepare('SELECT inherited_json FROM intake_next WHERE next_id=?').get(id) as { inherited_json: string } | undefined
  return { ...row, components: JSON.parse(row.components), sources, assets,
    context: state ? JSON.parse(state.context_json) : emptyIntakeContext(), inherited: prior ? JSON.parse(prior.inherited_json) : null }
}
export function draftForQuestion(questionId: number): IntakeDraft | null {
  const row = getDb().prepare('SELECT id FROM intake_drafts WHERE question_id=?').get(questionId) as { id: string } | undefined
  return row ? getDraft(row.id) : null
}
export function listDrafts(): IntakeSummary[] {
  return (getDb().prepare(`${selectDraft} ORDER BY updated_at DESC`).all() as DraftRow[]).map((r) => ({
    id: r.id, title: r.title, status: r.status, questionId: r.questionId, updatedAt: r.updatedAt, componentCount: (JSON.parse(r.components) as unknown[]).length
  }))
}
function editable(id: string, revision?: number): IntakeDraft {
  const draft = getDraft(id)
  if (draft.status !== 'editing') throw new Error('此稿已生成校对快照或已归档。请复制成新草稿后重组，原稿会保留。')
  if (revision !== undefined && draft.revision !== revision) throw new Error('草稿已在其他窗口修改，请保存本页文字后重新打开')
  return draft
}
async function exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
  if (busy.has(id)) throw new Error('此草稿正在保存资料，请稍后再试')
  busy.add(id)
  try { return await withStorageUse(action) } finally { busy.delete(id) }
}
function increment(id: string): void { getDb().prepare('UPDATE intake_drafts SET revision=revision+1,updated_at=? WHERE id=?').run(now(), id) }
function normalizeImage(data: Buffer): { buffer: Buffer; width: number; height: number } {
  inspectImage(data)
  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) throw new Error('图片无法解码，请改用有效的 PNG 或 JPEG')
  const buffer = image.toPNG(); inspectImage(buffer)
  return { buffer, ...image.getSize() }
}
function bytes(data: ArrayBuffer): Buffer {
  if (!(data instanceof ArrayBuffer) || !data.byteLength || data.byteLength > 100 * 1024 * 1024) throw new Error('文件为空或超过 100 MiB')
  return Buffer.from(data)
}
function validComponents(draft: IntakeDraft, input: IntakeComponent[]): IntakeComponent[] {
  if (!Array.isArray(input) || input.length > 80) throw new Error('一道题最多 80 个组成部分')
  const ids = new Set<string>(), assets = new Set(draft.assets.map((a) => a.id)); let length = 0
  return input.map((c) => {
    if (!c || typeof c.id !== 'string' || !/^[a-f0-9-]{36}$/.test(c.id) || ids.has(c.id) || !roles.has(c.role) ||
      typeof c.label !== 'string' || c.label.length > 8 || typeof c.text !== 'string' || c.text.length > 20000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(c.text) || (c.assetId !== null && !assets.has(c.assetId)) || (c.textSourceAssetId !== undefined && (!assets.has(c.textSourceAssetId) || c.assetId !== null))) throw new Error('组成部分格式无效或图片不属于此稿')
    length += c.text.length
    if (length > 80000) throw new Error('单题文字超过 8 万字，请拆分题目')
    if (!c.text.trim() && !c.assetId) throw new Error('请补充空白部分或将其删除')
    if (c.role === 'option' && !c.label.trim() && !c.assetId) throw new Error('请填写选项标记，例如 A')
    ids.add(c.id)
    return { id: c.id, role: c.role, label: c.label.trim(), text: c.text, assetId: c.assetId, ...(c.textSourceAssetId ? { textSourceAssetId: c.textSourceAssetId } : {}) }
  })
}
export function saveDraft(id: string, revision: number, title: string, input: IntakeComponent[]): IntakeDraft {
  if (busy.has(id)) throw new Error('资料正在处理，请稍后保存')
  const draft = editable(id, revision)
  if (typeof title !== 'string' || !title.trim() || title.length > 120) throw new Error('请填写不超过 120 字的题目名称')
  const components = validComponents(draft, input)
  getDb().transaction(() => {
    getDb().prepare('UPDATE intake_drafts SET title=?,components_json=?,revision=revision+1,updated_at=? WHERE id=?').run(title.trim(), JSON.stringify(components), now(), id)
    getDb().prepare('UPDATE papers SET name=?,updated_at=? WHERE id=?').run(title.trim(), now(), draft.paperId)
  })()
  return getDraft(id)
}
export async function createDraft(copyFrom?: string, includeComponents = false): Promise<IntakeDraft> {
  return withStorageUse(async () => {
    const source = copyFrom ? getDraft(copyFrom) : null, db = getDb(), id = randomUUID()
    db.transaction(() => {
      const title = source && includeComponents ? `${source.title.slice(0, 110)}（副本）` : '未命名录题'
      const paperId = Number(db.prepare("INSERT INTO papers (name,kind,status,created_at,updated_at) VALUES (?,'intake','processing',?,?)").run(title, now(), now()).lastInsertRowid)
      const questionId = createQuestionWithSegments(db, paperId, [], 1)
      db.prepare('INSERT INTO intake_drafts (id,paper_id,question_id,title,updated_at) VALUES (?,?,?,?,?)').run(id, paperId, questionId, title, now())
      for (const s of source?.sources ?? []) db.prepare('INSERT INTO intake_draft_sources VALUES (?,?)').run(id, s.id)
      if (source) saveContext(id, source.context)
    })()
    if (source && includeComponents) {
      const next = getDraft(id), remap = new Map<string, string>()
      for (const assetId of new Set(source.components.flatMap((c) => [c.assetId, c.textSourceAssetId].filter((id): id is string => Boolean(id))))) {
        const asset = source.assets.find((a) => a.id === assetId)!
        const copy = await writeAsset(next, asset.sourceId, asset.page, asset.crop, await readFile(join(getProjectsRoot(), asset.path)))
        remap.set(assetId, copy.id)
      }
      return saveDraft(id, next.revision, next.title, source.components.map((c) => ({ ...c, id: randomUUID(), assetId: c.assetId ? remap.get(c.assetId)! : null, ...(c.textSourceAssetId ? { textSourceAssetId: remap.get(c.textSourceAssetId)! } : {}) })))
    }
    return getDraft(id)
  })
}
async function importBuffer(id: string, data: Buffer, name: string): Promise<IntakeDraft> {
  const draft = editable(id)
  if (draft.sources.length >= 40) throw new Error('每份草稿最多保留 40 个原稿，请分批录入')
  const ext = extname(name).toLowerCase(), sourceId = randomUUID()
  const kind: IntakeSource['kind'] = ['.png', '.jpg', '.jpeg'].includes(ext) ? 'image' : ext === '.pdf' ? 'pdf' : ext === '.docx' ? 'docx' : (() => { throw new Error('支持 PNG、JPEG、PDF 和 DOCX；旧 DOC 请先另存为 DOCX 或 PDF') })()
  let preview: Buffer = data, warning: string | null = null
  if (!data.length || data.length > (kind === 'pdf' ? 100 : kind === 'docx' ? 30 : 20) * 1024 * 1024) throw new Error('文件为空或超限：图片 20、Word 30、PDF 100 MiB')
  if (kind === 'image') preview = normalizeImage(data).buffer
  if (kind === 'pdf' && !data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('此文件不是有效的 PDF')
  if (kind === 'docx') { const result = prepareDocxPreview(data); preview = result.buffer; warning = result.warning }
  const folder = `intake/sources/${sourceId}`, absolute = join(getProjectsRoot(), folder)
  const originalPath = `${folder}/original${ext}`, previewPath = kind === 'pdf' ? originalPath : `${folder}/preview.${kind === 'image' ? 'png' : 'docx'}`
  await mkdir(absolute, { recursive: true })
  try {
    await writeFile(join(getProjectsRoot(), originalPath), data, { flag: 'wx' })
    if (previewPath !== originalPath) await writeFile(join(getProjectsRoot(), previewPath), preview, { flag: 'wx' })
    editable(id)
    getDb().transaction(() => {
      getDb().prepare('INSERT INTO intake_sources VALUES (?,?,?,?,?,?,?,?)').run(sourceId, basename(name).slice(0, 200), kind, originalPath, previewPath, data.length, warning, now())
      getDb().prepare('INSERT INTO intake_draft_sources VALUES (?,?)').run(id, sourceId)
      increment(id)
    })()
  } catch (e) { await rm(absolute, { recursive: true, force: true }).catch(() => {}); throw e }
  return getDraft(id)
}
export async function importPath(id: string, path: string): Promise<IntakeDraft> {
  return exclusive(id, async () => {
    editable(id)
    const info = await stat(path)
    if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('请选择不超过 100 MiB 的文件')
    return importBuffer(id, await readFile(path), basename(path))
  })
}
export async function importBytes(id: string, data: ArrayBuffer, name: string): Promise<IntakeDraft> {
  return exclusive(id, () => importBuffer(id, bytes(data), name))
}
async function writeAsset(draft: IntakeDraft, sourceId: string | null, page: number | null, crop: OcrCrop | null, data: Buffer): Promise<IntakeAsset> {
  const image = normalizeImage(data), id = randomUUID(), filename = `content_${draft.questionId}_${id}.png`
  const asset: IntakeAsset = { id, path: `${draft.paperId}/images/${filename}`, width: image.width, height: image.height, sourceId, page, crop }
  await ensurePaperDir(draft.paperId)
  await writeFile(join(imagesDir(draft.paperId), filename), image.buffer, { flag: 'wx' })
  try {
    editable(draft.id)
    getDb().prepare('INSERT INTO intake_assets VALUES (?,?,?,?,?,?,?,?)').run(id, draft.id, asset.path, asset.width, asset.height, sourceId, page, crop ? JSON.stringify(crop) : null)
  } catch (e) { await rm(join(imagesDir(draft.paperId), filename), { force: true }).catch(() => {}); throw e }
  return asset
}
export async function addCrop(id: string, sourceId: string, page: number, crop: OcrCrop | null, data: ArrayBuffer): Promise<IntakeAsset> {
  return exclusive(id, async () => {
    const draft = editable(id)
    if (!draft.sources.some((s) => s.id === sourceId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('原稿或页码无效')
    if (crop && (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.00001 || crop.y + crop.height > 1.00001)) throw new Error('框选区域无效')
    return writeAsset(draft, sourceId, page, crop, bytes(data))
  })
}
const answerRole = (c: IntakeComponent) => ['answer', 'analysis', 'answerFigure'].includes(c.role)
export async function prepareQuestion(id: string, revision: number, question: ArrayBuffer, answer: ArrayBuffer | null): Promise<IntakeDraft> {
  return exclusive(id, async () => {
    const draft = editable(id, revision), components = validComponents(draft, draft.components)
    if (!components.some((c) => !answerRole(c))) throw new Error('请先添加整道题，或添加题干、选项及配图')
    if (components.some(answerRole) !== Boolean(answer)) throw new Error('答案预览与组成部分不一致，请重新生成')
    const q = normalizeImage(bytes(question)), a = answer ? normalizeImage(bytes(answer)) : null
    await ensurePaperDir(draft.paperId)
    const qName = `q_${draft.questionId}.png`, aName = `a_${draft.questionId}_${randomUUID()}.png`
    const snapshotName = `intake_${randomUUID()}.png`
    // Keep failed/prepared snapshots independently; only the DB transaction publishes canonical paths.
    await writeFile(join(imagesDir(draft.paperId), snapshotName), q.buffer, { flag: 'wx' })
    await copyFile(join(imagesDir(draft.paperId), snapshotName), join(imagesDir(draft.paperId), qName))
    if (a) await writeFile(join(imagesDir(draft.paperId), aName), a.buffer, { flag: 'wx' })
    editable(id, revision)
    getDb().transaction(() => {
      const db = getDb()
      db.prepare('UPDATE questions SET image_path=?,width_px=?,height_px=?,answer_image_path=?,answer_width_px=?,answer_height_px=?,updated_at=? WHERE id=?')
        .run(`projects/${draft.paperId}/images/${qName}`, q.width, q.height, a ? `projects/${draft.paperId}/images/${aName}` : null, a?.width ?? null, a?.height ?? null, now(), draft.questionId)
      const used = new Set(components.flatMap((c) => [c.assetId, c.textSourceAssetId].filter((id): id is string => Boolean(id))))
      for (const asset of draft.assets.filter((a) => used.has(a.id))) insertQuestionAsset(db, { id: asset.id, questionId: draft.questionId, path: asset.path, widthPx: asset.width, heightPx: asset.height, name: '录题原稿选区.png' })
      const body = (isAnswer: boolean): EditableBlock[] => components.filter((c) => answerRole(c) === isAnswer).flatMap((c) => {
        const result: EditableBlock[] = []
        const prefix = c.role === 'option' && c.label ? `${c.label}. ` : c.role === 'answer' ? '答案：' : c.role === 'analysis' ? '解析：' : ''
        if (c.text || prefix) for (const line of `${prefix}${c.text}`.split(/\r?\n/)) result.push({ type: 'paragraph', content: [{ type: 'text', text: line }] })
        if (c.assetId) result.push({ type: 'image', attrs: { assetId: c.assetId, widthPercent: 100, align: 'left', caption: '' } })
        return result
      })
      const content = newQuestionContent()
      content.questionMode = 'editable'; content.questionBody.content = body(false)
      content.answerBody.content = body(true); content.answerMode = a ? 'editable' : 'original'
      saveQuestionContent(db, draft.questionId, content, 0)
      db.prepare("UPDATE intake_drafts SET status='reviewing',revision=revision+1,updated_at=? WHERE id=?").run(now(), id)
    })()
    return getDraft(id)
  })
}
export function publishQuestion(id: string, contentRevision: number, confirmed: boolean): IntakeDraft {
  if (busy.has(id)) throw new Error('资料仍在处理，请稍后入库')
  return getDb().transaction(() => {
    const draft = getDraft(id)
    if (draft.status !== 'reviewing' || confirmed !== true) throw new Error('请先完成组题与人工校对，再确认入库')
    const content = getQuestionContent(getDb(), draft.questionId)
    if (!content || content.revision !== contentRevision) throw new Error('内容版本已变化，请重新读取并校对')
    if (Object.values(content.recognition ?? {}).some((r) => r.reviewState !== 'reviewed')) throw new Error('请在题干和答案页勾选已校对并保存，再确认入库')
    getDb().prepare("UPDATE papers SET status='done',updated_at=? WHERE id=?").run(now(), draft.paperId)
    getDb().prepare("UPDATE intake_drafts SET status='published',revision=revision+1,updated_at=? WHERE id=?").run(now(), id)
    return getDraft(id)
  })()
}
export function archiveDraft(id: string, revision: number, archived: boolean): IntakeDraft {
  if (busy.has(id)) throw new Error('资料仍在处理，请稍后再试')
  const draft = getDraft(id)
  if (draft.revision !== revision || (archived ? draft.status !== 'editing' : draft.status !== 'archived')) throw new Error('仅可归档未组题的草稿，或恢复已归档草稿')
  getDb().prepare('UPDATE intake_drafts SET status=?,revision=revision+1,updated_at=? WHERE id=?').run(archived ? 'archived' : 'editing', now(), id)
  return getDraft(id)
}
export function revealSource(id: string, sourceId: string): void {
  const source = getDraft(id).sources.find((s) => s.id === sourceId)
  if (!source) throw new Error('原稿不存在')
  shell.showItemInFolder(join(getProjectsRoot(), source.originalPath))
}

/** View writes intentionally do not change the content revision. */
export function saveContext(id: string, input: IntakeContext): void {
  const draft = getDraft(id), sourceIds = new Set(draft.sources.map((s) => s.id))
  if (!input || (input.activeSourceId !== null && !sourceIds.has(input.activeSourceId)) || !input.views || typeof input.views !== 'object') throw new Error('原稿位置无效')
  const context = emptyIntakeContext(); context.activeSourceId = input.activeSourceId
  context.inherit = validateInheritance(input.inherit)
  for (const [source, view] of Object.entries(input.views)) {
    if (!sourceIds.has(source) || !view || !Number.isSafeInteger(view.page) || view.page < 1 || view.page > 100000 ||
      ![view.zoom, view.left, view.top].every(Number.isFinite) || view.zoom < 0.5 || view.zoom > 3 || view.left < 0 || view.left > 1 || view.top < 0 || view.top > 1) throw new Error('原稿页码或缩放无效')
    context.views[source] = { page: view.page, zoom: view.zoom, left: view.left, top: view.top }
  }
  getDb().prepare('INSERT INTO intake_context VALUES (?,?) ON CONFLICT(draft_id) DO UPDATE SET context_json=excluded.context_json').run(id, JSON.stringify(context))
}
function validateInheritance(input: IntakeInheritance): IntakeInheritance {
  const result = defaultIntakeInheritance()
  for (const key of Object.keys(result) as (keyof IntakeInheritance)[]) {
    if (!input || typeof input[key] !== 'boolean') throw new Error('请选择下一题沿用的标签')
    result[key] = input[key]
  }
  return result
}
/** One successor per published draft, including retries after a lost IPC response. */
export function nextDraft(id: string, inheritance: IntakeInheritance): IntakeDraft {
  const db = getDb()
  return db.transaction(() => {
    const source = getDraft(id)
    if (source.status !== 'published') throw new Error('本题尚未保存入库，请先完成保存')
    const existing = db.prepare('SELECT next_id FROM intake_next WHERE previous_id=?').get(id) as { next_id: string } | undefined
    if (existing) return getDraft(existing.next_id)
    const inherit = validateInheritance(inheritance), context = { ...source.context, inherit }
    saveContext(id, context)
    const sourceName = source.sources.find((s) => s.id === source.context.activeSourceId)?.name ?? source.sources[0]?.name ?? '手工录题'
    const nextId = randomUUID(), title = `${sourceName.slice(0, 96)} · 第 ${listSession(id).length + 1} 题`
    const paperId = Number(db.prepare("INSERT INTO papers (name,kind,status,created_at,updated_at) VALUES (?,'intake','processing',?,?)").run(title, now(), now()).lastInsertRowid)
    const questionId = createQuestionWithSegments(db, paperId, [], 1)
    db.prepare('INSERT INTO intake_drafts (id,paper_id,question_id,title,updated_at) VALUES (?,?,?,?,?)').run(nextId, paperId, questionId, title, now())
    for (const s of source.sources) db.prepare('INSERT INTO intake_draft_sources VALUES (?,?)').run(nextId, s.id)
    saveContext(nextId, context)
    const prior = getQuestionMetadata(db, source.questionId), metadata = emptyQuestionMetadata()
    metadata.source = inherit.source ? prior.source : null; metadata.year = inherit.year ? prior.year : null
    metadata.typeId = inherit.typeId ? prior.typeId : null; metadata.chapterId = inherit.chapterId ? prior.chapterId : null
    metadata.difficultyId = inherit.difficultyId ? prior.difficultyId : null
    metadata.knowledgePointIds = inherit.knowledgePointIds ? prior.knowledgePointIds : []
    saveQuestionMetadata(db, questionId, metadata, getQuestionMetadata(db, questionId))
    db.prepare('INSERT INTO intake_next VALUES (?,?,?)').run(id, nextId, JSON.stringify(metadata))
    return getDraft(nextId)
  })()
}
export function listSession(id: string): IntakeSummary[] {
  getDraft(id)
  const db = getDb()
  // Both directions form a single chain; UNION also bounds traversal if old data is corrupt.
  const rows = db.prepare(`WITH RECURSIVE session(id) AS (
    SELECT ? UNION SELECT n.previous_id FROM intake_next n JOIN session s ON n.next_id=s.id
    UNION SELECT n.next_id FROM intake_next n JOIN session s ON n.previous_id=s.id)
    SELECT d.id,d.title,d.status,d.question_id AS questionId,d.updated_at AS updatedAt,
      json_array_length(d.components_json) AS componentCount FROM intake_drafts d JOIN session s ON d.id=s.id ORDER BY d.question_id`).all(id) as IntakeSummary[]
  return rows
}
