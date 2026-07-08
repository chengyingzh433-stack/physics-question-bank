# 裁切框选技术方案（高级工程师指导）

- 日期：2026-07-07
- 关联文档：`2026-07-07-crop-box-select-issues.md`（需求，本方案输入）、`2026-07-06-development-progress.md`（5.7 节）、`-technical-design.md`（第 5 节 裁切模型）
- 文档性质：**技术指导，非实现细则**。定方向、划边界、点关键坑，具体代码由实现模型（Sonnet）完成。实现前请通读第 6 节红线。
- 目标：为裁切页增加**矩形框选**能力（排除框 + 分割框），与现有「分列+横切」模式共存。

---

## 0. 总体判断与三处关键决策

需求把框选抽象为「排除框」和「分割框」。深入现有架构后，核心判断如下：

**决策 A：框选原始数据必须存独立表，不能塞进 `segments`。**
理由：`useCropData.recomputeSegments`（`useCropData.ts:67`）每次线变化都调 `deriveSegments` → `replaceSegmentsForPage` **整页替换** `segments` 表。框选若进 `segments`，每次重算都被冲掉。所以新建独立表 `manual_boxes`，与 `cut_lines`/`column_dividers` 平级，是框选的"原始输入"。最终 `segments` 仍由一个合并函数统一产出。

**决策 B：排除框只减「推导片段」，不减「分割框」。**（⚠️ 这是对直觉的修正，务必理解）
排除框和分割框是**配合使用**的：不规整区域先用排除框把 `deriveSegments` 产的错误片段挖掉，再用分割框在挖空区补上正确的题目片段。如果排除框也筛掉分割框，用户就无法在排除区内框题了。所以合并语义是：
```
最终片段 = ( deriveSegments 推导片段 − 与任一排除框相交的 ) ∪ ( 所有分割框 )
```
分割框直接加入，不过排除筛。

**决策 C：排序——无框选页必须等于原 `deriveSegments` 结果（红线 5）。**
`deriveSegments` 现在是**列优先**排序。场景 B「同行并排两题」需要**行优先**。两者冲突。折中：`deriveAllSegments` 在**该页无分割框时原样返回** `deriveSegments`（含原 `order_index`，纯横切页语义零变化）；**有分割框时**才对全页片段按 (y 分桶容差, x) 行优先重排。混用页排序语义会变，这是框选的固有代价，需在 UI 或文档向用户点明。

---

## 1. 数据模型决策

### 新表 `manual_boxes`（命名刻意区别于 `segments`，避免混淆）

```sql
CREATE TABLE IF NOT EXISTS manual_boxes (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  x_start_ratio REAL NOT NULL,
  x_end_ratio REAL NOT NULL,
  y_start_ratio REAL NOT NULL,
  y_end_ratio REAL NOT NULL,
  is_excluded INTEGER NOT NULL DEFAULT 0,  -- 0=分割框（产出片段）, 1=排除框（从推导片段减去）
  created_seq INTEGER                       -- 撤销用，与 cut_lines 一致
);
```

- 建表放 `schema.ts` 的 `SCHEMA_V1` 里，`CREATE TABLE IF NOT EXISTS` 幂等——现有库启动时自动补表，无需迁移脚本（与现有所有表一致）。
- 坐标一律 0..1 比例值，与 `segments` 同构，红线 1。
- `x_start<x_end`、`y_start<y_end` 由落框逻辑保证（min/max 归一化），存库时已是规范矩形。

**为什么单独建表**：见决策 A。`deriveSegments` 纯函数完全不动，框选是并行的另一条输入通路，最终在合并函数汇流。

---

## 2. 纯函数决策

### 新增 `deriveAllSegments`（放 `ColumnCropService.ts`，与 `deriveSegments` 同文件）

签名建议：
```
deriveAllSegments(page, dividers, cutLines, manualBoxes): SegmentDTO[]
```

内部逻辑（这是指导，不是代码）：
1. 调 `deriveSegments(page, dividers, cutLines)` 得推导片段（**现有函数一行不改**）。
2. 拆 `manualBoxes`：`is_excluded=1` 的是排除框，`is_excluded=0` 的是分割框。
3. **推导片段过排除筛**：去掉与任一排除框矩形有面积重叠的推导片段（决策 B：只筛推导片段）。
4. 分割框转成 `SegmentDTO` 形态直接加入（`col_index` 建议填 `-1` 标记「手画」，方便调试；下游只认 `x/y_*_ratio`，`col_index` 不影响渲染）。
5. **统一排 `order_index`**（见下方排序决策），返回。

### 排序决策（决策 C 的落地要求）

- **无分割框时**：直接返回步骤 3 的结果（此时排除框也没意义，因为没框；退化为纯 `deriveSegments`），`order_index` 保持 `deriveSegments` 原值。**这是红线 5 的保证，必须有单测钉死。**
- **有分割框时**：对合并后的全页片段按 **(y 分桶, x) 行优先**重排 `order_index`。y 分桶容差建议 `0.02`（同 EPS 量级）：`y_start` 差在容差内视为同一行，同行内按 `x_start` 升序。跨行按 `y_start` 升序。这样场景 B 的「左1右2」阅读顺序才对。

### 相交判定（关键坑）

用**比例坐标做矩形 AABB 重叠**，不转像素。两矩形 `(x0,x1,y0,y1)` 与 `(bx0,bx1,by0,by1)` 相交 ⟺ `x0<bx1 && x1>bx0 && y0<by1 && y1>by0`。抽成小纯函数，易单测。

### `deriveSegments` 完全不动

10 个单测覆盖（红线 2）。框选逻辑全在 `deriveAllSegments`。

### 单测要求（新增 `deriveAllSegments.test.ts`）

1. 无 `manualBoxes` → 结果与 `deriveSegments` **逐字段相等**（含 order_index）——钉死红线 5
2. 一个分割框 → 出现在最终列表，且带 order_index
3. 一个排除框与某推导片段相交 → 该推导片段被剔除
4. 排除框与分割框相交 → **分割框仍保留**（验证决策 B）
5. 排除框不相交任何片段 → 推导片段不变
6. 场景 B：两个并排分割框（y 相近、x 一左一右）→ order_index 为 左=先、右=后（验证行优先 + y 分桶）
7. 相交判定纯函数单独测：相邻不重叠（边界相切）判为不相交

---

## 3. 交互决策

### 工具模式扩展

现有 `ToolMode = 'pan' | 'cut'`（`CropView.tsx:16`）。扩展为：
```
type ToolMode = 'pan' | 'cut' | 'box-split' | 'box-exclude'
```
`CropView` 的 `SegmentedControl`（`CropView.tsx:85`）加两档：`{ value: 'box-split', label: '⬚ 框选' }`、`{ value: 'box-exclude', label: '⛔ 排除' }`。`pan`/`cut` 原样保留。

### 框选交互（在 `CropOverlay.tsx`）

- 需给 `CropOverlay` 新增 props：`manualBoxes: ManualBoxDTO[]`、`onAddManualBox(x0,y0,x1,y1,isExcluded)`、`onDeleteManualBox(id)`。
- `box-split`/`box-exclude` 模式下：`onHostMouseDown` 记起点（比例坐标，用现有 `getBoundingClientRect` 换算，同 `colAtX` 第 41-43 行的做法）；`onHostMouseMove` 更新终点、画跟随虚线矩形（**绝对定位 div，不用 canvas**，红线 7）；`onHostMouseUp` 落框——起止点各自 min/max 归一化成规范矩形，调 `onAddManualBox`。
- ⚠️ 起点需存 `useRef`/`useState`（比如 `dragStart`），不要和分隔线拖动的 `dragIdx` 混用状态，分两个独立状态避免串味。
- `cut` 模式的点击落刀（`onHostClick`）必须**不受影响**：`onHostClick` 开头已有 `if (toolMode !== 'cut') return`，天然隔离；框选走 mousedown/move/up，不走 click。两条路径互不干扰（红线 6）。
- 落框后不做拖拽调整边缘——第一版**点框内即删**（与横切「点击删除」一致）。要改就删了重画，简单。

### 已落框的显示

- 分割框：主题色（sky）半透明填充 + 实线边框。
- 排除框：红色半透明填充 + 虚线边框（视觉区分）。
- 点击框内 → 删除（`onDeleteManualBox`）。
- 现有 dividers/cutLines 的显示层不动，框选层叠加在其上（更高 zIndex）。

### 坐标换算

复用 `CropOverlay` 现有 `getBoundingClientRect()` 比例换算，与缩放/DPI 解耦（红线 1）。

---

## 4. 数据通路决策

### `useCropData.ts` 扩展

- 新增 state：`manualBoxes: Record<number, ManualBoxDTO[]>`，`loadAll` 里并行加载每页（仿 dividers/cutLines/segments 的 `Promise.all` 写法，`useCropData.ts:43-47`）。
- 新增 `addManualBox(pageId, x0,y0,x1,y1, isExcluded)`、`deleteManualBox(id, pageId)`、`undoLastManualBox(pageId)`。
- **关键改动**：`recomputeSegments`（`useCropData.ts:67`）从调 `deriveSegments` 改为调 `deriveAllSegments`，多传一个 `manualBoxes[page.id] ?? []` 参数。`replaceSegmentsForPage` 写入的仍是合并后最终片段，下游无感。
- **所有会改变最终片段的操作**（setColumnMode/replaceDividers/addCutLine/undoLastCutLine/deleteCutLine/addManualBox/deleteManualBox/undoLastManualBox）末尾都要触发 `recomputeSegments`。现有 5 个已有，新增 3 个照抄模式。
- **红线 4（先写库再 state）**：`addManualBox` 先 `await window.api.addManualBox(...)`，再 `listManualBoxes` 刷 state，再 `recomputeSegments`——与 `addCutLine`（`useCropData.ts:113`）时序完全一致。

### IPC + Repo + preload + types

- `pageRepo.ts` 加：`listManualBoxes(pageId)`、`addManualBox(...)`（`created_seq` 取该页 MAX+1，抄 `addCutLine`）、`deleteManualBox(id)`、`undoLastManualBox(pageId)`（按 `created_seq` DESC 删，抄 `undoLastCutLine`）。
- `ipc/index.ts` 加 handler，命名遵现有规约 `模块:动词`：`manualboxes:list`、`manualboxes:add`、`manualboxes:delete`、`manualboxes:undo`。
- `preload/index.ts` + `types.ts` 暴露对应方法，`ManualBoxDTO` 加到 `types.ts` 裁切 DTO 区（第 219 行附近，仿 `CutLineDTO`）。

### 撤销

框选撤销复用 `created_seq` 模式，`undoLastManualBox` 删该页 `created_seq` 最大的框。**与横切撤销两套独立**——撤横切不碰框，反之亦然。裁切页工具栏可在现有「撤销上一刀」按钮（`CropView.tsx:94`）旁加一个「撤销上一框」，或第一版复用「点框即删」不加撤销按钮亦可（实现模型自行决定，不强制）。

---

## 5. 实施顺序（每步独立提交、独立自测）

| 序 | 步骤 | 独立自测 |
|---|---|---|
| 1 | `schema.ts` 加 `manual_boxes` 表 + `types.ts` 加 `ManualBoxDTO` | 启动不报错，表存在 |
| 2 | `pageRepo` CRUD + `ipc/index.ts` handler + `preload` 暴露 | typecheck 过，手测 `manualboxes:add` 能写库 |
| 3 | `ColumnCropService.deriveAllSegments` + 相交纯函数 + 单测 | 7 个新单测全过 |
| 4 | `useCropData` 扩展（load/add/delete/undo + recompute 改用 deriveAllSegments） | typecheck + 现有单测不退化 |
| 5 | `CropOverlay` 框选交互 + `CropView` 工具栏加两档 | 人测：画分割框/排除框、删除、与横切共存 |
| 6 | 全量自测：typecheck + build + 单测（现有 + 7 新） | 全绿 |

第 1-4 步是数据与逻辑地基，第 5 步是最大的交互改动。先把地基做稳，再做交互——地基有单测护航，交互靠人测。

---

## 6. 红线（实现时必须遵守）

1. **比例坐标体系**：`manual_boxes` 所有坐标 0..1 比例值，与缩放/DPI 解耦。相交判定用比例坐标 AABB，**不转像素**。
2. **`deriveSegments` 纯函数一行不改**：10 个单测覆盖。框选逻辑全放新函数 `deriveAllSegments`。
3. **`segments` 表结构不变**：下游 `renderPageRegion`/`renderSegmentsAtDpi`/`composeQuestionCanvas`/`derivePreviewQuestions`/`handleFinalize` 全部无需改动。`replaceSegmentsForPage` 写入的是 `deriveAllSegments` 的合并产物，对下游透明。
4. **先写库再 state（A12）**：`addManualBox`/`deleteManualBox`/`undoLastManualBox` 一律先 IPC 写库，再刷 state，再 `recomputeSegments`。
5. **无框选页排序零变化**：`deriveAllSegments` 在该页无分割框时**逐字段等于** `deriveSegments`（含 `order_index`）。这保证纯横切页的 `(page_index, order_index)` 跨页排序逻辑（`derivePreviewQuestions`/`handleFinalize`，5.4 修复）完全不受影响。单测 1 钉死。
6. **横切与框选共存**：`toolMode` 分支隔离——`cut` 走 `onHostClick`，`box-*` 走 mousedown/move/up，两条路径不干扰。数据上 `cut_lines` 与 `manual_boxes` 两表独立，`recomputeSegments` 通过 `deriveAllSegments` 合并。
7. **白屏修复模式**：框选预览与已落框**一律用绝对定位 div**（虚线/实线边框 + 半透明背景），**不新增 canvas**。`CropOverlay` 现状全是 div 无 canvas，保持这一点即天然满足（见 `2026-07-07-workflow-whitescreen-diagnosis.md`）。
8. **排除框只减推导片段、不减分割框**（决策 B）：合并语义 `(推导 − 相交排除框) ∪ 分割框`。分割框不过排除筛，否则用户无法在排除区内框题。单测 4 钉死。
9. **旋转页**：旋转页框选坐标仍是比例坐标，旋转后矩形语义可能变（与横切同样的已有问题，不在本轮范围），但**不要让旋转页崩溃**。

---

## 7. 一句话总结

新增 `manual_boxes` 表存用户手画矩形（分割框/排除框统一形态 + `is_excluded` 标记，独立于 `segments` 避免被整页重算冲掉），新增纯函数 `deriveAllSegments` 合并「分列+横切推导片段」与「手画框」——排除框只从推导片段里减、分割框直接加，`deriveSegments` 一行不改。排序上无分割框页原样返回（红线 5），有分割框页按行优先重排（场景 B）。交互上 `ToolMode` 加 `box-split`/`box-exclude` 两档，`CropOverlay` 用绝对定位 div 做框选起止与显示。下游 `segments` 表结构不变，纯横切页入库排序零影响。九条红线守：比例坐标、deriveSegments 不动、segments 同构、先写库再 state、无框页排序零变、横切框选共存、纯 div 无 canvas、排除只减推导不减分割、旋转页不崩。
