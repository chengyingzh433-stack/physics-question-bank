# 收尾与加固计划（交接设计文档）

- 日期：2026-07-07
- 作者视角：本文写给"接手把项目推向可发布状态"的下一个智能体
- 前置阅读（按顺序）：
  1. `2026-07-06-development-progress.md`（当前进度全景，**必读**）
  2. `2026-07-06-physics-question-bank-technical-design.md`（技术设计总纲，判据 A1–A13 / R1–R7 出处）
  3. `2026-07-06-frontend-redesign-plan-mantine.md`（前端设计系统，改 UI 前必读）
  4. 本文（剩余工作的拆解与执行方案）

---

## 0. 一句话现状

主线代码（M0–M10）与前端 Mantine 7 重构已完成，28 单测 + typecheck + build 全绿。**距离"可交付"还差三件硬事**：① M11 打包跑不通（P0 阻断发布）；② 全链路人工走查从未做过（P0 验收缺口）；③ 若干加固项与两个体验缺口（P1/P2）。本文把这些拆成可独立领取、可验证的任务。

---

## 1. 不可触碰的红线（改任何代码前先读）

这些是前几轮踩过坑、用单测和人测锁死的契约。**修改它们 = 破坏已验证的正确性**，除非有充分理由并重跑相关验证：

| 红线 | 位置 | 为什么 |
|---|---|---|
| 裁切坐标数学 | `ColumnCropService.deriveSegments`、`CropOverlay` 的 `colXRange`/`colAtX`/`getBoundingClientRect` 换算 | 比例坐标 + A13 clamp 由 10 个单测锁定，缩放解耦靠 `getBoundingClientRect` 天然含缩放。动它就要重跑裁切人测 |
| IPC 契约 | `shared/types.ts` 的 `Api` 接口签名、`preload/index.ts` | 渲染层全靠它。改签名要同步 3 处（types/preload/ipc handler） |
| "先写库再更新 state" | `useCropData.ts`（A12） | "DB 是真值"，重启可续编的根基 |
| pdfjs-dist 锁 v4 | `package.json` | v6 的 `Promise.try` 在 Electron 31 Chromium 崩溃，见 memory `qbank-pdfjs-v4-electron31`。**不要升级** |
| preload 输出 CJS | electron-vite 配置 | sandbox 下 ESM 裸跑报错 |
| better-sqlite3 按 Electron ABI 重建 | `npm run rebuild` | Node ABI 与 Electron ABI 不同，见 memory `qbank-dev-env` |

改前端视觉时，`CropOverlay` 只能改颜色/宽度/hover/动画，**坐标相关的行一律不动**（重构时已确认，见进度文档 10.7）。

---

## 2. 剩余工作总览（按优先级）

| 编号 | 任务 | 优先级 | 阻断发布? | 预估难度 |
|---|---|---|---|---|
| T1 | M11 打包修复（better-sqlite3 ABI） | P0 | 是 | 中（环境坑，非逻辑） |
| T2 | 全链路人工走查 + 裁切专项 | P0 | 是（验收缺口） | 中（耗时，需真 PDF） |
| T3 | 删试卷磁盘文件清理 | P1 | 否 | 低 |
| T4 | Ctrl+滚轮以光标为锚点缩放 | P1 | 否 | 中 |
| T5 | 旋转页支持（pages.rotation 列） | P1 | 否 | 中（涉及 schema 迁移） |
| T6 | M12-2：DB 备份导出 + 导出 DPI 设置（R7） | P2 | 否 | 中 |
| T7 | 损坏 PDF 导入友好提示 | P2 | 否 | 低 |
| T8 | 大 PDF 出图内存监控（A11） | P2 | 否 | 低 |
| S1 | **安全：吊销泄露的 GitHub PAT** | 立即 | — | 低（用户操作） |

建议执行顺序：**S1（提醒用户）→ T1 →（拿到安装包后）T2 → T3/T7（低成本加固）→ T4/T5（体验）→ T6/T8**。T2 依赖 T1（要在打包产物或 dev 上走查），其余互相独立，可并行领取。

---

## 3. 逐任务方案

### T1 — M11 打包修复（P0，阻断发布）

**问题根因**：`npm run dist` 执行 `electron-vite build && electron-builder`。electron-builder 默认会对 native 模块（better-sqlite3）按当前 **Node ABI** 重新编译，而 dev 阶段用 `electron-rebuild` 编的是 **Electron ABI 125** 产物。两者 ABI 不同 → 撞 Node 24 编译或运行期 `NODE_MODULE_VERSION` 不匹配。

**现有配置**（`electron-builder.yml`）已有 `asarUnpack: node_modules/better-sqlite3/**/*`，方向对，但缺"别重编、直接用 Electron ABI 产物"的开关。

**执行步骤**：
1. 确认 dev 产物存在：`node_modules/better-sqlite3/build/Release/better_sqlite3.node` 是按 Electron ABI 编的（跑 `npm run rebuild` 保证）。
2. 在 `electron-builder.yml` 顶层加：
   ```yaml
   npmRebuild: false        # 禁止 electron-builder 按 Node ABI 重编
   ```
   `npmRebuild: false` 让 builder 直接打包现有 `.node`（已是 Electron ABI）。
3. 若步骤 2 仍不行，改用显式 electron-rebuild 前置钩子，或设 `buildDependenciesFromSource: false`，并确认 `asarUnpack` 命中真实产物目录（注意 better-sqlite3 v11 产物可能在 `build/Release/` 而非旧版的 `bin/win32-x64-125/`——**先 `Glob` 确认真实路径再写配置**）。
4. 跑 `npm run dist`，产出 `release/物理教师题库管理系统 Setup 1.0.0.exe`。
5. **验证（关键，不能省）**：在一台**干净机器**（或新 Windows 用户配置文件）安装，启动后做最小冒烟——导入一个 PDF、建一张表能读写。因为打包最容易在"native 模块运行期加载"炸，build 通过 ≠ 运行通过。

**验收判据**：干净机器安装 → 应用启动 → 能导入 PDF 且 SQLite 正常读写（无 `NODE_MODULE_VERSION` 报错）。

**坑预警**：Windows 中文产品名 `物理教师题库管理系统` 生成的安装包文件名含中文，脚本处理路径时注意引号与编码。

---

### T2 — 全链路人工走查（P0，验收缺口）

所有里程碑的"人测"列在进度文档里全是 ⏳，即**从未真正端到端点过**。代码和单测覆盖了逻辑，但画布交互、缩放不错位、重启还原这类只能靠眼睛确认。

**走查脚本**（按主线顺序，每步记录 通过/问题）：
1. **导入**：双击 `启动(无窗口).vbs` 起 dev。导入一个**多页、含双栏**的真实物理卷 PDF。确认列表出现、缩略/页数正确。
2. **裁切**（专项，最易出 bug）：
   - 切 1/2/3 列，拖分隔线——确认 clamp 到相邻线不越界（A13）。
   - 缩放到 50%/200%，落横切线——**确认线落在光标处、不随缩放错位**（A4 靠 `getBoundingClientRect`）。
   - 撤销、删线。
   - **关掉应用重启**——确认所有分隔线、横切线、片段**精确还原**（A12/DB 真值）。这是 M2 的核心验收点。
3. **后期处理**：缩略图按序、软删除+恢复、多选合并→取消合并无损、入库（看 Progress 进度条）。
4. **入库出图质量**：入库后到题库看题图——**确认 300 DPI 清晰、不糊、拼接段无缝**（R1）。
5. **原卷复查**：套模板题型正确、可手改、赋知识点（Chip.Group）。
6. **题库筛选**：题型/试卷/章节/难度/知识点组合筛选，结果正确。
7. **组卷篮**：勾选入篮、上下移重排、分组标题、重启后篮内容还在（M9 验收）。
8. **导出**：导出 PDF，打开打印预览——**确认中文不乱码、题图清晰不变形、分页正确**（R4 + Noto Sans SC 内嵌）。

**验收判据**：8 步全过；发现的问题按"复现步骤 + 期望 vs 实际"记录成 bug 清单，回填进度文档第 5 节遗留，再决定修复优先级。

**建议**：这一步产出应是一份"走查报告"，即使不修也要如实记录哪些通过、哪些有问题——不要报喜不报忧。

---

### T3 — 删试卷磁盘文件清理（P1）

**现状**：`ipc/index.ts:60-64` 的 `papers:delete` 只删 DB 行（级联生效），磁盘 `projects/{id}/`（source.pdf + images/*.png）**残留**。原因是递归 `rm` 曾被安全分类器拦截。

**方案**（安全地做）：
1. 在 `FileService.ts` 加：
   ```ts
   import { rm } from 'fs/promises'
   /** 删除某试卷的整个项目目录。严格限定在 userData/projects/{id} 之下。 */
   export async function deletePaperDir(paperId: number): Promise<void> {
     const root = join(app.getPath('userData'), 'projects')
     const target = paperDir(paperId)               // .../projects/{id}
     // 双重校验：target 必须在 root 之下，且 id 为正整数
     if (!Number.isInteger(paperId) || paperId <= 0) return
     const resolved = target
     if (!resolved.startsWith(root + sep) ) return   // 防穿越
     await rm(resolved, { recursive: true, force: true })
   }
   ```
   （引入 `sep` from `path`；`force: true` 让目录不存在时不抛错。）
2. `ipc/index.ts` 的 `papers:delete` 改为 `async`，先删 DB 行再 `await fileService.deletePaperDir(id)`。**顺序**：先 DB 后磁盘——DB 是真值，磁盘删失败不影响一致性（残留孤儿文件可后续清，但 DB 绝不能留悬空引用）。
3. 关键约束：只允许删 `projects/{正整数}`，绝不接受外部传入的任意路径。paperId 来自 DB 主键，天然可信，但仍做整数校验兜底。

**验收判据**：删一张有图的试卷后，`userData/projects/{id}/` 目录消失；删不存在的 id 不报错；单测或手测确认路径校验拒绝非法 id。

---

### T4 — Ctrl+滚轮以光标为锚点缩放（P1）

**现状**：`CropView.onWheel`（`CropView.tsx:37-49`）只改百分比 ±25，不做滚动位置补偿，缩放后光标下的内容会漂移。

**方案**：在 `PDFViewer` 的滚动容器（`scrollRef`）层做锚点补偿。缩放前记录光标相对容器内容的位置比例，缩放后调整 `scrollLeft/scrollTop` 使同一内容点保持在光标下。核心公式：
```
newScroll = (oldScroll + cursorOffset) * (newScale / oldScale) - cursorOffset
```
需要把 `onWheel` 逻辑从 `CropView` 下沉/协作到 `PDFViewer`（后者持有 `scrollRef`），或让 `PDFViewer` 暴露一个 `zoomAtPoint(clientX, clientY, delta)`。注意缩放是异步 re-render，滚动补偿要在下一帧（`requestAnimationFrame` 或 `useLayoutEffect`）应用。

**验收判据**：Ctrl+滚轮放大/缩小时，光标正下方的题目内容位置基本不动（允许 1–2px 误差）；上下限 25%–400% 仍生效。

**注意**：这块碰 `PDFViewer` 的缩放与滚动，但**不碰 CropOverlay 的比例坐标**——overlay 用 `getBoundingClientRect` 换算，缩放怎么变它都对。改完仍要做一次 T2 步骤 2 的缩放落线走查确认没回归。

---

### T5 — 旋转页支持（P1）

**现状**：`RenderService` 已支持传 `rotation`，但 `PageCanvas` 里 `rotation: 0` 写死（`PDFViewer.tsx:85` `computePageState` 返回 `rotation: 0`），且 **pages 表无 rotation 列**，扫描件旋转页会渲染异常（A6）。

**方案**：
1. **schema 迁移**：`schema.ts` 的 pages 表加 `rotation INTEGER NOT NULL DEFAULT 0`。因为已有用户可能有旧库，需要**幂等迁移**——检查列是否存在（`PRAGMA table_info(pages)`），无则 `ALTER TABLE pages ADD COLUMN rotation ...`。放在 `StorageService.initDatabase` 里跟建表一起跑。
2. 导入时从 pdfjs 读每页 `page.rotate` 存入 `pages.rotation`（在 `ImportService`/`paperRepo.addPages` 链路）。
3. `computePageState` 读 `page.rotation` 而非写死 0；宽高在 90/270 度时对调。
4. `deriveSegments`/裁切坐标：确认比例坐标在旋转后仍成立——**这里要小心**，旋转会改变 width/height 语义，可能需要在渲染层统一到"视觉正立"坐标系。**建议先只支持渲染正确显示旋转页，裁切旋转页作为独立子任务**，避免一次动太多。

**验收判据**：导入含 90° 旋转页的扫描 PDF，页面正立显示；旧库升级不丢数据；`PRAGMA table_info(pages)` 含 rotation 列。

**风险提示**：这是唯一涉及 schema 变更的任务，务必做幂等迁移，别让老用户的库崩。

---

### T6 — M12-2：DB 备份导出 + 导出 DPI 设置（P2, R7）

两个独立小功能：
1. **DB 备份**：加 IPC `bank:backup`，用 `dialog.showSaveDialog` 选目标路径，复制 `userData/app.db`（better-sqlite3 建议用 `db.backup(dest)` API 而非裸 copyFile，避免 WAL 未落盘）。UI 放在库区（LibraryLayout）某处或设置页。
2. **导出 DPI 可调**：现在 `EXPORT_DPI=300` 硬编码在 `shared/constants.ts`。加一个设置项（Mantine `NumberInput` 或 `Select`，档位如 150/200/300），存 localStorage 或一张 `settings` 表，导出时读取。R7 要求可调。

**验收判据**：备份能生成可用的 .db 副本（用另一实例打开验证）；改 DPI 后导出的 PDF 分辨率随之变化。

---

### T7 — 损坏 PDF 导入友好提示（P2）

**现状**：损坏/加密 PDF 导入会抛原始错误。**方案**：`ImportService` 的 pdfjs `loadPdf` 包 try/catch，捕获后通过 `notifications.show({ color: 'red', ... })` 给友好中文提示（"该 PDF 无法打开，可能已损坏或加密"），并回滚已建的 paper 行（复用 `ipc/index.ts:53-56` 的回滚逻辑）。**验收**：导入一个损坏 PDF → 红色 toast，列表无残留脏行。

---

### T8 — 大 PDF 出图内存监控（P2, A11）

虚拟化滚动已做（IntersectionObserver）。风险在**入库出图**时按 300 DPI 逐页渲染大 canvas 可能爆内存。**方案**：入库循环里逐题渲染后显式释放 canvas（`canvas.width = canvas.height = 0`），避免同时驻留多个高清 canvas；`QuestionRenderService` 复用单个离屏 canvas。**验收**：入库一份 20+ 页大卷不崩、内存平稳。属优化项，无明显问题可延后。

---

### S1 — 安全：吊销泄露的 GitHub PAT（立即，用户操作）

上一轮对话中用户的 GitHub Personal Access Token 以明文出现在对话里（`ghp_...`）。虽然我已从 git remote URL 清除，但**token 一旦出现在任何日志/历史中就应视为泄露**。

**必须提醒用户**：立即去 GitHub → Settings → Developer settings → Personal access tokens **吊销该 token 并重新生成**。这是接手方开工前第一件要转达的事。

---

## 4. 验证纪律（每个任务收尾都要做）

沿用项目既有习惯，任何代码改动后：
1. `npm run typecheck`（node + web 两段全过）
2. `npm run build`（electron-vite 三段：main/preload/renderer）
3. `npm test`（28 单测全绿；若改了纯逻辑函数需加/改单测）
4. 涉及交互/渲染的改动，补做对应的 T2 人测子项确认无回归
5. 如实报告：过了就说过了，没过贴输出，跳过的说跳过——不粉饰

改 schema（T5）额外验证旧库幂等迁移。改 native/打包（T1）必须干净机器冒烟。

---

## 5. 关键文件速查（接手先认路）

| 要改的东西 | 去哪个文件 |
|---|---|
| 打包配置 | `electron-builder.yml`、`package.json` scripts |
| 删试卷磁盘清理 | `src/main/files/FileService.ts` + `src/main/ipc/index.ts` (`papers:delete`) |
| 缩放/滚动/渲染 | `src/renderer/src/views/PDFViewer.tsx`、`CropView.tsx` |
| 裁切交互（只改视觉！） | `src/renderer/src/views/CropOverlay.tsx` |
| schema / 迁移 | `src/main/storage/schema.ts`、`StorageService.ts` |
| 导入流程 / 错误处理 | `src/renderer/src/services/ImportService.ts`、`RenderService.ts` |
| 出图渲染 | `src/renderer/src/services/QuestionRenderService.ts` |
| 导出 PDF | `src/main/export/ExportService.ts` |
| 常量（DPI/A4/边距） | `src/shared/constants.ts` |
| IPC 契约 | `src/shared/types.ts` + `src/preload/index.ts` + `src/main/ipc/index.ts` |

更完整的文件树见进度文档第 7 节。

启动 dev：双击项目根 `启动(无窗口).vbs`。

---

## 6. 给接手智能体的话

- 先读第 1 节红线，再动手。这个项目的正确性靠"比例坐标 + DB 真值 + Electron ABI"三根支柱撑着，踩塌任何一根前面几轮的验证就白费了。
- T1 是纯环境坑不是逻辑问题，别改业务代码去绕它。
- T2 没有捷径，得找一份真实的双栏物理卷 PDF 老实点一遍——这是唯一能发现"缩放后线错位""重启没还原"这类只在真机出现的问题的办法。
- 每完成一个任务，回填 `2026-07-06-development-progress.md` 对应状态（把 ⏳ 改成结果），保持进度文档是唯一真相源。
- 遇到和本文/进度文档记载不符的现实（比如某个功能其实没做完），**以代码为准**，并在文档里纠正——文档可能滞后。
