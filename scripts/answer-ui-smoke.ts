// 真实 PDF → 导入 → 高清题图/答案图 → 手动配对 → 重载；所有资料均在临时目录。
import { app, BrowserWindow, dialog, nativeImage } from 'electron'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { PDFDocument, degrees, rgb } from 'pdf-lib'
import { initDatabase, getDb, closeDatabase } from '../src/main/storage/StorageService'
import { registerIpc } from '../src/main/ipc'
import { registerAppProtocol, handleAppProtocol } from '../src/main/files/FileService'
import { getPages } from '../src/main/storage/repositories/paperRepo'
import { replaceSegmentsForPage, getSegmentsByPaper } from '../src/main/storage/repositories/segmentRepo'
import { getAnswerPairings } from '../src/main/storage/repositories/answerPairingRepo'

const scratch = mkdtempSync(join(tmpdir(), 'question-bank-answer-ui-'))
app.setPath('userData', scratch)
app.disableHardwareAcceleration()
registerAppProtocol()
let win: BrowserWindow
const evaluate = (code: string) => win.webContents.executeJavaScript(code)
async function waitFor(predicate: () => Promise<boolean> | boolean, description: string) {
  const end = Date.now() + 15000
  while (Date.now() < end) {
    if (await predicate()) return
    await new Promise((done) => setTimeout(done, 60))
  }
  throw new Error(`等待失败：${description}`)
}
const waitText = (text: string) => waitFor(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), text)
async function click(selector: string) {
  await waitFor(() => evaluate(`Boolean(${selector}) && !(${selector}).disabled`), selector)
  await evaluate(`(${selector}).click()`)
}
const button = (text: string) => `Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)})`
let navigation = 0
const route = (hash: string) => win.loadFile(resolve('out/renderer/index.html'), { hash, query: { smoke: String(++navigation) } })

app.whenReady().then(async () => {
  initDatabase(); registerIpc(); handleAppProtocol()
  const db = getDb()
  db.prepare("INSERT INTO app_settings VALUES ('export_dpi', '72')").run()
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([200, 100])
  page.drawRectangle({ x: 0, y: 0, width: 100, height: 100, color: rgb(1, 0, 0) })
  page.drawRectangle({ x: 100, y: 0, width: 100, height: 100, color: rgb(0, 0, 1) })
  page.setRotation(degrees(90))
  const source = join(scratch, '旋转 90度题目与答案.pdf')
  writeFileSync(source, await pdf.save())
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog
  win = new BrowserWindow({ width: 1200, height: 800, show: true,
    webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  const errors: string[] = []
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message) })
  await route('/')
  await click(button('导入试卷 PDF'))
  await waitFor(() => getPages(db, 1).length === 1, '试卷 PDF 解析落库')
  const qPage = getPages(db, 1)[0]
  assert.deepEqual([qPage.width_pt, qPage.height_pt, qPage.rotation], [100, 200, 90])
  const crop = (paperId: number, pageId: number) => replaceSegmentsForPage(db, pageId, paperId, [0, 0.5].map((y, i) => ({
    col_index: 0, x_start_ratio: 0, x_end_ratio: 1, y_start_ratio: y, y_end_ratio: y + 0.5, order_index: i
  })))
  crop(1, qPage.id)
  await route('/post/1'); await waitText('第 1 题')
  await click(button('完成入库')); await click(button('确认入库'))
  await waitFor(() => (db.prepare('SELECT count(*) AS n FROM questions WHERE paper_id=1 AND image_path IS NOT NULL').get() as {n:number}).n === 2, '两张题图入库')
  await waitText('入库完成')
  const questions = () => db.prepare('SELECT id, image_path, answer_image_path FROM questions WHERE paper_id=1 ORDER BY order_in_paper').all() as { id: number; image_path: string; answer_image_path: string | null }[]
  const ids = questions().map(q => q.id)
  function checkImage(path: string, color: 'red' | 'blue') {
    const image = nativeImage.createFromPath(join(scratch, path))
    assert.deepEqual(image.getSize(), { width: 100, height: 100 }, '旋转后的半页应为正方形')
    const pixels = image.toBitmap()
    const offset = (50 * 100 + 50) * 4
    const expected = color === 'red' ? [0, 0, 255, 255] : [255, 0, 0, 255]
    assert.deepEqual([...pixels.subarray(offset, offset + 4)], expected, '裁切内容与旋转预览一致')
  }
  checkImage(questions()[0].image_path, 'red'); checkImage(questions()[1].image_path, 'blue')
  await route('/answer/1'); await click(button('选择答案 PDF'))
  await waitFor(() => getPages(db, 2).length === 1, '答案 PDF 解析落库')
  await waitText('答案 PDF 已导入')
  const aPage = getPages(db, 2)[0]
  assert.equal(aPage.rotation, 90)
  crop(2, aPage.id)
  const segments = getSegmentsByPaper(db, 2).map(s => s.id!)
  await route('/answer/1'); await waitText('确认绑定')
  for (let i = 0; i < 2; i++) {
    await click(button(`调整第 ${i + 1} 题答案`))
    const card = `document.querySelector('[data-testid="answer-pairing-${ids[i]}"]')`
    // 切换两个答案，实现第 1 题→答案 2、第 2 题→答案 1。
    for (const number of [1, 2]) await click(`${card}.querySelector('[role=checkbox][aria-label="答案 ${number}"]')`)
  }
  await click(button('确认绑定')); await waitText('答案匹配完成')
  assert.deepEqual(getAnswerPairings(db, 1).map(p => p.segmentIds), [[segments[1]], [segments[0]]])
  checkImage(questions()[0].answer_image_path!, 'blue'); checkImage(questions()[1].answer_image_path!, 'red')
  await route('/answer/1'); await waitText('确认绑定')
  await click(button('调整第 1 题答案'))
  const firstCard = `document.querySelector('[data-testid="answer-pairing-${ids[0]}"]')`
  assert.equal(await evaluate(`${firstCard}.querySelector('[aria-label="答案 2"]').getAttribute('aria-checked')`), 'true')
  assert.equal(await evaluate(`${firstCard}.querySelector('[aria-label="答案 1"]').getAttribute('aria-checked')`), 'false')
  // 显式取消答案后重开，不能重新自动配对。
  await click(`${firstCard}.querySelector('[aria-label="答案 2"]')`)
  await click(button('确认绑定')); await waitText('答案匹配完成')
  await route('/answer/1'); await waitText('确认绑定')
  assert.deepEqual(getAnswerPairings(db, 1)[0].segmentIds, [])
  assert.equal(questions()[0].answer_image_path, null)
  assert.equal(await evaluate(`${firstCard}.innerText.includes('无答案')`), true)
  writeFileSync(resolve('out/answer-ui-saved.png'), (await win.webContents.capturePage()).toPNG())
  assert.deepEqual(errors, [], '渲染器不能产生错误')
  console.log('PASS: 真实旋转 PDF 导入/题图/答案图像素、手动交换配对、保存后重载、显式无答案重载；独立 SQLite 与临时资料。')
  closeDatabase(); win.destroy(); app.exit(0)
}).catch(async error => {
  console.error(error)
  if (win) {
    console.error(await evaluate('document.body.innerText'))
    writeFileSync(resolve('out/answer-ui-failure.png'), (await win.webContents.capturePage()).toPNG())
  }
  closeDatabase(); app.exit(1)
})
