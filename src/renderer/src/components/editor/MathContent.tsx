import { useEffect, useMemo, useRef } from 'react'
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { convertLatexToMarkup, MathfieldElement, validateLatex } from 'mathlive'
import 'mathlive/fonts.css'
import 'mathlive/static.css'

// Vite resolves every font URL in fonts.css into the application bundle.
// Disable MathLive's CDN fallback and optional network-loaded sounds.
MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null

const FORMULAS = [
  ['分式', '\\frac{a}{b}'], ['根号', '\\sqrt{x}'], ['上下标', 'v_0^2'],
  ['矢量', '\\vec{F}'], ['牛顿第二定律', '\\vec{F}=m\\vec{a}'],
  ['匀变速', 'v=v_0+at'], ['动能', 'E_k=\\frac{1}{2}mv^2'],
  ['欧姆定律', 'I=\\frac{U}{R}'], ['求和', '\\sum_{i=1}^{n}F_i'],
  ['积分', '\\int_a^b f(x)\\,\\mathrm{d}x']
]

/** Render only generated mathematical markup; remove active HTML/URLs. */
function mathMarkup(latex: string): string {
  try {
    const parsed = new DOMParser().parseFromString(convertLatexToMarkup(latex), 'text/html')
    const tags = new Set(['SPAN', 'SVG', 'PATH', 'G', 'LINE', 'RECT', 'USE'])
    for (const el of [...parsed.body.querySelectorAll('*')]) {
      if (!tags.has(el.tagName.toUpperCase())) { el.replaceWith(...el.childNodes); continue }
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || /(?:href|src)/i.test(attr.name) ||
          /(?:url\s*\(|javascript:|@import)/i.test(attr.value)) el.removeAttribute(attr.name)
      }
    }
    return parsed.body.innerHTML
  } catch { return '' }
}

export function MathContent({ latex }: { latex: string }) {
  const html = useMemo(() => mathMarkup(latex), [latex])
  return html ? <span className="question-math" aria-label={latex} dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="question-math-fallback">{latex}</span>
}

export function FormulaDialog({ opened, value, onChange, onClose, onInsert }: {
  opened: boolean; value: string; onChange: (value: string) => void
  onClose: () => void; onInsert: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const field = useRef<MathfieldElement | null>(null)
  const syntaxErrors = useMemo(() => validateLatex(value), [value])
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!opened || !host.current) return
    const mf = new MathfieldElement()
    mf.mathVirtualKeyboardPolicy = 'manual'
    mf.menuItems = []
    mf.value = value
    mf.setAttribute('aria-label', '可视公式编辑器')
    const update = () => onChangeRef.current(mf.value)
    mf.addEventListener('input', update)
    host.current.appendChild(mf)
    field.current = mf
    mf.focus()
    return () => { mf.removeEventListener('input', update); mf.remove(); field.current = null }
  }, [opened])
  useEffect(() => {
    if (field.current && field.current.value !== value) field.current.value = value
  }, [value])
  return <Modal opened={opened} onClose={onClose} title="编辑公式" size="lg" keepMounted trapFocus={false}>
    <Stack>
      <Text size="sm" c="dimmed">在公式框内直接编辑，或点选常用结构。保存后公式仍可再次修改。</Text>
      <div ref={host} className="formula-field-host" />
      <Group gap="xs">{FORMULAS.map(([name, latex]) => <Button key={name} variant="light" size="xs" onClick={() => {
        const mf = field.current
        if (mf) { mf.focus(); mf.insert(latex); onChange(mf.value) }
      }}>{name}</Button>)}</Group>
      <Textarea label="LaTeX（可选）" description="也可粘贴已有 LaTeX。不要包含外层 $ 符号。" value={value}
        autosize minRows={2} maxRows={6} onChange={(event) => onChange(event.currentTarget.value)} />
      <div className="formula-preview"><MathContent latex={value} /></div>
      {syntaxErrors.length > 0 && <Alert color="orange">公式结构尚不完整，或包含无法识别的命令。请检查括号、分子分母和命令拼写后再插入。</Alert>}
      <Group justify="flex-end"><Button variant="default" onClick={onClose}>取消</Button>
        <Button disabled={!value.trim() || syntaxErrors.length > 0} onClick={onInsert}>放入正文</Button></Group>
    </Stack>
  </Modal>
}
