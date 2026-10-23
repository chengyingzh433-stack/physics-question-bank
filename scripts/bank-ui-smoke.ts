// 实际 renderer + preload + IPC + SQLite，只使用临时 userData 和生成的示意题图。
import { app, BrowserWindow, protocol } from 'electron'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { initDatabase, getDb, closeDatabase } from '../src/main/storage/StorageService'
import { registerIpc } from '../src/main/ipc'
import { registerAppProtocol } from '../src/main/files/FileService'

const scratch = mkdtempSync(join(tmpdir(), 'question-bank-ui-'))
app.setPath('userData', scratch)
app.disableHardwareAcceleration()
registerAppProtocol()
let win: BrowserWindow
const evaluate = (expression: string) => win.webContents.executeJavaScript(expression)
async function waitFor(expression: string): Promise<void> {
  const end = Date.now() + 7000
  while (Date.now() < end) {
    if (await evaluate(expression)) return
    await new Promise((done) => setTimeout(done, 60))
  }
  throw new Error(`等待失败：${expression}`)
}
async function clickText(text: string): Promise<void> {
  const code = `Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled)`
  await waitFor(`Boolean(${code})`)
  await evaluate(`(${code}).click()`)
}
async function click(selector: string): Promise<void> {
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
async function fill(selector: string, value: string): Promise<void> {
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
}
const hasText = (text: string) => `document.body.innerText.includes(${JSON.stringify(text)})`

app.whenReady().then(async () => {
  initDatabase()
  const db = getDb()
  db.prepare("INSERT INTO papers (id, name, kind, status, year, source) VALUES (1, '高一物理 · 力学综合训练', 'paper', 'done', 2026, '校本精选')").run()
  const insert = db.prepare('INSERT INTO questions (id, paper_id, order_in_paper, type_id, image_path, answer_image_path) VALUES (?, 1, ?, 1, ?, ?)')
  for (let id = 1; id <= 30; id++) insert.run(id, id, `q_${id}.png`, id % 2 ? `a_${id}.png` : null)
  protocol.handle('app', (request) => {
    const answer = request.url.includes('/a_')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="230"><rect width="700" height="230" fill="white"/>
      <g fill="#222" font-family="Microsoft YaHei" font-size="22"><text x="24" y="40">${answer ? '参考答案：由牛顿第二定律得' : '如图所示，小物块沿光滑斜面下滑，求加速度。'}</text>
      <text x="24" y="82">${answer ? 'a = g sin θ' : '已知重力加速度 g，斜面倾角 θ。'}</text></g>
      <path d="M390 190 L640 190 L390 100 Z" fill="none" stroke="#444" stroke-width="2"/>
      <rect x="475" y="115" width="38" height="24" fill="#ddd" stroke="#444" transform="rotate(20 490 128)"/>
      <text x="24" y="200" fill="#888" font-size="16">界面测试示意题 · 非用户资料</text></svg>`
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } })
  })
  registerIpc()
  win = new BrowserWindow({ width: 900, height: 670, show: false,
    webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  win.setMenu(null)
  const errors: string[] = []
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') { errors.push(message); console.error('Renderer:', message) } })
  await win.loadFile(resolve('out/renderer/index.html'), { hash: '/bank' })
  await waitFor(hasText('30 题 · 已选 0 题'))
  assert.equal(await evaluate("document.querySelectorAll('.bank-card').length"), 24)
  await click('.bank-card input[type="checkbox"]')
  await waitFor(hasText('已选 1 题'))
  await clickText('加入组卷篮') // 第一处为批量栏
  await waitFor(hasText('组卷篮 · 1'))
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM paper_set_items').get() as { c: number }).c, 1)
  await clickText('已入篮 · 点击移出')
  await waitFor(hasText('组卷篮 · 0'))
  await click('[aria-label="预览题目 1"]')
  await waitFor("Boolean(document.querySelector('img[alt=\"参考答案\"]'))")
  await clickText('下一题')
  await waitFor(hasText('未匹配答案'))
  await click('.mantine-Modal-close')
  await waitFor("!document.querySelector('[role=dialog]')")
  await fill('[aria-label="搜索资料和标签"]', '不存在的词')
  await waitFor(hasText('没有找到题目'))
  await clickText('清空条件')
  await waitFor(hasText('30 题 · 已选 0 题'))
  // 翻页保留勾选，切换筛选会清空；勾选本身不修改组卷篮。
  await click('.bank-card input[type="checkbox"]')
  await clickText('2')
  await waitFor("Boolean(document.querySelector('[aria-label=\"预览题目 25\"]'))")
  await waitFor(hasText('已选 1 题'))
  await click('.bank-card input[type="checkbox"]')
  await waitFor(hasText('已选 2 题'))
  await clickText('1')
  await waitFor("Boolean(document.querySelector('[aria-label=\"预览题目 1\"]'))")
  assert.equal(await evaluate("document.querySelector('.bank-card input[type=checkbox]').checked"), true)
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM paper_set_items').get() as { c: number }).c, 0)
  await fill('[aria-label="搜索资料和标签"]', '校本精选')
  await waitFor(hasText('30 题 · 已选 0 题'))
  await clickText('清空条件')
  await waitFor(hasText('30 题 · 已选 0 题'))
  // 默认窗口的实际布局截图与横向溢出检查。
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
  writeFileSync(resolve('out/bank-ui-900.png'), (await win.webContents.capturePage()).toPNG())
  await clickText('分类 / 筛选')
  await click('[aria-label="新建题夹"]')
  await fill('input[placeholder^="例如"]', '期末复习好题')
  await clickText('保存')
  await waitFor(hasText('期末复习好题'))
  await clickText('查看结果')
  await waitFor("!document.querySelector('[role=dialog]')")
  await click('.bank-card input[type="checkbox"]')
  await clickText('加入题夹')
  await click('input[placeholder="选择题夹"]')
  await waitFor("Boolean(document.querySelector('[role=option]'))")
  await click('[role=option]')
  await clickText('确认加入')
  await waitFor("!document.querySelector('[role=dialog]')")
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM question_folder_items').get() as { c: number }).c, 1)
  // 更宽窗口能看到题夹常驻侧栏，选择和批量栏。
  win.setSize(1320, 850)
  await waitFor("Boolean(document.querySelector('.bank-sidebar'))")
  await click('.bank-card input[type="checkbox"]')
  await waitFor(hasText('已选 1 题'))
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  writeFileSync(resolve('out/bank-ui-1320.png'), (await win.webContents.capturePage()).toPNG())
  await evaluate("Array.from(document.querySelectorAll('.bank-sidebar button')).find(e => e.textContent.includes('期末复习好题')).click()")
  await waitFor(hasText('1 题 · 已选 0 题'))
  await click('.bank-card input[type="checkbox"]')
  await clickText('移出当前题夹')
  await waitFor(hasText('没有找到题目'))
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c, 30)
  await clickText('重命名')
  await fill('input[placeholder^="例如"]', '力学好题')
  await clickText('保存')
  await waitFor("!document.querySelector('[role=dialog]')")
  assert.equal((db.prepare('SELECT name FROM question_folders').get() as { name: string }).name, '力学好题')
  await clickText('删除题夹')
  await clickText('删除题夹，保留原题')
  await waitFor(hasText('30 题 · 已选 0 题'))
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c, 30)
  assert.deepEqual(errors, [])
  console.log('PASS: 默认/宽窗口、选择与入篮分离、取消入篮、跨页选择、切换筛选清空选择、题目/答案预览、搜索/空态、题夹创建/归类/移出/重命名/删除；实际 IPC + 隔离 SQLite。')
  console.log(`测试数据目录：${scratch}`)
  closeDatabase(); win.destroy(); app.exit(0)
}).catch(async (error) => {
  console.error(error)
  if (win) {
    console.error(await evaluate('document.body.innerText'))
    writeFileSync(resolve('out/bank-ui-failure.png'), (await win.webContents.capturePage()).toPNG())
  }
  closeDatabase(); app.exit(1)
})
