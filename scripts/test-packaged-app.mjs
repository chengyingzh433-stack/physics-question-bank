// 验证真正的发布 EXE，所有资料和导出均位于独立临时目录。
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const release = resolve('release', version)
const executable = join(release, 'win-unpacked', '物理教师题库管理系统.exe')
const scratch = await mkdtemp(join(tmpdir(), 'question-bank-packaged-'))
const profile = join(scratch, 'profile')
await mkdir(profile)
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
async function freePort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  await new Promise((done) => server.close(done))
  return port
}
async function endpoint(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = pages.find((p) => p.webSocketDebuggerUrl && (p.type === 'node' || p.type === 'page'))
      if (page) return page.webSocketDebuggerUrl
    } catch { /* 等待被测应用启动 */ }
    await delay(100)
  }
  throw new Error(`调试端点未就绪：${port}`)
}
async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  const events = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (events.has(message.method)) {
      const { resolve, timer } = events.get(message.method)
      events.delete(message.method); clearTimeout(timer); resolve(message.params)
    }
    if (!pending.has(message.id)) return
    const { resolve, reject, timer } = pending.get(message.id)
    pending.delete(message.id); clearTimeout(timer)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`调用超时：${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  const nextEvent = (method) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { events.delete(method); reject(new Error(`事件超时：${method}`)) }, 10000)
    events.set(method, { resolve, timer })
  })
  return { send, evaluate, nextEvent, close: () => socket.close() }
}
const mainPort = await freePort()
const rendererPort = await freePort()
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(executable, [`--user-data-dir=${profile}`, `--inspect=127.0.0.1:${mainPort}`, `--remote-debugging-port=${rendererPort}`, '--disable-gpu'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', (data) => { output += data })
child.stderr.on('data', (data) => { output += data })
let main, renderer
try {
  main = await connect(await endpoint(mainPort))
  renderer = await connect(await endpoint(rendererPort))
  const m = main.evaluate
  const r = renderer.evaluate
  // 发布入口为 ESM。用版本查询处的调试断点取得该模块的 require，避免修改发布代码。
  const mainSource = require('@electron/asar').extractFile(join(release, 'win-unpacked/resources/app.asar'), join('out', 'main', 'index.js')).toString()
  const lines = mainSource.split('\n')
  const versionLine = lines.findIndex((line) => line.includes('"app:version"'))
  assert.ok(versionLine >= 0)
  await main.send('Debugger.enable')
  const breakpoint = await main.send('Debugger.setBreakpointByUrl', {
    urlRegex: 'out/main/index\\.js$', lineNumber: versionLine,
    columnNumber: lines[versionLine].indexOf('app.getVersion()')
  })
  const paused = main.nextEvent('Debugger.paused')
  const versionCall = r('window.api.getAppVersion()').catch((error) => ({ error: String(error) }))
  const frame = await paused
  const assigned = await main.send('Debugger.evaluateOnCallFrame', {
    callFrameId: frame.callFrames[0].callFrameId,
    expression: 'globalThis.smokeElectron = { app, dialog, BrowserWindow }; globalThis.smokeDb = getDb()', returnByValue: false
  })
  assert.ok(!assigned.exceptionDetails, JSON.stringify(assigned.exceptionDetails))
  await main.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId })
  await main.send('Debugger.resume')
  await versionCall
  await main.send('Debugger.disable')
  const electron = 'smokeElectron'
  const info = await m(`({ version: ${electron}.app.getVersion(), packaged: ${electron}.app.isPackaged, data: ${electron}.app.getPath('userData') })`)
  assert.equal(info.version, version)
  assert.equal(info.packaged, true)
  assert.equal(resolve(info.data), resolve(profile))
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) {
      if (await r(expression)) return
      await delay(100)
    }
    throw new Error(`页面未就绪：${expression}`)
  }
  await waitFor('Boolean(window.api && document.querySelector("#root")?.innerText.includes("题库"))')
  assert.equal(await r('window.api.getAppVersion()'), version)
  // 原生文件拖放经过 Chromium → preload webUtils → IPC → 复制 → pdfjs 解析。
  const dropPdf = await PDFDocument.create()
  dropPdf.addPage([595, 842]).drawText('PDF drag-and-drop regression test', { x: 40, y: 760 })
  const dropBytes = await dropPdf.save()
  const droppedPaths = [join(scratch, '拖放测试 一.pdf'), join(scratch, '拖放测试 二.PDF')]
  for (const path of droppedPaths) await writeFile(path, dropBytes)
  const invalidPath = join(scratch, '不能导入.txt')
  const corruptPath = join(scratch, '损坏试卷.pdf')
  await writeFile(invalidPath, 'not a pdf')
  await writeFile(corruptPath, '%PDF-1.7\ninvalid content')
  async function dragFiles(paths) {
    const data = { items: [], files: paths, dragOperationsMask: 1 }
    await renderer.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 420, y: 250, data })
    await waitFor('Boolean(document.querySelector("[data-testid=pdf-drop-overlay]"))')
    await renderer.send('Input.dispatchDragEvent', { type: 'dragOver', x: 420, y: 250, data })
    await renderer.send('Input.dispatchDragEvent', { type: 'drop', x: 420, y: 250, data })
  }
  await dragFiles([invalidPath])
  await waitFor('document.body.innerText.includes("仅支持 PDF 文件")')
  assert.equal((await r('window.api.listPapers()')).length, 0)
  assert.ok((await r('location.href')).includes('index.html'))
  await dragFiles([droppedPaths[0]])
  await waitFor('document.body.innerText.includes("已导入 1 份试卷")')
  let importedPapers = await r('window.api.listPapers()')
  assert.equal(importedPapers.length, 1)
  assert.equal(importedPapers[0].page_count, 1)
  assert.equal(importedPapers[0].name, '拖放测试 一')
  // 已有试卷时批量拖放，失败项清理完后仍继续导入后面的有效文件。
  await dragFiles([corruptPath, droppedPaths[1]])
  await waitFor('document.body.innerText.includes("拖放测试 二") && !document.body.innerText.includes("正在导入 2/2")')
  importedPapers = await r('window.api.listPapers()')
  assert.equal(importedPapers.length, 2)
  assert.ok(importedPapers.every((p) => p.page_count === 1 && p.status === 'cropping'))
  assert.ok(!importedPapers.some((p) => p.name === '损坏试卷'))
  for (const paper of importedPapers) {
    assert.equal((await r(`window.api.getPages(${paper.id})`)).length, 1)
    assert.deepEqual(await readFile(paper.source_pdf_path), Buffer.from(dropBytes))
    await r(`window.api.deletePaper(${paper.id})`)
  }
  // 按钮选文件仍走相同入口，答案卷的 kind / parent 语义保持不变。
  await m(`${electron}.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [${JSON.stringify(droppedPaths[0])}] })`)
  const picked = await r('window.api.importPaper("按钮导入回归")')
  const answer = await r(`window.api.importPaper('答案回归', { kind: 'answer', parentPaperId: ${picked.id} })`)
  assert.equal(answer.kind, 'answer')
  assert.equal(answer.parent_paper_id, picked.id)
  await r(`window.api.deletePaper(${picked.id})`)
  assert.equal((await r('window.api.listPapers()')).length, 0)
  // 使用实际打包的 native SQLite，在隔离 profile 中准备两道示意题。
  assert.equal(await m('smokeDb.open'), true)
  const pdf = await PDFDocument.create()
  const pdfPage = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdfPage.drawText('Physics smoke-test: original PDF', { x: 50, y: 780, size: 18, font })
  pdfPage.drawText('1. A block slides down a smooth incline. Find its acceleration.', { x: 50, y: 700, size: 12, font })
  const project = join(profile, 'projects', '1')
  await mkdir(join(project, 'images'), { recursive: true })
  const source = join(project, 'source.pdf')
  await writeFile(source, await pdf.save())
  await m(`smokeDb.exec(${JSON.stringify(`
    INSERT INTO papers (id, name, kind, status, year, source, page_count) VALUES (1, '测试版验收试卷', 'paper', 'done', 2026, '示例', 1);
    INSERT INTO pages (id, paper_id, page_index, width_pt, height_pt, rotation) VALUES (1, 1, 0, 595, 842, 0);
    INSERT INTO questions (id, paper_id, order_in_paper, type_id, image_path, width_px, height_px, answer_image_path, answer_width_px, answer_height_px)
      VALUES (1, 1, 1, 1, 'q_1.png', 700, 240, 'a_1.png', 700, 240), (2, 1, 2, 1, 'q_2.png', 700, 240, NULL, NULL, NULL);
  `)})`)
  await m(`smokeDb.prepare('UPDATE papers SET source_pdf_path = ? WHERE id = 1').run(${JSON.stringify(source)})`)
  for (const [file, text] of [['q_1.png', '物理测试题一：求物体沿光滑斜面运动的加速度。'], ['q_2.png', '物理测试题二：分析物体受力情况。'], ['a_1.png', '参考答案：a = g sin θ。']]) {
    const dataUrl = await r(`(() => { const c = document.createElement('canvas'); c.width = 700; c.height = 240;
      const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, 700, 240); x.fillStyle = '#222';
      x.font = '24px Microsoft YaHei'; x.fillText(${JSON.stringify(text)}, 24, 60);
      x.font = '18px Microsoft YaHei'; x.fillText('隔离测试用示意题，未使用用户资料。', 24, 170);
      return c.toDataURL('image/png'); })()`)
    await writeFile(join(project, 'images', file), Buffer.from(dataUrl.split(',')[1], 'base64'))
  }
  // 发布产物内的模板数据、迁移和新增 IPC 均走真实 preload 检查。
  const chapterTemplates = await r('window.api.listChapterTemplates()')
  const physicsTemplate = chapterTemplates.find((item) => item.key === 'physics-pep-2019')
  assert.equal(physicsTemplate.node_count, 158)
  assert.equal(physicsTemplate.installed, true)
  const chaptersBefore = await r('window.api.listChapters()')
  await r('window.api.installChapterTemplate("physics-pep-2019")')
  assert.deepEqual(await r('window.api.listChapters()'), chaptersBefore)
  const chapterParent = chaptersBefore.find((item) => item.name === '必修第一册 / 第四章 运动和力的关系')
  const customChapter = await r(`window.api.createChapter('发布验收专题', ${chapterParent.id})`)
  const knowledgePoint = await r('window.api.createKnowledgePoint("发布验收知识点", null)')
  assert.equal(await r('window.api.createKnowledgePoint("  发布验收知识点  ", null)'), knowledgePoint)
  await r(`window.api.setQuestionChapter(1, ${customChapter})`)
  await r(`window.api.setQuestionKnowledgePoints(1, [${knowledgePoint}])`)
  assert.deepEqual((await r(`window.api.listBankQuestions({chapter_id: ${chapterParent.id}, kp_ids: [${knowledgePoint}]})`)).map((q) => q.id), [1])
  await r('location.hash = "/review/1"')
  await waitFor('document.body.innerText.includes("章节模板 / 自定义") && document.body.innerText.includes("发布验收知识点")')
  await r('location.hash = "/bank"')
  await waitFor('document.body.innerText.includes("2 题 · 已选 0 题")')
  assert.equal(await r('Promise.all(Array.from(document.querySelectorAll(".bank-card img"), i => i.decode())).then(() => true)'), true)
  await r('document.querySelector(".bank-card input[type=checkbox]").click()')
  await waitFor('document.body.innerText.includes("已选 1 题")')
  await r('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "加入组卷篮").click()')
  await waitFor('document.body.innerText.includes("组卷篮 · 1")')
  const folderId = await r('window.api.createQuestionFolder("测试版个人题夹")')
  assert.equal(await r(`window.api.addQuestionsToFolder(${folderId}, [1, 2])`), 2)
  assert.equal((await r(`window.api.listBankQuestions({ folder_id: ${folderId}, answer_status: 'with' })`)).length, 1)
  const sid = await r('window.api.getOrCreateDraftSet()')
  await r(`window.api.addManyToSet(${sid}, [2])`)
  // 只在调试测试进程替代保存对话框，应用产物本身没有测试后门。
  await m(`${electron}.dialog.showSaveDialog = async () => ({ canceled: false, filePath: globalThis.smokeSavePath })`)
  const exports = []
  for (const format of ['pdf', 'pptx']) {
    for (const mode of ['none', 'inline', 'append']) {
      const path = join(scratch, `试卷-${mode}.${format}`)
      await m(`globalThis.smokeSavePath = ${JSON.stringify(path)}`)
      const api = format === 'pdf' ? 'exportBasketPdf' : 'exportBasketPptx'
      assert.equal(await r(`window.api.${api}(${sid}, '测试版物理试卷', '${mode}')`), path)
      const bytes = await readFile(path)
      if (format === 'pdf') {
        const doc = await PDFDocument.load(bytes)
        assert.ok(doc.getPageCount() >= 1)
      } else {
        const zip = await JSZip.loadAsync(bytes)
        const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        assert.ok(slides.length >= 2)
        assert.ok(Object.keys(zip.files).some((name) => name.startsWith('ppt/media/')))
      }
      exports.push({ format, mode, bytes: bytes.length })
    }
  }
  await r('location.hash = "/crop/1"')
  await waitFor('Array.from(document.querySelectorAll("canvas")).some(c => c.width > 100 && c.height > 100)')
  const screenshot = await renderer.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(release, '打包版PDF渲染检查.png'), Buffer.from(screenshot.data, 'base64'))
  // 重复双击必须唤回旧窗口，而不是出现第二个窗口。
  const second = spawn(executable, [`--user-data-dir=${profile}`], { env, windowsHide: true, stdio: 'ignore' })
  const secondExit = await Promise.race([
    new Promise((done) => second.once('exit', done)),
    delay(7000).then(() => { second.kill(); throw new Error('重复启动未及时退出') })
  ])
  assert.equal(secondExit, 0)
  assert.equal(await m(`${electron}.BrowserWindow.getAllWindows().length`), 1)
  await m('smokeDb.close()')
  const files = require('@electron/asar').listPackage(join(release, 'win-unpacked/resources/app.asar'))
  assert.ok(!files.some((name) => /bank-ui-smoke|bank-ui-900|path-check/.test(name)))
  assert.ok(files.some((name) => /pdf.worker.*\.mjs$/.test(name)))
  await readFile(join(release, 'win-unpacked/resources/fonts/NotoSansSC-Regular.ttf'))
  const report = { testedAt: new Date().toISOString(), version, executable, profile, checks: [
    '真实发布 EXE 启动 / 原生 SQLite / preload IPC', '题图读取 / 选题入篮 / 个人题夹',
    'PDF、PPTX 三种答案模式导出及文件结构', '打包字体 / PDF worker / 原 PDF 渲染', '重复双击只保留一个窗口', '包内排除测试脚本和截图'
  ], exports }
  report.checks.push('原生 PDF 拖放：空库/已有试卷、多文件、中文空格/大写扩展名、非 PDF 拒绝、损坏文件回滚后继续、按钮/答案导入兼容')
  report.checks.push('六册章节模板 / 重复套用不重复 / 自定义子章节 / 知识点去重及保存回显 / 按上级章节与知识点组合筛选')
  await writeFile(join(release, 'packaged-test-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error(error, '\n应用输出：\n', output)
  if (renderer) {
    try {
      console.error('失败页面：', await renderer.evaluate('({ url: location.href, text: document.body.innerText, canvases: Array.from(document.querySelectorAll("canvas"), c => ({ width: c.width, height: c.height })) })'))
      const failure = await renderer.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(release, 'packaged-test-failure.png'), Buffer.from(failure.data, 'base64'))
    } catch (diagnosticError) { console.error('诊断读取失败', diagnosticError) }
  }
  process.exitCode = 1
} finally {
  main?.close(); renderer?.close()
  child.kill()
}
