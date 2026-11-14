import { app, BrowserWindow, dialog } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, dirname, basename, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { PDFDocument } from 'pdf-lib'
import pptxgen from 'pptxgenjs'
import { parseDocument } from 'htmlparser2'
import type { EditableDocument, WordExportOptions } from '../../shared/editable'
import { hasEditableContent } from '../../shared/editable'
import { withStorageUse } from '../storage/activity'
import { normalizeWordOptions, readSnapshot, writeExportAtomic, type SnapshotQuestion, type SourceImage } from './ExportServiceDocx'

const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const dataImage = (image: SourceImage): string => `data:image/png;base64,${image.bytes.toString('base64')}`
let activeExport = false

async function bounded<T>(task: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([task, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}超过 60 秒，请分卷或简化复杂内容后重试`)), 60_000)
    })])
  } finally { if (timer) clearTimeout(timer) }
}

/** Only locally generated mathematical markup is accepted; no URLs or active elements. */
function safeMath(markup: string): string {
  const allowed = new Set(['span', 'svg', 'path', 'g', 'line', 'rect', 'use'])
  type Node = ReturnType<typeof parseDocument>['children'][number]
  const visit = (node: Node): string => {
    if (node.type === 'text') return escape(node.data)
    if (!('children' in node)) return ''
    if (!('name' in node) || !allowed.has(node.name.toLowerCase())) return node.children.map(visit).join('')
    const attributes = Object.entries(node.attribs).filter(([name, value]) =>
      /^(class|style|viewbox|preserveAspectRatio|d|width|height|fill|stroke|xmlns|transform|x|y|x1|y1|x2|y2|stroke-width|aria-hidden)$/i.test(name) &&
      !/(?:url\s*\(|javascript:|@import|expression\s*\()/i.test(value))
      .map(([name, value]) => ` ${name === 'viewbox' ? 'viewBox' : name}="${escape(value)}"`).join('')
    return `<${node.name}${attributes}>${node.children.map(visit).join('')}</${node.name}>`
  }
  return parseDocument(markup, { lowerCaseAttributeNames: false }).children.map(visit).join('')
}

async function documentHtml(document: EditableDocument, question: SnapshotQuestion): Promise<string> {
  const { convertLatexToMarkup, validateLatex } = await import('mathlive')
  return document.content.map((block) => {
    if (block.type === 'image') {
      const image = question.assets.get(block.attrs.assetId)
      if (!image) throw new Error(`第 ${question.number} 题配图不存在，请重新插入`)
      return `<figure style="text-align:${block.attrs.align}"><img style="width:${block.attrs.widthPercent}%;height:auto" src="${dataImage(image)}">${block.attrs.caption ? `<figcaption>${escape(block.attrs.caption)}</figcaption>` : ''}</figure>`
    }
    return `<p>${(block.content ?? []).map((node) => {
      if (node.type === 'hardBreak') return '<br>'
      if (node.type === 'inlineMath') {
        if (validateLatex(node.attrs.latex).length) throw new Error(`第 ${question.number} 题含有无效公式，请校对后导出`)
        return `<span class="math-atom">${safeMath(convertLatexToMarkup(node.attrs.latex))}</span>`
      }
      let value = escape(node.text)
      if (node.marks?.some((mark) => mark.type === 'bold')) value = `<strong>${value}</strong>`
      if (node.marks?.some((mark) => mark.type === 'italic')) value = `<em>${value}</em>`
      return value
    }).join('') || '<br>'}</p>`
  }).join('')
}

async function partHtml(question: SnapshotQuestion, answer: boolean): Promise<string> {
  const content = question.content
  if (content && (answer ? content.answerMode : content.questionMode) === 'editable') {
    const body = answer ? content.answerBody : content.questionBody
    if (!hasEditableContent(body)) {
      if (answer) return '<p class="muted">（暂无参考答案）</p>'
      throw new Error(`第 ${question.number} 题编辑稿为空，请补充后导出`)
    }
    return documentHtml(body, question)
  }
  const original = answer ? question.answerOriginal : question.original
  if (original) return `<figure class="original"><img src="${dataImage(original)}"></figure>`
  if (answer) return '<p class="muted">（暂无参考答案）</p>'
  throw new Error(`第 ${question.number} 题没有原图，请选择最新保存内容或补充题图`)
}

function fontStyles(): string {
  const require = createRequire(import.meta.url)
  const cssPath = require.resolve('mathlive/fonts.css')
  const fonts = readFileSync(cssPath, 'utf8').replace(/url\(([^)]+)\)/g, (_all, raw: string) => {
    const name = basename(raw.replace(/["']/g, '').split('?')[0])
    if (!/^[\w.-]+\.woff2?$/.test(name)) throw new Error('公式字体资源路径无效')
    const file = join(dirname(cssPath), 'fonts', name)
    return `url(data:font/woff2;base64,${readFileSync(file).toString('base64')})`
  })
  const chinese = [join(process.resourcesPath, 'fonts/NotoSansSC-Regular.ttf'), join(app.getAppPath(), 'src/renderer/src/assets/fonts/NotoSansSC-Regular.ttf')].find(existsSync)
  if (!chinese) throw new Error('导出所需中文字体缺失，请重新安装应用')
  return `${fonts}\n${readFileSync(require.resolve('mathlive/static.css'), 'utf8')}\n@font-face{font-family:ExportChinese;src:url(data:font/ttf;base64,${readFileSync(chinese).toString('base64')})}`
}

/** This script is part of the export engine, not a UI test. It measures text lines
 * to split long questions without slicing through formulas or lines of text. */
const paginationScript = `
(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(async img => { await img.decode(); if (!img.naturalWidth) throw new Error('题图或配图损坏'); }));
  const flow = document.getElementById('flow');
  const viewport = document.getElementById('viewport');
  const bounds = flow.getBoundingClientRect();
  const capacity = viewport.clientHeight;
  const header = document.getElementById('header');
  if(header.scrollHeight > header.clientHeight+2 || header.scrollWidth > header.clientWidth+2) throw new Error('标题或副标题超出页眉，请精简后导出');
  if (flow.scrollWidth > flow.clientWidth + 2) throw new Error('有公式或内容超出页面宽度，请缩小字号或拆分后导出');
  const bands = [];
  const add = r => { if (r.height > 0 && r.width > 0) bands.push([r.top - bounds.top, r.bottom - bounds.top]); };
  const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('.math-atom')) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    for (const rect of range.getClientRects()) add(rect);
  }
  for (const node of flow.querySelectorAll('.math-atom, figure')) {
    const rect = node.getBoundingClientRect();
    if(node.matches('.math-atom') || rect.height <= capacity) add(rect);
  }
  // Long image bodies continue at their chosen width; text/caption lines and smaller figures stay together.
  for (const node of flow.querySelectorAll('h2,h3,.question-number')) {
    const next = node.nextElementSibling;
    const r = node.getBoundingClientRect();
    const nextBand = bands.filter(b => b[0] >= r.bottom - bounds.top - 1).sort((a,b)=>a[0]-b[0])[0];
    if(next && nextBand && nextBand[1] - (r.top - bounds.top) <= capacity) bands.push([r.top-bounds.top, nextBand[1]]);
  }
  if(bands.some(b => b[1]-b[0] > capacity)) throw new Error('有配图或公式高于单页，请缩小配图或字号后导出');
  const sections = [...flow.querySelectorAll('.question-section')].map(el => ({
    start: el.offsetTop, end: el.offsetTop+el.offsetHeight, label: el.dataset.label,
    newPage: el.dataset.newPage === 'true'
  }));
  const forced = sections.filter(s=>s.newPage).map(s=>s.start);
  const pages = []; let offset = 0; const height = flow.scrollHeight;
  while(offset < height) {
    if(pages.length >= 500) throw new Error('超过 500 页，请分卷导出');
    let end = Math.min(height, offset+capacity);
    const force = forced.find(y=>y>offset+1 && y<end); if(force !== undefined) end=force;
    let adjusted = true;
    while(adjusted) {
      adjusted=false;
      for(const [top,bottom] of bands) if(top < end-.1 && bottom > end+.1 && top > offset+1) {end=top;adjusted=true;}
    }
    if(end-offset < 2) throw new Error('内容无法分页，请调整字号或配图尺寸');
    const section=sections.find(s=>s.start<offset-1 && s.end>offset+1);
    pages.push({ offset, height: end-offset, continuation: section ? section.label+'（续）' : '' });
    offset=end;
  }
  return pages;
})()`

export function exportRasterDocument(format: 'pdf' | 'pptx', setId: number, input: WordExportOptions): Promise<string | null> {
  return withStorageUse(() => exportRasterDocumentCore(format, setId, input))
}

async function exportRasterDocumentCore(format: 'pdf' | 'pptx', setId: number, input: WordExportOptions): Promise<string | null> {
  if (activeExport) throw new Error('已有 PDF / PPT 正在导出，请等待完成')
  activeExport = true
  let window: BrowserWindow | undefined, temporary: string | undefined
  try {
    const options = normalizeWordOptions(input)
    const title = [...options.title.replace(/[\\/:*?"<>|\r\n]/g, '_')].slice(0, 60).join('').replace(/[. ]+$/, '') || '物理试卷'
    const result = await dialog.showSaveDialog({ title: `导出 ${format.toUpperCase()}`, defaultPath: join(app.getPath('documents'), `${title}.${format}`), filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (result.canceled || !result.filePath) return null
    const path = extname(result.filePath).toLowerCase() === `.${format}` ? result.filePath : `${result.filePath}.${format}`
    const questions = await withStorageUse(async () => readSnapshot(setId, options.answerMode !== 'none', options.contentSource))
    const width = format === 'pdf' ? 1200 : 1600, height = format === 'pdf' ? 1697 : 900
    const unit = format === 'pdf' ? width / 595.28 : width / 720
    const margin = Math.round(format === 'pdf' ? width * options.marginMm / 210 : width * options.marginMm / 297)
    const fontSize = options.fontSize * unit, headerHeight = Math.ceil(fontSize * 2.7), footerHeight = Math.ceil(fontSize * 1.5)
    const capacity = height - margin * 2 - headerHeight - footerHeight
    const sections: string[] = []
    for (const [index, q] of questions.entries()) {
      sections.push(`<section class="question-section" data-label="第 ${escape(q.number)} 题" data-new-page="${index > 0 && (format === 'pptx' || options.questionStartNewPage)}">${q.groupHeader ? `<h2>${escape(q.groupHeader)}</h2>` : ''}<p class="question-number">${escape(q.number)}.</p>${await partHtml(q, false)}${options.answerMode === 'inline' ? `<h3>参考答案</h3>${await partHtml(q, true)}` : ''}</section>`)
    }
    if (options.answerMode === 'append') {
      for (const [index, q] of questions.entries()) sections.push(`<section class="question-section" data-label="第 ${escape(q.number)} 题答案" data-new-page="${index === 0 || format === 'pptx'}">${index === 0 ? '<h2>参考答案</h2>' : ''}<p class="question-number">${escape(q.number)}.</p>${await partHtml(q, true)}</section>`)
    }
    temporary = await mkdtemp(join(app.getPath('temp'), 'physics-export-'))
    const htmlPath = join(temporary, 'document.html')
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>${fontStyles()}
      *{box-sizing:border-box}html,body{margin:0;background:white;color:#111;overflow:hidden}body{width:${width}px;height:${height}px;font:${fontSize}px/1.65 ExportChinese,'Times New Roman',serif;padding:${margin}px}
      #header{height:${headerHeight}px;overflow:hidden;font-size:${fontSize * .9}px;line-height:1.4}#header strong{font-size:${fontSize * 1.15}px}#continuation{float:right}#viewport{height:${capacity}px;overflow:hidden;position:relative}#flow{position:relative;display:flow-root;transform-origin:top left}#footer{height:${footerHeight}px;text-align:center;font-size:${fontSize * .7}px;line-height:2}
      .question-section{position:relative;display:flow-root;padding-bottom:${options.questionSpacing * unit}px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 .5em}h2,h3{font-size:1.1em;margin:0 0 .5em}.question-number{font-weight:bold;margin:0 0 .25em}figure{margin:0 0 .5em}figure img{max-width:100%;height:auto;vertical-align:top}figure.original img{width:100%;max-height:none}figcaption{font-size:.85em;line-height:1.4}.math-atom{display:inline-block;white-space:nowrap}.muted{color:#666}
      </style></head><body><div id="header"><span id="continuation"></span><strong>${escape(options.title)}</strong>${options.subtitle ? `<br>${escape(options.subtitle)}` : ''}</div><div id="viewport"><div id="flow">${sections.join('')}</div></div><div id="footer"></div></body></html>`, 'utf8')
    window = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, focusable: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: `export-${Date.now()}` } })
    const web = window.webContents
    const localUrl = pathToFileURL(htmlPath).href
    web.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    web.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== localUrl && !details.url.startsWith('data:') }))
    web.setWindowOpenHandler(() => ({ action: 'deny' }))
    web.on('will-navigate', (event) => event.preventDefault())
    window.setContentSize(width, height)
    await bounded(window.loadFile(htmlPath), '导出页面加载')
    const pages = await bounded(web.executeJavaScript(paginationScript), '图文分页') as { offset: number; height: number; continuation: string }[]
    if (!pages.length) throw new Error('没有可导出的内容')
    const pdf = format === 'pdf' ? await PDFDocument.create() : null
    const ppt = format === 'pptx' ? new pptxgen() : null
    if (ppt) { ppt.layout = 'LAYOUT_WIDE'; ppt.title = options.title; ppt.author = '物理教师题库' }
    let imageBytes = 0
    for (const [index, page] of pages.entries()) {
      await bounded(web.executeJavaScript(`document.getElementById('flow').style.transform='translateY(-${page.offset}px)';document.getElementById('viewport').style.height='${page.height}px';document.getElementById('footer').style.position='absolute';document.getElementById('footer').style.bottom='${margin}px';document.getElementById('footer').style.left='${margin}px';document.getElementById('footer').style.right='${margin}px';document.getElementById('footer').textContent='${index + 1} / ${pages.length}';document.getElementById('continuation').textContent=${JSON.stringify(page.continuation)};new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`), '导出页面排版')
      const image = await bounded(web.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true, stayAwake: true }), '导出页面绘制')
      const png = image.toPNG()
      if (image.isEmpty()) throw new Error(`第 ${index + 1} 页排版图生成失败`)
      imageBytes += png.length
      if (imageBytes > 384 * 1024 * 1024) throw new Error('导出图片总量超过 384 MB，请分卷导出')
      if (pdf) { const picture = await pdf.embedPng(png); pdf.addPage([595.28, 841.89]).drawImage(picture, { x: 0, y: 0, width: 595.28, height: 841.89 }) }
      if (ppt) ppt.addSlide().addImage({ data: `data:image/png;base64,${png.toString('base64')}`, x: 0, y: 0, w: 13.333333, h: 7.5 })
    }
    const bytes = pdf ? Buffer.from(await pdf.save()) : await ppt!.write({ outputType: 'nodebuffer' }) as Buffer
    await writeExportAtomic(path, bytes)
    return path
  } finally {
    if (window && !window.isDestroyed()) window.destroy()
    if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {})
    activeExport = false
  }
}
