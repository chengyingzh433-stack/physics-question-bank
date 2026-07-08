# 后期处理 UX 问题（第二轮）

- 日期：2026-07-07
- 关联文档：`2026-07-07-postprocess-ux-issues.md`（第一轮问题，已修复）、`2026-07-07-postprocess-ux-solution.md`（第一轮方案，已实施）、`2026-07-06-development-progress.md`（进度，5.5 节）
- 本文档目的：**记录第一轮 UX 重构 + 渲染/排序 bug 修复后，人测继续发现的 3 个 UX 问题**。本文只定义问题，不给方案——方案由高级工程师评估后另出文档（如 `2026-07-07-postprocess-ux-solution-2.md`）。

---

## 0. 背景

第一轮 UX 重构（`2026-07-07-postprocess-ux-solution.md`）已完成：片段网格 → 题目纵向列表（`Stack` + `QuestionCard`）、拼合大图（`QuestionThumb`，正确 rotation）、题号题型标注（`derivePreviewQuestions` + 模板预览）。随后修复了缩略图渲染竞态（`renderPageRegion` 未 await）和跨页排序 bug（`order_index` 是页内序号，跨页须按 `(page_index, order_index)` 排）。

修复后缩略图可见、顺序正确。但用户继续人测，发现下面 3 个**交互设计层面**的问题（非代码 bug）。

当前 `PostProcessView` 的结构（`src/renderer/src/views/PostProcessView.tsx`）：
- 顶部 `Group` 工具栏（`showDeleted` Switch / 模板预览 Select / 合并 Button / 入库 Button），`position: relative`，随页面滚动
- `Stack` 题目纵向列表（`QuestionCard × N`），`maxW=360` 硬编码
- 已删除片段区（`showDeleted` 时显示）
- 外层是 `WorkflowLayout`（全屏，顶栏 52px 步骤指示，下方 `Outlet`）

---

## 1. UX2-1：工具栏应在侧栏，而非顶部

### 现状

工具栏在页面最顶部（`PostProcessView.tsx:289-311` 的 `<Group justify="space-between" p="sm">`），与题目列表同处一个滚动流。题目列表纵向铺开后（几十道题），用户滑到中下部选中片段后，要点"合并选中"必须滚回顶部——**操作目标与操作按钮分离**，割裂。

同时题目卡 `maxW=360` 占左侧，**右侧大片空白**（大屏尤其明显），空间利用率低。

### 期望

改成**侧栏布局**：
- 左侧主区：题目纵向列表（可占满宽度或限定更宽，如 `maxW=720` 或 `100%`）
- 右侧固定侧栏（不随列表滚动）：放操作按钮（合并选中 / 完成入库）、选中信息（已选 N）、模板预览下拉、显示已删除开关、入库进度条

这样用户无论滚到哪，侧栏按钮始终可见可点。

### 涉及

- `PostProcessView.tsx`：外层 `div` 改为 `display:flex`（左主区 + 右侧栏 `flex-shrink:0 w:280`）
- 顶部工具栏 `<Group>` 拆到右侧栏 `<Stack>`/`<Card>`
- 入库 `Progress` / `Alert` 也归到侧栏
- 注意：`WorkflowLayout` 的 `Outlet` 容器是 `flex:1 minHeight:0`，侧栏布局需适配高度（侧栏自身 `overflow:auto` 或固定）

### 约束

- 移动端/窄屏可能需退化为顶部（Mantine `Grid`/`MediaQuery` 或 CSS `@media`）
- 窗口很窄时侧栏会挤压主区，需给主区 `minWidth` 或允许侧栏折叠

---

## 2. UX2-2：缺撤销操作（Ctrl+Z）

### 现状

当前操作不可撤销：
- `handleDelete`（软删除片段）：要恢复需开"显示已删除"→找到→点恢复图标，多步
- `handleMerge`（合并选中 → `createQuestionWithSegments`）：误合并后只能"取消合并"（`handleUnmerge`，删 question 行），但需在合并组 Badge 上找图标
- `handleUnmerge`（取消合并）：误取消后无法直接还原（要重新选片段再合并）

用户希望 **Ctrl+Z 撤销最近一次操作**（删/合并/取消合并），减少误操作成本。

### 期望

全局快捷键 `Ctrl+Z`（或 `Cmd+Z`）撤销最近一次后期处理操作。可考虑再加 `Ctrl+Shift+Z` / `Ctrl+Y` 重做。

### 技术考量（供方案参考，不限定）

- **操作栈**：在 `PostProcessView` 维护一个 `undoStack`（数组），每次操作前 push 一个"逆操作"描述符（如 `{type:'delete', segId:5}` → 逆操作是 `setSegmentDeleted(5,false)`）。
- **逆操作类型**：
  - 删除 → 恢复（`setSegmentDeleted(id,false)`）
  - 恢复 → 删除（`setSegmentDeleted(id,true)`）
  - 合并 `[segIds]→qid` → 取消合并（`deleteQuestion(qid)`）
  - 取消合并 `qid→[segIds]` → 重新合并（`createQuestionWithSegments(pid, segIds, null)`）
- **Ctrl+Z 注册**：`useHotkeys`（`@mantine/hooks`）或 `useEffect` 加 `keydown` 监听，限制仅在 PostProcessView 路由下生效。
- **栈深度**：限制如 20 步，避免内存膨胀。
- **入库（`handleFinalize`）不可撤销**——它是批量出图写盘，已确认弹窗。撤销栈在入库时清空。
- **持久化**：撤销栈是否跨重载？设计文档 A12"先写库再 state"，库是真值；撤销栈是会话级内存即可（重载后状态从库恢复，无"最近一次操作"概念）。建议**不持久化**。

### 涉及

- `PostProcessView.tsx`：加 `undoStack` state + `pushUndo` + `performUndo` + 快捷键注册
- 各 `handle*` 在调 IPC 后 push 逆操作描述符
- 工具栏/侧栏加"撤销"按钮（可视化，不只快捷键）

### 约束

- 撤销的逆操作必须与原操作语义对称（合并的逆是取消合并，不是"删除那个 question"——后者会留脏 segments，前者无损还原）。当前 `handleUnmerge` 已是"无损还原"语义（删 question 占位行，segments 仍在），可复用。
- Ctrl+Z 不能与浏览器/系统快捷键冲突（Electron renderer 默认无浏览器历史，应无冲突）。

---

## 3. UX2-3：缩略图大小不能缩放

### 现状

`QuestionThumb` 的 `maxW` 硬编码 `360`（`PostProcessView.tsx:451` 默认值），`QuestionCard` 调用处未传 `maxW`。用户无法调整：
- 大屏下 360px 偏小，题文看不清
- 片段很多时想缩小看全貌、片段很少时想放大看细节，都做不到

对比：裁切页 `PDFViewer` 有完整缩放（适应宽度/整页/档位 50-200%/Ctrl+滚轮锚点缩放，T4 已做）。后期处理页无任何缩放。

### 期望

后期处理页加缩略图缩放控制：
- **方案 A（轻量）**：侧栏放档位 Select（小/中/大/特大，对应 `maxW` 200/360/560/800）或滑块，存到 state 传给 `QuestionThumb`。
- **方案 B（完整）**：Ctrl+滚轮缩放（复用裁切页思路），但后期处理是多个独立 canvas 列表，锚点补偿比裁切页复杂——可能不值得。

建议**方案 A**——够用且改动小。

### 涉及

- `PostProcessView.tsx`：加 `thumbMaxW` state（默认 360），侧栏放 `Select`/`Slider`，传给 `QuestionCard` → `QuestionThumb`
- `QuestionThumb`：`maxW` 从 prop 取（已是参数，无需改签名）
- 可选：`thumbMaxW` 存 `app_settings`（复用 T6 的 `getSetting/setSetting`，键如 `postprocess_thumb_width`），跨会话保留

### 约束

- `maxW` 变化时 `QuestionThumb` 的 `useEffect` 依赖含 `maxW`（已是），会重渲染——但有虚拟化（IntersectionObserver），只重渲染可见的，性能 OK。
- 太大时单卡高度膨胀，列表变长——可接受（用户主动选择）。

---

## 4. 优先级与依赖

三个问题相互独立，可任意顺序实施。但 **UX2-1（侧栏）建议先做**——侧栏是容器，UX2-2 的撤销按钮和 UX2-3 的缩放控件都要放进侧栏，先有侧栏后两者有地方放。

若 UX2-1 暂不做，UX2-2/UX2-3 的控件可临时放顶部工具栏。

---

## 5. 红线提醒（方案设计时必须遵守）

- **白屏修复模式**：任何新 canvas 挂载点必须用独立 `canvasMountRef` 空 div，不能与 React 子节点混用（见 `2026-07-07-workflow-whitescreen-diagnosis.md`）。UX2-3 改 `maxW` 会触发 `QuestionThumb` 重渲染，挂载点逻辑不能回退。
- **跨页排序**：`derivePreviewQuestions` 的 `(page_index, order_index)` 排序不能动（5.4 修复）。UX2-1 侧栏布局不影响排序。
- **`handleFinalize` 入库逻辑**：题号排序与 `derivePreviewQuestions` 必须一致。UX2-2 撤销栈不能影响入库。
- **"先写库再 state"**（A12）：撤销栈是会话级内存，不写库；逆操作仍走 IPC 写库。
- **IPC 契约不改**：撤销/缩放都是渲染层逻辑，不新增 IPC。

---

## 6. 一句话总结

后期处理第一轮 UX 重构 + 渲染/排序 bug 修复后，剩余 3 个交互问题：工具栏改侧栏（解决滚动割裂 + 空间浪费）、加 Ctrl+Z 撤销、缩略图可缩放。三者独立，建议先做侧栏（容器），后两者控件放入侧栏。方案由高级工程师评估后另出文档。
