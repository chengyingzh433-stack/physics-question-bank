import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, NumberInput, Stack, Text } from '@mantine/core'
import { renderAsync } from 'docx-preview'
import { toPng } from 'html-to-image'
import type { IntakeSource } from '@shared/intake'
import type { OcrCrop } from '@shared/ocr'
import { assetUrl } from '@shared/editable'
import { loadPdf, type PdfDocument } from '../../services/RenderService'
import { OcrImageSelection } from '../editor/OcrImageSelection'

export interface IntakePage { url: string; page: number; text: string }
export function IntakePreview({ source, disabled, readOnly = false, onPage, onSelection, onText }: {
  source: IntakeSource; disabled: boolean; readOnly?: boolean; onPage: (page: IntakePage | null) => void
  onSelection: (crop: OcrCrop | null, scale: number, valid: boolean) => void; onText: (text: string) => void
}) {
  const [page, setPage] = useState(1), [count, setCount] = useState(1)
  const [ready, setReady] = useState(0), [image, setImage] = useState<IntakePage | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const pdf = useRef<PdfDocument | null>(null), wordPages = useRef<HTMLElement[]>([])
  const frame = useRef<HTMLIFrameElement>(null)
  const callbacks = useRef({ onPage, onSelection }); callbacks.current = { onPage, onSelection }
  useEffect(() => {
    let cancelled = false, destroy: (() => Promise<void>) | undefined
    setLoading(true); setError(''); setImage(null); setReady(0); callbacks.current.onPage(null)
    const load = async () => {
      if (source.kind === 'image') { setCount(1); return }
      if (source.kind === 'pdf') {
        const loaded = await loadPdf(assetUrl(source.previewPath)); destroy = loaded.destroy
        if (cancelled) { await loaded.destroy(); return }
        pdf.current = loaded.doc; setCount(loaded.doc.numPages)
      } else {
        const iframe = frame.current!
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Word 预览页面未能载入，请重新打开草稿')), 15000)
          iframe.onload = () => { window.clearTimeout(timer); resolve() }
          iframe.srcdoc = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob:; style-src &#39;unsafe-inline&#39;; font-src data: blob:;"><style>body{margin:0;background:white;color:black}section.docx{box-shadow:none!important;margin:0!important}</style></head><body></body></html>'
        })
        if (cancelled) return
        const doc = iframe.contentDocument!
        doc.addEventListener('click', (e) => e.preventDefault())
        const response = await fetch(assetUrl(source.previewPath))
        if (!response.ok) throw new Error('Word 预览副本无法读取')
        const styles = doc.createElement('div'), content = doc.createElement('div')
        doc.body.replaceChildren(styles, content)
        await renderAsync(await response.arrayBuffer(), content, styles, { inWrapper: false, ignoreFonts: true,
          useBase64URL: true, renderAltChunks: false, renderChanges: false, renderComments: false, breakPages: true,
          ignoreLastRenderedPageBreak: false, experimental: false })
        if (cancelled) return
        const pages = [...doc.querySelectorAll<HTMLElement>('section.docx')]
        if (!pages.length || pages.length > 300) throw new Error('Word 预览为空或超过 300 页，请拆分或改用 PDF')
        // Guard unsupported/malicious links and objects even after the package has been sanitized.
        doc.querySelectorAll('a').forEach((a) => a.removeAttribute('href'))
        doc.querySelectorAll('iframe,object,embed,script').forEach((e) => e.remove())
        for (const element of doc.querySelectorAll('*')) {
          for (const attribute of [...element.attributes]) {
            if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
          }
          if (element.localName.toLowerCase() === 'image') {
            for (const attribute of [...element.attributes].filter((a) => a.localName === 'href')) {
              if (!/^data:image\/(png|jpeg);base64,/i.test(attribute.value)) throw new Error('Word 含不支持的矢量配图，请改用 PDF')
            }
          }
          if (element.tagName === 'IMG') {
            const src = element.getAttribute('src') ?? ''
            if (src && !/^data:image\/(png|jpeg);base64,/i.test(src)) throw new Error('Word 含不支持的配图资源，请改用 PDF')
          }
          // html-to-image runs in the parent page, so reject any CSS resource that could
          // escape the iframe's CSP during image embedding. Generated local images use data URLs.
          const computed = doc.defaultView!.getComputedStyle(element)
          for (const property of ['background-image', 'mask-image', '-webkit-mask-image']) {
            const value = computed.getPropertyValue(property)
            if (/url\(/i.test(value) && !/^url\(["']?data:image\/(png|jpeg);base64,[a-z0-9+/=]+["']?\)$/i.test(value)) {
              throw new Error('Word 含不支持的背景资源，请改用 PDF')
            }
          }
        }
        wordPages.current = pages; setCount(pages.length)
      }
    }
    void load().then(() => { if (!cancelled) setReady((v) => v + 1) }).catch((e) => {
      if (!cancelled) { setError(String(e instanceof Error ? e.message : e)); setLoading(false) }
    })
    return () => { cancelled = true; pdf.current = null; wordPages.current = []; void destroy?.() }
  }, [source.id])
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const currentPdf = pdf.current
    let renderTask: ReturnType<Awaited<ReturnType<PdfDocument['getPage']>>['render']> | null = null
    setLoading(true); setError(''); setImage(null); callbacks.current.onPage(null); callbacks.current.onSelection(null, 1, false)
    const render = async (): Promise<IntakePage> => {
      if (source.kind === 'image') return { url: assetUrl(source.previewPath), page: 1, text: '' }
      if (currentPdf) {
        const p = await currentPdf.getPage(page), base = p.getViewport({ scale: 1 })
        if (cancelled) throw new Error('已切换原稿')
        const scale = Math.min(2.5, 1800 / base.width, 10000 / base.height)
        const viewport = p.getViewport({ scale }), canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        renderTask = p.render({ canvasContext: canvas.getContext('2d')!, viewport })
        await renderTask.promise
        const textContent = await p.getTextContent()
        const text = textContent.items.map((i) => 'str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '').join('')
        const url = canvas.toDataURL('image/png'); p.cleanup()
        return { url, page, text }
      }
      const node = wordPages.current[page - 1]
      if (!node) throw new Error('Word 页码无效')
      await Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
      const width = Math.ceil(Math.max(node.scrollWidth, node.getBoundingClientRect().width))
      const height = Math.ceil(Math.max(node.scrollHeight, node.getBoundingClientRect().height))
      if (width < 1 || height < 1 || width > 5000 || height > 20000 || width * height > 20_000_000) throw new Error('此页过大，无法生成清晰预览，请改用分页 PDF')
      const ratio = Math.min(2, 1800 / width, 10000 / height)
      const url = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: ratio, width, height, skipFonts: true, cacheBust: false })
      return { url, page, text: node.innerText.slice(0, 20000) }
    }
    void render().then((value) => { if (!cancelled) { setImage(value); callbacks.current.onPage(value) } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [source.id, page, ready])
  return <Stack gap="sm">
    {source.kind !== 'image' && <Group justify="space-between">
      <Group gap="xs"><Button size="xs" variant="default" disabled={disabled || loading || page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
        <NumberInput aria-label="原稿页码" value={page} min={1} max={count} w={80} disabled={disabled || loading} allowDecimal={false}
          onChange={(v) => { if (typeof v === 'number' && v >= 1 && v <= count) setPage(v) }} />
        <Text size="sm">/ {count} 页</Text><Button size="xs" variant="default" disabled={disabled || loading || page >= count} onClick={() => setPage((p) => p + 1)}>下一页</Button></Group>
      <Button size="xs" variant="light" disabled={!image?.text.trim() || disabled || loading || readOnly} onClick={() => image && onText(image.text)}>读取本页文字到输入框</Button>
    </Group>}
    {source.warning && <Alert color="orange">{source.warning}</Alert>}
    {source.kind === 'docx' && <Text size="xs" c="dimmed">Word 预览的分页、字体和复杂对象可能与原文档不同。如显示不完整，可先导出 PDF 再录入。</Text>}
    {error && <Alert color="red" title="原稿已保留，预览未完成">{error}</Alert>}
    {loading && <Group justify="center" p="xl"><Loader size="sm" /><Text>正在本机生成预览…</Text></Group>}
    {image && !loading && <OcrImageSelection key={`${source.id}-${page}`} url={image.url} disabled={disabled || readOnly}
      onChange={onSelection} purpose="intake" />}
    {source.kind === 'docx' && <iframe ref={frame} sandbox="allow-same-origin" title="本机 Word 预览" className="intake-word-frame" />}
  </Stack>
}

export async function cropPage(url: string, crop: OcrCrop | null, scale = 1): Promise<ArrayBuffer> {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url
  await img.decode()
  const c = crop ?? { x: 0, y: 0, width: 1, height: 1 }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * c.width * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * c.height * scale))
  if (canvas.width > 12000 || canvas.height > 12000 || canvas.width * canvas.height > 40_000_000) throw new Error('选区过大，请缩小副本尺寸')
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, c.x * img.naturalWidth, c.y * img.naturalHeight, c.width * img.naturalWidth, c.height * img.naturalHeight, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('选区图片生成失败')), 'image/png'))
  return blob.arrayBuffer()
}
