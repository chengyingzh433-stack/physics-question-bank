# 物理教师题库管理系统 — 技术设计文档（第一阶段）

- 日期：2026-07-06
- 关联需求：`2026-07-06-physics-question-bank-requirements.md`
- 文档用途：面向具体开发的技术蓝图。接手的开发者/模型应能仅凭本文档 + 需求文档独立实现第一阶段完整链路。

---

## 1. 项目概述

面向中学物理教师的 **Windows 独立桌面应用**，把已有 PDF 试卷人工裁切成一道道题目、入库、打标签、筛选、重新组卷并导出为可打印的新 PDF。

第一阶段完整链路：
> 导入 PDF → 查看（适应宽度/缩放/滚动）→ 分列 + 横向切刀成片段 → 清理/合并成题 → 套题型模板 → 入库打标签 → 按条件筛选 → 勾选组卷 → 导出新 PDF → 关闭后可续编。

---

## 2. 核心设计原则（务必遵守）

1. **不做 OCR / 不做自动识别。** 一道"题"本质上是 PDF 页面上一块或多块**裁切下来的图像区域**。存的是渲染图，不是抽取的文字。公式、电路图、受力图、实验图因此天然保真。
2. **人工可控。** 在哪切、删哪段、哪些合并成一题，全部由教师决定。
3. **几何用比例坐标（0..1），与 DPI 无关。** 屏幕显示用低 DPI 保流畅，入库/导出用高 DPI 保清晰；两者靠比例坐标换算，绝不放大屏幕位图。
4. **进程职责分离。** 渲染进程不碰数据库和文件系统；主进程不跑 pdf.js。
5. **一切可续编。** 裁切线、删除、合并、题型、标签、组卷篮全部持久化，重启精确还原。

---

## 3. 技术栈（已确定）

| 用途 | 选型 | 理由 |
|---|---|---|
| 应用外壳 + UI | Electron + React + TypeScript | 独立桌面程序（非网页）；渲染/裁切/合成/导出全在同一 Chromium + canvas 体系，坐标与图像模型统一 |
| PDF 渲染 | pdf.js（`pdfjs-dist`） | 任意 DPI 渲染到 canvas |
| 元数据存储 | SQLite（`better-sqlite3`，WAL 模式） | 本地单文件库，同步 API 适合主进程 |
| 图像存储 | PNG 文件，存于 userData 项目目录 | DB 只存文件引用，不存二进制 |
| 导出 PDF | `pdf-lib` + `@pdf-lib/fontkit` | 内嵌 PNG + 绘制标题/编号/分组标题；**必须内嵌中文字体子集** |
| 打包 | `electron-builder`（NSIS 目标） | 带桌面/开始菜单快捷方式的原生安装体验；需 MSI 时用 msi-wrapped |
| 状态管理 | Zustand | 轻量，适合单人开发 |
| 构建 | electron-vite | 主/预加载/渲染三进程一体化构建 |
| 单元测试 | Vitest | 纯逻辑与 repository 测试 |
| E2E（可选） | Playwright-for-Electron | 导航冒烟测试 |

> **为什么是 Electron 而非浏览器网页：** 用户要求本地部署、不依赖浏览器打开。Electron 打包为独立 `.exe` + 安装包，自带运行时，从桌面/开始菜单图标启动，与普通 Windows 软件一致。

### 3.1 四个必须警惕的坑

1. **导出 DPI 是头号保真陷阱。** 绝不放大屏幕位图。屏幕显示用低 DPI；入库"标准图"从 PDF 页面区域**按导出 DPI 重新渲染**（`scale = 目标DPI / 72`，A4@300DPI ≈ 2480×3508px）。按需渲染、及时释放 pdf.js page proxy，不可一次性渲染所有页。
2. **中文字体。** pdf-lib 标准字体无中文字形，导出前必须内嵌 Noto Sans SC 之类 TTF 子集，否则标题/编号/分组标题显示为空白或豆腐块。
3. **better-sqlite3 是原生模块。** 需 `@electron/rebuild` 按 Electron ABI 重建 + `asarUnpack` 打包。这类问题只在**打包后的安装版**暴露，dev 下不报错 —— 把"干净 Windows 机器上安装版能正常读写库"列为独立验收关卡。
4. **图像不走 IPC 通道传输。** 渲染图通过自定义 `app://` 协议提供给渲染进程；只有入库那一刻的裁切 PNG 以 `ArrayBuffer` 交给主进程落盘。

## 4. PDF 查看与缩放（裁切工作区的基础能力）

对应需求文档第 5 条。这些是裁切工作区的**基础交互，必须优先实现且独立可用**，不能省略或简化：

- **一键适应宽度（Fit Width）**：页面宽度铺满可视区宽度（减去边距），高度按比例。这是**默认视图**，导入后进入裁切工作区即以此显示。
- **一键适应整页（Fit Page）**：整页完整显示在可视区内（宽高都不超出），用于总览。
- **自助缩放（Zoom）**：
  - 提供缩放按钮（+ / −）与百分比显示，支持在预设档位间切换（如 50% / 75% / 100% / 125% / 150% / 200% / 适应宽度 / 适应整页）。
  - 支持 `Ctrl + 鼠标滚轮`以光标位置为锚点缩放；普通滚轮用于上下滚动页面。
  - 缩放有上下限（如 25%–400%），避免内存爆掉。
- **滚动**：多页试卷连续纵向滚动查看（虚拟化：只渲染视口附近的页，其余占位）。
- **缩放与裁切坐标解耦**：所有裁切线/分隔线/片段均以**比例坐标**存储，缩放只改变显示 scale，不改变已落刀的逻辑位置。缩放后重绘覆盖层时按当前 scale 重新换算像素位置即可。

**实现要点：** 显示层用较低 `renderScale`（如 CSS 像素 × devicePixelRatio，约 96–150 DPI 等效）以保证滚动流畅；这与导出用的高 DPI 渲染是两条独立路径，不要混用。适应宽度的 scale 计算：`scale = 可视区可用宽度(px) / (page.width_pt * baseDpi/72)`。

---

## 5. 裁切模型（分列 + 横切，二维）

已与用户确认：需支持**单栏 / 双栏 / 三栏可切换**。裁切是二维的：

1. **先竖向分列**：教师为当前页选择列模式（1/2/3 列）。系统按列数生成默认均分的**列分隔线**（n 列 = n−1 条竖线），分隔线支持拖动微调。
2. **再在每列内横切**：进入横切模式后，页面上显示一条**跟随光标的横向示意线**（让教师预知这一刀切在哪）；点击后在该列该 Y 位置**固定落下一条裁切线**。可继续往下点，把该列切成多段。
3. **撤销/删除**：裁切线支持撤销最近一刀、删除指定线。
4. **片段派生**：片段 = 某列内相邻两条横切线之间的带状区域，占该列完整宽度。

**片段阅读顺序** = 页码（升序）→ 列序（左→右）→ 纵向位置（上→下）。该顺序即后期处理与入库时的默认题目顺序。

> **注意：** 列模式可**逐页**设置（不同页可能栏数不同）。示意线与落刀都限定在**当前光标所在列**内，不跨列。

---

## 6. 后期处理模型

- 按片段阅读顺序平铺显示所有片段（缩略图）。
- **软删除**无关片段（页眉、页脚、试卷标题、考试说明、空白）—— 用 `is_deleted` 标记，不物理删除，便于恢复。
- **多选合并成一题**：主要处理跨页/跨列题（题目前半在上一页/上一列末尾，后半在下一页/下一列开头）。合并顺序由 `merge_order` 固定。
- **取消合并**：保留 `question_segments` 映射即可无损还原。
- 清理后剩下的每个"逻辑题"进入入库步骤。

---

## 7. SQLite 数据模型

几何全部用**比例坐标（0..1）**：`pixelY = y_ratio * height_pt * (dpi/72)`，`pixelX = x_ratio * width_pt * (dpi/72)`。

| 表 | 关键列 | 说明 |
|---|---|---|
| **papers** | id, name, source_pdf_path, original_filename, page_count, status[importing\|cropping\|processing\|done], created_at, updated_at | 试卷项目 |
| **pages** | id, paper_id→papers, page_index, width_pt, height_pt, **column_mode**(默认1) | 每页尺寸 + 列模式 |
| **column_dividers** | id, page_id→pages, x_ratio | n 列有 n−1 条竖分隔线，默认均分、可拖 |
| **cut_lines** | id, page_id→pages, **col_index**, y_ratio, created_seq | 横切刀，归属某列；持久化以精确还原 |
| **segments** | id, paper_id, page_id, **col_index, x_start_ratio, x_end_ratio,** y_start_ratio, y_end_ratio, order_index, is_deleted | 由分列+横切派生但持久化；order_index=页→列→纵向 |
| **questions** | id, paper_id, order_in_paper, type_id?, chapter_id?, difficulty_id?, is_merged, image_path, width_px, height_px, created_at, updated_at | 入库题目，指向标准 PNG |
| **question_segments** | id, question_id→questions, segment_id→segments, merge_order | 一题含 1..N 段；保留以便撤销合并 |
| **question_types** | id, name, is_builtin | 预置 单选/多选/填空/实验/计算，可自增 |
| **templates** | id, name, created_at | 题型模板 |
| **template_rules** | id, template_id, from_no, to_no, type_id, rule_order | 按 order_in_paper 套用的区间 |
| **chapters** | id, name | 章节，单值 FK |
| **knowledge_points** | id, name, chapter_id? | 知识点 |
| **question_knowledge_points** | question_id, kp_id | 唯一的多对多 |
| **difficulties** | id, name, sort_order | 自定义标签 简单/中等/较难/压轴 |
| **paper_sets** | id, name, title, status[draft\|saved], created_at, updated_at | 组卷篮=draft set，天然跨重启保留 |
| **paper_set_items** | id, set_id, question_id, order_index, group_header?, display_number? | 可重排；题目可跨套复用 |
| **schema_meta** | version | 迁移版本 |
| **app_settings** | key, value | 应用设置 |

- 删除试卷 = 从 paper `ON DELETE CASCADE` 删除 pages/cut_lines/segments/questions（破坏性，需二次确认）。
- 章节、难度是单值 FK；知识点是唯一的多对多。

## 8. 模块 / 进程架构

**硬规则：渲染进程不碰 DB 和文件系统；主进程不跑 pdf.js。**

### 8.1 主进程（Node 侧）
- **StorageService** — better-sqlite3 句柄、迁移执行器、各 repository（所有 SQL 集中于此）。
- **FileService** — 每项目目录 `userData/projects/{paperId}/`，存 `source.pdf` 与 `images/`。
- **ExportService** — 读组卷项 → 读入库 PNG → pdf-lib 组装（标题、连续编号、可选分组标题、分页、内嵌中文字体、高 DPI）→ 系统保存对话框。
- **IPC** — 命名空间化 `ipcMain.handle` 通道：`papers:* / pages:* / cutlines:* / dividers:* / segments:* / questions:* / tags:* / templates:* / sets:* / export:* / files:*`。`contextIsolation:true`、`nodeIntegration:false`，preload 用 `contextBridge` 暴露带类型的 `api`。
- **app:// 协议** — 注册自定义协议，把 `userData/projects/.../images/*.png` 安全地映射给渲染进程 `<img>` 使用，避免图像走 IPC。

### 8.2 渲染进程（React + TS，pdf.js 侧）
- **RenderService** — 封装 pdfjs-dist；按指定 scale 渲染整页或页面区域，产出 PNG blob；缓存/及时释放 page proxy。区分显示低 DPI 与导出高 DPI 两条路径。
- **ViewportController** — 适应宽度/适应整页/百分比缩放/滚动/虚拟化（见第 4 节）。
- **ColumnCropService** — 依 column_mode + 分隔线分列；依 cut_lines 在列内派生片段；按导出 DPI 产出每段 PNG；合并题时宽度归一化后纵向拼接。
- **State/IPC client** — Zustand + 类型化 IPC 封装。
- **视图** — 主页/题库导入、裁切工作区、后期处理工作区、题型模板管理、原试卷复查、题库浏览（筛选侧栏）、组卷篮、导出对话框、标签管理。

### 8.3 关键创建文件
- `src/main/storage/schema.ts` — 迁移与数据模型
- `src/main/storage/repositories/*.ts` — 各表的 CRUD/查询
- `src/main/ipc/index.ts` — IPC 边界 + preload 契约类型
- `src/main/export/ExportService.ts` — pdf-lib + 中文字体内嵌
- `src/main/files/FileService.ts` — 项目目录与 app:// 协议
- `src/renderer/services/RenderService.ts` — 任意 DPI 渲染
- `src/renderer/services/ViewportController.ts` — 适应/缩放/滚动
- `src/renderer/services/ColumnCropService.ts` — 分列/横切/合并拼接
- `src/renderer/views/*` — 各工作区视图
- `src/shared/types.ts` — 主/渲染共享类型（IPC 契约、DTO）

---

## 9. 里程碑（按依赖顺序，每个可独立验证）

### 先做两个 Spike 去风险（在铺 UI 之前）
- **Spike A 保真链**：pdf.js 渲染页面区域 @300DPI → PNG → pdf-lib 内嵌 + 一行中文标题 → 用 PDF 阅读器/打印预览查看。一次性验证导出 DPI 与中文字体两大风险。
- **Spike B 裁切画布**：页面图 + 竖向分列（1/2/3 列，分隔线可拖）+ 跟随光标的横向示意线 + 点击落刀 + 撤销/删除，全用比例坐标。验证最棘手的交互与二维坐标数学。

### 主线里程碑
| # | 里程碑 | 内容 | 独立验证点 |
|---|---|---|---|
| M0 | 脚手架 | electron-vite 三进程拆分、contextIsolation、**better-sqlite3 + electron-rebuild 验证**、迁移(schema v1)、主页 | 应用能启动，库能建表 |
| M1 | 导入 + 持久化 | 复制 PDF 入项目目录、pdf.js 读各页尺寸、存 paper+pages、列表与重新打开 | 导入后重启仍在列表 |
| M2 | 裁切工作区 | **适应宽度/适应整页/缩放/滚动**（按需渲染）、列模式切换 + 分隔线、列内横切示意线/落刀/撤销删除、存比例、派生并存 segments | **重启精确还原**所有线与片段 |
| M3 | 后期处理 | 按序显示片段、软删除、多选合并→question_segments、取消合并 | 重启还原删除与合并状态 |
| M4 | 入库 + 出图 | 每题生成高 DPI 标准 PNG（合并题拼接）、经主进程落盘、分配 order_in_paper | 入库题在库中可见、图清晰 |
| M5 | 题型模板 | 题型 CRUD、模板区间、按序套用、手动改题型 | 套模板后题型正确、可手改 |
| M6 | 标签 | 章节/知识点/难度 CRUD + 临时新建、赋值、后续可改 | 标签持久、可多知识点 |
| M7 | 原试卷复查 | 重开已处理试卷、按原序显示题目、就地改题型/标签 | 顺序与状态正确 |
| M8 | 题库浏览 + 筛选 | 网格(图+来源)、可组合筛选(题型/来源/章节/知识点/难度) | 组合筛选结果正确 |
| M9 | 组卷篮 | 勾选入 set、查看/移除/重排、分组标题、编号 | 重启后组卷篮保留 |
| M10 | 导出 | pdf-lib 组装(标题、连续编号1..N、题图、可选分组标题、分页、内嵌中文字体、高DPI) → 保存 | 打印预览清晰不变形 |
| M11 | 打包 | electron-builder NSIS + 快捷方式；**干净 Windows 机器验证原生模块与库读写** | 安装版可用 |
| M12 | 加固 | 错误态、大 PDF 内存、自动保存、破坏性操作确认、DB 备份/导出 | 稳定性 |

**关键主线：** M0→M1→M2→M3→M4；M5/M6 依赖 M4；M7 依赖 M4–M6；M8 依赖 M4+M6；M9 依赖 M8；M10 依赖 M9。

---

## 10. 验证策略

- **Vitest 纯逻辑单测（Node，无 Electron，性价比最高）**：比例↔像素换算、分列+横切派生片段、片段与合并排序、拼接尺寸数学、模板区间→题型套用、筛选查询构造、导出分页与连续编号。
- **Repository 测试**（临时 better-sqlite3 库）：迁移、CRUD、级联删除、筛选连表。
- **图像保真**：断言输出 PNG 尺寸符合给定 DPI + 一张 golden 样本 + 人工目视（不做精确哈希，抗锯齿会误报）。
- **导出**：断言页数与内嵌图数、用 pdfjs 解析确认中文字形存在 + 人工打印预览。
- **E2E**：Playwright-for-Electron 只做导航与非画布操作的冒烟测试；裁切画布用每里程碑的人工检查清单验证；**干净机器安装测试为 M11 强制关卡**。

---

## 11. 待确认项（构建前逐一敲定，已排序）

1. **跨页/跨列合成宽度**不一致时如何处理 —— 建议归一化到最大/内容宽度。
2. **入库后重新裁切**是否作废该卷已入库题目 —— 需重派生/重入库策略。
3. **删除来源试卷**是否级联删除其入库题目（建议级联 + 确认）还是保留孤立题目。
4. **导出页面尺寸/边距**：默认 A4；单题图高于一页时缩放适配还是拆分（建议先缩放适配）。
5. **图像格式**：PNG（无损、较大）默认；实验照片类是否用 JPEG 省空间。
6. **题目复用**：跨多套 set 复用（建议允许）；同一 set 内是否允许重复（建议去重）。
7. **默认导出 DPI**：建议 300 DPI（打印级）；可在设置中调整。

---

## 12. 第一阶段完成判据

教师能从一份普通 PDF 物理试卷开始，经人工分列 + 横切 + 整理，变成题库中一道道题目，再从题库筛选、重新组卷、导出可打印的 PDF；关闭软件再打开能继续查看和编辑已有内容。整条链路顺畅、清楚、可靠。
