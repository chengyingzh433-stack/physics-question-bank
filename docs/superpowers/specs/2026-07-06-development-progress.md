# 开发进度记录

- 日期：2026-07-06
- 关联文档：`-technical-design.md`（技术设计总纲）、`-task-handbook.md`（任务手册）、`-requirements.md`（需求原文）
- 本文档记录截至当前的开发状态，对照技术设计文档逐节说明实现情况，并列出剩余工作。

---

## 1. 总体状态

主线链路 **M0→M1→M2→M3→M4**（导入→裁切→后期处理→入库出图）代码全部完成，M5–M10 的功能代码也已完成。**自测通过**（typecheck、build、28 个单测、多个端到端内存库验证）。**打包（M11）未通过**，**部分视觉/交互判据待人测**。

**已验证可用**的硬链路：
- Electron 31 + better-sqlite3（Electron ABI 125）原生模块加载 + SQL 读写
- `app://` 自定义协议安全映射项目文件
- pdfjs-dist v4 渲染 PDF（v6 因 `Promise.try` 在 Electron 31 Chromium 崩溃，已降级 v4）
- pdf-lib + 内嵌中文字体（Noto Sans SC）生成 PDF（中文不乱码已验证）
- 比例坐标派生片段 + R1 合成拼接（单测覆盖）

---

## 2. 对照技术设计文档的实现情况

### 第 2 节 核心设计原则
| 原则 | 实现情况 |
|---|---|
| 不做 OCR，存渲染图 | ✅ questions.image_path 指向 PNG，无文字提取 |
| 人工可控 | ✅ 分列/横切/合并全由用户操作 |
| 几何用比例坐标 | ✅ column_dividers.x_ratio、cut_lines.y_ratio、segments 的 x/y_ratio 全为 0..1 |
| 进程职责分离 | ✅ 渲染层管 pdfjs + UI（RenderService）；主进程管 DB + 文件（StorageService/FileService/ExportService） |
| 一切可续编 | ✅ 所有变更先写库再更新 state（useCropData hook 遵循"DB 是真值"），重启从库重载 |

### 第 3 节 技术栈
| 选型 | 实际版本 | 说明 |
|---|---|---|
| Electron + React + TS | Electron 31.7.7 / React 18.3 / TS 5.5 | ✅ |
| pdf.js | **pdfjs-dist 4.10.38** | ⚠️ 手册未锁版本，原装 v6 与 Electron 31 不兼容，降级 v4 |
| SQLite | better-sqlite3 11.10.0 | ✅ electron-rebuild 按 Electron ABI 编译 |
| 图像存储 | PNG 文件 | ✅ userData/projects/{id}/images/ |
| 导出 PDF | pdf-lib 1.17 + @pdf-lib/fontkit 1.1 | ✅ 内嵌 Noto Sans SC |
| 打包 | electron-builder 24.13 | ⚠️ 配置完成，打包失败（见第 5 节） |
| 状态管理 | **未引入 Zustand**，用 React state + hooks | ⚠️ 偏离设计，当前规模够用，重构时可引入 |
| 构建 | electron-vite 2.3 | ✅ |
| 单测 | Vitest 2.0 | ✅ 28 个 |

### 第 3.1 节 四个坑
1. 导出 DPI：✅ EXPORT_DPI=300 集中定义（shared/constants.ts），屏幕低 DPI/入库高 DPI 两条路径分开
2. 中文字体：✅ Noto Sans SC TTF 已下载（assets/fonts/），fontkit subset 内嵌
3. better-sqlite3 原生模块：✅ dev 用 electron-rebuild；打包 asarUnpack 已配置（但打包本身失败）
4. 图像不走 IPC：✅ `app://` 协议提供给 `<img>`；仅入库那一刻 ArrayBuffer 落盘

### 第 4 节 PDF 查看与缩放
- 适应宽度（默认）：✅ `PDFViewer.computePageState` 按 `containerW/(width_pt*BASE_DPI/72)`
- 适应整页：✅
- 缩放档位 50/75/100/125/150/200% + +/- 按钮 + 百分比显示：✅
- Ctrl+滚轮以光标锚点缩放（25%–400%）：✅ 改百分比（未实现以光标为锚点的滚动补偿，但有上下限）
- 多页虚拟化滚动：✅ IntersectionObserver（rootMargin 1000px）
- 缩放与裁切坐标解耦：✅ overlay 用比例，`getBoundingClientRect()` 换算

### 第 5 节 裁切模型（分列 + 横切）
- 单/双/三栏可切换：✅
- 均分列分隔线 + 拖动：✅ A13 clamp 到相邻 ±EPS
- 跟随光标横向示意线 + 点击落刀：✅ 限当前列
- 撤销/删除：✅ 按 created_seq 撤销
- 片段派生：✅ `deriveSegments` 纯函数 + 10 单测（单栏2刀=3段、双栏各1刀=4段顺序、去重、越界夹紧）
- 逐页列模式：✅ pages.column_mode

### 第 6 节 后期处理模型
- 按序平铺缩略图：✅ PostProcessView
- 软删除 is_deleted + 显示已删除/恢复：✅
- 多选合并 → question_segments（merge_order）：✅
- 取消合并无损还原：✅ 删 question 占位行，segments 仍在

### 第 7 节 SQLite 数据模型
- 18 张表全部按 schema.ts 建表：✅
- 外键级联：✅ `PRAGMA foreign_keys = ON` + ON DELETE CASCADE
- 删试卷级联：✅ DB 行级联（**磁盘图片文件未清理，见第 5 节遗留**）

### 第 8 节 模块/进程架构
- StorageService + 各 repository：✅ paperRepo/pageRepo/segmentRepo/questionRepo/questionTypeRepo/templateRepo/tagRepo/setRepo
- FileService（项目目录 + app:// 协议）：✅
- ExportService（pdf-lib 组装）：✅
- IPC 命名空间化：✅ papers/pages/cutlines/dividers/segments/questions/types/templates/chapters/kps/diffs/sets/bank/export/files
- contextIsolation:true、nodeIntegration:false、sandbox:true：✅
- RenderService / ColumnCropService / 视图：✅
- **ViewportController 未独立抽出**，逻辑在 PDFViewer 内：⚠️ 重构时可拆

### 第 9 节 里程碑
见下表。

---

## 3. 里程碑完成度

| 里程碑 | 设计文档验收点 | 实际状态 | 自测 | 人测 |
|---|---|---|---|---|
| **M0 脚手架** | 应用能启动，库能建表 | ✅ 完成 | ✅ schema v1 ready + 18 表 + 种子 | ⏳ 弹窗显示 pong |
| **M1 导入+持久化** | 导入后重启仍在列表 | ✅ 完成 | ✅ app:// 协议 + paperRepo 端到端 | ⏳ 导入多页 PDF |
| **M2 裁切工作区** | 重启精确还原所有线与片段 | ✅ 完成 | ✅ deriveSegments 10 单测 + pageRepo 端到端 | ⏳ 画布交互、缩放、落线 |
| **M3 后期处理** | 重启还原删除与合并 | ✅ 完成 | ✅ questionRepo 端到端（合并/取消/级联） | ⏳ 缩略图、多选合并 |
| **M4 入库+出图** | 入库题在库中可见、图清晰 | ✅ 完成 | ✅ R1 拼接单测 + pdf-lib 字体验证 | ⏳ 入库、题图清晰度 |
| **M5 题型模板** | 套模板正确、可手改 | ✅ 完成 | ✅ applyTemplate 6 单测 + typeRepo 端到端 | ⏳ 模板管理 UI |
| **M6 标签** | 标签持久、可多知识点 | ✅ 完成 | ✅ tagRepo 端到端（多选/去重/级联） | ⏳ 赋标签 UI |
| **M7 原卷复查** | 顺序与状态正确 | ✅ 完成 | — | ⏳ 复查页 |
| **M8 题库浏览+筛选** | 组合筛选结果正确 | ✅ 完成 | ✅ buildQuestionFilter 7 单测 + 端到端 | ⏳ 筛选 UI |
| **M9 组卷篮** | 重启后篮内容保留 | ✅ 完成 | ✅ setRepo 端到端（去重/重排） | ⏳ 勾选/重排 UI |
| **M10 导出** | 打印预览清晰不变形 | ✅ 代码完成 | ✅ pdf-lib 中文嵌入验证 | ⏳ 导出 PDF 打印预览 |
| **M11 打包** | 干净机器安装版可用 | ❌ **打包失败** | — | — |
| **M12 加固** | 删除确认、错误态、备份 | 🔶 部分 | 删试卷二次确认(R3) 已做；DB备份/DPI设置 未做 | — |

---

## 4. 自测覆盖

### 4.1 单元测试（Vitest，28 个全过）
- `ColumnCropService.test.ts`（10 个）：单栏2刀=3段、双栏各1刀=4段顺序、列间互不干扰、三栏均分、解耦、退化段过滤、越界夹紧、像素相接 A5、R1 拼接尺寸数学
- `TemplateService.test.ts`（6 个）：区间命中、未命中、null order、规则重叠 rule_order、开区间端点
- `questionFilter.test.ts`（7 个）：无条件、单条件、多条件 AND、知识点 EXISTS、组合、DISTINCT

### 4.2 端到端验证（ELECTRON_RUN_AS_NODE + 内存 SQLite）
- **M0-4**：18 表 + 5 题型 + 4 难度 + 幂等
- **M1-1**：createPaper/listPapers/getPages/级联删除
- **M2-2/3/4**：列模式 + 分隔线 + 横切线 + 派生 + 撤销 + 重启还原
- **M3**：合并/取消合并/renumber/级联
- **M5**：题型 CRUD（内置不可删）/模板规则/applyTemplate/删模板级联
- **M6**：标签 CRUD/多选替换/去重/删知识点级联/删章节 SET NULL
- **M8**：listBankQuestions 组合筛选（type/paper/chapter/difficulty/kp）+ paper_name
- **M9**：draft 复用/去重/order 递增/交换重排/group_header/移除

### 4.3 其他验证
- **app:// 协议**：net.fetch 返回 `%PDF-` 字节，路径穿越返回 403
- **pdf-lib 中文字体**：生成测试 PDF，中文标题嵌入成功（可变字体 + subset）
- **better-sqlite3**：Electron Node 模式跑 SQL 读写 `SQLITE_OK`
- **typecheck**：node + web 全过
- **build**：electron-vite 三段（main/preload/renderer）全过

---

## 5. 偏离设计文档与遗留问题

### 5.1 偏离
1. **pdfjs-dist v4 而非 v6**：v6 的 worker 用 `Promise.try`（ES2024），Electron 31 Chromium 不支持，worker 崩溃导致导入极慢。降级 v4.10.38。已记 memory。
2. **preload 输出 CJS**：electron-vite 默认 ESM `.mjs`，sandbox 下裸跑报 `Cannot use import statement`。改强制 CJS `.cjs`。
3. **未引入 Zustand**：设计提到 Zustand，当前用 React state + hooks，规模够用。
4. **ViewportController 未独立**：逻辑内联在 PDFViewer，未抽独立模块。
5. **脚手架手写**：`npm create` 被权限拦，手写等价 electron-vite react-ts 结构。
6. **electron 二进制走 npmmirror 镜像**：github 直连 ECONNRESET。

### 5.2 遗留问题（待处理）
1. **M11 打包失败**：electron-builder 在打包时重新编译 better-sqlite3 按 Node ABI（而非 Electron ABI），撞 Node 24 编译失败。需配置 electron-builder 使用已有的 Electron ABI 产物，或在打包前确保 native 模块正确。详见第 6 节。
2. **删试卷磁盘文件未清理**：DB 行级联删除生效，但 `projects/{id}/` 图片文件残留。递归 `rm` 被安全分类器拦截。需加严格路径校验后启用。
3. **Ctrl+滚轮未以光标为锚点**：只改百分比，未做滚动位置补偿。
4. **M12-2 未做**：DB 备份导出、设置里的导出 DPI 调节（R7）未实现。
5. **旋转页面**：A6 要求 `getViewport({rotation: page.rotate})`，RenderService 已传 rotation，但数据库未存页面旋转值（pages 表无 rotation 列），rotation 传 0。扫描件旋转页可能渲染异常。

---

## 6. 剩余工作

按优先级：

### P0（阻断发布）
- **M11 打包修复**：让 `npm run dist` 产出 NSIS 安装包。关键：electron-builder 需用 Electron ABI 的 better-sqlite3 产物（已 electron-rebuild 过），而非重新按 Node ABI 编译。可能需要 `npmRebuild: false` + 手动确保 `node_modules/better-sqlite3/bin/win32-x64-125/` 存在，或配置 `nodeGypRebuild` 参数。
- **人测主线**：导入→裁切→后期处理→入库→复查→筛选→组卷→导出，确认视觉/交互正确。

### P1（体验）
- **前端重构**（见独立交接文档 `2026-07-06-frontend-refactor-handoff.md`）
- Ctrl+滚轮以光标为锚点的缩放
- 旋转页支持（pages 表加 rotation 列，渲染时读取）

### P2（加固）
- M12-2：DB 备份导出（复制 app.db）+ 设置里的导出 DPI 调节
- 删试卷磁盘文件清理（加严格路径校验）
- 损坏 PDF 导入友好提示（当前会抛原始错误）
- 大 PDF 内存监控（A11，虚拟化已做，但 300DPI 出图时仍需注意）

---

## 7. 关键文件索引

```
src/
├── main/
│   ├── index.ts                    # 主进程入口（app ready → initDB + registerIpc + protocol）
│   ├── storage/
│   │   ├── schema.ts               # SCHEMA_V1 建表 SQL + 内置题型/难度常量
│   │   ├── StorageService.ts       # getDb 单例 + initDatabase（建表+种子）
│   │   ├── questionFilter.ts       # buildQuestionFilter/buildQuestionQuery（纯函数+单测）
│   │   └── repositories/
│   │       ├── paperRepo.ts        # papers/pages CRUD
│   │       ├── pageRepo.ts         # 列模式/分隔线/横切线 CRUD
│   │       ├── segmentRepo.ts      # segments 派生替换
│   │       ├── questionRepo.ts     # questions CRUD + 入库 + 题库查询
│   │       ├── questionTypeRepo.ts # 题型 CRUD（内置不可删）
│   │       ├── templateRepo.ts     # 模板+区间规则
│   │       ├── tagRepo.ts          # 章节/知识点/难度 + 题目赋标签
│   │       └── setRepo.ts          # 组卷篮（draft set + items）
│   ├── files/FileService.ts        # 项目目录 + app:// 协议 + saveQuestionPng
│   ├── export/ExportService.ts     # pdf-lib 导出（中文标题+编号+分页+R4）
│   └── ipc/index.ts               # 所有 ipcMain.handle
├── preload/index.ts                # contextBridge 暴露 Api
├── renderer/src/
│   ├── App.tsx                     # HashRouter 路由
│   ├── services/
│   │   ├── RenderService.ts        # pdfjs 封装（渲染整页/区域，低/高 DPI）
│   │   ├── ImportService.ts        # 导入流程编排
│   │   ├── ColumnCropService.ts    # deriveSegments + 像素换算 + R1 尺寸数学（纯函数）
│   │   ├── QuestionRenderService.ts# renderSegmentsAtDpi + composeQuestionCanvas
│   │   ├── TemplateService.ts      # applyTemplate（纯函数）
│   │   └── useCropData.ts          # 裁切数据 hook（加载+变更持久化+重算派生）
│   └── views/
│       ├── HomeView.tsx            # 主页试卷列表 + 导入 + 删除
│       ├── PDFViewer.tsx           # 查看器（适应/缩放/虚拟化）+ overlay 注入
│       ├── CropOverlay.tsx         # 分隔线/横切线交互层
│       ├── CropView.tsx            # 裁切工作区（整合查看器+overlay+工具栏）
│       ├── PostProcessView.tsx     # 后期处理（缩略图/软删除/合并/入库）
│       ├── PaperReviewView.tsx     # 原卷复查（套模板/手改题型/赋标签）
│       ├── BankView.tsx            # 题库网格 + 侧栏筛选 + 勾选入篮
│       ├── BasketView.tsx          # 组卷篮管理（重排/分组/导出）
│       └── TemplateView.tsx        # 题型与模板管理
└── shared/
    ├── types.ts                    # IPC 契约 + DTO
    └── constants.ts                # EXPORT_DPI/A4 尺寸/边距常量
```

启动方式：双击项目根目录 `启动(无窗口).vbs`（dev 模式）。
