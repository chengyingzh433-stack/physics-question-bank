import { Unzip, UnzipInflate, zipSync, strToU8 } from 'fflate'
import { SaxesParser } from 'saxes'
import { inspectImage } from '../files/ContentAssetService'
import { posix } from 'node:path'

/** Bound both declared and actual decompression before passing a local preview to docx-preview. */
export function prepareDocxPreview(data: Buffer): { buffer: Buffer; warning: string | null } {
  if (!data.length || data.length > 30 * 1024 * 1024) throw new Error('Word 文件须小于 30 MiB')
  let end = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break }
  }
  if (end < 0) throw new Error('无法读取 DOCX，请确认未加密，或另存为 PDF')
  const count = data.readUInt16LE(end + 10), size = data.readUInt32LE(end + 12), offset = data.readUInt32LE(end + 16)
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || data.readUInt16LE(end + 8) !== count || count > 3000 || offset + size > end) throw new Error('Word 压缩结构或文件数量不受支持')
  const declared = new Map<string, number>()
  let cursor = offset, total = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > offset + size || data.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Word 压缩目录损坏')
    const flags = data.readUInt16LE(cursor + 8), method = data.readUInt16LE(cursor + 10)
    const original = data.readUInt32LE(cursor + 24), nameLength = data.readUInt16LE(cursor + 28)
    const next = cursor + 46 + nameLength + data.readUInt16LE(cursor + 30) + data.readUInt16LE(cursor + 32)
    if (next > offset + size || flags & 1 || ![0, 8].includes(method) || original > 30 * 1024 * 1024 || data.readUInt32LE(cursor + 42) >= offset) throw new Error('Word 包含过大或不支持的条目')
    const name = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(cursor + 46, cursor + 46 + nameLength))
    if (!name || /[\\:\u0000-\u001f]/.test(name) || name.startsWith('/') || name.split('/').includes('..') || declared.has(name)) throw new Error('Word 包含无效或重复路径')
    total += original
    if (total > 100 * 1024 * 1024) throw new Error('Word 解压后超过 100 MiB，请拆分文档或另存 PDF')
    declared.set(name, original); cursor = next
  }
  if (cursor !== offset + size) throw new Error('Word 压缩目录不完整')
  const files: Record<string, Uint8Array> = Object.create(null)
  const seen = new Set<string>()
  total = 0
  const unzip = new Unzip((file) => {
    if (!declared.has(file.name) || seen.has(file.name)) throw new Error('Word 实际内容与压缩目录不一致')
    seen.add(file.name)
    if (file.name.endsWith('/')) return
    const chunks: Buffer[] = []; let length = 0
    file.ondata = (err, chunk, final) => {
      if (err) throw new Error('Word 解压失败')
      length += chunk.length; total += chunk.length
      if (length > declared.get(file.name)! || total > 100 * 1024 * 1024) { file.terminate(); throw new Error('Word 实际解压大小超过限制') }
      chunks.push(Buffer.from(chunk))
      if (final) {
        if (length !== declared.get(file.name)) throw new Error('Word 文件不完整')
        files[file.name] = Buffer.concat(chunks, length)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let i = 0; i < data.length; i += 4096) unzip.push(data.subarray(i, i + 4096), i + 4096 >= data.length)
  if ([...declared.keys()].some((name) => !name.endsWith('/') && !files[name])) throw new Error('Word 缺少文件内容')
  if (!files['word/document.xml'] || !files['[Content_Types].xml']) throw new Error('这不是有效的 DOCX 文件')
  if (Object.keys(files).some((name) => /vbaProject|activeX/i.test(name))) throw new Error('不支持含宏或 ActiveX 的 Word，请另存为普通 DOCX 或 PDF')
  if (files['word/document.xml'].length > 8 * 1024 * 1024) throw new Error('Word 正文过大，请拆分文档或改用 PDF')
  for (const [name, content] of Object.entries(files)) {
    if (/^word\/media\/.*\.(png|jpe?g)$/i.test(name)) inspectImage(Buffer.from(content))
  }
  let removed = false
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  for (const name of Object.keys(files)) {
    if (/\.xml$|\.rels$/i.test(name)) {
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(files[name])
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Word 包含不支持的 XML 声明')
      if (name.endsWith('.rels')) {
        const relationships: string[] = []
        const parser = new SaxesParser({ xmlns: true })
        parser.on('opentag', (tag) => {
          if (tag.local !== 'Relationship') return
          const attr = (key: string): string => Object.values(tag.attributes).find((a) => a.local === key)?.value ?? ''
          const target = attr('Target'), type = attr('Type'), id = attr('Id')
          const base = name === '_rels/.rels' ? '' : posix.dirname(posix.dirname(name))
          const resolved = posix.normalize(posix.join(base, target))
          if (attr('TargetMode').toLowerCase() === 'external' || /^(?:[a-z]+:|\/|\\)/i.test(target) || /[\\?#]/.test(target) ||
            /aFChunk|oleObject|package|control/i.test(type) || resolved.startsWith('../') ||
            (type.endsWith('/image') && !/\.(png|jpe?g)$/i.test(target))) { removed = true; return }
          relationships.push(`<Relationship Id="${escape(id)}" Type="${escape(type)}" Target="${escape(target)}"/>`)
        })
        parser.write(xml).close()
        files[name] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`)
      }
    }
    if (/^word\/(embeddings|activeX)\//i.test(name) || /\.(html?|mht)$/i.test(name)) { delete files[name]; removed = true }
  }
  return { buffer: Buffer.from(zipSync(files, { level: 1 })), warning: removed ? '预览已跳过外部链接资源、嵌入对象或非 PNG/JPEG 配图。原 Word 保留；如有缺失，请改用 PDF 或截图。' : null }
}
