import {
  Math as OfficeMath,
  convertToXmlComponent,
  ImportedXmlComponent,
  type IContext,
  type IXmlableObject,
  type XmlElement
} from 'docx'
import { SaxesParser } from 'saxes'

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'
const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// Explicit support boundary of mathml2omml 0.5; unsupported elements must not
// fall through that library's warning-only branch and silently lose semantics.
const SUPPORTED_MATHML = new Set([
  'math', 'menclose', 'mfrac', 'mi', 'mmultiscripts', 'mn', 'mo', 'mover',
  'mroot', 'mrow', 'ms', 'mspace', 'msqrt', 'mstyle', 'msub', 'msubsup',
  'msup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'semantics'
])
const ARITY: Record<string, number> = {
  mfrac: 2, mroot: 2, msub: 2, msup: 2, mover: 2, munder: 2,
  msubsup: 3, munderover: 3
}

/** Strict XML parsing: no DTD, external entities, instructions or arbitrary HTML. */
function parseMathXml(xml: string, office: boolean): XmlElement {
  if (xml.length > 1_000_000) throw new Error('公式结构过大，请拆分公式')
  const stack: XmlElement[] = []
  let root: XmlElement | undefined
  let count = 0
  const parser = new SaxesParser({ xmlns: true })
  parser.on('doctype', () => { throw new Error('公式含有不支持的文档声明') })
  parser.on('processinginstruction', () => { throw new Error('公式含有不支持的处理指令') })
  parser.on('error', (error) => { throw error })
  parser.on('opentag', (tag) => {
    if (++count > 20_000 || stack.length > 128) throw new Error('公式结构过于复杂，请拆分公式')
    if (office) {
      if (tag.uri !== OMML_NS && tag.uri !== WORD_NS) throw new Error('公式转换产生了无效的 Word 节点')
    } else if (tag.uri !== MATHML_NS || !SUPPORTED_MATHML.has(tag.local)) {
      throw new Error(`暂不能导出这种公式结构（${tag.local}），请简化该公式后重试`)
    }
    const node: XmlElement = {
      type: 'element', name: tag.name,
      attributes: Object.fromEntries(Object.values(tag.attributes).map((attr) => [attr.name, attr.value])),
      elements: []
    }
    if (stack.length) stack[stack.length - 1].elements!.push(node)
    else root = node
    stack.push(node)
  })
  parser.on('text', (value) => {
    if (stack.length) stack[stack.length - 1].elements!.push({ type: 'text', text: value })
  })
  parser.on('cdata', () => { throw new Error('公式含有不支持的文本结构') })
  parser.on('closetag', () => {
    const node = stack.pop()!
    if (!office) {
      const required = ARITY[node.name!]
      if (required && node.elements!.filter((child) => child.type === 'element').length !== required) {
        throw new Error(`公式结构不完整（${node.name}），请检查分子、分母或上下标`)
      }
    }
  })
  parser.write(xml).close()
  if (!root || root.name !== (office ? 'm:oMath' : 'math')) throw new Error('公式转换未生成完整内容')
  return root
}

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Convert numeric entities to Unicode while retaining escaping of XML syntax. */
function serializeMathMl(node: XmlElement): string {
  if (node.type === 'text') return escapeXml(String(node.text ?? ''))
  const attributes = Object.entries(node.attributes ?? {}).map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`).join('')
  return `<${node.name}${attributes}>${(node.elements ?? []).map(serializeMathMl).join('')}</${node.name}>`
}

function textOf(node: XmlElement): string {
  return node.type === 'text' ? String(node.text ?? '') : (node.elements ?? []).map(textOf).join('')
}

/** Normalize two concrete 0.5 output quirks to the Office Math schema. */
function normalizeOfficeMath(node: XmlElement): void {
  node.elements?.forEach(normalizeOfficeMath)
  if (node.name === 'm:r' && node.elements) {
    // CT_R puts mathematical properties before Word run properties. The
    // converter emits these in the opposite order for e.g. \mathrm{d}.
    node.elements = [
      ...node.elements.filter((child) => child.name === 'm:rPr'),
      ...node.elements.filter((child) => child.name === 'w:rPr'),
      ...node.elements.filter((child) => child.name !== 'm:rPr' && child.name !== 'w:rPr')
    ]
  }
  if (node.name === 'm:bar') {
    // The library wraps a bar's base in an unnecessary empty sub/superscript;
    // its superscript branch even uses m:sub. Keep the actual base directly.
    const base = node.elements?.find((child) => child.name === 'm:e')
    const script = base?.elements?.length === 1 ? base.elements[0] : undefined
    if (script && (script.name === 'm:sSup' || script.name === 'm:sSub')) {
      const actualBase = script.elements?.find((child) => child.name === 'm:e')
      const scripts = script.elements?.filter((child) => child.name === 'm:sub' || child.name === 'm:sup') ?? []
      if (base && actualBase && scripts.length > 0 && scripts.every((child) => !child.elements?.length)) {
        base.elements = actualBase.elements ?? []
      }
    }
  }
}

/** Fail closed if conversion drops identifiers, numbers, operators or prose. */
function assertTextPreserved(mathml: XmlElement, omml: XmlElement): void {
  const source: string[] = []
  const target: string[] = []
  const visit = (node: XmlElement, tags: Set<string>, output: string[]): void => {
    if (node.name && tags.has(node.name)) output.push(textOf(node))
    else node.elements?.forEach((child) => visit(child, tags, output))
  }
  visit(mathml, new Set(['mi', 'mn', 'mtext', 'mo']), source)
  visit(omml, new Set(['m:t']), target)
  const collectSymbols = (node: XmlElement): void => {
    if (node.name && ['m:chr', 'm:begChr', 'm:endChr', 'm:sepChr'].includes(node.name)) {
      target.push(String(node.attributes?.['m:val'] ?? ''))
    }
    if (node.name === 'm:bar') {
      const position = node.elements?.find((child) => child.name === 'm:barPr')?.elements
        ?.find((child) => child.name === 'm:pos')?.attributes?.['m:val']
      target.push(position === 'bot' ? '\u0332' : '\u0305')
    }
    node.elements?.forEach(collectSymbols)
  }
  collectSymbols(omml)
  // Office represents accents with combining characters; MathML often uses
  // spacing accents or long arrows. Compare their equivalent character forms.
  const accents: Record<string, string> = {
    '←': '\u20d6', '⟵': '\u20d6', '→': '\u20d7', '⟶': '\u20d7',
    '´': '\u0301', '˝': '\u030b', '˘': '\u0306', 'ˇ': '\u030c', '¸': '\u0312',
    '^': '\u0302', '¨': '\u0308', '˙': '\u0307', '`': '\u0300', '-': '\u0305',
    '¯': '\u0305', '−': '\u0305', '_': '\u0332', '.': '\u0307', '~': '\u0303', '˜': '\u0303'
  }
  const characters = (values: string[]): string[] => [...values.join('').replace(/[\s\u2061-\u2064\u200b]/g, '')]
    .map((char) => accents[char] ?? char)
  const remaining = new Map<string, number>()
  for (const char of characters(target)) remaining.set(char, (remaining.get(char) ?? 0) + 1)
  for (const char of characters(source)) {
    const count = remaining.get(char) ?? 0
    if (count === 0) throw new Error('转换器无法完整保留该公式的文字或符号，请简化公式后重试')
    remaining.set(char, count - 1)
  }
}

/** A real paragraph-level m:oMath element, accepted by docx's branded Math type. */
class ImportedOfficeMath extends OfficeMath {
  constructor(private readonly imported: ImportedXmlComponent) { super({ children: [] }) }
  override prepForXml(context: IContext): IXmlableObject | undefined { return this.imported.prepForXml(context) }
}

/** Pure local conversion using MathLive + the separately distributed LGPL library. */
export async function wordMath(latex: string, location: string): Promise<OfficeMath> {
  try {
    if (!latex.trim()) throw new Error('公式为空')
    if (/\\(?:placeholder|prompt)\b/.test(latex)) throw new Error('公式还含有待填写的位置')
    // MathLive 0.111's MathML emitter omits these atom types, including their
    // bodies, even when syntax validation succeeds. Reject rather than losing
    // part of an otherwise nonempty equation. This is only a support guard;
    // all LaTeX parsing is still done by MathLive.
    const unsupportedCommands = new Set([
      'overline', 'underline', 'rlap', 'llap', 'mathrlap', 'mathllap',
      'smash', 'phantom', 'vphantom', 'hphantom', 'mathstrut', 'rule', 'ce', 'pu', 'not'
    ])
    for (const match of latex.matchAll(/\\([A-Za-z]+|[\s\S])/g)) {
      if (unsupportedCommands.has(match[1])) {
        const alternative = match[1] === 'overline' ? '；上横线可改用 \\bar{...}' : match[1] === 'not' ? '；不等号可改用 \\neq' : ''
        throw new Error(`当前公式转换器不支持 \\${match[1]}${alternative}`)
      }
    }
    const [{ validateLatex, convertLatexToMathMl }, { mml2omml }] = await Promise.all([
      // MathLive's Node conditional export resolves to its DOM-free SSR build.
      import('mathlive'), import('mathml2omml')
    ])
    const errors = validateLatex(latex)
    if (errors.length) throw new Error(`公式语法不完整或命令不受支持（${errors[0].code}${errors[0].arg ? `: ${errors[0].arg}` : ''}）`)
    // MathLive emits these two HTML named entities; standalone MathML XML
    // has no HTML DTD, so replace only the known entities with Unicode.
    const fragment = convertLatexToMathMl(latex).replace(/&ne;/g, '\u2260').replace(/&nbsp;/g, '\u00a0')
    if (!fragment.trim()) throw new Error('该公式没有可导出的数学内容')
    const mathml = parseMathXml(`<math xmlns="${MATHML_NS}">${fragment}</math>`, false)
    // 0.5's default XML entity decoding followed by raw serialization would
    // emit invalid XML for < and &. Preserve these escapes; normalize numeric
    // entities first so the converter still recognizes integral/limit symbols.
    const omml = parseMathXml(mml2omml(serializeMathMl(mathml), { disableDecode: true }), true)
    normalizeOfficeMath(omml)
    if (!textOf(omml).trim()) throw new Error('转换后公式为空，请补充完整公式')
    assertTextPreserved(mathml, omml)
    const component = convertToXmlComponent(omml)
    if (!(component instanceof ImportedXmlComponent)) throw new Error('无法生成 Word 公式节点')
    return new ImportedOfficeMath(component)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '转换失败'
    const preview = latex.length > 100 ? `${latex.slice(0, 100)}…` : latex
    throw new Error(`${location}的公式无法导出：${detail}\n公式：${preview}`)
  }
}
