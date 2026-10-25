import type { IntakeDraft } from '@shared/intake'
import { assetUrl } from '@shared/editable'

export const roleNames = { stem: '题干', option: '选项', answer: '答案', analysis: '解析', figure: '题干配图', answerFigure: '答案配图' }
export const isAnswerPart = (role: string) => ['answer', 'analysis', 'answerFigure'].includes(role)
export interface Composition { question: ArrayBuffer; answer: ArrayBuffer | null; questionUrl: string; answerUrl: string | null }
/** Render only user-selected local components; never request OCR or remote resources. */
export async function composeQuestion(draft: IntakeDraft): Promise<Composition> {
  await document.fonts.ready
  const render = async (answer: boolean): Promise<{ data: ArrayBuffer; url: string } | null> => {
    const components = draft.components.filter((c) => isAnswerPart(c.role) === answer)
    if (!components.length) return null
    const width = 1400, margin = 60, lineHeight = 52
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!
    const font = '34px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.font = font
    const rows: ({ type: 'text'; text: string; y: number } | { type: 'image'; image: HTMLImageElement; y: number; width: number; height: number })[] = []
    let y = margin
    for (const c of components) {
      const prefix = c.role === 'option' && c.label ? `${c.label}. ` : c.role === 'answer' ? '答案：' : c.role === 'analysis' ? '解析：' : ''
      if (c.text || prefix) for (const paragraph of `${prefix}${c.text}`.split(/\r?\n/)) {
        let line = ''
        for (const char of paragraph) {
          if (ctx.measureText(line + char).width > width - 2 * margin && line) { rows.push({ type: 'text', text: line, y }); y += lineHeight; line = '' }
          line += char
        }
        rows.push({ type: 'text', text: line, y }); y += lineHeight
        if (y > 11500) throw new Error('这道题太长，无法生成清晰的单题图，请拆分题目')
      }
      if (c.assetId) {
        const asset = draft.assets.find((a) => a.id === c.assetId)
        if (!asset) throw new Error('组成部分的图片不存在，请重新添加')
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = assetUrl(asset.path); await img.decode()
        const ratio = Math.min(1.5, (width - 2 * margin) / img.naturalWidth)
        const w = Math.round(img.naturalWidth * ratio), h = Math.round(img.naturalHeight * ratio)
        rows.push({ type: 'image', image: img, y, width: w, height: h }); y += h + 12
      }
      y += 24
      if (y > 11500) throw new Error('组合后的题图过长，请减少部分或拆分题目')
    }
    canvas.width = width; canvas.height = Math.ceil(y + margin)
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, canvas.height)
    ctx.fillStyle = '#111'; ctx.font = font; ctx.textBaseline = 'top'
    for (const row of rows) {
      if (row.type === 'text') ctx.fillText(row.text, margin, row.y)
      else ctx.drawImage(row.image, margin, row.y, row.width, row.height)
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('组题图片生成失败')), 'image/png'))
    if (blob.size > 20 * 1024 * 1024) throw new Error('组合图片超过 20 MiB，请缩小配图或拆分题目')
    return { data: await blob.arrayBuffer(), url: URL.createObjectURL(blob) }
  }
  const question = await render(false)
  if (!question) throw new Error('请先添加题干、选项或题干配图')
  try {
    const answer = await render(true)
    return { question: question.data, answer: answer?.data ?? null, questionUrl: question.url, answerUrl: answer?.url ?? null }
  } catch (e) { URL.revokeObjectURL(question.url); throw e }
}
export function releaseComposition(value: Composition | null): void {
  if (value) { URL.revokeObjectURL(value.questionUrl); if (value.answerUrl) URL.revokeObjectURL(value.answerUrl) }
}
