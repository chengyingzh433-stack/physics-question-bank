import { app, dialog, nativeImage } from 'electron'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { open, rename, rm } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  AlignmentType, Document, ImageRun, Packer, Paragraph, TextRun,
  type IParagraphOptions, type ParagraphChild
} from 'docx'
import { getDb } from '../storage/StorageService'
import * as setRepo from '../storage/repositories/setRepo'
import * as contentRepo from '../storage/repositories/contentRepo'
import { getProjectsRoot } from '../files/FileService'
import {
  hasEditableContent,
  type EditableDocument, type QuestionContentDTO, type WordExportOptions
} from '../../shared/editable'
import { wordMath } from './WordMath'

const MM_TO_TWIPS = 1440 / 25.4
const MM_TO_PX = 96 / 25.4
const BODY_FONT = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: '宋体', cs: 'Times New Roman' }

/** Validate both IPC input and previously saved settings; never silently clamp. */
export function normalizeWordOptions(input: unknown): WordExportOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Word 排版设置无效')
  const value = input as Record<string, unknown>
  const text = (key: string, max: number, label: string): string => {
    if (typeof value[key] !== 'string' || (value[key] as string).trim().length > max) throw new Error(`${label}须为不超过 ${max} 个字的文本`)
    const result = (value[key] as string).trim()
    for (const character of result) {
      const cp = character.codePointAt(0)!
      if ((cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0xfffe || cp === 0xffff) {
        throw new Error(`${label}含有无效字符`)
      }
    }
    return result
  }
  const number = (key: string, min: number, max: number, label: string): number => {
    const result = value[key]
    if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) throw new Error(`${label}须在 ${min}–${max} 之间`)
    return result
  }
  if (!['none', 'inline', 'append'].includes(value.answerMode as string)) throw new Error('Word 答案位置无效')
  if (typeof value.questionStartNewPage !== 'boolean') throw new Error('Word 分页设置无效')
  return {
    title: text('title', 200, '试卷标题') || '物理试卷',
    subtitle: text('subtitle', 500, '副标题'),
    answerMode: value.answerMode as WordExportOptions['answerMode'],
    fontSize: number('fontSize', 8, 24, '字号'),
    marginMm: number('marginMm', 10, 35, '页边距'),
    questionSpacing: number('questionSpacing', 0, 60, '题间距'),
    questionStartNewPage: value.questionStartNewPage
  }
}

interface SourceImage { bytes: Buffer; name: string }
interface SnapshotQuestion {
  id: number
  number: string
  groupHeader: string | null
  content: QuestionContentDTO | null
  original: SourceImage | null
  answerOriginal: SourceImage | null
  assets: Map<string, SourceImage>
}

/**
 * Capture metadata, selected revisions and image bytes before asynchronous
 * conversion. Later edits, storage moves or answer replacement cannot create
 * a document that mixes old metadata with new/missing image bytes.
 */
function readSnapshot(setId: number, includeAnswers: boolean): SnapshotQuestion[] {
  if (!Number.isSafeInteger(setId) || setId <= 0) throw new Error('组卷篮编号无效')
  const db = getDb()
  return db.transaction(() => {
    if (!db.prepare('SELECT id FROM paper_sets WHERE id = ?').get(setId)) throw new Error('组卷篮不存在')
    const items = setRepo.listSetItems(db, setId)
    if (!items.length) throw new Error('组卷篮为空，无法导出')
    const root = realpathSync(getProjectsRoot())
    let byteCount = 0
    const readImage = (path: string, paperId: number, questionId: number, kind: 'original' | 'asset', label: string): SourceImage => {
      const relativePath = path.replace(/^projects\//, '')
      const prefix = `${paperId}/images/`
      const filename = relativePath.slice(prefix.length)
      const validFilename = kind === 'asset'
        ? new RegExp(`^content_${questionId}_[0-9a-f-]+\\.png$`).test(filename)
        : new RegExp(`^(?:q_${questionId}|a_${questionId}(?:_[0-9a-f-]+)?)\\.png$`).test(filename)
      if (!relativePath.startsWith(prefix) || !validFilename) throw new Error(`${label}图片路径与题目不匹配，请重新保存图片`)
      try {
        const absolute = realpathSync(join(root, relativePath))
        const inside = relative(root, absolute)
        if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('图片路径不在题库目录内')
        const stat = statSync(absolute)
        if (!stat.isFile() || stat.size > 40 * 1024 * 1024) throw new Error('单张图片超过 40 MB 或不是文件')
        byteCount += stat.size
        if (byteCount > 384 * 1024 * 1024) throw new Error('本次组卷图片总量超过 384 MB，请分卷导出')
        return { bytes: readFileSync(absolute), name: filename }
      } catch (error) {
        throw new Error(`${label}图片读取失败：${error instanceof Error ? error.message : '请检查题库文件是否存在'}`)
      }
    }
    return items.map((item, index) => {
      const number = item.display_number?.trim() || String(index + 1)
      const label = `第 ${number} 题`
      const question = db.prepare(`SELECT q.id, q.paper_id, q.image_path, q.answer_image_path
        FROM questions q JOIN papers p ON p.id = q.paper_id WHERE q.id = ? AND (p.kind = 'paper' OR (p.kind = 'intake' AND p.status = 'done'))`).get(item.question_id) as
        { id: number; paper_id: number; image_path: string | null; answer_image_path: string | null } | undefined
      if (!question) throw new Error(`${label}已被删除或不再属于题库，请刷新组卷篮`)
      const content = contentRepo.getQuestionContent(db, question.id)
      const editableQuestion = content?.questionMode === 'editable'
      const editableAnswer = includeAnswers && content?.answerMode === 'editable'
      const assets = new Map<string, SourceImage>()
      if (editableQuestion || editableAnswer) {
        const owned = new Map(contentRepo.listQuestionAssets(db, question.id).map((asset) => [asset.id, asset]))
        const documents = [editableQuestion ? content?.questionBody : undefined, editableAnswer ? content?.answerBody : undefined]
        for (const document of documents) {
          for (const block of document?.content ?? []) {
            if (block.type !== 'image' || assets.has(block.attrs.assetId)) continue
            const asset = owned.get(block.attrs.assetId)
            if (!asset || asset.questionId !== question.id) throw new Error(`${label}含有不属于这道题的配图，请重新插入配图`)
            assets.set(asset.id, readImage(asset.path, question.paper_id, question.id, 'asset', label))
          }
        }
      }
      if (!editableQuestion && !question.image_path) throw new Error(`${label}尚未生成原题图，请先完成入库`)
      return {
        id: question.id, number, groupHeader: item.group_header?.trim() || null, content, assets,
        original: !editableQuestion && question.image_path ? readImage(question.image_path, question.paper_id, question.id, 'original', label) : null,
        answerOriginal: includeAnswers && !editableAnswer && question.answer_image_path
          ? readImage(question.answer_image_path, question.paper_id, question.id, 'original', `${label}答案`) : null
      }
    })
  })()
}

interface Layout { options: WordExportOptions; widthPx: number; heightPx: number }
const paragraphDefaults = (): Pick<IParagraphOptions, 'spacing' | 'widowControl'> => ({
  spacing: { after: 100, line: 276 }, widowControl: true
})

function imageParagraphs(image: SourceImage, widthPercent: number, align: 'left' | 'center' | 'right', caption: string, layout: Layout, location: string): Paragraph[] {
  if (!image.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${location}的图片格式不正确，请重新保存原图或配图`)
  }
  const decoded = nativeImage.createFromBuffer(image.bytes)
  if (decoded.isEmpty()) throw new Error(`${location}的图片损坏，无法导出（${image.name}）`)
  const size = decoded.getSize()
  if (!size.width || !size.height) throw new Error(`${location}的图片尺寸无效`)
  // Keep the original bytes in storage. The Word copy fits on a single A4 page
  // with room for its question label, caption and paragraph spacing.
  const availableHeight = Math.max(96, layout.heightPx - (caption ? 120 : 80) - layout.options.fontSize * 2)
  const scale = Math.min(layout.widthPx * widthPercent / 100 / size.width, availableHeight / size.height)
  const alignment = align === 'left' ? AlignmentType.LEFT : align === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER
  const result = [new Paragraph({
    ...paragraphDefaults(), alignment, keepNext: Boolean(caption),
    children: [new ImageRun({
      type: 'png', data: image.bytes,
      transformation: { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) },
      altText: { title: location, description: caption || location, name: image.name }
    })]
  })]
  if (caption) result.push(new Paragraph({
    ...paragraphDefaults(), alignment,
    children: [new TextRun({ text: caption, size: Math.max(16, (layout.options.fontSize - 1) * 2), color: '555555' })]
  }))
  return result
}

async function editableParagraphs(document: EditableDocument, question: SnapshotQuestion, layout: Layout, location: string): Promise<Paragraph[]> {
  const result: Paragraph[] = []
  let mathIndex = 0
  for (const block of document.content) {
    if (block.type === 'image') {
      const asset = question.assets.get(block.attrs.assetId)
      if (!asset) throw new Error(`${location}的配图不存在，请重新插入`)
      result.push(...imageParagraphs(asset, block.attrs.widthPercent, block.attrs.align, block.attrs.caption, layout, location))
      continue
    }
    const children: ParagraphChild[] = []
    for (const inline of block.content ?? []) {
      if (inline.type === 'text') {
        children.push(new TextRun({
          text: inline.text, bold: inline.marks?.some((mark) => mark.type === 'bold'),
          italics: inline.marks?.some((mark) => mark.type === 'italic')
        }))
      } else if (inline.type === 'hardBreak') children.push(new TextRun({ break: 1 }))
      else children.push(await wordMath(inline.attrs.latex, `${location}第 ${++mathIndex} 个`))
    }
    result.push(new Paragraph({ ...paragraphDefaults(), children }))
  }
  return result
}

async function questionBody(question: SnapshotQuestion, answer: boolean, layout: Layout): Promise<Paragraph[]> {
  const location = `第 ${question.number} 题${answer ? '答案' : ''}`
  const content = question.content
  const editable = content && (answer ? content.answerMode : content.questionMode) === 'editable'
  if (editable) {
    const body = answer ? content.answerBody : content.questionBody
    if (!hasEditableContent(body)) {
      if (answer) return [new Paragraph({ ...paragraphDefaults(), children: [new TextRun({ text: '（暂无答案）', color: '777777' })] })]
      throw new Error(`${location}选择了可编辑内容，但内容为空；请先编辑，或切回原题图`)
    }
    return editableParagraphs(body, question, layout, location)
  }
  const original = answer ? question.answerOriginal : question.original
  if (!original) {
    if (answer) return [new Paragraph({ ...paragraphDefaults(), children: [new TextRun({ text: '（暂无答案）', color: '777777' })] })]
    throw new Error(`${location}没有可导出的题目内容`)
  }
  return imageParagraphs(original, 100, 'left', '', layout, location)
}

async function composeDocument(questions: SnapshotQuestion[], options: WordExportOptions): Promise<Buffer> {
  const layout: Layout = { options, widthPx: (210 - options.marginMm * 2) * MM_TO_PX, heightPx: (297 - options.marginMm * 2) * MM_TO_PX }
  const children: Paragraph[] = [new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 180 },
    children: [new TextRun({ text: options.title, bold: true, size: 36 })]
  })]
  if (options.subtitle) children.push(new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 240 },
    children: [new TextRun({ text: options.subtitle, size: 22 })]
  }))
  for (const [index, question] of questions.entries()) {
    const newPage = options.questionStartNewPage && index > 0
    if (question.groupHeader) children.push(new Paragraph({
      ...paragraphDefaults(), keepNext: true, pageBreakBefore: newPage,
      spacing: { before: 160, after: 120 },
      children: [new TextRun({ text: question.groupHeader, bold: true, size: (options.fontSize + 2) * 2 })]
    }))
    children.push(new Paragraph({
      ...paragraphDefaults(), keepNext: true,
      pageBreakBefore: newPage && !question.groupHeader,
      children: [new TextRun({ text: `${question.number}.`, bold: true })]
    }))
    children.push(...await questionBody(question, false, layout))
    if (options.answerMode === 'inline') {
      children.push(new Paragraph({ ...paragraphDefaults(), keepNext: true, children: [new TextRun({ text: '参考答案', bold: true })] }))
      children.push(...await questionBody(question, true, layout))
    }
    if (options.questionSpacing > 0) children.push(new Paragraph({
      spacing: { before: 0, after: Math.round(options.questionSpacing * 20), line: 20 },
      children: [new TextRun({ text: '', size: 2 })]
    }))
  }
  if (options.answerMode === 'append') {
    children.push(new Paragraph({
      pageBreakBefore: true, keepNext: true, spacing: { after: 240 },
      children: [new TextRun({ text: '参考答案', size: 32, bold: true })]
    }))
    for (const question of questions) {
      children.push(new Paragraph({ ...paragraphDefaults(), keepNext: true, spacing: { before: 160, after: 100 }, children: [new TextRun({ text: `${question.number}.`, bold: true })] }))
      children.push(...await questionBody(question, true, layout))
    }
  }
  const margin = Math.round(options.marginMm * MM_TO_TWIPS)
  const document = new Document({
    creator: '物理题库', title: options.title, description: '由物理题库导出的可编辑组卷',
    styles: { default: {
      document: { run: { font: BODY_FONT, size: options.fontSize * 2 }, paragraph: paragraphDefaults() }
    } },
    sections: [{ properties: { page: {
      size: { width: Math.round(210 * MM_TO_TWIPS), height: Math.round(297 * MM_TO_TWIPS) },
      margin: { top: margin, bottom: margin, left: margin, right: margin }
    } }, children }]
  })
  return Packer.toBuffer(document)
}

/** Atomic same-directory replacement; a failed write never truncates the destination. */
async function writeDocxAtomic(filePath: string, data: Buffer): Promise<void> {
  const temporary = join(dirname(filePath), `.physics-word-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(data); await file.sync() } finally { await file.close() }
    await rename(temporary, filePath)
  } finally { await rm(temporary, { force: true }).catch(() => {}) }
}

/** The dialog grants the destination; cancellation performs no file writes. */
export async function exportBasketDocx(setId: number, input: WordExportOptions): Promise<string | null> {
  const options = normalizeWordOptions(input)
  const safeTitle = [...options.title.replace(/[\\/:*?"<>|\r\n]/g, '_')].slice(0, 60).join('').replace(/[. ]+$/, '') || '物理试卷'
  const result = await dialog.showSaveDialog({
    title: '导出可编辑 Word 试卷',
    defaultPath: join(app.getPath('documents'), `${safeTitle}.docx`),
    filters: [{ name: 'Word 文档', extensions: ['docx'] }]
  })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath).toLowerCase() === '.docx' ? result.filePath : `${result.filePath}.docx`
  const questions = readSnapshot(setId, options.answerMode !== 'none')
  const buffer = await composeDocument(questions, options)
  await writeDocxAtomic(filePath, buffer)
  return filePath
}
