// 真实 renderer + preload + IPC + SQLite；临时题库和自行生成的 PDF，不接触用户资料。
import { app, BrowserWindow } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { initDatabase, getDb, closeDatabase } from '../src/main/storage/StorageService'
import { registerIpc } from '../src/main/ipc'
import { registerAppProtocol, handleAppProtocol } from '../src/main/files/FileService'

const scratch = mkdtempSync(join(tmpdir(), 'question-bank-chapter-ui-'))
app.setPath('userData', scratch)
app.disableHardwareAcceleration()
registerAppProtocol()
let win: BrowserWindow
let stage = 'startup'
const evaluate = (expression: string) => win.webContents.executeJavaScript(expression)
const hasText = (text: string) => `document.body.innerText.includes(${JSON.stringify(text)})`
const visibleOptions = `Array.from(document.querySelectorAll('[role=option]')).filter(e => e.getClientRects().length)`
async function waitFor(expression: string): Promise<void> {
  const end = Date.now() + 10000
  while (Date.now() < end) {
    if (await evaluate(expression)) return
    await new Promise((done) => setTimeout(done, 60))
  }
  throw new Error(`等待失败：${expression}`)
}
async function waitDb(predicate: () => boolean, message: string): Promise<void> {
  const end = Date.now() + 7000
  while (Date.now() < end) {
    if (predicate()) return
    await new Promise((done) => setTimeout(done, 60))
  }
  throw new Error(`数据库等待失败：${message}`)
}
async function clickText(text: string): Promise<void> {
  const code = `Array.from(document.querySelectorAll('button')).find(e => (e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)}) && !e.disabled && e.getClientRects().length)`
  await waitFor(`Boolean(${code})`)
  await pointerClick(code)
}
async function pointerClick(code: string): Promise<void> {
  await evaluate(`(${code}).scrollIntoView({ block: 'center' })`)
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const point = await evaluate(`(() => { const rect = (${code}).getBoundingClientRect(); return {
    x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }; })()`)
  // 真实鼠标 down/up 会触发焦点迁移及 blur；不能用 element.click() 绕过组合框失焦行为。
  win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
}
async function inputForLabel(label: string, index = 0): Promise<string> {
  const code = `Array.from(document.querySelectorAll('label')).filter(e => e.textContent.trim() === ${JSON.stringify(label)})[${index}]`
  await waitFor(`Boolean(${code})`)
  const id = await evaluate(`(${code}).htmlFor`)
  assert.ok(id, `输入框必须有关联标签：${label}`)
  return `document.getElementById(${JSON.stringify(id)})`
}
async function fillLabel(label: string, value: string, index = 0): Promise<void> {
  stage = `fill ${label}: ${value}`
  const code = await inputForLabel(label, index)
  await waitFor(`!(${code}).disabled`)
  await evaluate(`(() => { const el = ${code}; el.scrollIntoView({ block: 'center' }); el.focus(); el.click();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
}
async function chooseOption(text: string): Promise<void> {
  const code = `${visibleOptions}.find(e => e.textContent.trim() === ${JSON.stringify(text)})`
  await waitFor(`Boolean(${code})`)
  await pointerClick(code)
}
async function screenshot(name: string): Promise<void> {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  writeFileSync(resolve(`out/chapter-ui-${name}.png`), (await win.webContents.capturePage()).toPNG())
}
let navigation = 0
async function openRoute(hash: string): Promise<void> {
  stage = `route ${hash}`
  await win.loadFile(resolve('out/renderer/index.html'), { hash, query: { smoke: String(++navigation) } })
}

app.whenReady().then(async () => {
  initDatabase()
  const db = getDb()
  const countChapters = () => (db.prepare('SELECT COUNT(*) AS n FROM chapters').get() as { n: number }).n
  assert.equal(countChapters(), 158, '空库自动预设六册、27 章、125 节')
  const leaf = db.prepare("SELECT id, name, parent_id FROM chapters WHERE name LIKE '% / 3 牛顿第二定律'").get() as { id: number; name: string; parent_id: number }
  assert.ok(leaf)
  const parent = db.prepare('SELECT id, name FROM chapters WHERE id = ?').get(leaf.parent_id) as { id: number; name: string }
  db.exec(`INSERT INTO papers (id, name, status, kind, page_count) VALUES
    (1, '章节知识点回归示例', 'done', 'paper', 1), (2, '后期处理回归示例', 'processing', 'paper', 1);
    INSERT INTO questions (id, paper_id, order_in_paper, type_id, image_path) VALUES
    (1, 1, 1, 1, 'q_1.png'), (2, 1, 2, 1, 'q_2.png'), (3, 2, 1, 1, NULL);
    INSERT INTO pages (id, paper_id, page_index, width_pt, height_pt) VALUES (1, 2, 0, 595, 842);
    INSERT INTO segments (id, paper_id, page_id, col_index, x_start_ratio, x_end_ratio, y_start_ratio, y_end_ratio, order_index)
      VALUES (1, 2, 1, 0, 0, 1, 0, 0.3, 0);
    INSERT INTO question_segments (question_id, segment_id, merge_order) VALUES (3, 1, 0);`)
  const kpNames = ['牛顿第一定律', '牛顿第二定律', '综合：牛顿定律', '受力分析', '动量守恒', '能量守恒', '电场', '磁场', '折射', '干涉', '电路']
  const insertKp = db.prepare('INSERT INTO knowledge_points (name) VALUES (?)')
  kpNames.forEach((name) => insertKp.run(name))
  const kpId = (name: string) => (db.prepare('SELECT id FROM knowledge_points WHERE name = ?').get(name) as { id: number }).id
  const selectedKps = (id: number) => (db.prepare('SELECT kp_id FROM question_knowledge_points WHERE question_id = ? ORDER BY kp_id').all(id) as { kp_id: number }[]).map((row) => row.kp_id)
  const chapterId = (id: number) => (db.prepare('SELECT chapter_id FROM questions WHERE id = ?').get(id) as { chapter_id: number | null }).chapter_id
  const imageDir = join(scratch, 'projects', '1', 'images')
  mkdirSync(imageDir, { recursive: true })
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('UI smoke test: F = ma. Find the acceleration.', { x: 32, y: 780, size: 18, font })
  mkdirSync(join(scratch, 'projects', '2'), { recursive: true })
  writeFileSync(join(scratch, 'projects', '2', 'source.pdf'), await pdf.save())
  handleAppProtocol()
  registerIpc()
  win = new BrowserWindow({ width: 1320, height: 850, show: false,
    webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  win.setMenu(null)
  const errors: string[] = []
  win.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error') { errors.push(message); console.error('Renderer:', stage, message) }
  })
  await win.loadURL('about:blank')
  const imageData = await evaluate(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 180;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 700, 180);
    ctx.fillStyle = '#222'; ctx.font = '26px "Microsoft YaHei"';
    ctx.fillText('已知小物块受到恒定合力 F，质量为 m。', 24, 50);
    ctx.fillText('求物块的加速度，并说明方向。', 24, 95);
    ctx.fillStyle = '#888'; ctx.font = '18px "Microsoft YaHei"';
    ctx.fillText('界面回归示意题 · 非用户资料', 24, 150);
    return canvas.toDataURL('image/png').split(',')[1];
  })()`)
  const png = Buffer.from(imageData, 'base64')
  writeFileSync(join(imageDir, 'q_1.png'), png)
  writeFileSync(join(imageDir, 'q_2.png'), png)

  await openRoute('/review/1')
  await waitFor(hasText('共 2 题'))
  await fillLabel('章节', '牛顿第二')
  await chooseOption(leaf.name)
  await waitDb(() => chapterId(1) === leaf.id, '复查页保存章节')
  await fillLabel('知识点', '')
  await waitFor(`${visibleOptions}.length === 8`)
  await fillLabel('知识点', '牛顿')
  await waitFor(`${visibleOptions}.length === 3`)
  assert.deepEqual(await evaluate(`${visibleOptions}.map(e => e.textContent.trim())`), kpNames.slice(0, 3), '前缀匹配排在包含匹配前')
  await screenshot('review-search')
  await chooseOption('牛顿第一定律')
  await waitDb(() => selectedKps(1).length === 1, '知识点选择')
  await fillLabel('知识点', '牛顿第二')
  await chooseOption('牛顿第二定律')
  await waitDb(() => selectedKps(1).length === 2, '知识点多选')
  await fillLabel('知识点', '个人力学难题')
  await clickText('新建并选中「个人力学难题」')
  await waitDb(() => selectedKps(1).length === 3, '新建后自动选中知识点')
  const expectedKps = [kpId('牛顿第一定律'), kpId('牛顿第二定律'), kpId('个人力学难题')].sort((a, b) => a - b)
  assert.deepEqual(selectedKps(1), expectedKps)
  assert.deepEqual(selectedKps(2), [], '第二题不能被改动')
  assert.equal(chapterId(2), null)

  // 通过实际管理弹窗重新套用模板、在模板下创建个人章节。
  await clickText('章节模板 / 自定义')
  await waitFor(hasText('章节模板与自定义'))
  await clickText('套用章节模板')
  await waitFor(hasText('章节模板已就绪，可以直接选择'))
  assert.equal(countChapters(), 158, '重复套用不能复制模板节点')
  await fillLabel('上级章节', '第四章 运动和力的关系')
  await chooseOption(parent.name)
  await fillLabel('章节名称', '本班综合练习')
  await clickText('新建章节并选中')
  await waitFor("!document.querySelector('[role=dialog]')")
  const custom = db.prepare('SELECT id, name, parent_id, template_key FROM chapters WHERE name LIKE ?').get('% / 本班综合练习') as { id: number; name: string; parent_id: number; template_key: string | null }
  assert.ok(custom)
  assert.equal(custom.parent_id, parent.id)
  assert.equal(custom.template_key, null)
  assert.equal(chapterId(1), custom.id)
  assert.equal(countChapters(), 159)
  await openRoute('/review/1')
  await waitFor(hasText('共 2 题'))
  const reviewChapter = await inputForLabel('章节')
  await waitFor(`(${reviewChapter}).value === ${JSON.stringify(custom.name)}`)
  await waitFor(hasText('个人力学难题'))
  assert.deepEqual(selectedKps(1), expectedKps, '重载后多选知识点保持')
  await fillLabel('章节', '牛顿第二')
  await chooseOption(leaf.name)
  await waitDb(() => chapterId(1) === leaf.id, '复查页重新选择预设章节')
  await screenshot('review-saved')

  await openRoute('/bank')
  await waitFor(hasText('2 题 · 已选 0 题'))
  await fillLabel('章节', '第四章 运动和力的关系')
  await chooseOption(parent.name)
  await waitFor(hasText('1 题 · 已选 0 题'))
  assert.equal(await evaluate("document.querySelectorAll('.bank-card').length"), 1)
  assert.equal(await evaluate("Boolean(document.querySelector('[aria-label=\"预览题目 1\"]'))"), true)
  await fillLabel('知识点（命中任一）', '牛顿第二')
  await chooseOption('牛顿第二定律')
  await waitFor(hasText('1 题 · 已选 0 题'))
  await screenshot('bank-filter')
  await clickText('清除所有条件')
  await waitFor(hasText('2 题 · 已选 0 题'))
  await fillLabel('知识点（命中任一）', '个人力学')
  await chooseOption('个人力学难题')
  await waitFor(hasText('1 题 · 已选 0 题'))
  await clickText('清除所有条件')
  await waitFor(hasText('2 题 · 已选 0 题'))
  await fillLabel('知识点（命中任一）', '电场')
  await chooseOption('电场')
  await waitFor(hasText('没有找到题目'))

  // 后期处理使用真正的一页 PDF 和实际片段，确保不是仅复查页可用。
  await openRoute('/post/2')
  await waitFor(hasText('第 1 题'))
  await waitFor("Boolean(document.querySelector('canvas')) && !document.body.innerText.includes('渲染中…')")
  await fillLabel('章节', '牛顿第二')
  await chooseOption(leaf.name)
  await waitDb(() => chapterId(3) === leaf.id, '后期处理保存章节')
  await fillLabel('知识点', '个人力学')
  await chooseOption('个人力学难题')
  await waitDb(() => selectedKps(3).includes(kpId('个人力学难题')), '后期处理保存知识点')
  await openRoute('/post/2')
  await waitFor(hasText('第 1 题'))
  const postChapter = await inputForLabel('章节')
  await waitFor(`(${postChapter}).value === ${JSON.stringify(leaf.name)}`)
  await waitFor(hasText('个人力学难题'))
  await waitFor("Boolean(document.querySelector('canvas')) && !document.body.innerText.includes('渲染中…')")
  assert.deepEqual(selectedKps(3), [kpId('个人力学难题')])
  assert.deepEqual(selectedKps(1), expectedKps)
  assert.deepEqual(selectedKps(2), [])
  assert.equal(chapterId(2), null)
  await screenshot('postprocess-saved')
  assert.deepEqual(errors, [], '渲染器不能产生错误')
  console.log('PASS: 158 节点默认模板、复查页搜索章节、知识点前缀优先/限 8 项/多选/自定义、逐题保存与重载、模板幂等套用、自定义子章节、题库上级含下级筛选、知识点筛选及空态、真实 PDF 后期处理保存；实际 IPC + 隔离 SQLite。')
  console.log(`测试数据目录：${scratch}`)
  closeDatabase(); win.destroy(); app.exit(0)
}).catch(async (error) => {
  console.error(error)
  if (win) {
    console.error(await evaluate('document.body.innerText'))
    console.error(await evaluate("Array.from(document.querySelectorAll('input')).map(e => ({ id:e.id, value:e.value, placeholder:e.placeholder, disabled:e.disabled }))"))
    await screenshot('failure')
  }
  closeDatabase(); app.exit(1)
})
