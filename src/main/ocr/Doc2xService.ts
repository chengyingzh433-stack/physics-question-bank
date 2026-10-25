import { app, net } from 'electron'
import { getDb } from '../storage/StorageService'
import { withStorageUse } from '../storage/activity'
import * as ocrRepo from '../storage/repositories/ocrRepo'
import * as contentRepo from '../storage/repositories/contentRepo'
import { saveQuestionAsset } from '../files/ContentAssetService'
import { requireOcrKey } from './OcrCredentials'
import { clearPreparedInputs, fingerprint, readOcrSource, takePreparedInput } from './OcrInput'
import { localImageReference, unpackOcrImages } from './OcrArchive'
import { convertOcrMarkdown } from './OcrMarkdown'
import type { OcrAdoptInput, OcrAdoptResult, OcrIssue, OcrJobDTO, OcrSourceDTO, OcrStartInput } from '../../shared/ocr'
import type { QuestionAssetDTO } from '../../shared/editable'
import { randomUUID } from 'node:crypto'

const BASE = 'https://v2.doc2x.noedgeai.com'
const MAX_RESPONSE = 32 * 1024 * 1024
interface Worker { id: string; controller: AbortController; paused: boolean }
let active: Worker | null = null
class CloudFailure extends Error {}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function failureMessage(code: unknown, status?: number): string {
  const safeCode = typeof code === 'string' && /^[a-z0-9_-]{1,60}$/i.test(code) ? code : ''
  if (status === 404 || status === 410 || /expir|not_?found|not_?exist/i.test(safeCode)) return '远端识别结果已不可用，请检查本地候选；如需重新识别，须重新预览并明确确认上传'
  if (status === 401 || status === 403 || /auth|key|token/i.test(safeCode)) return 'Doc2X 拒绝授权，请在开放平台核对 API Key 和接口权限'
  if (status === 402 || /quota|balance|credit|page_limit/i.test(safeCode)) return 'Doc2X 可用解析额度不足，请在开放平台核对余额和额度'
  if (status === 429 || /limit|rate|concurr/i.test(safeCode)) return 'Doc2X 暂时限制请求频率，请稍后继续查询原任务'
  if (status === 413) return 'Doc2X 拒绝了图片大小，请重新准备更小的识别副本'
  return `Doc2X 请求未完成${safeCode ? `（${safeCode}）` : status ? `（HTTP ${status}）` : ''}，请保留任务记录后重试查询`
}

async function requestJson(worker: Worker, key: string, path: string, data?: Buffer): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const stop = (): void => controller.abort()
  worker.controller.signal.addEventListener('abort', stop, { once: true })
  if (worker.controller.signal.aborted) controller.abort()
  const timeout = setTimeout(stop, data ? 90_000 : 30_000)
  try {
    const response = await net.fetch(`${BASE}${path}`, {
      method: data ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, ...(data ? { 'Content-Type': 'application/octet-stream' } : {}) },
      body: data ? new Uint8Array(data).buffer : undefined, signal: controller.signal
    })
    if (!response.ok) {
      await response.body?.cancel()
      // A 5xx POST can have reached the parser; retain uncertainty without a UID.
      if (response.status >= 500 || response.status === 408) throw new Error('服务暂时不可用')
      throw new CloudFailure(failureMessage(undefined, response.status))
    }
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_RESPONSE) { await response.body?.cancel(); throw new Error('识别响应超过本机处理限制') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('识别服务返回空响应')
    const chunks: Buffer[] = []
    let size = 0
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.length
        if (size > MAX_RESPONSE) throw new Error('识别响应超过 32 MiB')
        chunks.push(Buffer.from(next.value))
      }
    } finally { await reader.cancel().catch(() => {}) }
    const responseBody = object(JSON.parse(Buffer.concat(chunks, size).toString('utf8')))
    if (responseBody.code !== 'success') throw new CloudFailure(failureMessage(responseBody.code))
    return object(responseBody.data)
  } finally {
    clearTimeout(timeout)
    worker.controller.signal.removeEventListener('abort', stop)
  }
}

function delay(worker: Worker): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => { clearTimeout(timer); worker.controller.signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, 2500)
    worker.controller.signal.addEventListener('abort', finish, { once: true })
    if (worker.controller.signal.aborted) finish()
  })
}
function stillWorking(worker: Worker): boolean { return active === worker && !worker.paused && !worker.controller.signal.aborted }

async function materialize(job: OcrJobDTO, data: Record<string, unknown>, worker: Worker): Promise<void> {
  const result = object(data.result), pages = result.pages
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 10 || pages.some((page) => typeof object(page).md !== 'string')) throw new Error('识别结果缺少页面文字，请保留任务号继续查询')
  const markdown = pages.map((page) => object(page).md as string).join('\n\n')
  if (Buffer.byteLength(markdown, 'utf8') > 4 * 1024 * 1024) throw new CloudFailure('远端识别文字超过本机单题 4 MiB 限制，未保存；请在开放平台查看结果，并缩小选区后重新确认识别')
  const issues: OcrIssue[] = []
  let images = new Map<string, Buffer>()
  try { images = unpackOcrImages(data.convert_zip) }
  catch {
    issues.push({ id: randomUUID(), kind: 'conversion', message: '配图包格式异常或超过限制，未解压；请使用原图裁图补充', original: '', resolution: '' })
  }
  const assets = new Map<string, QuestionAssetDTO>()
  const fallback = (): Awaited<ReturnType<typeof convertOcrMarkdown>> => ({
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '【自动转换未完成，完整识别原文已保留。请打开原始 Markdown，对照原图整理后再采用。】' }] }] },
    issues: [{ id: randomUUID(), kind: 'conversion', message: '识别内容结构复杂、过长或无法转换；完整原文保存在此候选的原始 Markdown 中，请手工整理并记录处理决定', original: '', resolution: '' }]
  })
  let converted: Awaited<ReturnType<typeof convertOcrMarkdown>>
  try { converted = await convertOcrMarkdown(markdown, async (reference) => {
    if (!stillWorking(worker)) throw new Error('本机等待已停止')
    const path = localImageReference(reference)
    if (!path) return null
    let canonical = path
    if (!images.has(canonical)) {
      const matches = [...images.keys()].filter((name) => name.split('/').pop() === path.split('/').pop())
      if (matches.length !== 1) return null
      canonical = matches[0]
    }
    const previous = assets.get(canonical)
    if (previous) return previous
    const bytes = images.get(canonical)
    if (!bytes) return null
    try {
      const asset = await saveQuestionAsset(getDb(), job.questionId, new Uint8Array(bytes).buffer, `识别配图-${canonical.split('/').pop()}`)
      assets.set(canonical, asset)
      return asset
    } catch { return null }
  }) } catch {
    if (!stillWorking(worker)) return
    // Keep the complete bounded cloud result even if its structure cannot fit
    // the editor. The user can read/copy the saved original and repair locally.
    converted = fallback()
  }
  if (!stillWorking(worker)) return
  try { ocrRepo.storeOcrCandidate(getDb(), job.id, { rawMarkdown: markdown, document: converted.document, issues: [...issues, ...converted.issues] }) }
  catch {
    // The shared editor also has aggregate byte/node limits. Retain raw text
    // if conversion produced more inline nodes than that model can store.
    const plain = fallback()
    ocrRepo.storeOcrCandidate(getDb(), job.id, { rawMarkdown: markdown, document: plain.document, issues: [...issues, ...plain.issues] })
  }
}

async function poll(worker: Worker, key: string): Promise<void> {
  const deadline = Date.now() + 10 * 60_000
  while (stillWorking(worker)) {
    const job = ocrRepo.getOcrJob(getDb(), worker.id)
    if (!job.remoteUid) throw new Error('没有远端任务号，不能重新查询')
    const data = await requestJson(worker, key, `/api/v2/parse/img/layout/status?uid=${encodeURIComponent(job.remoteUid)}`)
    if (!stillWorking(worker)) return
    if (data.status === 'success') { await materialize(job, data, worker); return }
    if (data.status === 'failed') throw new CloudFailure('Doc2X 未能完成这次识别；原图与编辑内容均保留，可调整选区后重新确认识别')
    if (data.status !== 'processing') throw new Error('Doc2X 返回暂无法识别的任务状态')
    if (Date.now() > deadline) {
      ocrRepo.updateOcrJob(getDb(), job.id, { status: 'paused', error: '本机已等待 10 分钟并暂停，可继续查询原任务；远端可能仍在处理' })
      return
    }
    await delay(worker)
  }
}

/** Detached runtime work only starts after explicit IPC confirmation/resume. */
function launch(worker: Worker, key: string, upload?: Buffer): void {
  void withStorageUse(async () => {
    try {
      if (upload) {
        const data = await requestJson(worker, key, '/api/v2/async/parse/img/layout', upload)
        if (typeof data.uid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(data.uid)) throw new Error('提交后没有取得有效任务号')
        ocrRepo.updateOcrJob(getDb(), worker.id, { remoteUid: data.uid, status: stillWorking(worker) ? 'processing' : 'paused', error: stillWorking(worker) ? null : '已停止本机等待；可继续查询原任务' })
      }
      if (stillWorking(worker)) await poll(worker, key)
    } catch (error) {
      try {
        const job = ocrRepo.getOcrJob(getDb(), worker.id)
        if (job.status !== 'ready' && !worker.paused) ocrRepo.updateOcrJob(getDb(), job.id, {
          status: error instanceof CloudFailure ? 'failed' : job.remoteUid ? 'paused' : 'unknown',
          error: error instanceof CloudFailure ? error.message : job.remoteUid
            ? '等待或读取结果中断，任务号已保留；继续查询不会重新上传图片'
            : '提交结果不明，远端可能已经收到图片并计费；没有任务号，不能自动重投。请核对开放平台记录'
        })
      } catch { /* The source question may have been deleted while awaiting. */ }
    } finally { if (active === worker) active = null }
  }).catch(() => { if (active === worker) active = null })
}

export async function startOcrJob(owner: number, input: OcrStartInput): Promise<OcrJobDTO> {
  if (!input || input.confirmed !== true || typeof input.inputToken !== 'string' || typeof input.draftFingerprint !== 'string') throw new Error('请先预览并确认这一次图片上传和额度使用')
  if (active) throw new Error('另一个识别任务仍在等待或停止中，请完成或暂停后再开始')
  const worker: Worker = { id: 'preparing', controller: new AbortController(), paused: false }
  active = worker
  try {
    return await withStorageUse(async () => {
      const key = await requireOcrKey()
      if (!stillWorking(worker)) throw new Error('识别准备已停止，没有上传图片')
      const prepared = takePreparedInput(owner, input.inputToken)
      const current = contentRepo.getQuestionContent(getDb(), prepared.questionId)
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || (current?.revision ?? 0) !== input.expectedRevision) throw new Error('OCR_REVISION_CONFLICT：正式内容已改变，请重新打开识别预览')
      const asset = await saveQuestionAsset(getDb(), prepared.questionId, new Uint8Array(prepared.data).buffer, '本次识别的输入副本.png')
      if (!stillWorking(worker)) throw new Error('识别准备已停止，没有上传图片')
      if (readOcrSource(prepared.questionId, prepared.part).fingerprint !== prepared.sourceFingerprint) throw new Error('原图已改变，请重新预览后确认')
      const job = ocrRepo.createOcrJob(getDb(), {
        questionId: prepared.questionId, part: prepared.part, status: 'submitting', remoteUid: null,
        sourceFingerprint: prepared.sourceFingerprint, inputFingerprint: fingerprint(prepared.data), inputImagePath: asset.path,
        crop: prepared.crop, scale: prepared.scale, baseRevision: input.expectedRevision, draftFingerprint: input.draftFingerprint, error: null
      })
      worker.id = job.id
      launch(worker, key, prepared.data)
      return job
    })
  } catch (error) { if (active === worker) active = null; throw error }
}

export function pauseOcrJob(jobId: string): OcrJobDTO {
  const job = ocrRepo.getOcrJob(getDb(), jobId)
  if (job.status === 'ready' || job.status === 'failed') return job
  if (active?.id === jobId) { active.paused = true; active.controller.abort() }
  return ocrRepo.updateOcrJob(getDb(), jobId, {
    status: job.remoteUid ? 'paused' : 'unknown',
    error: job.remoteUid ? '已停止本机等待；这不会取消远端任务，也不会退还已消耗额度' : '已停止提交等待，但远端可能已经收到图片并计费；无任务号，不能自动重投'
  })
}
export async function resumeOcrJob(jobId: string): Promise<OcrJobDTO> {
  const job = ocrRepo.getOcrJob(getDb(), jobId)
  if (job.status === 'ready') return job
  if (!job.remoteUid) throw new Error('没有远端任务号，不能继续查询；请先核对开放平台记录，再决定是否重新确认上传')
  if (active) throw new Error('另一个任务仍在等待或停止中，请稍后继续')
  const worker: Worker = { id: jobId, controller: new AbortController(), paused: false }
  active = worker
  try {
    return await withStorageUse(async () => {
      const key = await requireOcrKey()
      if (!stillWorking(worker)) throw new Error('继续查询已取消')
      const updated = ocrRepo.updateOcrJob(getDb(), jobId, { status: 'processing', error: null })
      launch(worker, key)
      return updated
    })
  } catch (error) { if (active === worker) active = null; throw error }
}
export function pauseAllOcr(): void {
  if (!active) return
  if (active.id === 'preparing') { active.paused = true; active.controller.abort(); return }
  try { pauseOcrJob(active.id) } catch { active?.controller.abort() }
}
export async function adoptOcrCandidate(input: OcrAdoptInput): Promise<OcrAdoptResult> {
  return withStorageUse(async () => {
    const job = ocrRepo.getOcrJob(getDb(), input.jobId)
    let currentSource: string
    try { currentSource = readOcrSource(job.questionId, job.part).fingerprint }
    catch { throw new Error('当前原图暂不可用，识别候选已保留。请恢复原图后再采用，或从原始 Markdown 手工取用文字') }
    return ocrRepo.adoptOcrCandidate(getDb(), input, currentSource)
  })
}
export function getOcrSource(jobId: string): OcrSourceDTO {
  const job = ocrRepo.getOcrJob(getDb(), jobId)
  try {
    const source = readOcrSource(job.questionId, job.part)
    return { sourceFingerprint: source.fingerprint, imagePath: source.imagePath }
  } catch { throw new Error('当前原图暂不可用，识别候选已保留。请恢复原图后再对照采用') }
}
export function initializeOcrRuntime(): void {
  app.once('before-quit', () => { pauseAllOcr(); clearPreparedInputs() })
}
