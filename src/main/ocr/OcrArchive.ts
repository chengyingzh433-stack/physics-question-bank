import { Unzip, UnzipInflate } from 'fflate'

const MAX_ARCHIVE = 20 * 1024 * 1024
const MAX_FILE = 10 * 1024 * 1024
const MAX_TOTAL = 40 * 1024 * 1024
export function localImageReference(value: string): string | null {
  try {
    const path = decodeURIComponent(value).normalize('NFC').replace(/^\.\//, '')
    if (!path || path.length > 300 || /[\\:\u0000-\u001f?#]/.test(path) || path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) return null
    return path
  } catch { return null }
}

/** Inspect central-directory declarations before starting any decompression. */
function inspectDirectory(data: Buffer): Map<string, number> {
  let end = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break }
  }
  if (end < 0) throw new Error('图片包缺少有效 ZIP 目录')
  const count = data.readUInt16LE(end + 10), size = data.readUInt32LE(end + 12), offset = data.readUInt32LE(end + 16)
  if (data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0 || data.readUInt16LE(end + 8) !== count ||
    count > 100 || size > 1024 * 1024 || offset + size > end) throw new Error('图片包数量、目录或分卷格式不受支持')
  const files = new Map<string, number>(), caseNames = new Set<string>()
  let cursor = offset, total = 0
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > offset + size || data.readUInt32LE(cursor) !== 0x02014b50) throw new Error('图片包目录损坏')
    const flags = data.readUInt16LE(cursor + 8), method = data.readUInt16LE(cursor + 10)
    const compressed = data.readUInt32LE(cursor + 20), original = data.readUInt32LE(cursor + 24)
    const nameLength = data.readUInt16LE(cursor + 28), extraLength = data.readUInt16LE(cursor + 30), commentLength = data.readUInt16LE(cursor + 32)
    const external = data.readUInt32LE(cursor + 38), localOffset = data.readUInt32LE(cursor + 42)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (next > offset + size || flags & 1 || ![0, 8].includes(method) || localOffset >= offset || compressed > MAX_ARCHIVE || original > MAX_FILE ||
      ((external >>> 16) & 0xf000) === 0xa000) throw new Error('图片包含有过大、加密或不安全条目')
    total += original
    if (total > MAX_TOTAL) throw new Error('图片包解压后超过 40 MiB')
    const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength)
    if (!(flags & 0x800) && nameBytes.some((byte) => byte >= 128)) throw new Error('图片包文件名编码不受支持')
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)
    const path = localImageReference(name.endsWith('/') ? name.slice(0, -1) : name)
    if (!path || caseNames.has(path.toLowerCase())) throw new Error('图片包含有重复或不安全的路径')
    caseNames.add(path.toLowerCase())
    if (!name.endsWith('/')) files.set(path, original)
    cursor = next
  }
  if (cursor !== offset + size) throw new Error('图片包目录长度不一致')
  return files
}

/** No ZIP member is written to disk; decoded images later receive fresh UUIDs. */
export function unpackOcrImages(encoded: unknown): Map<string, Buffer> {
  if (encoded == null || encoded === '') return new Map()
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_ARCHIVE / 3) * 4 + 4 ||
    encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('图片包不是有效 Base64 ZIP 或超过 20 MiB')
  const archive = Buffer.from(encoded, 'base64')
  if (archive.toString('base64') !== encoded || archive.length > MAX_ARCHIVE) throw new Error('图片包编码不完整')
  const declarations = inspectDirectory(archive), result = new Map<string, Buffer>(), encountered = new Set<string>()
  let total = 0
  const unzip = new Unzip((file) => {
    if (file.name.endsWith('/')) return
    const path = localImageReference(file.name)
    if (!path || !declarations.has(path) || encountered.has(path)) throw new Error('图片包实际条目与目录不一致')
    encountered.add(path)
    if (!/\.(png|jpe?g)$/i.test(path)) return
    if (file.originalSize !== undefined && file.originalSize !== declarations.get(path)) throw new Error('图片包尺寸声明不一致')
    const chunks: Buffer[] = []
    let length = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error('图片包解压失败')
      length += chunk.length; total += chunk.length
      if (length > MAX_FILE || total > MAX_TOTAL || length > declarations.get(path)!) { file.terminate(); throw new Error('图片包实际解压尺寸超过限制') }
      chunks.push(Buffer.from(chunk))
      if (final) {
        if (length !== declarations.get(path)) throw new Error('图片包文件不完整')
        result.set(path, Buffer.concat(chunks, length))
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < archive.length; offset += 4096) unzip.push(archive.subarray(offset, offset + 4096), offset + 4096 >= archive.length)
  for (const path of declarations.keys()) if (/\.(png|jpe?g)$/i.test(path) && !result.has(path)) throw new Error('图片包缺少完整配图')
  return result
}
