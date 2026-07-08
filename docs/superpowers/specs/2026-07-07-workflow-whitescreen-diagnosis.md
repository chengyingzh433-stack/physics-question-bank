# 功能性 Bug 诊断与修复指南（裁切/后期/复查白屏）

- 日期：2026-07-07
- 关联文档：`2026-07-07-completion-and-hardening-implementation.md`（实施记录）、`2026-07-06-physics-question-bank-technical-design.md`（判据 A1–A13）
- 本文档目的：**诊断用户报告的三个功能性 bug，定位根因，给出修复指南和注意点。本文不含代码改动，只做分析和方案。**

---

## 0. 用户报告的现象

1. **裁切**：点击裁切，疑似什么都没发生；横切应有虚线提示（点哪里哪里出现横虚线表示裁切线）。
2. **后期处理**：从裁切进后期处理直接白屏，什么选项都没有，卡死。
3. **原卷复查**：也什么都没发生（用户推测可能与裁切没成功有关）。
4. 导入、模板创建正常。

**关键观察**：出问题的三个视图（裁切 `/crop`、后期 `/post`、复查 `/review`）都在 `WorkflowLayout` 路由下；正常的导入、模板在 `LibraryLayout` 下。三者共用 PDF 渲染链路（`RenderService` + canvas 命令式挂载）。

---

## 1. 根因分析

### 1.1 核心根因：命令式 `innerHTML` 与 React 子节点冲突（导致白屏崩溃）

**位置**：`src/renderer/src/views/PDFViewer.tsx` 的 `PageCanvas` 组件（行 313–354）。

**问题代码**：

```tsx
// 渲染回调里（行 328-332）
const host = canvasHostRef.current
if (host) {
  host.innerHTML = ''          // ← 命令式清空 host 的所有子 DOM
  host.appendChild(result.canvas)
}

// 但同一个 host 又是 React 渲染 overlay 的容器（行 339-354）
return (
  <div ref={canvasHostRef} style={{ position: 'relative', ... }}>
    {overlay}                  // ← React 管理的子节点（CropOverlay）
  </div>
)
```

**冲突机制**：

1. `canvasHostRef` 指向的 `<div>` 既被 React 用来渲染 `{overlay}`（即 CropView 传入的 `<CropOverlay>`），又被 `renderPage` 的异步回调用 `host.innerHTML = ''` 命令式清空。
2. `host.innerHTML = ''` 会**删除 React 挂在这个 div 里的所有真实 DOM**，包括 CropOverlay 的 DOM。
3. 但 React 的虚拟 DOM（Fiber 树）仍认为 CropOverlay 的 DOM 存在。
4. 之后任何触发 React 更新/卸载 overlay 的操作——例如鼠标在 CropOverlay 上移动改 `hoverY` state、或组件卸载——React 会尝试对**已经被 innerHTML 删除的 DOM 节点**执行 `removeChild`/`insertBefore`，抛 `NotFoundError: Failed to execute 'removeChild' on 'Node'`。
5. 这个错误发生在 React commit 阶段，**无 error boundary 捕获 → 整个 React 树崩溃 → 白屏**。

**为什么这能解释全部三个现象**：

- **裁切"什么都没发生"**：CropOverlay 的 DOM 被 canvas 渲染回调的 `innerHTML=''` 清掉了。鼠标事件（onMouseMove/onClick）绑在已被删除的 DOM 上 → 落刀、hover 虚线全部失效。用户看到的就是"点了没反应、没有虚线"。
- **后期处理白屏卡死**：见 1.2。
- **复查空白**：见 1.3。

**⚠️ 需确认**：这段 `host.innerHTML=''` + `{overlay}` 的结构在本轮（T4/T5）改动前是否已存在。本轮 T4 给 PDFViewer 加了 `useLayoutEffect`（滚动补偿）和 onWheel，T5 加了 rotation 传递——这些改动**增加了 PageCanvas 的重渲染频率和 state 变化**（zoomPercent/pages 变化触发 layoutEffect + re-render），可能把一个"原本潜伏、偶发"的时序 bug 变成"稳定复现"。修复时应把这段命令式挂载与 React 子节点彻底解耦（见第 2 节）。

### 1.2 后期处理白屏的根因

**位置**：`src/renderer/src/views/PostProcessView.tsx`。

后期处理**也用同样的命令式 canvas 挂载模式**——`SegmentThumb` 组件（行 350–395）里：

```tsx
const host = hostRef.current
if (host) {
  host.innerHTML = ''        // ← 同样的命令式清空
  ...
  host.appendChild(c)
}
```

不过 `SegmentThumb` 的 host（行 390）**没有** React 子节点（`{!state.loaded && ...}` 是 React 管理的兄弟文本，但它和 canvas 在同一个 div 里）——看行 390-393：

```tsx
return (
  <div ref={hostRef} style={{...}}>
    {!state.loaded && !state.error && <Text>渲染中…</Text>}   // React 子节点
    {state.error && <Text c="red">渲染失败</Text>}            // React 子节点
  </div>
)
```

**这里同样有冲突**：`host.innerHTML = ''` 会删掉 React 渲染的 `<Text>渲染中…</Text>`，然后 `setState({ loaded: true })` 触发 re-render，React 试图移除已不存在的 `<Text>` → `NotFoundError` → 白屏。

**但更可能的直接原因**：后期处理白屏很可能是**从裁切页崩溃后带过来的**——如果裁切页已经让 React 树崩溃（1.1），SPA 的路由切换（HashRouter）不会重新初始化 React，白屏状态会延续。需要在修复 1.1 后重新验证后期处理是否独立复现。

**另一个需排查点**：`SegmentThumb` 依赖 `segments`（裁切派生的片段）。如果裁切从未成功产生 segments（因为 1.1 让裁切交互失效），后期处理 `visibleSegs` 为空 → 网格空白（但这是"空"不是"白屏卡死"，所以白屏主因还是 1.1/命令式挂载崩溃）。

### 1.3 复查空白的根因

**位置**：`src/renderer/src/views/PaperReviewView.tsx`。

复查页**不用命令式 canvas 挂载**——它用标准 `<img src="app://...">`（行 164-168）显示题图。所以它本身不会因 1.1 崩溃。

复查空白的原因是**数据链的上游为空**：
- 复查显示的是 `listQuestionsByPaper(pid)` 的结果（已入库的题目）。
- 题目由"后期处理→完成入库"产生。
- 如果裁切交互失效（1.1）→ 没有 segments → 后期处理无法入库 → 没有 questions → 复查页 `questions` 为空数组 → 网格空白。

所以复查空白是**连锁反应**，用户的推测正确。修好裁切+后期，复查自然有数据。

### 1.4 横切虚线提示的现状

用户希望"点哪里哪里出现横虚线"。**代码里其实已实现**——`CropOverlay.tsx`：
- 跟随光标的示意线（行 217-230）：`toolMode === 'cut' && hoverY !== null` 时画黄色虚线。
- 已落横切线（行 167-199）：sky 色实线。
- 落刀高亮动画（行 201-215）：黄色闪一下。

**但因为 1.1，CropOverlay 的 DOM 被 canvas 回调清掉了**，这些视觉元素虽然在 React 虚拟 DOM 里，却没有真实 DOM 承载（或渲染后立即被 innerHTML 清除）。所以用户看不到虚线。**修好 1.1 后虚线提示应自动恢复**。

若修好后虚线仍不明显，可作为体验优化：加粗虚线、提高对比度（当前是 `rgba(255,200,0,0.9)` 1px 虚线，在深色 PDF 背景上可能不够显眼）。

---

## 2. 修复指南

### 2.1 核心修复：解耦命令式 canvas 挂载与 React 子节点

**原则**：一个 DOM 节点，要么完全交给 React 管理，要么完全交给命令式代码管理，**绝不混用**。

下面给出**可直接照着改**的 before/after。执行者按此落地即可，不需要再设计。

---

#### 改动 A：`PDFViewer.tsx` 的 `PageCanvas` 组件

**问题**：`canvasHostRef` 这个 div 同时被 `host.innerHTML=''`（命令式）和 `{overlay}`（React）使用。

**改法**：新增一个**canvas 专用的空子 div**（`canvasMountRef`），命令式代码只操作它；`{overlay}` 留在外层相对定位 div 里，与 canvas 挂载点做兄弟。

**Before（现状，行 ~294-355）**：

```tsx
function PageCanvas(props: {...}): React.JSX.Element {
  const { doc, pageIndex, state, pageId, overlay } = props
  const canvasHostRef = useRef<HTMLDivElement>(null)
  ...
  // 渲染 useEffect 里（行 328-332）
  const host = canvasHostRef.current
  if (host) {
    host.innerHTML = ''
    host.appendChild(result.canvas)
  }
  ...
  return (
    <div
      data-page-id={pageId}
      style={{ width: state.widthCss, height: state.heightCss, position: 'relative', ... }}
      ref={canvasHostRef}          // ← host 同时挂 canvas 和 overlay
    >
      {overlay}
    </div>
  )
}
```

**After（目标）**：

```tsx
function PageCanvas(props: {...}): React.JSX.Element {
  const { doc, pageIndex, state, pageId, overlay } = props
  const canvasMountRef = useRef<HTMLDivElement>(null)   // ← 新增：canvas 专用挂载点
  ...
  // 渲染 useEffect 里：把 canvasHostRef 全部改成 canvasMountRef
  const mount = canvasMountRef.current
  if (mount) {
    mount.innerHTML = ''
    mount.appendChild(result.canvas)
  }
  ...
  return (
    <div
      data-page-id={pageId}
      style={{ width: state.widthCss, height: state.heightCss, position: 'relative',
               margin: '0 auto 12px', background: '#fff',
               boxShadow: '0 2px 8px rgba(0,0,0,0.4)', borderRadius: 'var(--mantine-radius-xs)' }}
      // ← 注意：这个外层 div 不再有 ref
    >
      {/* canvas 专用挂载点：React 永不放子节点，命令式代码独占 */}
      <div ref={canvasMountRef} style={{ position: 'absolute', inset: 0 }} />
      {/* overlay 作为兄弟，React 管理，靠自身 position:absolute;inset:0 覆盖在 canvas 上 */}
      {overlay}
    </div>
  )
}
```

**要点**：
1. `canvasHostRef` 更名为 `canvasMountRef`（或保留原名，只要把它指向新的空子 div 即可）——渲染 useEffect 里所有 `canvasHostRef.current` 同步改。
2. 外层 `data-page-id` 的相对定位 div **去掉 ref**，尺寸样式保持不变（`width/height=state.widthCss/heightCss`）。
3. canvas 挂载点和 overlay 都用 `position:absolute; inset:0` 覆盖满外层 div，天然重叠。canvas 在下、overlay 在上（DOM 顺序决定层级，overlay 在后即在上；如层级不对可给 overlay 容器加 `zIndex`，但 CropOverlay 内部子元素已有 zIndex，通常不需要）。
4. **z 轴与事件**：CropOverlay 根节点是 `position:absolute; inset:0`，会盖住 canvas。裁切时需要接收鼠标事件（正确）；但**非裁切页（如后期处理不传 overlay）**时 overlay 为 `undefined`，不渲染，canvas 正常显示——无影响。

---

#### 改动 B：`PostProcessView.tsx` 的 `SegmentThumb` 组件

**问题**：`hostRef` 这个 div 同时被 `host.innerHTML=''`（命令式挂 canvas）和 React 的 `<Text>渲染中…</Text>` / `<Text>渲染失败</Text>` 使用。

**改法**：同 A——canvas 挂到独立空子 div，状态文本作为兄弟节点由 React 管理。

**Before（现状，行 ~350-394）**：

```tsx
function SegmentThumb(props: {...}): React.JSX.Element | null {
  const { doc, segment, pages } = props
  const hostRef = useRef<HTMLDivElement>(null)
  ...
  // useEffect 里（行 372-381）
  const host = hostRef.current
  if (host) {
    host.innerHTML = ''
    const c = result.canvas
    ...
    host.appendChild(c)
  }
  ...
  return (
    <div ref={hostRef} style={{ minHeight: 60, background: ..., borderRadius: ... }}>
      {!state.loaded && !state.error && <Text size="xs" c="dimmed" p="xs">渲染中…</Text>}
      {state.error && <Text size="xs" c="red" p="xs">渲染失败</Text>}
    </div>
  )
}
```

**After（目标）**：

```tsx
function SegmentThumb(props: {...}): React.JSX.Element | null {
  const { doc, segment, pages } = props
  const canvasMountRef = useRef<HTMLDivElement>(null)   // ← 只给 canvas 用
  ...
  // useEffect 里：hostRef.current 改成 canvasMountRef.current
  const mount = canvasMountRef.current
  if (mount) {
    mount.innerHTML = ''
    const c = result.canvas
    const maxW = 172
    const scale = Math.min(1, maxW / c.width)
    c.style.width = `${c.width * scale}px`
    c.style.height = `${c.height * scale}px`
    mount.appendChild(c)
  }
  ...
  return (
    <div style={{ minHeight: 60, background: 'var(--mantine-color-gray-1)',
                  borderRadius: 'var(--mantine-radius-sm)', position: 'relative' }}>
      {/* canvas 专用挂载点 */}
      <div ref={canvasMountRef} />
      {/* 状态文本：React 管理，与 canvas 挂载点做兄弟 */}
      {!state.loaded && !state.error && <Text size="xs" c="dimmed" p="xs">渲染中…</Text>}
      {state.error && <Text size="xs" c="red" p="xs">渲染失败</Text>}
    </div>
  )
}
```

**要点**：
1. `hostRef` → `canvasMountRef`，指向新的空子 div，useEffect 内同步改名。
2. 外层 div 去掉 ref，加 `position: relative`（保持缩略图容器样式其余不变）。
3. 状态文本和 canvas 挂载点同为外层 div 的子节点（兄弟），互不干扰。canvas 加载完后状态文本消失（React 卸载它，不再碰 canvas 挂载点）。

---

#### 为什么这样改能根治

`innerHTML=''` 之后只清空 canvas 专用子 div，该 div **没有任何 React 子节点**，所以 React 的 Fiber 树和真实 DOM 不再冲突。overlay / 状态文本由 React 独占管理，命令式代码碰不到。两套机制各管各的 DOM 子树。

**注意（红线）**：CropOverlay 内部用 `hostRef.getBoundingClientRect()` 做坐标换算（A4）。改结构后 CropOverlay 覆盖的是外层相对定位 div（`width: state.widthCss`），**尺寸与改动前完全一致**，坐标数学不受影响。但这是红线，**改完必须重测缩放落线（A4）和重启还原（A12）**。


### 2.2 修复后的验证顺序

必须**按依赖顺序**验证，因为后期/复查依赖裁切：

1. **先修 2.1 的 PageCanvas**，验证裁切：
   - 切列、拖分隔线正常
   - **横切模式点击落刀 → 出现 sky 色横线**
   - **横切模式移动鼠标 → 跟随光标的黄色虚线**（用户要的功能）
   - 缩放到 50%/200% 落线不错位（A4 回归）
   - 重启应用，线精确还原（A12 回归）
3. **再修 SegmentThumb**，验证后期处理：
   - 缩略图正常显示（不白屏）
   - 软删除/恢复/多选合并正常
   - 完成入库 → 进度条 → 成功
4. **最后验证复查**（应自动有数据）：
   - 入库后题目卡片显示题图
   - 题型/章节/难度/知识点可改

### 2.3 T4/T5 回归重点

因为白屏可能是 T4/T5 改动**放大**了这个 bug，修复后要专门确认 T4/T5 本身没引入其他问题：

- **T4 光标锚点缩放**：Ctrl+滚轮缩放，光标下内容不动（本身可能正常，但要确认 `useLayoutEffect` 里读 `scrollRef` 的 `getBoundingClientRect` 不会在 overlay 崩溃后抛错）。
- **T5 rotation**：`computePageState` 读 `page.rotation ?? 0`。确认普通（未旋转）PDF 的 rotation 是 0，渲染正常。**排查点**：如果 `page.rotation` 因为某种原因是 `undefined` 或 `NaN`，传给 `renderPage` 的 `getViewport({ rotation })` 可能出错。已用 `?? 0` 兜底，但要确认 DTO 里 rotation 确实有值（老库迁移后是 0，新导入是 page.rotate）。

### 2.4 建议加 Error Boundary（防御性）

当前没有 error boundary，任何一个视图的渲染错误都会白屏整个应用。建议在 `WorkflowLayout` 的 `<Outlet />` 外或 App 顶层加一个 React Error Boundary，捕获后显示"页面出错"而非白屏，并打印错误栈——这样即使以后再有类似 bug，也能看到错误信息而非白屏，大幅降低 debug 难度。

---

## 3. 排查清单（给修复者）

修复前先确认根因，用浏览器 DevTools（dev 模式按 F12）：

1. **打开裁切页，看 Console**：
   - 若有 `NotFoundError: Failed to execute 'removeChild'/'insertBefore' on 'Node'` → 确认 1.1 根因。
   - 若有其他错误 → 按错误栈定位。
2. **看 Elements 面板**：进裁切页后，找 `[data-page-id]` 的 div，看它里面是 canvas 还是 CropOverlay，还是两者交替出现/消失。
3. **确认裁切是否产生 segments**：裁切后切到 Console 跑 `await window.api.getSegmentsByPage(pageId)`，看是否有派生片段。若有 → 说明底层逻辑正常，纯前端渲染问题；若无 → 还要查 deriveSegments/IPC。
4. **后期白屏时看 Console**：确认是"崩溃错误"还是"空数据"（空数据是正常空网格，不是白屏）。

---

## 4. 涉及文件

| 文件 | 问题 | 修复动作 |
|---|---|---|
| `src/renderer/src/views/PDFViewer.tsx` | PageCanvas 命令式 `innerHTML` 清掉 React overlay（1.1） | canvas 独立容器，overlay 移为兄弟节点（2.1） |
| `src/renderer/src/views/PostProcessView.tsx` | SegmentThumb 同样冲突（1.2） | 状态提示移出 hostRef，或 canvas 独立容器 |
| `src/renderer/src/views/CropOverlay.tsx` | 虚线提示已实现，但被 1.1 清除（1.4） | 不改逻辑；修好 1.1 后自动恢复。可选：加粗虚线提高可见度 |
| `src/renderer/src/views/PaperReviewView.tsx` | 空白是数据链连锁反应（1.3） | 不改；修好裁切+后期后自动有数据 |
| `src/renderer/src/App.tsx` 或 `WorkflowLayout.tsx` | 无 error boundary（2.4） | 建议加 Error Boundary 防白屏 |

---

## 5. 注意点（红线提醒）

- **CropOverlay 坐标数学是红线**（A4/A13）。2.1 改 PageCanvas 结构时，CropOverlay 的 `hostRef.getBoundingClientRect()` 换算依赖它覆盖的容器尺寸——改结构后**必须重测缩放落线不错位、重启精确还原**。
- **"先写库再更新 state"是红线**（A12，`useCropData`）。本次 bug 不涉及这条，别动 useCropData。
- 修复应**只动渲染层的 DOM 挂载方式**，不动 IPC 契约、不动 deriveSegments、不动坐标换算。
- 修复后跑全套验证：`npm run typecheck` + `npm run build` + `npm test`，再做第 2.2 节的人工走查。

---

## 6. 验收 Checklist（执行者改完逐条勾）

改动只涉及改动 A（PDFViewer）+ 改动 B（PostProcessView），可选加 Error Boundary（2.4）。逐条验证：

**自动验证**：
- [ ] `npm run typecheck` node + web 两段全过
- [ ] `npm run build` 三段成功
- [ ] `npm test` 28 单测全绿（本次不动纯逻辑，应无变化）

**裁切页（改动 A）**：
- [ ] 打开裁切页不白屏，Console 无 `NotFoundError`
- [ ] PDF 正常渲染显示
- [ ] 切 1/2/3 列，分隔线出现、可拖动、clamp 到相邻不越界（A13）
- [ ] 横切模式：移动鼠标出现**跟随光标的黄色虚线**（用户明确要的）
- [ ] 横切模式：点击落刀出现 **sky 色横线**，且短暂黄色高亮
- [ ] 点已落横线可删除
- [ ] **缩放 50%/200% 后落线，线落在光标处不错位**（A4 回归，红线）
- [ ] **关掉应用重启，所有分隔线/横切线精确还原**（A12 回归，红线）
- [ ] Ctrl+滚轮缩放，光标下内容基本不动（T4 回归）

**后期处理页（改动 B）**：
- [ ] 从裁切进入后期处理不白屏
- [ ] 片段缩略图正常显示（不是"渲染中…"卡住，也不是白屏）
- [ ] 软删除 / 恢复 / 显示已删除开关正常
- [ ] 多选 ≥2 片段合并、取消合并正常
- [ ] 完成入库：确认弹窗 → 进度条 → 成功 toast

**复查页（连锁，应自动恢复）**：
- [ ] 入库后进复查页，题目卡片显示题图（`app://` 图片）
- [ ] 题型/章节/难度可改，知识点 Chip 可多选

**若加了 Error Boundary（2.4）**：
- [ ] 故意制造一个渲染错误，确认显示"页面出错"而非白屏

---

## 7. 一句话总结

三个 bug 同源：**PDFViewer 的 PageCanvas 用 `host.innerHTML=''` 命令式清空一个同时被 React 用来渲染 `{overlay}` 的 div，导致 React 操作已删除的 DOM 而崩溃白屏**。裁切交互失效（overlay DOM 被清）→ 无 segments → 后期无数据/同样崩溃 → 复查无题目。修复核心是**把命令式 canvas 挂载点和 React 子节点解耦成两个独立的兄弟 div**（改动 A + 改动 B，含完整 before/after 代码见第 2.1 节）。T4/T5 的改动可能是把这个潜伏 bug 从偶发变成稳定复现的推手，修复后需回归 T4/T5。
