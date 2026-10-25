import { randomUUID } from 'node:crypto'
import type { EditableBlock, EditableDocument, EditableInline, QuestionAssetDTO } from '../../shared/editable'
import type { OcrIssue } from '../../shared/ocr'
import { wordMath } from '../export/WordMath'

interface Node {
  type: string; value?: string; url?: string; alt?: string; children?: Node[]; ordered?: boolean; start?: number
  position?: { start: { offset?: number }; end: { offset?: number } }
}
const safeText = (value: string): string => [...value].filter((char) => {
  const cp = char.codePointAt(0)!
  return (cp >= 32 || cp === 9 || cp === 10 || cp === 13) && !(cp >= 0xd800 && cp <= 0xdfff) && cp !== 0xfffe && cp !== 0xffff
}).join('')

/** Normalize Doc2X's \(...\)/\[...\] delimiters, outside parsed code spans. */
function normalizeDelimiters(source: string, tree: Node): string {
  const codeRanges: [number, number][] = []
  const visit = (node: Node): void => {
    if ((node.type === 'code' || node.type === 'inlineCode') && node.position) codeRanges.push([node.position.start.offset!, node.position.end.offset!])
    else node.children?.forEach(visit)
  }
  visit(tree)
  codeRanges.sort((a, b) => a[0] - b[0])
  let result = '', index = 0, range = 0
  while (index < source.length) {
    if (codeRanges[range]?.[0] === index) { result += source.slice(index, codeRanges[range][1]); index = codeRanges[range++][1]; continue }
    if (source[index] === '\\' && source[index + 1] === '\\') { result += '\\\\'; index += 2; continue }
    const opening = source.slice(index, index + 2)
    if (opening === '\\(' || opening === '\\[') {
      const closing = opening === '\\(' ? '\\)' : '\\]'
      const end = source.indexOf(closing, index + 2)
      if (end !== -1 && !codeRanges.some(([start, stop]) => start < end + 2 && stop > index)) {
        const body = source.slice(index + 2, end)
        // remark-math accepts matching runs of dollars. Make the delimiter
        // longer than every run in the TeX body so even \\$ remains literal.
        const longestRun = [...body.matchAll(/\$+/g)].reduce((length, match) => Math.max(length, match[0].length), 0)
        const delimiter = '$'.repeat(Math.max(opening === '\\[' ? 2 : 1, longestRun + 1))
        result += opening === '\\[' ? `\n\n${delimiter}\n${body}\n${delimiter}\n\n`
          : `${delimiter} ${body.replace(/[\r\n]/g, ' ')} ${delimiter}`
        index = end + 2; continue
      }
    }
    result += source[index++]
  }
  return result
}

/** Parse with remark; remote HTML is data and is never rendered or executed. */
export async function convertOcrMarkdown(rawMarkdown: string, image: (reference: string) => Promise<QuestionAssetDTO | null>): Promise<{ document: EditableDocument; issues: OcrIssue[] }> {
  if (typeof rawMarkdown !== 'string' || rawMarkdown.length > 400_000) throw new Error('识别文字超过单题处理限制，请缩小识别区域')
  const [{ unified }, { default: remarkParse }, { default: remarkMath }, { default: remarkGfm }, { Parser }] = await Promise.all([
    import('unified'), import('remark-parse'), import('remark-math'), import('remark-gfm'), import('htmlparser2')
  ])
  const issues: OcrIssue[] = []
  const issue = (kind: OcrIssue['kind'], message: string, original: string): void => {
    if (issues.length >= 100) throw new Error('识别内容包含过多待处理结构，请缩小选区后重试')
    issues.push({ id: randomUUID(), kind, message, original: safeText(original).slice(0, 8000), resolution: '' })
  }
  const clean = safeText(rawMarkdown)
  if (clean !== rawMarkdown) issue('conversion', '识别结果包含无效控制字符，已移除；请对照原图核对', '')
  const source = normalizeDelimiters(clean, unified().use(remarkParse).parse(clean) as unknown as Node)
  const tree = unified().use(remarkParse).use(remarkMath).use(remarkGfm).parse(source) as unknown as Node
  const blocks: EditableBlock[] = []
  let pending: EditableInline[] = [], nodeCount = 0
  const original = (node: Node): string => source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0) || node.value || ''
  const appendText = (value: string, marks: { type: 'bold' | 'italic' }[] = []): void => {
    const parts = safeText(value).split('\n')
    parts.forEach((part, index) => {
      if (index) pending.push({ type: 'hardBreak' })
      if (part) pending.push({ type: 'text', text: part, ...(marks.length ? { marks } : {}) })
    })
  }
  const flush = (): void => {
    if (pending.length) { blocks.push({ type: 'paragraph', content: pending }); pending = [] }
    if (blocks.length > 1500) throw new Error('识别段落过多，请缩小识别区域')
  }
  const addImage = async (reference: string, label = ''): Promise<void> => {
    flush()
    const asset = await image(reference)
    if (!asset) {
      issue('missing_image', '配图未能取得，请使用原图裁图补充；未自动访问外部图片地址', reference)
      appendText(`【配图待补：${label || reference}】`); flush(); return
    }
    blocks.push({ type: 'image', attrs: { assetId: asset.id, widthPercent: 70, align: 'center', caption: safeText(label).slice(0, 2000) } })
  }
  const formula = async (latex: string): Promise<void> => {
    try {
      if (latex.length > 8192) throw new Error('公式过长')
      await wordMath(latex, '识别结果')
      pending.push({ type: 'inlineMath', attrs: { latex: latex.trim() } })
    } catch {
      issue('formula', '公式不能直接转为可编辑公式，已按原文保留，请对照原图修改', latex)
      appendText(`\\(${latex}\\)`)
    }
  }
  const html = async (value: string): Promise<void> => {
    const tokens: { type: 'text' | 'image'; value: string; alt?: string }[] = []
    let table = false, unsupported = false
    const parser = new Parser({
      onopentag(name, attrs) {
        if (name === 'table') table = true
        else if (name === 'img') tokens.push({ type: 'image', value: attrs.src ?? '', alt: attrs.alt })
        else if (name === 'br') tokens.push({ type: 'text', value: '\n' })
        else if (!['p', 'span', 'div', 'b', 'strong', 'i', 'em'].includes(name)) unsupported = true
      },
      ontext(text) { tokens.push({ type: 'text', value: text }) },
      onclosetag(name) { if (['p', 'div'].includes(name)) tokens.push({ type: 'text', value: '\n' }) }
    }, { decodeEntities: true })
    parser.write(value); parser.end()
    if (table) { issue('table', '表格暂未转换为可编辑表格，已保留原始内容，请用配图或文字处理', value); appendText(value); return }
    if (unsupported) { issue('unsupported', '识别中的 HTML 结构暂不支持，已作为普通文字保留', value); appendText(value); return }
    for (const token of tokens) {
      if (token.type === 'image') await addImage(token.value, token.alt)
      else appendText(token.value)
    }
  }
  const walk = async (node: Node, marks: { type: 'bold' | 'italic' }[] = [], depth = 0): Promise<void> => {
    if (++nodeCount > 16000 || depth > 64) throw new Error('识别结构过于复杂，请缩小识别区域')
    switch (node.type) {
      case 'text': appendText(node.value ?? '', marks); break
      case 'break': pending.push({ type: 'hardBreak' }); break
      case 'inlineMath': await formula(node.value ?? ''); break
      case 'math': flush(); await formula(node.value ?? ''); flush(); break
      case 'image': await addImage(node.url ?? '', node.alt); break
      case 'html': await html(node.value ?? ''); break
      case 'strong': case 'emphasis': {
        const type = node.type === 'strong' ? 'bold' : 'italic'
        const next = marks.some((mark) => mark.type === type) ? marks : [...marks, { type } as { type: 'bold' | 'italic' }]
        for (const child of node.children ?? []) await walk(child, next, depth + 1)
        break
      }
      case 'paragraph': case 'heading':
        for (const child of node.children ?? []) await walk(child, node.type === 'heading' ? [{ type: 'bold' }] : marks, depth + 1)
        flush(); break
      case 'root': case 'blockquote': case 'listItem':
        for (const child of node.children ?? []) await walk(child, marks, depth + 1)
        flush(); break
      case 'list':
        for (const [index, child] of (node.children ?? []).entries()) { flush(); appendText(node.ordered ? `${(node.start ?? 1) + index}. ` : '• '); await walk(child, marks, depth + 1) }
        break
      case 'table': issue('table', '表格暂不支持结构化编辑，已保留表格原文，请对照原图处理', original(node)); appendText(original(node)); flush(); break
      case 'inlineCode': case 'code': appendText(node.value ?? ''); if (node.type === 'code') flush(); break
      case 'thematicBreak': appendText('────────'); flush(); break
      default:
        issue('unsupported', `暂不支持的内容结构（${node.type}），已保留原文`, original(node))
        appendText(original(node)); flush()
    }
  }
  await walk(tree); flush()
  if (!blocks.length) { blocks.push({ type: 'paragraph', content: [{ type: 'text', text: '【未识别到可用内容，请对照原图补充】' }] }); issue('conversion', '识别结果为空或只有注释，请检查原图', rawMarkdown) }
  return { document: { type: 'doc', content: blocks }, issues }
}
