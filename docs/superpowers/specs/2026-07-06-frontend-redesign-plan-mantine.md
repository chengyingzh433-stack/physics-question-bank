# 前端重构方案 — Mantine 7

- 日期：2026-07-06
- UI 方案：**Mantine 7**（用户已确认）
- 关联：`2026-07-06-frontend-redesign-prompt.md`（需求）、`2026-07-06-frontend-refactor-handoff.md`（边界与坐标系统）、`2026-07-06-development-progress.md`（进度）
- 目标：在**不改 IPC 契约、主进程、纯逻辑函数、裁切坐标数学**的前提下，把 UI 重做成现代、一致、深浅色统一的桌面应用。

---

## 0. 为什么选 Mantine 7

- 组件齐全（Button/Card/Select/Modal/Table/Badge/Tabs/SegmentedControl/Tooltip/Notification 全内置），无需自己拼视觉。
- 设计令牌开箱即用（间距 xs–xl、圆角、阴影、主色阶自动生成），一举解决"颜色/间距/字号各处不一致"。
- **暗色模式一流**：`ColorSchemeScript` + `useMantineColorScheme`，裁切工作区天然深色，能和全局统一。
- `@mantine/hooks` 丰富（`useHotkeys` 直接给裁切页做快捷键，`useDisclosure` 管弹窗）。
- 支持 React 18，与当前 electron-vite 兼容。

---

## 1. 不可触碰的边界（重构全程遵守）

以下改了会破坏功能，方案里所有视图重构都**只换视觉、不动这些**：

- `src/shared/types.ts` 的 `Api` 接口签名 —— 所有数据仍走 `window.api.xxx()`。
- `src/main/**`、`src/preload/index.ts`、`src/shared/constants.ts`。
- 纯逻辑函数：`ColumnCropService`(`deriveSegments`/`computeComposedSize`/`computeSegmentXOffset`/`ratioToPx`/`segmentPixelRows`)、`TemplateService.applyTemplate`、`QuestionRenderService`、`RenderService`（pdfjs 参数）。
- 裁切坐标数学：比例坐标（0..1）+ `getBoundingClientRect()` 换算 + A13 拖动 clamp + A3 renderTask cancel。**CropOverlay 只改线的颜色/粗细/hover，坐标计算原样保留。**
- 路由路径不变：`/`、`/crop/:paperId`、`/post/:paperId`、`/review/:paperId`、`/templates`、`/bank`、`/basket`。
- "先 IPC 写库成功，再更新 state"（A12）——`useCropData` 的时序保留。

---

## 2. 整体架构决策（我替你定的）

### 2.1 两类布局，而非扁平路由
当前 `App.tsx` 是 7 条平行路由，无共享导航。改成两个布局组件包裹：

- **LibraryLayout**（常驻侧边导航栏 `AppShell.Navbar`）：包裹 `/`、`/bank`、`/basket`、`/templates`。侧边栏有：主页 / 题库浏览 / 组卷篮 / 题型模板，顶栏放亮暗切换和组卷篮计数徽章。
- **WorkflowLayout**（顶部工具栏 + 返回，无侧边栏，专注）：包裹 `/crop/:paperId`、`/post/:paperId`、`/review/:paperId`。这三个是针对单份试卷的深度工作流，全屏更专注；顶栏做"裁切 → 后期 → 复查"步骤指示。

路由路径**完全不变**，只是外面套了不同的 `<Layout>`。

### 2.2 状态管理
不引入 Zustand（当前 React state + hooks 够用，且交接文档说规模够用）。唯一跨视图状态是"组卷篮计数"，用一个轻量 Context 或每次进 Library 顶栏时查一次 `listSetItems` 即可，不铺大架子。

### 2.3 反馈层
- `window.confirm` → `@mantine/modals` 的 `modals.openConfirmModal`（删除试卷等危险操作用红色确认）。
- 导入/入库/导出的成功失败 → `@mantine/notifications`（toast）。
- 加载态 → Mantine `Skeleton` / `Loader` / `LoadingOverlay`。
- 错误红字 div → `Alert` 组件。

### 2.4 图标
`@tabler/icons-react`（Mantine 官方搭配）。工具栏、按钮、空状态都用图标降低认知成本。

### 2.5 字体
全局字体栈通过 Mantine theme 的 `fontFamily` 设：`'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', sans-serif`（项目已含 Noto Sans SC）。等宽（坐标/编号）用 `ui-monospace, 'Cascadia Code', monospace`。

---

## 3. 依赖与基础设施

### 3.1 新增依赖
```
@mantine/core @mantine/hooks @mantine/modals @mantine/notifications @tabler/icons-react
```
（`@mantine/core` 自带 `clsx`/`@floating-ui`，无需额外装。）不动现有 pdfjs/pdf-lib/better-sqlite3。

### 3.2 electron-vite 注意
- Mantine 是纯前端库，只影响 renderer 段，不碰 main/preload。
- Mantine 用 CSS 层（`@layer`），需在 `main.tsx` **先 import** `@mantine/core/styles.css`（以及 modals/notifications 的 css）再渲染 App。
- 无需 PostCSS 也能跑；若要用 Mantine 的响应式 `rem` 混入可选装 `postcss-preset-mantine`（非必须，可后置）。

### 3.3 Provider 包裹（main.tsx）
```tsx
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'

<MantineProvider theme={theme} defaultColorScheme="auto">
  <ModalsProvider>
    <Notifications />
    <App />
  </ModalsProvider>
</MantineProvider>
```
`theme` 集中定义主色（sky/indigo 系）、fontFamily、defaultRadius。这是唯一的设计令牌来源。

---

## 4. 共享组件与目录

新增 `src/renderer/src/components/`（薄封装，非重造轮子）：
- `AppLayout/LibraryLayout.tsx`、`AppLayout/WorkflowLayout.tsx` —— 上面 2.1 的两个布局。
- `PageThumb.tsx` —— 统一的题图/片段缩略图卡（含 `app://` URL 拼接、hover 放大、加载占位）。
- `StatusBadge.tsx` —— 试卷状态徽章（importing/cropping/processing/done 四色）。
- `EmptyState.tsx` —— 空列表引导（图标 + 文案 + CTA 按钮）。
- `useBasketCount.ts` —— 组卷篮计数（供导航徽章）。

其余直接用 Mantine 原生组件，不包一层。

---

## 5. 逐视图重构清单（每项标注：保留什么 / 换成什么）

> 顺序建议：先易后难，**CropView/PDFViewer/CropOverlay 最后做**（最复杂、最易回归）。每改一个视图跑 `npm run typecheck && npm test`。

### 5.1 HomeView（主页）
- 保留：`listPapers` / `importPaper('')` + `importPagesFromPdf` / `deletePaper` / `navigate('/crop/:id')`。
- 换成：`SimpleGrid` 卡片网格；每卡 `Card` + `StatusBadge` + 页数 + 相对时间；导入按钮 `Button leftSection={<IconUpload/>}` 主色突出；删除走 `modals.openConfirmModal`（替代 `window.confirm`）；空态用 `EmptyState`；导入中用 `LoadingOverlay` 或按钮 loading 态。

### 5.2 TemplateView（题型与模板）
- 保留：题型 CRUD（内置不可删）、模板 CRUD、区间规则 add/delete。
- 换成：左右 `Grid`/`Flex` 双栏；左题型列表用 `List`/`Stack`，内置题型加"锁"图标不可删；右模板选中后规则用 `Table`（"第 X–Y 题 = 题型"三列 + 删除），新增规则用 `NumberInput` + `Select` 行内表单。

### 5.3 PostProcessView（后期处理）
- 保留：片段派生显示、`setSegmentDeleted` 软删除、显示已删除开关、多选合并 `createQuestionWithSegments`、取消合并、"完成入库"逐题渲染出图 `saveQuestionPng`/`setQuestionImage`/`setPaperStatus`。
- 换成：`SimpleGrid` 缩略图网格，每片 `Card` + `Checkbox`（多选）；已合并组用 `Paper` 带边框分组、`Badge` 标"合并"；显示已删除用 `Switch`；"合并选中"/"入库"用 `Button`，入库是重要操作放显眼位 + 二次确认；**入库进度用 `Progress` 或 notification 更新**（逐题渲染时反馈第 n/共 m 题）。

### 5.4 PaperReviewView（原卷复查）
- 保留：按题号列出已入库题、`setQuestionType`/`setQuestionChapter`/`setQuestionDifficulty`/`setQuestionKnowledgePoints`、临时新建知识点 `createKnowledgePoint` 并选中、套模板 `applyTemplate` 批量赋型。
- 换成：题目卡片 `Card` 网格/列表，每卡：题图 + 题型/章节/难度三个 `Select` + 知识点 `MultiSelect`（或 `Chip.Group` 多选，支持 `creatable` 临时新建）；顶部"题型模板"`Select` + "套用"`Button`；信息密度高，用 `Accordion` 或 `Collapse` 折叠非当前题。

### 5.5 BankView（题库浏览）
- 保留：`listBankQuestions(criteria)`、筛选（type/paper/chapter/difficulty + kp 多选命中任一）、`getOrCreateDraftSet`/`addToSet`/`listSetQuestionIds`、入篮去重。
- 换成：`AppShell.Navbar` 或左侧 `Paper` 做**可折叠筛选栏**，各筛选用 `Select`，知识点用 `Chip.Group`（多选）；顶部**已选条件 chips**（可点 × 清除，对应清 criteria 字段）；网格 `SimpleGrid` + `PageThumb`，hover 放大预览；入篮状态用醒目 `Badge`/边框 + 勾选 `Checkbox`；"共 N 题"用 `Text`。

### 5.6 BasketView（组卷篮）
- 保留：`listSetItems` 顺序、`updateSetItem`（order_index 上下移 / group_header 编辑）、`removeFromSet`、顶部标题 + `exportBasketPdf(setId, title)` 弹保存框。
- 换成：列表式，每项 `Paper`：题图缩略 + 来源 + `TextInput`（分组标题）+ 上/下移 `ActionIcon` + 移除 `ActionIcon`；顶部标题 `TextInput`；**"导出 PDF" 固定底栏**（`Affix` 或 sticky footer）+ 导出中 loading + 成功/失败 notification；空态 `EmptyState` 引导去题库。

### 5.7 CropView + PDFViewer + CropOverlay（最复杂，最后做）
- **保留（绝对不动）**：比例坐标、`getBoundingClientRect()` 换算、A13 拖动 clamp（相邻 ±0.02）、落刀 clamp (0,1)、A3 renderTask cancel/await、A4 canvas dpr 缓冲、A11 IntersectionObserver 虚拟化、`colAtX`/`onHostMouseMove`/`onHostClick` 逻辑。`useCropData` 的"先写库再更新 state"时序不动。
- **只换视觉**：
  - 工具栏用 `Group` 分三组：左（返回 `ActionIcon` + 试卷名 + 步骤指示）、中（列模式用 `SegmentedControl` 1/2/3 + 工具 `SegmentedControl` 平移/横切）、右（缩放：`Select`/`NumberInput` 百分比 + `ActionIcon` +/- + 适应宽度/整页按钮）。
  - 工具栏做成**半透明浮层**（`Paper` + backdrop blur），深色背景。
  - 分隔线/横切线：用 theme 主色，hover 加粗 + 变色反馈；落刀后短暂高亮（CSS transition，不碰坐标）。
  - 横切模式光标 `crosshair`（已有）+ 当前列高亮（已有，强化）。
  - 背景深色（Mantine dark scheme 的 `body`），凸显 PDF 白页。
- **快捷键**（用 `useHotkeys`，新增交互不改坐标）：`Z` 撤销、`1/2/3` 切列模式、`C` 横切、`Space` 平移、`Ctrl+O` 导入（全局）。

---

## 6. 暗色模式

- `MantineProvider defaultColorScheme="auto"` 跟随系统，或在 Library 顶栏放 `useMantineColorScheme` 的切换 `ActionIcon`（太阳/月亮图标）。
- 裁切工作区**强制深色**（无论全局如何），凸显 PDF 白页——可用 `MantineProvider` 局部覆盖或直接给 WorkflowLayout 设深色背景。
- 所有硬编码颜色（`#0078d7`/`#333`/`#555`/`#999`/`#eee`/`#f5f5f5`/`#525659`/`crimson`）全部删除，换成 Mantine theme 语义色（`var(--mantine-color-*)` 或组件 `c=`/`bg=` 属性），这样深浅色自动适配。

---

## 7. 执行步骤（交给执行智能体的顺序）

1. **建分支** `refactor/frontend-mantine`；跑基线 `npm run dev` + `npm test`（确认当前 28 单测全绿）。
2. **装依赖** + 配 `main.tsx` 的 Provider + import css + 定义 `theme`（主色/字体/圆角）。
3. **建两个 Layout** + 改 `App.tsx` 用 Layout 包裹路由（路径不变）+ 建共享组件（StatusBadge/EmptyState/PageThumb/useBasketCount）。
4. **逐视图重构**，顺序：HomeView → TemplateView → PostProcessView → PaperReviewView → BankView → BasketView → **CropView/PDFViewer/CropOverlay（最后）**。每个改完跑 `typecheck + test`。
5. **加反馈层**：notification（导入/入库/导出）、confirm modal（删除）、进度（入库/导出）、骨架屏（列表加载）。
6. **加快捷键**（裁切页 + 全局导入）。
7. **暗色模式统一** + 清除所有硬编码颜色。
8. **回归**：见第 8 节。

> 每步都在"只换视觉、不动逻辑"的红线内。任何一步若发现要改 Api/坐标/主进程才能实现某视觉效果——停下，说明，宁可不做那个效果。

---

## 8. 回归验证（重构后必须全过）

自动：
- `npm run typecheck` 全过。
- `npm test` 28 单测全绿（纯逻辑没动，应天然全绿；若挂说明误碰了逻辑）。
- `npm run dev` 能启动，无 console 报错。

人测完整链路：
导入 PDF → 裁切（分列/横切/落线）→ **重启后线精确还原** → 后期处理（删片段/合并）→ 入库 → 复查（套模板/赋标签）→ 题库筛选 → 入篮 → 导出 PDF。

裁切专项（最易回归）：
- **缩放窗口/改窗口大小后，已落裁切线相对位置不变**。
- **缩放 PDF 后裁切线仍跟鼠标对齐**（比例坐标 + getBoundingClientRect 没被破坏的标志）。
- 分隔线拖动不越过相邻线；横切线限本列。
- 撤销/删除线正确。

导出专项：
- 中文标题不乱码、连续题号、分组标题、自动分页、题图清晰（300DPI）。

---

## 9. 风险与回退

- **最大风险在 CropOverlay/PDFViewer**：这里坐标数学一旦被"顺手优化"就会错位，且不一定当场发现（要缩放/重启才暴露）。→ 对策：放最后做、只包视觉容器、坐标相关代码块加注释"勿动"、改完必做裁切专项人测。
- **CSS 冲突**：Mantine 用 `@layer`，若有残留全局 CSS 可能覆盖。→ 对策：删掉旧的全局样式，只留 Mantine css + theme。
- **回退**：全程在 `refactor/frontend-mantine` 分支，主分支功能完好，出问题可直接切回。

---

## 10. 一句话总结

引入 Mantine 7 做设计令牌与组件底座，把 7 个视图从内联样式逐个换成组件化界面，加两级布局 + 反馈层 + 快捷键 + 暗色模式；**全程不碰 IPC 契约、主进程、纯逻辑、裁切坐标数学**，以"28 单测全绿 + 裁切重启还原 + 缩放不错位"为不破坏功能的硬验收。

