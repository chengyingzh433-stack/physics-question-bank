# 后期处理 UX 第二轮 技术方案（高级工程师指导）

- 日期：2026-07-07
- 关联文档：`2026-07-07-postprocess-ux-issues-2.md`（问题定义，本方案的输入）、`2026-07-07-postprocess-ux-solution.md`（第一轮方案）、`2026-07-06-development-progress.md`（5.5 节）
- 文档性质：**技术指导，非实现细则**。本文定方向、划边界、点关键坑，具体代码由实现模型完成。实现前请通读第 5 节红线。
- 目标文件：`src/renderer/src/views/PostProcessView.tsx`（主战场，三问题都在此），可选 `src/main/ipc` 无改动（红线：不新增 IPC）。

---

## 0. 总体判断

三个问题都是**渲染层交互**，不触碰 IPC、主进程、数据模型、排序逻辑。这是好事——改动面收敛在一个文件里，风险可控。

实施顺序定死：**UX2-1（侧栏）→ UX2-3（缩放）→ UX2-2（撤销）**。理由：
- 侧栏是容器，后两者的控件（缩放档位、撤销按钮）都往里放，先有容器。
- 缩放比撤销简单、无状态一致性风险，先做完拿到正反馈。
- 撤销涉及"库是真值"的状态一致性，最需要小心，放最后单独攻坚。

不要三个混在一个 PR 里。每个问题独立提交、独立自测，出问题好定位。

---

## 1. UX2-1 侧栏布局

### 决策：CSS Flex 双栏，不引入新布局库

Mantine 的 `Grid`/`AppShell` 都可以，但这里用**裸 Flex 最省心**：外层一个 `display:flex` 行，左主区 `flex:1 minWidth:0`，右侧栏 `flexShrink:0 width:280`。不要用 Grid 的 12 列——它按比例分配，窄屏下侧栏会被压变形；Flex 固定宽 + 主区弹性才是"固定侧栏"的正解。

### 高度链是关键，先理清再动手

`WorkflowLayout` 的 `Outlet` 容器是 `flex:1 minHeight:0`。PostProcessView 当前根节点是 `minHeight:100%` 的普通块，随内容撑高、由外层滚动。改侧栏后**滚动责任要重新分配**：

- 根节点改为 `height:100% display:flex overflow:hidden`（吃满 Outlet 给的高度，自身不滚）。
- 左主区 `flex:1 minWidth:0 overflowY:auto`（题目列表在这里滚）。
- 右侧栏 `flexShrink:0 overflowY:auto`（侧栏内容多时自己滚，不跟着列表走）。

这一步没理清就会出现"整页一起滚、侧栏没固定"或"内层双滚动条"。实现时先把这条高度链搭好、塞占位块验证滚动行为，再填真实内容。

**注意与 IntersectionObserver 的关系**：`QuestionThumb` 的虚拟化 observer 默认 `root:null`（视口）。现在滚动容器从"页面/Outlet"变成"左主区 div"，observer 的 root 必须显式指向左主区滚动容器，否则 `isIntersecting` 判断失准、缩略图在错误时机渲染或不渲染。**这是本问题最容易漏的坑**——改滚动容器就必须把 observer 的 `root` 一起改（用 ref 把滚动容器传进 `QuestionThumb`，或用 Mantine `useScrollIntoView`/context 传递）。

### 侧栏放什么

从顶部工具栏迁入右侧栏，纵向 `Stack`：
- 已选 N（`selectedStandaloneCount`）
- 合并选中按钮
- 完成入库按钮
- 入库进度 `Progress`（入库时才显示）
- 错误 `Alert`
- 模板预览 `Select`
- 显示已删除 `Switch`
- 缩放控件（UX2-3，预留位置）
- 撤销按钮（UX2-2，预留位置）

**已删除片段区留在左主区列表末尾**——它是内容不是控件，别塞侧栏。侧栏只放开关和动作。

### 响应式退化

大屏是主场景，窄屏兜底即可。用 Mantine 的 `visibleFrom`/`hiddenFrom` 或 `useMediaQuery`：窄于某断点（如 `sm`/768px）时，侧栏退化为顶部横向工具栏（回退到接近现状的形态）。**不要为窄屏做复杂折叠抽屉**，投入产出不划算——用户明确说痛点是大屏右侧浪费。给主区一个 `minWidth`（如 480）避免侧栏把主区挤没。

### 交付验收
- 滚动列表时侧栏纹丝不动，按钮始终可点。
- 缩略图在滚动中正确懒加载（observer root 已适配）。
- 窄屏不塌、不出横向滚动条。

---

## 2. UX2-3 缩略图缩放

### 决策：方案 A（离散档位），但要做对一个关键重构

问题文档建议方案 A（侧栏档位 Select，maxW 200/360/560/800），采纳。但**当前 `QuestionThumb` 有个设计缺陷会让缩放很难受，必须顺手修掉**：

现状 `maxW` 在 `QuestionThumb` 的渲染 `useEffect` 依赖里（第 585 行）。而 `maxW` 实际只影响最后一步 `composed.style.width` 的 CSS 缩放——渲染分辨率是固定的 `maxPx:1500`。也就是说**改一次 maxW 会把整段 pdfjs 渲染+拼合流程重跑一遍，只为改个 CSS 宽度**。用户每调一次档位，所有可见缩略图重新渲染，卡顿明显。

### 关键指导：渲染分辨率与显示尺寸解耦

- **渲染**：按固定高分辨率跑一次（现有 `maxPx:1500` 逻辑不动），产出 canvas 挂载后**不再因 maxW 变化重跑**。把 `maxW` 从渲染 `useEffect` 依赖里拿掉。
- **显示**：`maxW` 只驱动已挂载 canvas 的 CSS `width/height`，用一个**独立的轻量 effect**（依赖 `maxW` + 挂载完成标志）去改 `composed.style`，或改成挂载后读 canvas 内在尺寸算 scale。这样调档位是纯 CSS 操作，瞬时、无渲染。

这个解耦是本问题的技术核心，做对了缩放丝滑，做错了就是"每次缩放全列表卡一下"。

- **上限提醒**：`scale = min(1, maxW/宽)`，且渲染 maxPx 封顶 1500。特大档 800 < 1500，够清晰；若未来想要更大档位，需同步抬高 maxPx，否则只是把有限像素放大变糊。当前 4 档不用动 maxPx。

### 控件与持久化
- 侧栏放 `Select`（小/中/大/特大）或 `SegmentedControl`。**不建议连续 Slider**——即便解耦了渲染，连续拖动仍频繁改 CSS，且离散档位对用户足够。
- `thumbMaxW` 提到 `PostProcessView` 顶层 state（默认 360），经 `QuestionCard` 透传给 `QuestionThumb`。**注意**：`QuestionCard` 当前没转发 `maxW`，要加一层 prop 透传。
- 持久化到 `app_settings`（键 `postprocess_thumb_width`），复用 T6 的 `getSetting/setSetting`。这是纯读写设置、不涉 IPC 新增，符合红线。加载时读，改档时写。

### 交付验收
- 切换档位瞬时生效，无整列表重渲染卡顿（验证：切档时控制台不应刷出 `[QuestionThumb]` 渲染日志）。
- 重进该页保留上次档位。

---

## 3. UX2-2 撤销（Ctrl+Z）

这是三者里唯一有**状态一致性风险**的。核心矛盾：现有 handler 一半是乐观更新（`handleDelete/handleRestore` 直接改本地 `segments`），一半是全量重载（`handleMerge/handleUnmerge` 调 `reloadAll`）。撤销若只反转本地 state，会与库脱节，违背 A12"库是真值"。

### 决策：逆操作走真实 IPC + 撤销后统一 reload

不要"内存快照回滚"路线（保存整个 state 快照、撤销时还原）——它绕过库、易脱节、内存大。走**逆操作路线**：

1. 每个 handler 成功写库后，往 `undoStack` push 一个**逆操作描述符**。
2. `Ctrl+Z` 弹栈、执行逆操作的**真实 IPC**、然后 `await reloadAll()` 统一校准 state。

撤销后无脑 reload 一次，牺牲一点性能换"state 永远等于库"的确定性。这个页面数据量不大，reload 成本可接受，值得。

### 逆操作描述符设计

用 discriminated union，四种：

| 原操作 | 逆操作 IPC | 描述符需携带 |
|---|---|---|
| 删除 seg | `setSegmentDeleted(id, false)` | `segId` |
| 恢复 seg | `setSegmentDeleted(id, true)` | `segId` |
| 合并 → qid | `deleteQuestion(qid)` | **合并后返回的 qid** |
| 取消合并 qid | `createQuestionWithSegments(pid, segIds, null)` | **取消前该题的 segIds** |

### 三个必须踩准的时序坑

- **合并的逆需要生成的 qid**：`createQuestionWithSegments` 返回后才有 qid，所以**push 逆操作必须在 IPC 返回之后**，不能在调用前。
- **取消合并的逆需要原 segIds**：`deleteQuestion` 一旦执行，question_segments 关系就没了。必须在**调 `deleteQuestion` 之前**先 `getQuestionSegments(qid)` 抓到 segIds 存进描述符。`handleUnmerge` 当前是无损语义（segments 仍在，只删占位 question 行），所以重新合并能完整还原——这点问题文档已确认，复用即可。
- **逆操作也要能被再撤销吗**：即 redo。**第一版不做 redo**，只做单向 undo。redo 会让栈管理复杂度翻倍，先交付 undo，用户反馈需要再加 `Ctrl+Shift+Z`。

### 快捷键注册

- 用 `@mantine/hooks` 的 `useHotkeys`（第一轮已引入该库）。
- **必须防输入框误触**：本页有模板 `Select`，焦点在输入类元素时 `Ctrl+Z` 不应触发题目撤销。`useHotkeys` 支持忽略 input/textarea 的选项，确认开启;或在 handler 里检查 `document.activeElement`。
- **忙时禁用**：`busy` 为真（合并/入库进行中）时忽略撤销，避免并发写库竞态。
- Electron renderer 无浏览器历史，`Ctrl+Z` 无系统级冲突，放心注册。

### 栈管理规则
- 深度上限 ~20，超出丢最旧（`shift`）。会话级内存，不持久化（重载后从库恢复，无"最近操作"概念）。
- **入库清空栈**：`handleFinalize` 成功后清空 `undoStack`——入库是批量写盘不可逆，撤销栈失去意义且逆操作可能指向已变化的数据。
- 侧栏放**可视化撤销按钮**（不只快捷键），栈空时 `disabled`，鼠标党也能用。按钮 tooltip 可显示"撤销：删除第 N 题"之类，但第一版做到能撤即可，文案增强可选。

### 交付验收
- 删/合并/取消合并后按 Ctrl+Z，界面与库都回到操作前，且 reload 后题号顺序正确（依赖 `derivePreviewQuestions`，未受影响）。
- 焦点在模板 Select 里按 Ctrl+Z 不误撤销。
- 入库后栈清空，撤销按钮置灰。

---

## 4. 实施顺序与提交建议

| 序 | 问题 | 独立提交 | 风险 |
|---|---|---|---|
| 1 | UX2-1 侧栏 | 是 | 中（高度链 + observer root） |
| 2 | UX2-3 缩放 | 是 | 低（需渲染/显示解耦重构） |
| 3 | UX2-2 撤销 | 是 | 中（状态一致性 + 时序） |

每步做完跑 `typecheck` + `build` + 单测（现有 36 个必须全绿，本轮不新增纯函数逻辑、单测数不变），再人测该项。撤销做完重点人测"删→撤销→再删→撤销"连续操作和"合并→撤销→取消合并→撤销"交叉场景。

---

## 5. 红线（实现时必须遵守）

1. **白屏修复模式不可回退**：`QuestionThumb` 的 `canvasMountRef` 独立空 div + `containerRef` 的解耦结构（第 588-589 行）是白屏 bug 的修复，UX2-3 改 CSS 尺寸、UX2-1 改容器都不能把 canvas 挂载点与 React 子节点重新混用。见 `2026-07-07-workflow-whitescreen-diagnosis.md`。
2. **跨页排序不可动**：`derivePreviewQuestions` 的 `(page_index, order_index)` 排序（5.4 修复）和 `handleFinalize` 的同款排序键，本轮三问题都不碰。侧栏是布局、缩放是 CSS、撤销走 IPC+reload，均不影响排序。
3. **`handleFinalize` 入库逻辑不动**：题号排序、DPI 读取、canvas 释放（第 255-256 行 A11）原样保留。撤销栈在入库成功后清空，但不改入库本身。
4. **"先写库再 state"（A12）**：撤销的逆操作必须走真实 IPC 写库，再 reload 校准。禁止纯内存回滚。
5. **IPC 契约零新增**：撤销复用 `setSegmentDeleted/deleteQuestion/createQuestionWithSegments/getQuestionSegments`，缩放持久化复用 `getSetting/setSetting`。不加任何新 `ipcMain.handle`。
6. **虚拟化不能退化**：UX2-1 改滚动容器后，`IntersectionObserver` 的 `root` 必须指向新滚动容器，且 `rootMargin:'500px 0px'` 的预加载语义保留。这是渲染竞态修复的一部分，不能因布局改动失效。
7. **渲染竞态不可回退**：`renderPageRegion` 已 await 后裁剪（RenderService 5.4 修复），本轮不碰渲染服务。

---

## 6. 一句话总结

三问题皆在 `PostProcessView.tsx` 渲染层，不触 IPC/主进程/排序/数据模型。按侧栏→缩放→撤销顺序独立实施：侧栏用 Flex 双栏、重排高度链并把虚拟化 observer 的 root 指向新滚动容器；缩放用离散档位并把渲染分辨率与显示尺寸解耦（maxW 出渲染依赖、只驱动 CSS）；撤销走"逆操作真实 IPC + 撤销后 reload"路线、注意 qid/segIds 的抓取时序与输入框防误触。七条红线守住白屏修复、跨页排序、库是真值、IPC 契约。
