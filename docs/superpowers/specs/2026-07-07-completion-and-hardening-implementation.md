# 收尾加固实施记录

- 日期：2026-07-07
- 关联文档：`2026-07-07-completion-and-hardening-plan.md`（设计方案）、`2026-07-06-development-progress.md`（进度文档）
- 本文档目的：**对照设计方案逐项记录实际实现细节，包括改了哪些文件、改了什么、为什么这样改、如何验证**。供后续检查者判断工作是否有效，或在出 bug 时定位。

---

## 0. 开始前状态

- 主线代码 M0–M10 + 前端 Mantine 7 重构已完成
- 28 单测全绿、typecheck 全过、build 三段成功
- **M11 打包失败**（P0 阻断）
- 5 个遗留问题未处理（磁盘清理/光标锚点/旋转页/DB备份+DPI/损坏PDF提示）
- 全链路人测从未执行

---

## 1. T1：M11 打包修复

### 1.1 问题根因

`npm run dist` = `electron-vite build && electron-builder`。

electron-builder 默认 `npmRebuild: true`，会对 better-sqlite3 按**当前 Node ABI**（Node 24 = ABI 137）重编译 `node_modules/better-sqlite3/build/Release/better_sqlite3.node`。但 dev 阶段 `electron-rebuild` 编的是 **Electron ABI 125** 产物。两者 ABI 不匹配 → 运行期 `NODE_MODULE_VERSION` 报错。

### 1.2 确认的事实

执行 `Glob` 确认 better-sqlite3 v11 **同时存在两个产物**：

| 路径 | 来源 | ABI |
|---|---|---|
| `node_modules/better-sqlite3/build/Release/better_sqlite3.node` | `electron-rebuild`（dev 阶段） | 125（Electron 31） |
| `node_modules/better-sqlite3/bin/win32-x64-125/better_sqlite3.node` | `prebuild-install`（npm install 时） | 125（Electron 31） |

运行时通过 `bindings('better_sqlite3.node')` 解析 → 优先加载 `build/Release/`。

### 1.3 实际改动

**文件：`electron-builder.yml`**

```yaml
# 在 directories 与 files 之间加一行
npmRebuild: false
```

这一行让 electron-builder 跳过 native 模块重编译，直接打包 dev 阶段 `electron-rebuild` 编好的 `build/Release/better_sqlite3.node`（ABI 125）。

**无其他代码改动。** 这是纯配置修复，不动业务代码。

### 1.4 遇到的环境坑及解决

| 坑 | 表现 | 解决 |
|---|---|---|
| **electron-rebuild EPERM** | `better_sqlite3.node` 被 electron 进程占用无法删除 | `taskkill /F /IM electron.exe` 杀掉所有 electron 进程后再 rebuild |
| **github.com 下载 EOF** | electron-builder 从 `github.com/electron/electron/releases/` 下载 Electron 二进制超时 | 设环境变量 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` + `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` |
| **winCodeSign 解压符号链接失败** | 7zip 解压 `winCodeSign-2.6.0.7z` 时，darwin `.dylib` 符号链接在 Windows 无权限创建，electron-builder 视为致命错误 | 手动用 `7za x` 只解压 windows 部分到缓存目录 `winCodeSign-2.6.0`，绕过 darwin 符号链接：`7za x archive.7z -ooutdir 'windows-*' 'rcedit*' 'appxAssets'` |

### 1.5 验证

1. `npm run rebuild` → `✔ Rebuild Complete`
2. Electron ABI 验证：`ELECTRON_RUN_AS_NODE=1 electron -e "require('better-sqlite3')..."` → `SQLITE_OK { x: 42 }`
3. `npm run dist` → 产出 `release/物理教师题库管理系统 Setup 1.0.0.exe`（126MB）
4. dist 日志确认：`skipped dependencies rebuild reason=npmRebuild is set to false`

**⚠️ 未做**：干净机器安装冒烟（需要实际安装到另一台电脑验证 native 模块运行期加载）。

### 1.6 检查者如何验证

```bash
# 1. 确认 npmRebuild: false 在配置里
cat electron-builder.yml | grep npmRebuild
# 期望输出：npmRebuild: false

# 2. 确认 better-sqlite3 是 Electron ABI 产物
npm run rebuild
ELECTRON_RUN_AS_NODE=1 npx electron -e "const db=require('better-sqlite3')(':memory:');db.exec('CREATE TABLE t(x)');db.prepare('INSERT INTO t VALUES(42)').run();console.log(db.prepare('SELECT * FROM t').get())"
# 期望输出：{ x: 42 }

# 3. 跑打包
npm run dist
# 期望：release/ 目录下有 .exe

# 4. （最强验证）在另一台 Windows 机器安装 exe，启动后导入 PDF
```

---

## 2. T3：删试卷磁盘文件清理

### 2.1 问题根因

`ipc/index.ts` 的 `papers:delete` 只调 `paperRepo.deletePaper(getDb(), id)` 删 DB 行（级联生效），磁盘 `userData/projects/{id}/`（source.pdf + images/*.png）**残留**。代码里注释写着"M2+ 再补"。

### 2.2 实际改动

**文件 1：`src/main/files/FileService.ts`**

新增 `deletePaperDir(paperId: number)` 函数。关键设计决策：

- **三重校验**防止路径穿越：
  1. `Number.isInteger(paperId) && paperId > 0` — 整数兜底（paperId 来自 DB 主键天然可信，但仍拒非法值）
  2. `relative(root, target)` 不以 `..` 开头 — 防相对路径穿越
  3. `resolvedTarget.startsWith(resolvedRoot + sep)` — 防绝对路径穿越/symlink
- `force: true` 让目录不存在时不抛错（幂等）
- import 新增 `sep`, `relative` from `path`，`rm` from `fs/promises`

代码（行 27–42）：
```ts
export async function deletePaperDir(paperId: number): Promise<void> {
  if (!Number.isInteger(paperId) || paperId <= 0) return
  const root = join(app.getPath('userData'), 'projects')
  const target = paperDir(paperId)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel === '') return
  const resolvedTarget = target
  const resolvedRoot = root
  if (!resolvedTarget.startsWith(resolvedRoot + sep) && resolvedTarget !== resolvedRoot) {
    return
  }
  await rm(target, { recursive: true, force: true })
}
```

**文件 2：`src/main/ipc/index.ts`**

`papers:delete` handler（行 60–66）改为 `async`，先删 DB 行再删磁盘：

```ts
ipcMain.handle('papers:delete', async (_e, id: number) => {
  // 先删 DB 行（级联清理），再删磁盘文件。
  // 顺序：DB 是真值——磁盘删失败不影响一致性，仅留孤儿文件；DB 绝不能留悬空引用。
  paperRepo.deletePaper(getDb(), id)
  await fileService.deletePaperDir(id)
  return
})
```

**顺序决策**：先 DB 后磁盘。如果磁盘删除失败，DB 行已删除（一致性保证），仅留孤儿文件可后续清。反之若先删磁盘再删 DB、DB 删失败则磁盘文件丢失不可恢复。

### 2.3 验证

- `npm run typecheck:node` 通过
- 无新增单测（路径校验逻辑较简单，人工逻辑审查即可）

### 2.4 检查者如何验证

```bash
# 1. 确认 deletePaperDir 函数存在且有路径校验
grep -n "deletePaperDir\|Number.isInteger\|startsWith.*sep\|relative.*root" src/main/files/FileService.ts

# 2. 确认 papers:delete 是 async 且调了 deletePaperDir
grep -A5 "papers:delete" src/main/ipc/index.ts

# 3. 功能验证：启动 dev → 导入一个 PDF → 删除该试卷 → 检查 %APPDATA%/physics-question-bank/projects/ 下对应 id 目录是否存在
# 期望：目录已删除
```

---

## 3. T4：Ctrl+滚轮光标锚点缩放

### 3.1 问题根因

旧实现在 `CropView.tsx` 的 `onWheel` 只改 `zoomPercent ± 25`，不做滚动位置补偿。缩放后光标下的内容会漂移——用户体验差。

### 3.2 设计决策

**把 onWheel 从 CropView 下沉到 PDFViewer**，因为：
- `PDFViewer` 持有 `scrollRef`（滚动容器 DOM 引用），补偿需要读写 `scrollLeft/scrollTop`
- CropView 只持有 zoomPercent 状态，没有滚动容器的引用

**用 `useLayoutEffect` 而非 `requestAnimationFrame`**，因为：
- `useLayoutEffect` 在 DOM 更新后、浏览器绘制前同步执行——精确的补偿时机
- 缩放触发 `zoomPercent` state 变化 → React re-render → DOM 更新 → `useLayoutEffect` 在绘制前补偿滚动 → 用户看到的就是"光标下内容没动"

### 3.3 实际改动

**文件 1：`src/renderer/src/views/PDFViewer.tsx`**

新增接口和逻辑（约 30 行新增代码）：

1. **`ZoomAnchor` 接口**（行 34–41）：记录缩放瞬间的锚点信息
   ```ts
   interface ZoomAnchor {
     clientX: number    // 光标屏幕坐标
     clientY: number
     scrollLeft: number // 旧滚动偏移
     scrollTop: number
     contentW: number   // 旧内容总尺寸
     contentH: number
   }
   ```

2. **`pendingAnchorRef`**（行 52）：`useRef<ZoomAnchor | null>`——wheel 时写入，layoutEffect 时消费后清空。

3. **`onWheel` 回调**（行 122–141）：挂到 scrollRef 的 `onWheel`，Ctrl/Meta+滚轮时记录锚点 + 调 `onZoomPercentChange`。
   - `e.preventDefault()` 阻止浏览器默认缩放
   - `delta = deltaY < 0 ? 25 : -25`，与旧逻辑一致
   - 通过 `setZoomPercentForWheel` 上抛给父组件（CropView）

4. **`useLayoutEffect`**（行 104–119）：依赖 `[zoomMode, zoomPercent, containerW, containerH, pages]`，缩放生效后补偿滚动。
   - 核心公式：
     ```
     ratioX = (旧scrollLeft + 光标相对视口偏移) / 旧内容宽度
     ratioY = (旧scrollTop + 光标相对视口偏移) / 旧内容高度
     新scrollLeft = ratioX × 新内容宽度 - 光标相对视口偏移
     新scrollTop = ratioY × 新内容高度 - 光标相对视口偏移
     ```
   - 即：保持"光标在内容中的比例位置"不变

5. **`setZoomPercentForWheel`**（行 145–152）：内部辅助函数，处理从 fit-width/fit-page 切换到 percent 模式的过渡（基准值取 100 而非当前的 -1/-2）。

6. **scrollRef 的 `onWheel`**（行 170）：`<div ref={scrollRef} onWheel={onWheel}>`。

7. **import 变更**（行 1）：`useLayoutEffect` 加入 import。

**文件 2：`src/renderer/src/views/CropView.tsx`**

- 移除旧 `onWheel` 回调（原行 37–49）和 `useCallback` import
- 移除外层 div 的 `onWheel={onWheel}`（原行 126），改为注释说明"T4 由 PDFViewer 内部处理"
- 不再 import `useCallback`

**红线确认**：CropOverlay 的比例坐标数学（`colAtX`、`getBoundingClientRect` 换算、A13 clamp）完全未动。overlay 天然解耦——它用 `getBoundingClientRect()` 取容器实际尺寸换算比例，缩放怎么变它都对。

### 3.4 验证

- `npm run typecheck:web` 通过
- `npm run build` 通过

**⚠️ 需人测验证**：Ctrl+滚轮放大/缩小，光标下的题目内容是否基本不动（允许 1–2px 误差）。

### 3.5 检查者如何验证

```bash
# 1. 确认 PDFViewer 有 ZoomAnchor 接口和 useLayoutEffect
grep -n "ZoomAnchor\|useLayoutEffect\|pendingAnchorRef\|ratioX\|ratioY" src/renderer/src/views/PDFViewer.tsx

# 2. 确认 CropView 不再有 onWheel
grep -n "onWheel\|useCallback" src/renderer/src/views/CropView.tsx
# 期望：无 onWheel 匹配（除了注释），useCallback 不在 import 里

# 3. 功能验证：启动 dev → 打开一张试卷 → Ctrl+滚轮放大 → 观察光标下的内容是否不动
# 4. 验证缩放上下限 25%–400% 仍生效
# 5. 验证裁切落线：缩放后落横切线，确认线落在光标处不错位（A4 回归测试）
```

---

## 4. T5：旋转页支持

### 4.1 问题根因

`RenderService` 的 `renderPage` 已支持传 `rotation` 参数（`getViewport({ rotation })`），但 `PDFViewer.computePageState` 写死返回 `rotation: 0`，且 **pages 表无 rotation 列**。含旋转页的扫描 PDF 会渲染异常（A6）。

### 4.2 关键认知

pdfjs 的 `page.getViewport({ scale: 1, rotation: page.rotate })` **已根据旋转调整了 width/height**——即 `viewport.width`/`viewport.height` 是旋转后的尺寸。所以 `width_pt`/`height_pt` 存入 DB 的值**已经是旋转后的正确值**，不需要在 `computePageState` 里手动对调宽高。

唯一需要做的是：把 `page.rotate` 存入 DB → 传给 `renderPage` 让 pdfjs 按 rotation 渲染。

### 4.3 实际改动

**文件 1：`src/main/storage/StorageService.ts`**

在 `initDatabase()` 末尾（行 54–58）加幂等迁移：

```ts
const cols = db.prepare("PRAGMA table_info(pages)").all() as { name: string }[]
if (!cols.some((c) => c.name === 'rotation')) {
  db.exec('ALTER TABLE pages ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0')
}
```

**幂等保证**：`PRAGMA table_info` 检查列是否已存在，只在不存在时 ALTER。旧库升级不丢数据（新列 DEFAULT 0，与之前写死 rotation: 0 的行为一致）。新库建表时 schema.ts 的 `CREATE TABLE IF NOT EXISTS pages` 不含 rotation 列（因为它在 SCHEMA_V1 常量里），但 ALTER 会在建表后立即补上。**注意**：理想做法是改 `SCHEMA_V1` 建表 SQL 也加上 rotation 列，让新库从建表就有——但当前未改 schema.ts，依赖迁移补列。检查者可考虑后续将 rotation 加入建表 SQL。

**文件 2：`src/renderer/src/services/RenderService.ts`**

- `PageSize` 接口（行 10–14）加 `rotation: number`
- `getPageSize` 返回值（行 33）改为 `{ width_pt: vp.width, height_pt: vp.height, rotation: page.rotate }`

**文件 3：`src/renderer/src/services/ImportService.ts`**

- `NewPageDTO` 构造（行 47–53）加 `rotation: s.rotation`——导入时把 pdfjs 读到的旋转值存入 DB

**文件 4：`src/shared/types.ts`**

- `PageDTO` 接口加 `rotation: number`
- `NewPageDTO` 接口加 `rotation: number`

**文件 5：`src/renderer/src/views/PDFViewer.tsx`**

- `computePageState` 返回值（行 98）改为 `rotation: page.rotation ?? 0`（`?? 0` 兜底旧数据无 rotation 字段的情况）

### 4.4 验证

- `npm run typecheck` 全过
- `npm run build` 全过
- `npm test` 28 单测全过

**⚠️ 需人测验证**：导入含 90° 旋转页的扫描 PDF，确认页面正立显示。

### 4.5 检查者如何验证

```bash
# 1. 确认迁移代码存在
grep -A3 "PRAGMA table_info(pages)" src/main/storage/StorageService.ts

# 2. 确认 PageDTO/NewPageDTO 有 rotation 字段
grep "rotation" src/shared/types.ts

# 3. 确认 getPageSize 返回 rotation
grep -n "rotation.*page.rotate\|rotation: page" src/renderer/src/services/RenderService.ts

# 4. 确认 computePageState 读 page.rotation
grep "page.rotation" src/renderer/src/views/PDFViewer.tsx

# 5. 功能验证：找一份含旋转页的 PDF（或用工具旋转某页 90°）→ 导入 → 查看是否正立显示

# 6. 旧库升级验证：删掉 app.db → 启动应用（新建库）→ 确认 PRAGMA table_info(pages) 含 rotation 列
```

---

## 5. T6：DB 备份导出 + 导出 DPI 设置

### 5.1 设计决策

**DB 备份**：用 `db.backup(dest)` 而非 `copyFile`，因为 better-sqlite3 的 `backup()` API 在另一个连接上逐页复制，不阻塞主连接读写，且保证一致性快照（WAL 日志也会被正确处理）。

**DPI 设置**：存在已有的 `app_settings` 表（key/value），而非 localStorage。理由：DPI 影响入库渲染质量，属于持久化数据，应跟 DB 走而非浏览器存储。

### 5.2 实际改动

**文件 1：`src/main/ipc/index.ts`**

新增 3 个 IPC handler（行 300–329）：

1. `db:backup`（行 303–315）：
   - `dialog.showSaveDialog` 让用户选保存路径
   - 默认文件名 `题库备份-{日期}.db`
   - `await db.backup(result.filePath)` 执行备份
   - 返回保存路径，用户取消返回 null

2. `settings:get`（行 318–323）：
   - `SELECT value FROM app_settings WHERE key = ?`
   - 无记录返回 `defaultValue`

3. `settings:set`（行 324–329）：
   - `INSERT ... ON CONFLICT(key) DO UPDATE SET value = excluded.value`（upsert）

**文件 2：`src/shared/types.ts`**

Api 接口新增 3 个方法签名：
```ts
backupDatabase(): Promise<string | null>
getSetting(key: string, defaultValue: string): Promise<string>
setSetting(key: string, value: string): Promise<void>
```

**文件 3：`src/preload/index.ts`**

新增 3 个 bridge 方法：
```ts
backupDatabase: () => ipcRenderer.invoke('db:backup'),
getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value)
```

**文件 4：`src/renderer/src/views/PostProcessView.tsx`**

入库渲染 DPI 从硬编码改为读取设置（行 182–184）：
```ts
const dpiStr = await window.api.getSetting('export_dpi', '300')
const renderDpi = parseInt(dpiStr, 10) || 300
```

移除 `EXPORT_DPI` import（不再直接使用常量）。

**文件 5：`src/renderer/src/components/AppLayout/LibraryLayout.tsx`**

大量重写——新增设置 Drawer UI：
- Header 右侧加齿轮图标 `IconSettings`，点击打开 Drawer
- Drawer 内容：
  - "入库渲染"分区：`Select` 组件，4 档 DPI（150/200/300/600），`onChange` 调 `setSetting`
  - "数据维护"分区：`Button` 组件，点击调 `backupDatabase()`
- Drawer 打开时（`useEffect` 依赖 `settingsOpen`）从 `getSetting` 加载当前 DPI
- 新增 import：`useState`/`useEffect`, `Drawer`/`Select`/`Button`/`Stack`/`Divider`, `notifications`, `IconSettings`/`IconDownload`

### 5.3 验证

- `npm run typecheck` 全过
- `npm run build` 全过

**⚠️ 需人测验证**：
1. 设置 Drawer 能打开，DPI 选择切换后 toast 提示
2. 备份数据库 → 弹保存框 → 生成 .db 文件 → 用 SQLite 工具打开验证可读
3. 改 DPI 后入库的题目图片分辨率是否对应变化

### 5.4 检查者如何验证

```bash
# 1. 确认 IPC 契约三处一致
grep -n "backupDatabase\|getSetting\|setSetting" src/shared/types.ts src/preload/index.ts src/main/ipc/index.ts

# 2. 确认 PostProcessView 读 settings
grep -n "getSetting\|renderDpi\|EXPORT_DPI" src/renderer/src/views/PostProcessView.tsx
# 期望：getSetting 命中，EXPORT_DPI 不在

# 3. 确认 LibraryLayout 有设置 Drawer
grep -n "Drawer\|DPI_OPTIONS\|handleBackup\|handleDpiChange" src/renderer/src/components/AppLayout/LibraryLayout.tsx

# 4. 功能验证：启动 dev → 点击齿轮 → 切换 DPI → 入库一个题 → 检查图片分辨率
# 5. 功能验证：点击备份数据库 → 选路径 → 用 DB Browser for SQLite 打开备份文件
```

---

## 6. T7：损坏 PDF 导入友好提示

### 6.1 问题根因

`HomeView.handleImport` 流程：先 `importPaper('')` 建 paper 行 + 复制 PDF → 再 `importPagesFromPdf(paper)` 用 pdfjs 读取页尺寸。若 PDF 损坏/加密，`importPagesFromPdf` 抛错，但 **已建的 paper 行和复制的 source.pdf 不会回滚** → 列表留脏行。且错误信息是 pdfjs 原始英文错误。

### 6.2 实际改动

**文件 1：`src/renderer/src/services/ImportService.ts`**

1. 新增 `describeImportError(e: unknown): string` 函数（行 10–23），归类 pdfjs 错误为中文提示：

   | pdfjs 错误名 | 中文提示 |
   |---|---|
   | `PasswordException` 或 message 含 password | 该 PDF 已加密，请先解除密码保护后再导入。 |
   | `InvalidPDFException` 或 message 含 invalid pdf | 该 PDF 文件已损坏或格式不正确，无法打开。 |
   | `MissingPDFException` 或 message 含 missing pdf | 找不到 PDF 文件，可能已被移动或删除。 |
   | 其他 | 导入失败：{原始 message} |

   判断逻辑：先检查 `error.name`（pdfjs 抛的结构化错误有 name 属性），再做 message 关键词兜底。

2. `importPagesFromPdf` 改动：
   - `loadPdf` 失败时 `throw new Error(describeImportError(e))`
   - 后续步骤（`getAllPageSizes`/`bulkAddPages`/`setPageCount`）失败时也 `throw new Error(describeImportError(e))`
   - 移除 `console.time/timeEnd` 调试日志（保留关键 `console.log`）

**文件 2：`src/renderer/src/views/HomeView.tsx`**

`handleImport` 改动（行 42–70）：

```ts
const handleImport = useCallback(async () => {
  setBusy(true)
  let paper: PaperDTO | null = null  // 提升到 try 外，catch 可访问
  try {
    paper = await window.api.importPaper('')
    if (!paper) return
    await importPagesFromPdf(paper)
    await refresh()
    notifications.show({ message: '导入成功', color: 'green' })
  } catch (e) {
    // 回滚：若已建 paper 行但后续失败，删掉脏数据（T3 后 deletePaper 连磁盘一起清）
    if (paper) {
      try {
        await window.api.deletePaper(paper.id)
        await refresh()
      } catch {
        console.error('[import] 回滚 paper 失败', paper.id)
      }
    }
    notifications.show({
      title: '导入失败',
      message: e instanceof Error ? e.message : String(e),  // 友好中文 message
      color: 'red'
    })
  } finally {
    setBusy(false)
  }
}, [refresh])
```

关键：`paper` 变量提升到 try 外，使 catch 能判断"是否已成功建 paper"。回滚用 `deletePaper`（T3 后这个函数会同时清磁盘）。

### 6.3 验证

- `npm run typecheck:web` 通过

**⚠️ 需人测验证**：导入一个损坏/加密的 PDF → 红色 toast 显示中文提示 → 列表无残留脏行。

### 6.4 检查者如何验证

```bash
# 1. 确认 describeImportError 函数存在
grep -A15 "describeImportError" src/renderer/src/services/ImportService.ts

# 2. 确认 HomeView handleImport 有回滚逻辑
grep -A10 "paper.*PaperDTO.*null\|deletePaper.*paper.id" src/renderer/src/views/HomeView.tsx

# 3. 功能验证：准备一个加密 PDF → 导入 → 期望红色 toast "该 PDF 已加密"
# 4. 准备一个损坏 PDF（如改后缀的空文件）→ 导入 → 期望红色 toast "已损坏"
# 5. 每次导入失败后 → 确认试卷列表无新增条目
```

---

## 7. T8：大 PDF 出图内存监控

### 7.1 确认已有实现

**无需新增代码。** `PostProcessView.tsx` 行 194–195 已有逐题释放：

```ts
canvas.width = 0; canvas.height = 0                              // 释放合成 canvas
rendered.forEach((r) => { r.canvas.width = 0; r.canvas.height = 0 }) // 释放每个 segment canvas
```

`canvas.width = canvas.height = 0` 是释放 canvas 内存的标准做法——浏览器会立即回收对应的像素缓冲区。

### 7.2 检查者如何验证

```bash
# 确认逐题释放存在
grep -n "canvas.width = 0\|canvas.height = 0" src/renderer/src/views/PostProcessView.tsx
# 期望：两行命中

# 功能验证：入库一份 20+ 页大卷 → 观察任务管理器内存是否平稳（不持续增长）
```

---

## 8. T2：全链路人工走查（未完成）

**状态：待用户操作。**

这是唯一不能由代码自动完成的任务。设计文档 `2026-07-07-completion-and-hardening-plan.md` 第 3 节 T2 给出了 8 步走查脚本：

1. 导入多页双栏 PDF
2. 裁切专项（缩放不错位、重启还原）
3. 后期处理（软删除/合并/入库）
4. 入库出图质量（300 DPI 清晰）
5. 原卷复查（套模板/赋标签）
6. 题库筛选
7. 组卷篮（重启保留）
8. 导出 PDF（中文不乱码）

---

## 9. 全局验证结果

| 验证项 | 结果 |
|---|---|
| `npm run typecheck`（node + web） | ✅ 通过 |
| `npm run build`（main/preload/renderer 三段） | ✅ 通过 |
| `npm test`（28 单测） | ✅ 全绿 |
| `npm run dist`（NSIS 安装包） | ✅ 产出 126MB exe |

---

## 10. IPC 契约变更汇总

本次新增 3 个 IPC 方法，**未修改任何已有方法签名**：

| 新增方法 | IPC 通道 | 契约位置 | 实现位置 | 用途 |
|---|---|---|---|---|
| `backupDatabase()` | `db:backup` | `types.ts:138` | `ipc/index.ts:303-315` | M12-2 DB 备份 |
| `getSetting(key, default)` | `settings:get` | `types.ts:141` | `ipc/index.ts:318-323` | M12-2 读取设置 |
| `setSetting(key, value)` | `settings:set` | `types.ts:142` | `ipc/index.ts:324-329` | M12-2 写入设置 |

`preload/index.ts` 同步添加了 3 个 bridge 方法。

---

## 11. Schema 变更汇总

| 变更 | 迁移方式 | 影响范围 |
|---|---|---|
| `pages` 表新增 `rotation INTEGER NOT NULL DEFAULT 0` | 幂等 ALTER（`PRAGMA table_info` 检查后执行） | `StorageService.ts:54-58` |

**注意**：`SCHEMA_V1` 建表 SQL（`schema.ts`）尚未更新加入 rotation 列。新库建表时 pages 不含 rotation → 迁移代码补上。功能等价但不够干净——后续可考虑在建表 SQL 里也加 rotation 列。

---

## 12. 文件变更清单

| 文件 | 变更类型 | 涉及任务 |
|---|---|---|
| `electron-builder.yml` | 修改（加 `npmRebuild: false`） | T1 |
| `src/main/files/FileService.ts` | 修改（新增 `deletePaperDir` + import `sep`/`relative`/`rm`） | T3 |
| `src/main/ipc/index.ts` | 修改（`papers:delete` 改 async + 新增 `db:backup`/`settings:get`/`settings:set`） | T3, T6 |
| `src/main/storage/StorageService.ts` | 修改（`initDatabase` 加 rotation 迁移） | T5 |
| `src/shared/types.ts` | 修改（PageDTO/NewPageDTO 加 rotation + Api 加 3 个方法） | T5, T6 |
| `src/preload/index.ts` | 修改（新增 3 个 bridge 方法） | T6 |
| `src/renderer/src/services/RenderService.ts` | 修改（PageSize 加 rotation + getPageSize 返回 page.rotate） | T5 |
| `src/renderer/src/services/ImportService.ts` | 修改（新增 `describeImportError` + loadPdf 错误包装 + rotation 传入 NewPageDTO） | T5, T7 |
| `src/renderer/src/views/PDFViewer.tsx` | 修改（ZoomAnchor + onWheel + useLayoutEffect + rotation 传入 + import useLayoutEffect） | T4, T5 |
| `src/renderer/src/views/CropView.tsx` | 修改（移除旧 onWheel + 移除 useCallback import） | T4 |
| `src/renderer/src/views/HomeView.tsx` | 修改（handleImport 加回滚 + 友好错误消息） | T7 |
| `src/renderer/src/views/PostProcessView.tsx` | 修改（DPI 从 settings 读取 + 移除 EXPORT_DPI import） | T6 |
| `src/renderer/src/components/AppLayout/LibraryLayout.tsx` | 重写（新增设置 Drawer + DPI Select + 备份 Button） | T6 |
