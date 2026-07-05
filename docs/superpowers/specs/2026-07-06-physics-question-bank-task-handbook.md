# 物理教师题库管理系统 — 开发任务分解手册（第一阶段）

- 日期：2026-07-06
- 关联文档：`2026-07-06-physics-question-bank-technical-design.md`（技术设计，总纲）、`...-requirements.md`（需求原文）
- **本手册面向执行具体编程任务的开发者/模型。** 你不需要做架构决策，只需按任务顺序执行：装包 → 建文件 → 写代码 → 跑命令 → 对照"完成判据"。遇到判据不通过就修，通过就进入下一个任务。

---

## 如何使用本手册（务必先读）

1. **严格按任务编号顺序执行**（M0-1 → M0-2 → …）。每个任务只碰它列出的文件。
2. 每个任务的格式固定：
   - **前置**：必须先完成的任务。
   - **做什么**：一句话目标。
   - **步骤**：装什么包、建/改哪个文件、文件里放什么、跑什么命令。
   - **完成判据**：可照着跑的验证 + 预期结果。判据不满足就不算完成，不要进入下一个任务。
3. **不要自己改技术选型、不要引入手册没提到的新库。**
4. 遇到任何"需要做决策"的地方，答案已经写在下面第 0 节"已定死的规则"里。如果那里没有，就选最简单、最不破坏现有功能的做法，并在完成汇报里写一行说明。
5. 所有命令在项目根目录 `教师题库管理系统\` 下执行（Windows PowerShell）。

---

## 0. 已定死的规则（不要再纠结，直接照做）

- **R1 合成宽度不一致**：一道题由多段拼成时，取各段中的最大宽度为准；较窄的段在白色背景上**水平居中**，纵向按 `merge_order` 从上到下拼接。
- **R2 入库后重新裁切**：一份试卷入库后仍可再次进入裁切工作区。若用户确认"重新处理"，则**先删除该试卷已入库的题目（弹窗二次确认）**，再按新裁切结果重新派生、重新入库。不做增量 diff。
- **R3 删除来源试卷**：级联删除该试卷的 pages/cut_lines/segments/questions 及其图片文件，**必须弹窗二次确认**。
- **R4 导出页面**：A4 竖向，页边距 15mm。题目图片按内容宽度等比缩放以适应；若单题高于一页内容区，则**等比缩小到一页内**（第一阶段不拆分跨页）。
- **R5 图像格式**：一律 PNG（无损）。第一阶段不做 JPEG。
- **R6 题目复用**：一道题可加入多套试卷（set）；但**同一套 set 内不允许重复**（重复勾选忽略）。
- **R7 导出 DPI**：默认 300 DPI，常量集中定义，后续可在设置里改。
- **R8 单位约定**：数据库几何一律存**比例（0..1）**；PDF 点(pt) 1pt = 1/72 inch；像素换算 `px = ratio * size_pt * (dpi/72)`。
- **R9 ID 约定**：所有主键用自增整数 `INTEGER PRIMARY KEY`。时间戳存 `TEXT`（ISO8601，`new Date().toISOString()`）。

---

# 里程碑 M0 — 工程脚手架

目标：一个能 `npm run dev` 启动的 Electron + React + TypeScript 空应用，接好 SQLite。

## 任务 M0-1：初始化工程
- **前置**：无。
- **做什么**：用 electron-vite 官方 react-ts 模板建工程。
- **步骤**：
  1. 在项目根目录执行：`npm create @quick-start/electron@latest . -- --template react-ts`
     （若提示目录非空，选择继续/不覆盖 docs 目录；docs 文件夹必须保留）。
  2. 执行 `npm install`。
  3. 执行 `git init`（若还不是 git 仓库），并新建 `.gitignore` 包含：`node_modules`、`out`、`dist`、`*.log`。
- **完成判据**：`npm run dev` 能弹出一个 Electron 窗口显示模板首页；关闭窗口进程退出无报错。

## 任务 M0-2：整理目录结构
- **前置**：M0-1。
- **做什么**：建立技术设计文档第 8.3 节约定的目录骨架。
- **步骤**：新建这些空目录（用占位 `.gitkeep` 文件即可）：
  - `src/main/storage/repositories/`
  - `src/main/export/`
  - `src/main/files/`
  - `src/renderer/src/services/`
  - `src/renderer/src/views/`
  - `src/renderer/src/store/`
  - `src/shared/`
- **完成判据**：目录都存在；`npm run dev` 仍能启动。

## 任务 M0-3：接入 better-sqlite3 并验证原生模块
- **前置**：M0-2。
- **做什么**：装 SQLite，重建原生模块，确认在 Electron 里能用。
- **步骤**：
  1. `npm i better-sqlite3`
  2. `npm i -D @electron/rebuild @types/better-sqlite3`
  3. `npx electron-rebuild -f -w better-sqlite3`
  4. 在 `electron.vite.config.ts` 的 main 配置里，把 `better-sqlite3` 加入 `build.rollupOptions.external`（避免被打包，作为外部原生模块）。参考写法：
     ```ts
     // main 段落内
     build: { rollupOptions: { external: ['better-sqlite3'] } }
     ```
- **完成判据**：见 M0-4（建库后一起验证）。

## 任务 M0-4：StorageService + schema v1 建表
- **前置**：M0-3。
- **做什么**：新建数据库服务，应用启动时建库建表。
- **步骤**：
  1. 新建 `src/main/storage/schema.ts`，内容为下面的完整建表 SQL 常量（一字不改照抄）：
     ```ts
     export const SCHEMA_V1 = `
     PRAGMA journal_mode = WAL;
     PRAGMA foreign_keys = ON;

     CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);

     CREATE TABLE IF NOT EXISTS papers (
       id INTEGER PRIMARY KEY, name TEXT NOT NULL,
       source_pdf_path TEXT, original_filename TEXT, page_count INTEGER DEFAULT 0,
       status TEXT DEFAULT 'importing', created_at TEXT, updated_at TEXT);

     CREATE TABLE IF NOT EXISTS pages (
       id INTEGER PRIMARY KEY,
       paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
       page_index INTEGER NOT NULL, width_pt REAL, height_pt REAL,
       column_mode INTEGER DEFAULT 1);

     CREATE TABLE IF NOT EXISTS column_dividers (
       id INTEGER PRIMARY KEY,
       page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
       x_ratio REAL NOT NULL);

     CREATE TABLE IF NOT EXISTS cut_lines (
       id INTEGER PRIMARY KEY,
       page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
       col_index INTEGER NOT NULL DEFAULT 0, y_ratio REAL NOT NULL, created_seq INTEGER);

     CREATE TABLE IF NOT EXISTS segments (
       id INTEGER PRIMARY KEY,
       paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
       page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
       col_index INTEGER NOT NULL DEFAULT 0,
       x_start_ratio REAL, x_end_ratio REAL, y_start_ratio REAL, y_end_ratio REAL,
       order_index INTEGER, is_deleted INTEGER DEFAULT 0);

     CREATE TABLE IF NOT EXISTS question_types (
       id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_builtin INTEGER DEFAULT 0);

     CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS knowledge_points (
       id INTEGER PRIMARY KEY, name TEXT NOT NULL,
       chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL);
     CREATE TABLE IF NOT EXISTS difficulties (
       id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0);

     CREATE TABLE IF NOT EXISTS questions (
       id INTEGER PRIMARY KEY,
       paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
       order_in_paper INTEGER,
       type_id INTEGER REFERENCES question_types(id) ON DELETE SET NULL,
       chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
       difficulty_id INTEGER REFERENCES difficulties(id) ON DELETE SET NULL,
       is_merged INTEGER DEFAULT 0, image_path TEXT, width_px INTEGER, height_px INTEGER,
       created_at TEXT, updated_at TEXT);

     CREATE TABLE IF NOT EXISTS question_segments (
       id INTEGER PRIMARY KEY,
       question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
       segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
       merge_order INTEGER DEFAULT 0);

     CREATE TABLE IF NOT EXISTS question_knowledge_points (
       question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
       kp_id INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
       PRIMARY KEY (question_id, kp_id));

     CREATE TABLE IF NOT EXISTS templates (
       id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT);
     CREATE TABLE IF NOT EXISTS template_rules (
       id INTEGER PRIMARY KEY,
       template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
       from_no INTEGER, to_no INTEGER,
       type_id INTEGER REFERENCES question_types(id) ON DELETE SET NULL, rule_order INTEGER);

     CREATE TABLE IF NOT EXISTS paper_sets (
       id INTEGER PRIMARY KEY, name TEXT, title TEXT,
       status TEXT DEFAULT 'draft', created_at TEXT, updated_at TEXT);
     CREATE TABLE IF NOT EXISTS paper_set_items (
       id INTEGER PRIMARY KEY,
       set_id INTEGER NOT NULL REFERENCES paper_sets(id) ON DELETE CASCADE,
       question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
       order_index INTEGER, group_header TEXT, display_number TEXT);

     CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);
     `;

     export const BUILTIN_TYPES = ['单选题','多选题','填空题','实验题','计算题'];
     export const BUILTIN_DIFFICULTIES = ['简单','中等','较难','压轴'];
     ```
  2. 新建 `src/main/storage/StorageService.ts`：打开 `app.getPath('userData')/app.db`，执行 `SCHEMA_V1`；若 `schema_meta` 为空则写入 `version=1`，并插入 `BUILTIN_TYPES`（is_builtin=1）与 `BUILTIN_DIFFICULTIES`（sort_order 递增）。导出单例 `getDb()`。
  3. 在主进程入口（`src/main/index.ts`）的 app `whenReady` 里调用一次初始化，并 `console.log('schema v1 ready')`。
- **完成判据**：`npm run dev`，主进程控制台打印 `schema v1 ready`；用任意 SQLite 工具打开 `%APPDATA%/<应用名>/app.db`，能看到全部表，且 `question_types` 有 5 行、`difficulties` 有 4 行。

## 任务 M0-5：共享类型与 IPC 骨架
- **前置**：M0-4。
- **做什么**：搭好类型化 IPC 通道（先只做一个 ping 验证链路）。
- **步骤**：
  1. 新建 `src/shared/types.ts`，先放一个占位：`export interface Api { ping(): Promise<string>; }`。
  2. 在 preload（`src/preload/index.ts`）用 `contextBridge.exposeInMainWorld('api', { ping: () => ipcRenderer.invoke('app:ping') })`。
  3. 主进程 `ipcMain.handle('app:ping', () => 'pong')`。
  4. 渲染进程首页调用 `window.api.ping()` 并显示返回值。
- **完成判据**：`npm run dev`，首页显示 `pong`。确认 `contextIsolation: true`、`nodeIntegration: false`（模板默认即是，检查一下）。

**M0 验收：** 应用能启动，数据库建表完整并有种子数据，渲染进程能通过 IPC 拿到主进程返回值。

---

# 里程碑 S — 两个去风险 Spike（在铺 UI 之前先做）

这两个 Spike 可以写成临时页面/临时按钮，验证通过后代码可保留复用。它们验证的是全局最大的两个技术风险。

## 任务 S-A：保真链 Spike（导出清晰度 + 中文字体）
- **前置**：M0-5。
- **做什么**：证明 "pdf.js 高 DPI 渲染 → PNG → pdf-lib 内嵌 + 中文标题 → 导出 PDF" 这条链清晰且中文不乱码。
- **步骤**：
  1. `npm i pdfjs-dist pdf-lib @pdf-lib/fontkit`
  2. 下载一个中文 TTF（如 Noto Sans SC Regular），放到 `src/renderer/src/assets/fonts/NotoSansSC-Regular.ttf`（导出用，后续 M10 复用）。
  3. 临时在首页加一个"跑 Spike A"按钮：选一个本地 PDF → 用 pdfjs 以 `scale = 300/72` 渲染第 1 页到离屏 canvas → 转 PNG → 用 pdf-lib 新建 A4 页，`registerFontkit` 后内嵌该 TTF，绘制一行中文标题"物理测试卷"，再把 PNG `drawImage` 铺上去 → 存成 `spikeA.pdf`。
- **完成判据**：用系统 PDF 阅读器打开 `spikeA.pdf`，中文标题正常显示（非空白/豆腐块），页面图片放大到 200% 仍清晰、无锯齿模糊。

## 任务 S-B：裁切画布 Spike（分列 + 横切示意线 + 落刀 + 撤销）
- **前置**：M0-5（可与 S-A 并行）。
- **做什么**：验证最难的交互与二维坐标数学，全部用比例坐标。
- **步骤**：临时页面渲染一页 PDF 图，叠一层绝对定位的覆盖层 `<div>`（或 canvas overlay）：
  1. 顶部按钮切换列模式 1/2/3；按列数画出均分竖分隔线，可左右拖动改 `x_ratio`。
  2. 进入横切模式后，鼠标在某列内移动时画一条**跟随光标的水平虚线**（示意线）；点击则在该列该 `y_ratio` 落一条实线（记录 `{col_index, y_ratio}`）。
  3. 提供"撤销上一刀""删除某条线"。
  4. 所有坐标存为比例；窗口缩放/改变显示尺寸时，线的相对位置不变（验证解耦）。
- **完成判据**：能在双栏模式下，只在左列点出 3 条横线、右列点出 2 条横线，互不干扰；拖动中间分隔线后已落的横线仍停在各自列内；撤销/删除生效；改变窗口大小后线的相对位置不动。

---

# 里程碑 M1 — PDF 导入 + 持久化

## 任务 M1-1：papers/pages 的 repository
- **前置**：M0-4。
- **做什么**：写数据访问层。
- **步骤**：新建 `src/main/storage/repositories/paperRepo.ts`，实现并导出：
  - `createPaper(name): number`（写 created_at/updated_at，status='importing'，返回 id）
  - `addPage({paper_id, page_index, width_pt, height_pt})`
  - `setPageCount(paper_id, n)`、`listPapers()`、`getPaper(id)`、`getPages(paper_id)`
- **完成判据**：写一个临时脚本或在 ping 里调用一次 `createPaper('测试')` 后 `listPapers()` 能返回该行。

## 任务 M1-2：导入 PDF（复制文件 + 读页尺寸）
- **前置**：M1-1、S-A（需要 pdfjs 能读 PDF）。
- **做什么**：完成导入流程。
- **步骤**：
  1. 新建 `src/main/files/FileService.ts`：`ensurePaperDir(paperId)` 建 `userData/projects/{paperId}/` 与 `images/`；`copySourcePdf(paperId, srcPath)` 复制为 `source.pdf` 并返回路径。
  2. IPC：`papers:import`（参数 name），主进程用 `dialog.showOpenDialog` 选 PDF → createPaper → 复制文件。
  3. 页尺寸由**渲染进程**用 pdfjs 读取（主进程不跑 pdf.js）：渲染进程加载 source.pdf，遍历每页取 `getViewport({scale:1})` 的 width/height（pt），通过 IPC `pages:bulkAdd` 回存；再 `setPageCount`。
- **完成判据**：导入一个多页 PDF 后，数据库 papers 有 1 行、pages 行数 = PDF 页数且 width_pt/height_pt 非空；`userData/projects/{id}/source.pdf` 存在。

## 任务 M1-3：主页试卷列表 + 重新打开
- **前置**：M1-2。
- **做什么**：主页显示试卷列表，点击进入（先占位到裁切工作区路由）。
- **步骤**：渲染进程首页调用 `papers:list` 显示卡片（名称、页数、状态、创建时间）；"导入"按钮走 M1-2 流程；点卡片路由到 `/crop/:paperId`（页面先留空）。
- **完成判据**：导入 → 列表出现 → **关闭应用重启 → 列表仍在** → 点击能进到裁切页路由。

**M1 验收：** 能导入 PDF 并持久化，重启后列表还在。

---

# 里程碑 M2 — 裁切工作区

复用 S-B 的画布代码，接上持久化。

## 任务 M2-1：PDF 查看器（适应宽度/整页/缩放/滚动）
- **前置**：M1-3。
- **做什么**：实现技术设计文档第 4 节的全部查看能力（**这是需求硬性项，必须独立可用**）。
- **步骤**：新建 `src/renderer/src/services/RenderService.ts`（封装 pdfjs：`renderPage(pageIndex, scale) → canvas/blob`，缓存并释放 page proxy）与 `views/CropView.tsx`：
  - 多页纵向滚动容器，虚拟化（只渲染视口附近页）。
  - 工具栏：适应宽度（默认）、适应整页、缩放档位 50/75/100/125/150/200%、`+`/`−` 按钮、当前百分比显示。
  - `Ctrl+滚轮`以光标为锚点缩放（限 25%–400%）；普通滚轮上下滚动。
  - 适应宽度 scale = 可视区可用宽度 / (width_pt * baseDpi/72)，baseDpi 取 96。
- **完成判据**：导入的多页 PDF 能显示；点"适应宽度"页面铺满宽度；"适应整页"整页可见；缩放按钮和 Ctrl+滚轮都能改变大小且不越界；能顺畅滚动多页。

## 任务 M2-2：列模式 + 分隔线（持久化）
- **前置**：M2-1、S-B。
- **做什么**：把 S-B 的分列做成逐页可存。
- **步骤**：
  1. repository `pageRepo.ts`：`setColumnMode(page_id, mode)`、分隔线的增改删查（column_dividers）。
  2. CropView 叠加覆盖层：切换当前页列模式 → 按均分生成分隔线 → 可拖动改 `x_ratio` → 变更即通过 IPC 存库。
- **完成判据**：某页设为双栏并拖动分隔线后，**重启应用重新打开该试卷，列模式与分隔线位置精确还原**。

## 任务 M2-3：横切线（示意线 + 落刀 + 撤销删除，持久化）
- **前置**：M2-2。
- **做什么**：列内横切并存库。
- **步骤**：
  1. repository：cut_lines 的增/删/查（带 col_index、y_ratio、created_seq）。
  2. 覆盖层：横切模式下画跟随光标的示意线（限当前列）；点击落实线并存库；撤销最近一刀（按 created_seq）、删除指定线。
- **完成判据**：双栏页在左右两列分别落线互不干扰；撤销/删除生效；**重启后所有横切线精确还原**。

## 任务 M2-4：派生并持久化 segments
- **前置**：M2-3。
- **做什么**：由分列+横切算出片段并存库（纯逻辑，重点写单测）。
- **步骤**：
  1. 新建 `src/renderer/src/services/ColumnCropService.ts` 的纯函数 `deriveSegments(page, dividers, cutLines)`：
     - 每列 x 区间由分隔线切分（[0..d1],[d1..d2],...）。
     - 每列内 y 边界 = `[0, ...该列cutLines的y_ratio升序, 1]`，相邻两值成一段。
     - 输出带 `col_index, x_start/x_end, y_start/y_end` 的片段，`order_index` 按 页→列→y 排序。
  2. 每当线变化，重算并 upsert 到 segments 表（保留已有 is_deleted/合并关系尽量不丢——第一阶段可简单策略：重算前先清该页未删除且未入库的派生段再重建；若实现复杂，用 R2 规则整页重建并提示）。
  3. **写 Vitest 单测**覆盖：单栏 2 刀=3 段；双栏各 1 刀=4 段且顺序为 左列上、左列下、右列上、右列下。
- **完成判据**：单测通过；界面上落线后 segments 表行数与预期一致，order_index 正确。

**M2 验收：** 查看器四项能力可用；列模式、分隔线、横切线、派生片段全部持久化，重启精确还原。

---

# 里程碑 M3 — 后期处理工作区

## 任务 M3-1：片段缩略图列表（按序显示）
- **前置**：M2-4。
- **做什么**：新页面 `views/PostProcessView.tsx`，按 order_index 显示所有未删除片段的缩略图。
- **步骤**：RenderService 增加"渲染页面某个比例区域到缩略图"的方法（低 DPI 即可）；按 segments 顺序平铺。
- **完成判据**：进入后期处理页，能看到该试卷所有片段按 页→列→y 顺序排列的缩略图。

## 任务 M3-2：软删除片段
- **前置**：M3-1。
- **做什么**：删除页眉页脚等无关片段。
- **步骤**：每个片段一个删除按钮 → IPC 置 `is_deleted=1`；列表默认隐藏已删除；提供"显示已删除/恢复"开关。
- **完成判据**：删除某片段后它从列表消失；重启后仍为删除态；能恢复。

## 任务 M3-3：多选合并 / 取消合并
- **前置**：M3-2。
- **做什么**：把跨页/跨列片段合并成一"逻辑题"。
- **步骤**：
  1. 支持多选片段 → "合并"：这一步先只在内存/临时表建立分组关系（真正的 questions 行在 M4 入库时生成）。第一阶段建议：合并即在 `questions` 建占位行 + `question_segments` 映射（merge_order 按选择顺序），`is_merged=1`；单片段题在入库时自动各建一题。
  2. "取消合并"删除该 question 占位行与映射，片段回到独立状态。
- **完成判据**：选 2 个片段合并后显示为一组；取消合并后恢复独立；重启后合并状态保留。

**M3 验收：** 片段可删可恢复、可合并可拆分，全部跨重启保留。

---

# 里程碑 M4 — 入库 + 出图

## 任务 M4-1：生成每题的高 DPI 标准 PNG
- **前置**：M3-3、S-A。
- **做什么**：把每个逻辑题渲染成一张清晰 PNG 落盘。
- **步骤**：
  1. ColumnCropService 增加 `renderQuestionPng(question)`：对该题的每个 segment，用 RenderService 按 `scale = EXPORT_DPI/72`（R7=300）渲染其比例区域到 canvas；多段按 R1 规则（最大宽度、居中、按 merge_order 纵向拼接）合成一张 canvas → PNG blob。
  2. 通过 IPC 把 PNG 的 ArrayBuffer 交主进程，FileService 存到 `projects/{paperId}/images/q_{questionId}.png`，回写 questions 的 image_path/width_px/height_px。
- **完成判据**：入库后 images 目录出现每题 PNG；合并题的图上下拼接正确、清晰；questions 表 image_path 有值。

## 任务 M4-2：入库流程 + order_in_paper
- **前置**：M4-1。
- **做什么**：把处理好的题正式写入题库。
- **步骤**：后期处理页"完成入库"按钮 → 对未成组的单片段各建一题、已成组的用现有 question 行 → 按片段顺序赋 `order_in_paper`（1,2,3…）→ 触发 M4-1 出图 → paper.status 置 'done'。
- **完成判据**：入库后该试卷所有题在 questions 表齐全，order_in_paper 连续；status='done'；重启后仍在。

**M4 验收（核心链路打通）：** 从导入到入库出图的主线 M0→M4 完整跑通。**建议在此暂停，验证低智能模型确实能顺着手册工作，再继续 M5+。**

---

# 里程碑 M5 — 题型模板

## 任务 M5-1：题型 CRUD
- **前置**：M4-2。
- **做什么**：管理 question_types。
- **步骤**：repository + IPC + 简单管理界面：列出内置 5 种、可新增自定义题型（is_builtin=0）、可改名/删（内置不可删）。
- **完成判据**：能新增一个题型并在列表看到；重启保留。

## 任务 M5-2：模板与区间规则
- **前置**：M5-1。
- **做什么**：创建"第 x–y 题 = 某题型"的模板。
- **步骤**：templates/template_rules 的 CRUD + 界面：一个模板下可加多条 `{from_no, to_no, type_id}`。
- **完成判据**：能建一个含多条区间的模板并重启保留。

## 任务 M5-3：套用模板 + 手动改题型
- **前置**：M5-2。
- **做什么**：按 order_in_paper 自动标题型，且可手改。
- **步骤**：纯函数 `applyTemplate(questions, rules)`：对每题按 order_in_paper 落在哪个区间赋 type_id（**写 Vitest 单测**）。界面：选模板→套用→逐题可下拉手改。
- **完成判据**：单测通过；对一份试卷套用模板后题型正确；手改某题后重启保留。

---

# 里程碑 M6 — 标签（章节/知识点/难度）

## 任务 M6-1：三类标签 CRUD（含临时新建）
- **前置**：M4-2。
- **做什么**：chapters / knowledge_points / difficulties 的管理。
- **步骤**：各自 repository + IPC + 管理界面；难度带 sort_order。支持在编辑题目时"临时新建"标签（新建后立即可选）。
- **完成判据**：三类标签都能预先创建；重启保留；编辑题目时能临时新建一个知识点并马上选中。

## 任务 M6-2：给题目赋标签
- **前置**：M6-1。
- **做什么**：题目编辑面板挂标签。
- **步骤**：章节（单选）、难度（单选）写 questions 的 FK；知识点（**多选**）写 question_knowledge_points。后续可改。
- **完成判据**：给一题设 1 章节 + 2 知识点 + 1 难度，重启后完整还原；可再修改。

---

# 里程碑 M7 — 原试卷复查

## 任务 M7-1：按原序显示某卷所有题
- **前置**：M4-2、M5-3、M6-2。
- **做什么**：`views/PaperReviewView.tsx` 重开已处理试卷，按 order_in_paper 显示题图 + 题型 + 标签 + 是否合并。
- **步骤**：查询该 paper 的 questions（join 题型/标签），按序展示；就地可改题型/标签（复用 M5-3/M6-2 的编辑）。
- **完成判据**：打开一份已入库试卷，题目按原序显示，状态齐全；就地改题型/标签后重启保留。

---

# 里程碑 M8 — 题库浏览 + 组合筛选

## 任务 M8-1：题库网格
- **前置**：M4-2、M6-2。
- **做什么**：`views/BankView.tsx` 网格展示所有入库题（题图 + 来源试卷名）。
- **完成判据**：所有已入库题以网格显示，每题能看到来源试卷。

## 任务 M8-2：组合筛选
- **前置**：M8-1。
- **做什么**：按 题型/来源试卷/章节/知识点/难度 组合筛选。
- **步骤**：纯函数/查询构造器 `buildQuestionFilter(criteria)`（**写 Vitest 单测**）；侧栏多条件；条件为 AND 组合，知识点命中任一即可。
- **完成判据**：单测通过；筛选"单选题 + 某章节 + 中等"返回结果正确；清除条件恢复全部。

---

# 里程碑 M9 — 组卷篮

## 任务 M9-1：勾选入篮（draft set）
- **前置**：M8-2。
- **做什么**：题库中勾选题目加入组卷篮。
- **步骤**：应用维护一个 status='draft' 的 paper_set 作为当前篮；勾选写 paper_set_items（遵守 R6：同篮去重）。
- **完成判据**：勾选若干题后篮内数量正确；重复勾选不增加；**重启后篮内容保留**。

## 任务 M9-2：查看/移除/重排 + 分组标题
- **前置**：M9-1。
- **做什么**：`views/BasketView.tsx` 管理篮内题目。
- **步骤**：列出篮内题；移除；拖动重排改 order_index；可给条目加可选 group_header 文本。
- **完成判据**：移除、重排生效并持久化；能设置分组标题。

---

# 里程碑 M10 — 导出 PDF

## 任务 M10-1：导出组装
- **前置**：M9-2、S-A。
- **做什么**：`src/main/export/ExportService.ts` 用 pdf-lib 生成新试卷 PDF。
- **步骤**：
  1. 读当前篮的 items（按 order_index）→ 读各题 image_path 的 PNG。
  2. A4 竖向、边距 15mm（R4）；顶部绘制试卷标题（内嵌中文字体，复用 S-A 的 TTF）。
  3. 每题：绘制连续编号（1..N，R7 全卷连续，不因分组重置）+ 可选 group_header + 题图（按内容宽度等比缩放；高于一页内容区则等比缩小到一页内）。
  4. 自动分页；`dialog.showSaveDialog` 选保存路径。
  5. 导出参数 `EXPORT_DPI=300`、页面尺寸、边距集中为常量。
- **完成判据**：导出一套含跨页合并题的试卷 → 打印预览：标题中文正常、编号连续、题图清晰不变形、分页合理。

---

# 里程碑 M11 — 打包

## 任务 M11-1：electron-builder NSIS 安装包
- **前置**：M10-1。
- **做什么**：产出带快捷方式的安装包。
- **步骤**：配置 electron-builder：target `nsis`、`createDesktopShortcut`、`createStartMenuShortcut`；把 `better-sqlite3` 加入 `asarUnpack`（原生模块不能进 asar）；配置图标与应用名。`npm run build` 出安装包。
- **完成判据**：**在一台干净 Windows 机器（或干净用户）安装** → 桌面/开始菜单有快捷方式 → 启动能导入 PDF、入库、导出（**验证原生模块 better-sqlite3 在安装版下能正常读写库**，这是 dev 下测不出的关键项）。

---

# 里程碑 M12 — 加固

## 任务 M12-1：破坏性操作确认 + 错误态
- **前置**：M11-1。
- **做什么**：给删除试卷（R3）、重新裁切作废（R2）加二次确认弹窗；导入失败/损坏 PDF/空篮导出等给友好提示。
- **完成判据**：删除试卷弹确认，取消则不删；损坏 PDF 导入不崩溃并提示。

## 任务 M12-2：自动保存 + DB 备份
- **前置**：M12-1。
- **做什么**：关键操作即时落库（已满足）；提供"导出数据库备份"（复制 app.db）与设置里的导出 DPI 调节（R7）。
- **完成判据**：能导出一份 app.db 备份文件；改导出 DPI 后再导出生效。

---

# 附 A：陷阱与易错点清单（撞到报错先来这里查）

> 下面每条是"症状 → 原因 → 正确做法"。写代码前先扫一遍相关条目；遇到诡异问题按症状对照。

## A1. pdf.js worker 没配好（M1/M2 最先撞）
- **症状**：`Setting up fake worker failed` / 渲染卡住无输出 / 控制台 worker 报错。
- **原因**：pdfjs-dist 需要显式指定 worker 文件；在 Vite/Electron 里默认路径找不到。版本还必须与主库一致。
- **做法**：用 `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` 拿到 URL，再 `GlobalWorkerOptions.workerSrc = workerUrl`。pdfjs-dist v4+ 是 ESM，用 `.mjs`。API 库和 worker 必须同一个版本号。

## A2. 坐标系翻转：pdf.js/canvas 原点在左上，pdf-lib 原点在左下（M10 导出必踩）
- **症状**：导出的 PDF 里图片/文字跑到页面外、位置上下颠倒、标题在底部。
- **原因**：canvas 的 y 向下增长；pdf-lib 的 y 向上增长（原点在左下角）。
- **做法**：在 pdf-lib 里放元素时，`y = pageHeight - marginTop - elementHeight`（从顶部换算）。写一个 `topLeftToPdf(x, yTop, elH, pageH)` 小工具统一转换，所有绘制都用它，别逐处手算。

## A3. 同一 canvas 并发渲染 / 未取消旧渲染（M2 滚动缩放必踩）
- **症状**：`Cannot use the same canvas during multiple render() operations` / 滚动时页面闪烁或画错。
- **原因**：pdf.js 的 `page.render()` 是异步任务，前一个没结束又发起新的（缩放、滚动触发重渲染）。
- **做法**：每页保存当前 `renderTask`，重渲染前先 `renderTask.cancel()` 并 await；组件卸载时也要 cancel。渲染完调用 `page.cleanup()` 释放。

## A4. 高 DPI 屏幕的 devicePixelRatio + 鼠标坐标换算（M2 切线错位必踩）
- **症状**：渲染发虚；示意线/裁切线跟鼠标差一截、缩放后越差越多。
- **原因**：canvas 显示尺寸(CSS px) ≠ 背景缓冲尺寸(物理 px)；鼠标事件是 CSS px，没除以缩放和 dpr 就当成比例。
- **做法**：canvas 缓冲设 `cssW*dpr × cssH*dpr`，`ctx.scale(dpr,dpr)`。鼠标转比例：`ratio = (e.clientX - rect.left) / rect.width`（用元素的 `getBoundingClientRect()`，天然含缩放，不要自己乘 scale）。

## A5. 相邻片段边界的取整误差（M2-4 派生片段易出 bug）
- **症状**：裁下来的相邻两段之间有 1px 白缝或重叠一条线。
- **原因**：两段各自把 `y_ratio` 转像素后独立 `round`，边界对不齐。
- **做法**：一段的下边界像素 = 下一段的上边界像素，用同一个换算值；裁剪时上段 `[floor(y0), floor(y1))`、下段从 `floor(y1)` 开始，共用 `floor(y1)`。测试里断言相邻段像素首尾相接。

## A6. 忽略 PDF 页面旋转（部分试卷扫描件必踩）
- **症状**：某些页渲染出来是横躺/倒置的；width/height 对不上。
- **原因**：PDF 页带 `rotation`(90/180/270)，没传给 viewport。
- **做法**：一律用 `page.getViewport({ scale, rotation: page.rotate })`，并用返回 viewport 的 `width/height`（已含旋转）存库和渲染，不要用未旋转的原始尺寸。

## A7. better-sqlite3 版本/ABI 与 asar（M0-3、M11 必踩）
- **症状**：`NODE_MODULE_VERSION mismatch` / `was compiled against a different Node.js version` / 打包后 `cannot open database`。
- **原因**：原生模块按 Node ABI 编译，Electron 用的是自己的 ABI；打进 asar 后原生 `.node` 无法加载。
- **做法**：dev 阶段 `npx electron-rebuild -f -w better-sqlite3`；打包时 `asarUnpack` 必须包含 better-sqlite3（见 M11-1）。升级 Electron 或 Node 后必须重跑 electron-rebuild。

## A8. 中文路径 / 中文用户名（本项目根目录就是中文，几乎必踩）
- **症状**：读写 PDF 或图片时 `ENOENT`/乱码；某些库对非 ASCII 路径报错。
- **原因**：项目路径含中文（`cyz的资料`），且教师的 PDF 常在中文目录。个别库/命令对非 UTF-8 路径处理不当。
- **做法**：Node fs 用绝对路径且始终走 `path.join`，不手拼字符串。给渲染进程的图片用自定义 `app://` 协议或 `pathToFileURL()` 转成 URL，不要把中文路径直接塞进 `<img src>`。better-sqlite3 打开库用 `app.getPath('userData')`（受控路径）。测试时特意用一个中文名 PDF 验证。

## A9. contextIsolation 下 preload 只能传可序列化数据（M0-5 起贯穿）
- **症状**：`An object could not be cloned` / preload 里暴露的函数在渲染进程调用报错。
- **原因**：IPC 走结构化克隆，不能传函数、类实例、Buffer 之外的复杂对象；contextBridge 也不能暴露带原型链的对象。
- **做法**：IPC 只传纯 JSON（数字/字符串/数组/普通对象）和 `ArrayBuffer`。图片二进制用 `ArrayBuffer`。preload 里只暴露纯函数，函数内部再 invoke。

## A10. SQLite 外键默认不开 + 事务（数据一致性 bug 源头）
- **症状**：删试卷没级联删除子表；批量写一半失败留下脏数据。
- **原因**：SQLite 每个连接默认 `foreign_keys = OFF`；逐条写没包事务。
- **做法**：每次打开连接都执行 `PRAGMA foreign_keys = ON`（schema 里有，但要确保对当前连接生效）。批量操作（bulkAdd 页、派生片段、入库多题）用 `db.transaction(fn)` 包起来，保证要么全成要么全不动。

## A11. 内存爆掉：一次渲染所有页 / 未释放 canvas（M2、M4 大 PDF 必踩）
- **症状**：打开大 PDF 或 300 DPI 出图时内存飙升、白屏、崩溃。
- **原因**：一次性把所有页高 DPI 渲染并保留在内存；离屏 canvas 用完不释放。
- **做法**：显示层虚拟化（只渲染视口附近页，滚出即销毁）。出图逐题渲染、用完把 canvas 宽高设 0 帮助回收，`page.cleanup()`。屏幕用低 DPI，只有入库/导出才用 300 DPI，两条路径分开（技术设计文档 3.1）。

## A12. React 状态与"真值在 DB"不一致（贯穿，续编功能的隐蔽 bug）
- **症状**：改了标签/删了片段，界面变了但重启丢失；或界面没变但库已改。
- **原因**：只改了内存 state 没落库，或落库后没重新拉取。
- **做法**：约定"DB 是唯一真值"。任何变更 = 先 IPC 写库成功、再更新前端 state（或写库后重新查询该视图数据）。不要只改 Zustand 不写库。每个"重启后还原"判据本质就在测这条。

## A13. 拖动分隔线/落线时的浮点与边界（M2 交互 bug）
- **症状**：分隔线能拖出页面外、拖成负值或越过相邻线导致片段宽度为负。
- **原因**：`x_ratio` 没夹紧到 (0,1) 且没限制不越过相邻分隔线。
- **做法**：拖动时 `clamp(ratio, leftNeighbor+ε, rightNeighbor-ε)`（ε 如 0.02）。横切线 y 同理夹在 (0,1)。派生片段前过滤掉零高/零宽的退化段。

## A14. Windows 路径分隔符与文件名非法字符（导出/存图易踩）
- **症状**：导出 PDF 用试卷名做文件名时报错；路径用了 `/` 拼接在某些场景异常。
- **原因**：Windows 非法文件名字符 `\ / : * ? " < > |`；手拼路径分隔符。
- **做法**：所有路径用 `path.join`。用户输入（试卷名/导出名）做文件名前先 `replace(/[\\/:*?"<>|]/g, '_')`。

---

# 附 B：全局约定速查
- 几何存比例，`px = ratio * size_pt * (dpi/72)`。
- 渲染进程管 pdf.js 与 UI；主进程管 DB 与文件；图片走 `app://` 或入库时 ArrayBuffer 落盘，不长期走 IPC 传二进制。
- 纯逻辑（派生片段、套模板、筛选、拼接尺寸）一律配 Vitest 单测。
- 每完成一个里程碑，跑其"验收"，给用户一份简短汇报（做了什么/怎么自测/有无偏离），确认后再继续。

