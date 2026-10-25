import { nativeImage } from 'electron'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../storage/StorageService'
import { requireEditableQuestion } from '../storage/repositories/contentRepo'
import { getProjectsRoot } from '../files/FileService'
import type { OcrCrop, OcrPart, OcrPreparedInput } from '../../shared/ocr'

export const MAX_UPLOAD_BYTES = 7 * 1024 * 1024
export const fingerprint = (data: Buffer): string => createHash('sha256').update(data).digest('hex')
interface Prepared extends OcrPreparedInput { data: Buffer; owner: number; expires: number }
const prepared = new Map<string, Prepared>()
export function readOcrSource(questionId: number, part: OcrPart): { data: Buffer; fingerprint: string; imagePath: string } {
  if (part !== 'question' && part !== 'answer') throw new Error('识别对象无效')
  const question = requireEditableQuestion(getDb(), questionId)
  const source = part === 'question' ? question.image_path : question.answer_image_path
  if (!source) throw new Error(part === 'answer' ? '这道题还没有原答案图' : '这道题还没有原题图')
  const prefix = `projects/${question.paper_id}/images/`
  const filename = source.slice(prefix.length)
  const pattern = part === 'question' ? new RegExp(`^q_${questionId}\\.png$`) : new RegExp(`^a_${questionId}(?:_[a-f0-9-]+)?\\.png$`)
  if (!source.startsWith(prefix) || !pattern.test(filename)) throw new Error('原图路径与题目不匹配')
  const root = realpathSync(getProjectsRoot())
  const path = realpathSync(join(root, String(question.paper_id), 'images', filename))
  const within = relative(root, path)
  if (!within || within.startsWith('..') || isAbsolute(within) || path !== join(root, String(question.paper_id), 'images', filename)) throw new Error('原图不在本题所属目录中')
  const info = statSync(path)
  if (!info.isFile() || info.size > 60 * 1024 * 1024) throw new Error('原图文件过大，请先缩小试卷导入尺寸')
  const data = readFileSync(path)
  return { data, fingerprint: fingerprint(data), imagePath: source }
}
export function prepareOcrInput(owner: number, questionId: number, part: OcrPart, crop: OcrCrop | null, scale: number): OcrPreparedInput {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0.1 || scale > 1) throw new Error('缩放比例须在 10%–100% 之间')
  for (const [key, value] of prepared) if (value.expires < Date.now() || value.owner === owner) prepared.delete(key)
  if (prepared.size >= 8) throw new Error('待确认的识别预览过多，请关闭其他预览后重试')
  const source = readOcrSource(questionId, part)
  const data = source.data
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (data.length < 24 || !data.subarray(0, 8).equals(png) || data.toString('ascii', 12, 16) !== 'IHDR') throw new Error('原题图不是有效 PNG')
  const originalWidth = data.readUInt32BE(16), originalHeight = data.readUInt32BE(20)
  if (!originalWidth || !originalHeight || originalWidth > 12000 || originalHeight > 12000 || originalWidth * originalHeight > 40_000_000) throw new Error('原图像素过大：单边最多 12000 像素，总像素最多 4000 万，请先降低试卷导入尺寸')
  let image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) throw new Error('无法读取原图')
  if (crop !== null) {
    if (!crop || [crop.x, crop.y, crop.width, crop.height].some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      crop.x < 0 || crop.y < 0 || crop.x >= 1 || crop.y >= 1 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) throw new Error('选区超出原图范围')
    const x = Math.floor(crop.x * originalWidth), y = Math.floor(crop.y * originalHeight)
    image = image.crop({ x, y, width: Math.min(originalWidth - x, Math.max(1, Math.round(crop.width * originalWidth))), height: Math.min(originalHeight - y, Math.max(1, Math.round(crop.height * originalHeight))) })
  }
  const size = image.getSize()
  if (scale < 1) image = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' })
  const output = image.toPNG()
  if (output.length > MAX_UPLOAD_BYTES) throw new Error('识别副本仍超过 7 MiB，请缩小比例或重新选择区域；原图不会改变')
  if (!output.length) throw new Error('无法准备识别副本')
  const dimensions = image.getSize()
  const dto: OcrPreparedInput = { token: randomUUID(), questionId, part, previewDataUrl: `data:image/png;base64,${output.toString('base64')}`,
    bytes: output.length, width: dimensions.width, height: dimensions.height, sourceFingerprint: source.fingerprint, crop, scale }
  prepared.set(dto.token, { ...dto, data: output, owner, expires: Date.now() + 10 * 60_000 })
  return dto
}
export function takePreparedInput(owner: number, token: string): Prepared {
  const value = prepared.get(token)
  if (!value || value.owner !== owner || value.expires < Date.now()) throw new Error('识别预览已过期，请重新预览后确认')
  prepared.delete(token)
  if (readOcrSource(value.questionId, value.part).fingerprint !== value.sourceFingerprint) throw new Error('原图已改变，请重新预览，避免识别旧图')
  return value
}
export function clearPreparedInputs(): void { prepared.clear() }
