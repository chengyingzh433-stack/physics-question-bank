# 前端重构交接文档

- 日期：2026-07-06
- 关联：`-development-progress.md`（当前进度）、`-technical-design.md`（技术设计）、`-task-handbook.md`（任务手册，附 A 陷阱清单）
- 本文档面向**接手前端 UI 重构的智能体/开发者**。读完应能独立开展重构而不破坏既有功能。

---

## 0. 一句话现状

后端（主进程 DB/文件/IPC/导出）和纯逻辑（派生片段/模板/筛选/拼接）已完整且自测通过；**前端 UI 功能可用但视觉粗糙**——全是内联样式、无设计系统、无组件库。重构目标是**在不改动 IPC 契约和业务逻辑的前提下，把 UI 重做成专业、一致、好用的桌面应用界面**。

---

## 1. 重构边界（什么能改、什么不能改）

### ✅ 可以改
- 所有 `src/renderer/src/views/*.tsx` 的视觉与交互（布局、样式、组件拆分）
- `src/renderer/src/App.tsx` 的路由布局（保持路由路径不变即可）
- 引入 UI 组件库 / 设计系统 / 图标库
- 新增 `src/renderer/src/components/`（共享组件）
- 新增 `src/renderer/src/store/`（若引入 Zustand，见第 4 节）
- 全局 CSS / 主题（暗色模式等）
- `src/renderer/index.html`、`src/renderer/src/main.tsx`

### ❌ 不能改（改了会破坏功能）
- `src/shared/types.ts` 的 **`Api` 接口签名**（IPC 契约）——这是渲染层与主进程的唯一通道
- `src/shared/constants.ts`（EXPORT_DPI 等业务常量）
- `src/main/**`（主进程全部代码）
- `src/preload/index.ts`（contextBridge 暴露的 api）
- **业务逻辑纯函数**（重构 UI 时直接调用，不要改其签名/行为）：
  - `services/ColumnCropService.ts` 的 `deriveSegments` / `computeComposedSize` / `computeSegmentXOffset` / `ratioToPx` / `segmentPixelRows`
  - `services/TemplateService.ts` 的 `applyTemplate`
  - `src/main/storage/questionFilter.ts` 的 `buildQuestionFilter`（主进程，渲染层不直接调）
- **裁切坐标数学**（见第 5 节，重构 CropOverlay/PDFViewer 时必须保留比例坐标 + getBoundingClientRect 换算）

### ⚠️ 慎改
- `services/RenderService.ts` 的 pdfjs 调用（v4 API，A1 worker 配置）——视觉可改，渲染参数别动
- `services/useCropData.ts` 的"先写库再更新 state"模式（A12，DB 是真值）——可重构成 Zustand 但必须保留这个时序

---

## 2. 当前 UI 结构与问题诊断

### 2.1 路由（App.tsx，HashRouter）
| 路径 | 视图 | 作用 |
|---|---|---|
| `/` | HomeView | 试卷列表 + 导入 + 删除 |
| `/crop/:paperId` | CropView → PDFViewer + CropOverlay | 裁切工作区 |
| `/post/:paperId` | PostProcessView | 后期处理（缩略图/合并/入库） |
| `/review/:paperId` | PaperReviewView | 原卷复查（套模板/赋标签） |
| `/templates` | TemplateView | 题型与模板管理 |
| `/bank` | BankView | 题库网格 + 筛选 + 入篮 |
| `/basket` | BasketView | 组卷篮 + 导出 |

### 2.2 主要问题（按严重度）
1. **全内联样式**：每个组件 `style={{...}}` 散落，无复用、无一致性。颜色/字号/间距硬编码且各处不同（如 `#0078d7`、`#333`、`#555`、`#999` 混用）。
2. **无组件库**：按钮/输入框/下拉/卡片/弹窗都是原生 HTML，无 hover/focus/disabled 视觉反馈，无统一尺寸。
3. **无设计令牌**：间距（8/12/16/24 混用）、圆角（4/6/8 混用）、阴影各处不同。
4. **布局粗糙**：
   - 主页卡片是裸 div，无空状态插画、无加载骨架。
   - 裁切工作区工具栏拥挤、无分组、图标缺失（纯文字按钮）。
   - 题库网格卡片信息密度低、无 hover 预览。
   - 筛选侧栏是裸 select 堆叠，无折叠、无已选标签云。
5. **无反馈层**：操作（导入/入库/导出）只有 `busy` 文字，无 toast/进度条/骨架屏。错误用红色 div 显示，不醒目。
6. **无快捷键**：裁切（撤销/落刀/切列模式）全靠点按钮，效率低。
7. **暗色模式缺失**：裁切工作区背景 `#525659`（深色），但其他页面 `#eee`/`#f5f5f5`（浅色），割裂。
8. **响应式缺失**：Electron 窗口可缩放，但布局未适配窄屏。
9. **中文字体未统一**：`fontFamily: 'system-ui, sans-serif'` 各处重复，无全局字体栈。
10. **无图标**：所有操作纯文字，认知成本高。

### 2.3 各视图重构要点

**HomeView**：列表卡片化（含状态徽章、页数、缩略图预览首页）、空状态引导、导入按钮突出、删除二次确认用 Modal 而非 `window.confirm`。

**CropView + PDFViewer + CropOverlay**（最复杂，重点）：
- 工具栏分组：左（返回/试卷名）、中（列模式 1/2/3 + 工具：平移/横切）、右（缩放控件 + 适应宽度/整页）。
- 缩放百分比改为下拉/输入。
- 落刀后给视觉反馈（短暂高亮）。
- 横切模式光标变 crosshair（已有），加列高亮（已有，可强化）。
- **必须保留比例坐标逻辑**（见第 5 节）。

**PostProcessView**：缩略图网格 + 多选 checkbox + 合并按钮 + 入库按钮突出（危险/重要操作）。入库进度需反馈（逐题渲染）。

**PaperReviewView**：题目卡片网格，每卡：题图 + 题型/章节/难度下拉 + 知识点多选 chips + 临时新建。信息密度高，需折叠/展开。

**BankView**：筛选侧栏改为可折叠 + 已选条件 chips（可点 × 清除）；网格卡片加 hover 放大预览；入篮状态醒目。

**BasketView**：列表式（每项题图 + 来源 + 分组标题输入 + 上下移 + 移除）；导出按钮固定底栏；空状态引导。

**TemplateView**：左右分栏（题型 | 模板+规则），规则用表格而非裸列表。

---

## 3. 推荐技术方案

### 3.1 UI 组件库选型（三选一，按推荐度）

| 方案 | 优点 | 缺点 | 适合 |
|---|---|---|---|
| **shadcn/ui + Tailwind** | 完全可控、现代、文档全、社区大；Tailwind 解决设计令牌 | 需配 Tailwind，组件要 copy 进项目 | **推荐**，长期可维护 |
| **Ant Design 5** | 开箱即用、中文友好、组件最全、桌面感强 | 包大、样式覆盖略难、设计语言固定 | 想快速出效果、不介意统一风格 |
| **Mantine 7** | 开箱即用、API 干净、暗色模式好、hook 丰富 | 社区不如前两者 | 折中选 |

**首选 shadcn/ui + Tailwind**：理由是本项目是长期维护的桌面工具，组件可控性重要；Tailwind 的设计令牌能一举解决"间距/颜色/字号不一致"。

> 无论选哪个，**都不要引入会改变 IPC 契约或业务逻辑的库**。组件库只管 UI。

### 3.2 状态管理
设计文档提到 Zustand。当前用 React state + hooks，跨视图状态（如"当前篮"）通过 IPC 实时查。**重构时可引入 Zustand** 做：
- UI 状态（当前路由/主题/选中项/工具模式）
- 缓存的业务数据（papers/types/chapters 等不常变的字典）

但 **"DB 是真值"原则不可破**（A12）：任何业务变更仍须先 IPC 写库成功再更新 Zustand。推荐模式：
```ts
// store 用法示例（重构后）
usePaperStore.getState().addPaper = async (name) => {
  const paper = await window.api.importPaper(name)  // 先写库
  if (paper) set({ papers: [...get().papers, paper] })  // 再更新 state
}
```

### 3.3 图标
- **lucide-react**（shadcn 默认搭配，轻量、现代）
- 或 `@tabler/icons-react`

### 3.4 主题 / 设计令牌
- 用 Tailwind config 或 CSS 变量定义：主色、中性色、语义色（成功/警告/危险）、间距阶（4/8/12/16/24/32）、圆角（sm/md/lg）、阴影（sm/md/lg）。
- 暗色模式：裁切工作区天然深色，建议全应用支持暗色（`prefers-color-scheme` 或手动切换）。

### 3.5 字体
- 全局字体栈：`'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', sans-serif`（项目已含 Noto Sans SC，可复用做 UI 字体；或用系统字体保性能）。
- 等宽（编号/坐标）：`ui-monospace, 'Cascadia Code', monospace`。

---

## 4. 重构执行步骤（建议）

1. **建分支**：`git checkout -b refactor/frontend`
2. **跑通基线**：`npm run dev` + `npm test`，记录当前 28 单测全绿作为回归基线。
3. **引入基础设施**：Tailwind + shadcn/ui + lucide-react + Zustand（如选 shadcn 方案）。配 `tailwind.config`、全局 CSS 变量、字体。
4. **建共享组件**（`src/renderer/src/components/`）：Button、Input、Select、Modal、Card、Badge、Toast、Tooltip、EmptyState、ConfirmDialog（替代 window.confirm）。
5. **逐视图重构**（每改一个跑一次 typecheck + test + 人测）：
   - HomeView → PostProcessView → PaperReviewView → TemplateView → BankView → BasketView → **CropView/PDFViewer/CropOverlay 最后做**（最复杂）。
6. **加反馈层**：Toast（成功/失败）、进度条（入库/导出）、骨架屏（列表加载）。
7. **加快捷键**：裁切（Z 撤销、1/2/3 切列模式、C 横切模式、Space 平移）、全局（Ctrl+O 导入）。
8. **暗色模式**：全应用统一。
9. **回归**：28 单测全绿 + 完整链路人测。

---

## 5. 裁切坐标系统（重构 CropOverlay/PDFViewer 必读）

这是全项目最易踩坑的地方。重构时**必须保留以下逻辑**，否则裁切线错位：

### 5.1 比例坐标是唯一真值
- 分隔线 `x_ratio`、横切线 `y_ratio`、片段 `x/y_start/end_ratio` 全部是 0..1 比例，存 DB。
- 显示尺寸（CSS px）只用于渲染，不存。

### 5.2 鼠标坐标 → 比例（A4）
```ts
// 用元素的 getBoundingClientRect()，天然含缩放，不要自己乘 scale
const rect = el.getBoundingClientRect()
const xRatio = (e.clientX - rect.left) / rect.width
const yRatio = (e.clientY - rect.top) / rect.height
```
**不要**用 `e.offsetX` 或自己算 `clientX - canvasLeft`（dpr/缩放下会错）。

### 5.3 高 DPI 屏幕的 canvas（A4）
- canvas 缓冲尺寸 = `cssW * dpr × cssH * dpr`
- `ctx.scale(dpr, dpr)` 让绘图用 CSS px 坐标
- 显示尺寸用 `canvas.style.width/height`

### 5.4 拖动夹紧（A13）
- 分隔线 `x_ratio` clamp 到 `[leftNeighbor + ε, rightNeighbor - ε]`（ε≈0.02）
- 横切线 `y_ratio` clamp 到 (0,1)
- 派生前过滤零高/零宽退化段（`deriveSegments` 已做）

### 5.5 pdf.js 渲染取消（A3）
- 每页保存当前 `renderTask`，重渲染前 `renderTask.cancel()` 并 await
- 组件卸载也要 cancel
- 渲染完 `page.cleanup()`

### 5.6 旋转页（A6）
- `page.getViewport({ scale, rotation: page.rotate })`，用返回 viewport 的 width/height
- 当前 pages 表无 rotation 列，rotation 传 0；若加旋转支持需先加列

### 5.7 虚拟化（A11）
- 只渲染视口附近页（IntersectionObserver，rootMargin 1000px），滚出即销毁
- 300DPI 出图逐题渲染、用完 canvas 宽高置 0

### 5.8 派生片段边界（A5）
- 相邻段像素边界共用：上段 `[floor(y0), floor(y1))`，下段从 `floor(y1)` 开始
- `segmentPixelRows` 工具已实现，重构时直接用

**重构 CropOverlay 时**：保留 `colAtX`、`onHostMouseMove` 的拖动 clamp、`onHostClick` 的落刀逻辑。只改视觉（线颜色/粗细/hover 反馈），不动坐标换算。

---

## 6. 必须保留的 IPC 契约（Api 接口）

`window.api` 的所有方法签名（见 `src/shared/types.ts` 的 `Api`）。重构 UI 时调用方式不变。关键方法：

```ts
// 导入
importPaper(name): Promise<PaperDTO | null>      // 主进程弹文件选择框
bulkAddPages(pages): Promise<void>
setPageCount(paperId, n): Promise<void>

// 裁切
setColumnMode(pageId, mode)
replaceDividers(pageId, xRatios)
addCutLine(pageId, colIndex, yRatio): Promise<number>
undoLastCutLine(pageId): Promise<number | null>
deleteCutLine(cutLineId)
replaceSegmentsForPage(pageId, paperId, segments)

// 后期处理
setSegmentDeleted(segmentId, isDeleted)
createQuestionWithSegments(paperId, segmentIds, orderInPaper): Promise<number>
deleteQuestion(questionId)
renumberQuestions(paperId)
setQuestionOrder(questionId, orderInPaper)

// 入库出图
saveQuestionPng(paperId, questionId, data: ArrayBuffer): Promise<{relPath, url}>
setQuestionImage(questionId, imagePath, widthPx, heightPx)
setPaperStatus(paperId, status)

// 题型/模板/标签/篮/导出
listQuestionTypes(); createQuestionType(name); ...
listTemplates(); createTemplate(name); listRules(templateId); addRule(...)
listChapters(); listKnowledgePoints(); listDifficulties()
setQuestionChapter/ setType/ setDifficulty/ setQuestionKnowledgePoints
listBankQuestions(criteria)
getOrCreateDraftSet(); addToSet/ removeFromSet/ updateSetItem
exportBasketPdf(setId, title): Promise<string | null>
```

题图 URL 拼法：`app://projects/${paperId}/images/q_${questionId}.png`。

---

## 7. 验证回归

重构后必须保持：
- `npm run typecheck` 全过
- `npm run build` 三段全过
- `npm test` 28 单测全绿
- 完整链路人测（导入→裁切→后期→入库→复查→筛选→组卷→导出）

特别验证（易回归）：
- **裁切重启还原**：落线、分隔线、列模式重启后精确还原
- **缩放后线不错位**：放大/缩小后裁切线仍跟鼠标准
- **窗口缩放后线不动**：改变窗口大小，已落线的相对位置不变
- **入库题图清晰**：300DPI，合并题上下拼接正确
- **导出 PDF 中文不乱码**

---

## 8. 风格建议（可选参考）

- **整体**：桌面工具感，信息密度适中，留白克制。主色建议沉稳蓝（#2563eb 系）或墨绿。
- **裁切工作区**：深色背景（#1e1e1e）凸显 PDF 白页，工具栏浮层半透明。
- **题图卡片**：白底 + 轻阴影 + hover 微抬升。
- **危险操作**（删除/重新裁切）：红色确认 Modal，明确后果文案。
- **状态徽章**：importing/cropping/processing/done 用不同色。
- **空状态**：每个列表页有引导插画 + "导入第一个 PDF"等 CTA。

---

## 9. 给重构智能体的检查清单

开始前：
- [ ] 读了 `-technical-design.md` 第 4/5/8 节（查看器/裁切/架构）
- [ ] 读了 `-task-handbook.md` 附 A 的 A3/A4/A5/A6/A11/A13（裁切相关陷阱）
- [ ] 读了本文档第 5 节（坐标系统）
- [ ] 跑通 `npm run dev` + `npm test` 基线

过程中：
- [ ] 每改一个视图跑 typecheck + test
- [ ] 不改 `src/shared/types.ts` 的 Api 签名
- [ ] 不改 `src/main/**`
- [ ] 不改纯逻辑函数签名
- [ ] CropOverlay 坐标换算原样保留

完成后：
- [ ] 28 单测全绿
- [ ] 完整链路人测
- [ ] 裁切重启还原验证
- [ ] 缩放后线不错位验证
