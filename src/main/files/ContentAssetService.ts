import { nativeImage } from 'electron'
import { readFile, stat, open, mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/StorageService'
import type { QuestionAssetDTO } from '../../shared/editable'
import { insertQuestionAsset, requireEditableQuestion } from '../storage/repositories/contentRepo'
import { imagesDir } from './FileService'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_EDGE = 12000
const MAX_PIXELS = 40_000_000
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function checkDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new Error('图片尺寸过大或无效：单边最多 12000 像素，总像素最多 4000 万')
  }
}

/** 解码前检查文件类型和头部尺寸，避免先分配不受控的大图内存。 */
function inspectImage(data: Buffer): void {
  if (!data.length || data.length > MAX_BYTES) throw new Error('图片文件须小于 20 MB')
  if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (data.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG 文件头无效')
    checkDimensions(data.readUInt32BE(16), data.readUInt32BE(20))
    return
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 0xff) break
      while (offset < data.length && data[offset] === 0xff) offset++
      const marker = data[offset++]
      if (marker === 0xd9 || marker === 0xda) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > data.length) break
      const length = data.readUInt16BE(offset)
      if (length < 2 || offset + length > data.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) break
        checkDimensions(data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3))
        return
      }
      offset += length
    }
    throw new Error('JPEG 图片格式无效，无法读取尺寸')
  }
  throw new Error('仅支持 PNG 和 JPEG 图片，请先将其他格式另存为 PNG 或 JPEG')
}

function assetName(name: string): string {
  const safe = typeof name === 'string' ? basename(name).replace(/[\u0000-\u001f\u007f]/g, '').trim() : ''
  return safe.slice(0, 200) || '配图.png'
}

async function saveBuffer(db: DB, questionId: number, data: Buffer, name: string): Promise<QuestionAssetDTO> {
  const question = requireEditableQuestion(db, questionId)
  const identity = db.prepare('SELECT created_at FROM questions WHERE id = ?').get(questionId) as { created_at: string | null }
  inspectImage(data)
  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) throw new Error('无法读取这张图片，请使用有效的 PNG 或 JPEG 文件')
  const { width, height } = image.getSize()
  checkDimensions(width, height)
  const png = image.toPNG()
  if (!png.length || png.length > MAX_BYTES) throw new Error('图片转为 PNG 后超过 20 MB，请缩小图片后重试')
  const id = randomUUID()
  const filename = `content_${questionId}_${id}.png`
  const directory = imagesDir(question.paper_id)
  await mkdir(directory, { recursive: true })
  const absolutePath = join(directory, filename)
  const asset: QuestionAssetDTO = {
    id, questionId, path: `${question.paper_id}/images/${filename}`, widthPx: width, heightPx: height, name: assetName(name)
  }
  let created = false
  try {
    const handle = await open(absolutePath, 'wx')
    created = true
    try {
      await handle.writeFile(png)
    } finally {
      await handle.close()
    }
    // 文件选择/写盘期间题目可能被删除，落库前再次校验；失败只删除本次新文件。
    const current = requireEditableQuestion(db, questionId)
    const currentIdentity = db.prepare('SELECT created_at FROM questions WHERE id = ?').get(questionId) as { created_at: string | null }
    if (current.paper_id !== question.paper_id || currentIdentity.created_at !== identity.created_at) throw new Error('题目已变更，请重新打开题目后添加配图')
    if (imagesDir(question.paper_id) !== directory) throw new Error('存储目录已变更，请重新添加配图')
    insertQuestionAsset(db, asset)
  } catch (error) {
    if (created) await rm(absolutePath, { force: true }).catch(() => {})
    throw error
  }
  return asset
}

export async function importQuestionAssetFromPath(db: DB, questionId: number, sourcePath: string): Promise<QuestionAssetDTO> {
  requireEditableQuestion(db, questionId)
  const info = await stat(sourcePath)
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('请选择小于 20 MB 的 PNG 或 JPEG 图片文件')
  return saveBuffer(db, questionId, await readFile(sourcePath), basename(sourcePath))
}

export async function saveQuestionAsset(db: DB, questionId: number, data: ArrayBuffer, name: string): Promise<QuestionAssetDTO> {
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > MAX_BYTES) throw new Error('图片数据无效或超过 20 MB')
  return saveBuffer(db, questionId, Buffer.from(data), name)
}
