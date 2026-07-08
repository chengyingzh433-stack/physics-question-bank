# 后期处理 UX 重构技术方案

- 日期：2026-07-07
- 关联文档：`2026-07-07-postprocess-ux-issues.md`（问题定义）、`2026-07-06-development-progress.md`（进度）、`2026-07-06-physics-question-bank-technical-design.md`（技术设计，M3/M5）
- 本文档目的：**针对后期处理的 3 个 UX 问题给出可直接落地的技术方案，含数据模型、组件结构、完整代码骨架、验证清单。执行者照此实现即可。**

---

## 0. 方案总纲

三个问题（UX-1 纵向排列、UX-2 显示内容、UX-3 题号题型）**共同指向一次 PostProcessView 的整体重构**——从"技术导向的片段网格"改为"用户导向的题目列表"。

核心思路：**把"片段（segment）"视图转成"题目（question）"视图**。用户看到的应是一个个"题目卡"，每张卡从上到下纵向排列，卡上显示大图 + 题号 + 题型。合并只是把多个片段归到一张题目卡里。

关键设计决策：**引入"预览题目"（preview question）的概念**——在后期处理阶段，把当前 segments + 已有合并关系，实时推导成一个"如果现在入库会得到的题目列表"。这个列表就是 UI 的数据源，天然解决三个问题：
- 纵向排列（UX-1）：题目按推导出的题号从上到下排
- 显示内容（UX-2）：每张题目卡渲染其所有片段拼成的大图
- 题号题型（UX-3）：题号来自推导序号，题型来自模板套用（可选）

---

## 1. 数据模型：PreviewQuestion 推导

### 1.1 定义一个纯函数 `derivePreviewQuestions`

**新增文件**：`src/renderer/src/services/PostProcessService.ts`（纯函数，可单测）

输入：
- `segments: SegmentDTO[]`（该试卷所有未删除片段，按 order_index 排序）
- `segToQuestion: Record<number, number>`（片段→已有 question id 映射，来自合并操作）
- `questions: QuestionDTO[]`（已有的 question 行，主要是合并组）

输出：`PreviewQuestion[]`

```ts
export interface PreviewQuestion {
  // 稳定 key：已有 question 用 `q{id}`，未合并独立片段用 `s{segId}`
  key: string
  // 预览题号（从 1 递增，按视觉顺序）
  previewNumber: number
  // 组成这道题的片段（按 merge_order 或 order_index 排序）
  segments: SegmentDTO[]
  // 已有 question id（合并组有，独立片段为 null）
  questionId: number | null
  // 是否合并组
  isMerged: boolean
}
```

**推导算法**：

```ts
export function derivePreviewQuestions(
  segments: SegmentDTO[],
  segToQuestion: Record<number, number>,
  questions: QuestionDTO[]
): PreviewQuestion[] {
  // 1. 过滤未删除片段，按 order_index 升序
  const live = segments
    .filter((s) => !s.is_deleted && s.id !== undefined)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  // 2. 按"归属"分组：同一 questionId 的片段归一组；无 questionId 的各自独立
  //    用 Map 保持首次出现顺序（即视觉顺序）
  const groups = new Map<string, SegmentDTO[]>()
  for (const s of live) {
    const qid = segToQuestion[s.id!]
    const key = qid !== undefined ? `q${qid}` : `s${s.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  // 3. 转 PreviewQuestion，previewNumber 按分组出现顺序从 1 递增
  const qById = new Map(questions.map((q) => [q.id, q]))
  let n = 1
  const result: PreviewQuestion[] = []
  for (const [key, segs] of groups) {
    const qid = key.startsWith('q') ? Number(key.slice(1)) : null
    result.push({
      key,
      previewNumber: n++,
      segments: segs,
      questionId: qid,
      isMerged: qid !== null && (qById.get(qid)?.is_merged ?? 0) === 1
    })
  }
  return result
}
```

**注意**：合并组的排序位置取"组内第一个片段的 order_index"。因为步骤 1 已按 order_index 排序，步骤 2 的 Map 按首次出现插入，所以合并组自然排在其第一个片段应在的位置。这与"完成入库"时 `qOrders.sort((a,b) => a.order - b.order)` 的逻辑一致（`handleFinalize` 里 order 取 `segs.reduce(min order_index)`）。

**单测**（新增 `PostProcessService.test.ts`）：
- 3 个独立片段 → 3 道题，题号 1/2/3
- 2 片段合并 + 1 独立 → 2 道题（合并组题号按位置）
- 已删除片段不计入
- 合并组排在其首片段的位置

### 1.2 题型推导（UX-3，可选增强）

题型来自模板。在 PostProcessView 加一个可选的"套用模板"下拉（复用 PaperReviewView 的模式）：

```ts
// 用 previewNumber 当 order_in_paper 跑 applyTemplate
const typeResults = applyTemplate(
  previewQuestions.map((pq) => ({ id: pq.previewNumber, order_in_paper: pq.previewNumber })),
  rules
)
// typeResults[i].typeId → 用 types 查名字显示
```

**注意**：这里 `applyTemplate` 的入参 `id` 用 `previewNumber` 占位（因为独立片段还没有 questionId）。结果只用于**显示**，不写库——真正写库在"完成入库"后的复查环节。

---

## 2. UX-1：纵向排列

### 现状

`PostProcessView.tsx:296` 用 `<SimpleGrid cols={{base:2,sm:3,md:4,lg:5,xl:6}}>` 铺满片段。

### 方案

改为 `<Stack>`（Mantine 纵向布局），每个 `PreviewQuestion` 渲染一张占满宽度的"题目卡"（`QuestionCard`）。

```tsx
<Stack gap="md" p="md">
  {previewQuestions.map((pq) => (
    <QuestionCard
      key={pq.key}
      preview={pq}
      doc={doc}
      pages={pages}
      typeName={typeNameFor(pq)}      // UX-3
      selected={selected}
      onToggleSelect={toggleSelect}
      onDelete={handleDelete}
      onUnmerge={handleUnmerge}
    />
  ))}
</Stack>
```

**题目卡内部布局**（横向：左图右信息，或上图下信息）：
- 大缩略图（UX-2）
- 顶部标注条：`第 {previewNumber} 题` + 题型 Badge（UX-3）
- 合并组显示各片段 + "取消合并"按钮
- 独立片段显示"删除"/多选 Checkbox

### 约束

- `selected`/`toggleSelect` 多选合并逻辑保留：多选现在选的是"独立片段"（`PreviewQuestion` 里 `questionId===null` 的），合并后它们归一组。
- 合并按钮的 `handleMerge` 逻辑基本不变（仍调 `createQuestionWithSegments`），但传入的 segIds 来自选中的独立片段。

---

## 3. UX-2：显示裁切内容

### 现状问题

1. 缩略图 `maxW=172px` 太小
2. `SegmentThumb` 硬编码 `rotation: 0`
3. 一道合并题的多个片段没有拼在一起显示

### 方案

**方案 A（推荐）：题目卡渲染"整道题"的拼合图**

新组件 `QuestionThumb`，渲染一个 `PreviewQuestion` 的所有片段——复用已有的 `composeQuestionCanvas`（`QuestionRenderService.ts`）逻辑思路，但用低 DPI 预览版：

```tsx
function QuestionThumb(props: {
  doc: PdfDocument
  preview: PreviewQuestion
  pages: PageWithRotation[]     // ← 需含 rotation
  maxW?: number                 // 默认 360，比原来的 172 大一倍
}): React.JSX.Element {
  const canvasMountRef = useRef<HTMLDivElement>(null)
  ...
  useEffect(() => {
    // 对 preview.segments 逐个 renderPageRegion（传正确 rotation），
    // 再纵向拼接到一个 canvas（同 composeQuestionCanvas 的居中拼接逻辑）
    // 挂到 canvasMountRef（白屏修复后的独立挂载点模式）
  }, [依赖 preview.segments 的坐标 + maxW])
  ...
}
```

**关键修复点**：
1. **rotation**：`pages` prop 扩展为含 `rotation` 字段。`reloadAll` 里 `setPages` 时带上 `p.rotation`（`getPages` 返回的 PageDTO 已有 rotation，T5 加的）。`renderPageRegion` 传 `{ rotation: page.rotation ?? 0 }`。
2. **尺寸**：`maxW` 从 172 → 360（或占满卡片宽度）。相应 `maxPx` 可提到 1500。
3. **多片段拼合**：合并题的多个片段纵向拼一张图，用户一眼看到完整题目。

**方案 B（改动小）：只放大单片段缩略图 + 修 rotation**

如果不想引入拼合，至少：
- `SegmentThumb` 的 `maxW: 172` → `360`
- `pages` prop 加 rotation，`renderPageRegion` 传 `rotation: page.rotation ?? 0`
- 合并组的片段仍各自显示（不拼合）

**推荐方案 A**——它同时服务 UX-1（题目卡）和 UX-3（题目粒度标注），三个问题一次解决。

### reloadAll 改动（两个方案都需要）

```ts
// 当前（行 69）丢弃了 rotation：
setPages(pgs.map((p) => ({ id: p.id, page_index: p.page_index, width_pt: p.width_pt ?? 0, height_pt: p.height_pt ?? 0 })))
// 改为保留 rotation：
setPages(pgs.map((p) => ({ id: p.id, page_index: p.page_index, width_pt: p.width_pt ?? 0, height_pt: p.height_pt ?? 0, rotation: p.rotation ?? 0 })))
```

对应 `pages` state 类型和 SegmentThumb/QuestionThumb 的 `pages` prop 类型都加 `rotation: number`。

---

## 4. UX-3：显示题号和题型

### 题号

来自 `PreviewQuestion.previewNumber`（第 1 节推导）。直接显示 `第 {previewNumber} 题`。

### 题型

两级方案：

**级别 1（先做，改动小）**：显示已有 `question.type_id` 对应的题型名。合并组若已设 type_id 就显示。大部分独立片段此时 type_id 为 null，显示"未定"。

**级别 2（增强，UX-3 完整体验）**：在 PostProcessView 顶部工具栏加"套用模板"下拉（复用 PaperReviewView 代码），选中模板后用 `applyTemplate` + `previewNumber` 实时推导每道题的题型，**仅显示不写库**。这样处理时就能看到"第1题·单选题"，与最终复查一一对应。

**题型名查询**：`reloadAll` 里加载 `types`（`window.api.listQuestionTypes()`），构造 `Map<typeId, name>`。

```ts
const [types, setTypes] = useState<QuestionTypeDTO[]>([])
// reloadAll 里：
setTypes(await window.api.listQuestionTypes())
// 显示：
const typeName = typeId != null ? typeMap.get(typeId) ?? '未知' : '未定'
```

### 标注 UI

题目卡顶部一条：

```tsx
<Group justify="space-between">
  <Badge color="sky" variant="filled">第 {pq.previewNumber} 题</Badge>
  <Badge color={typeName === '未定' ? 'gray' : 'teal'} variant="light">{typeName}</Badge>
  {pq.isMerged && <Badge color="orange" variant="light">合并</Badge>}
</Group>
```

---

## 5. 组件结构总览（重构后）

```
PostProcessView
├── 顶部工具栏
│   ├── Switch 显示已删除
│   ├── Button 合并选中（≥2 独立片段）
│   ├── Select 套用模板（UX-3 级别2，可选）
│   └── Button 完成入库
├── Progress 入库进度
├── Alert 错误
└── Stack（纵向，UX-1）
    └── QuestionCard × N（每个 PreviewQuestion 一张）
        ├── 标注条：第X题 + 题型 Badge + 合并 Badge（UX-3）
        ├── QuestionThumb（拼合大图，UX-2）
        └── 操作区：Checkbox 多选 / 删除 / 取消合并
```

**保留不变的逻辑**：
- `handleDelete`/`handleRestore`（软删除）
- `handleMerge`（合并，segIds 来源改为选中的独立片段）
- `handleUnmerge`（取消合并）
- `handleFinalize`（完成入库，整段不动——它已按 order_index 推题号，与 previewNumber 一致）

**已删除片段的显示**：`showDeleted` 开关打开时，额外渲染已删除片段（可放在列表末尾或原位置置灰），保留恢复按钮。

---

## 6. 实施步骤（建议顺序）

1. **新增 `PostProcessService.ts`** + `derivePreviewQuestions` 纯函数 + 单测。先把数据推导跑通，不碰 UI。
2. **改 `reloadAll`**：pages 带 rotation，加载 types。
3. **UX-2 先行**：新建 `QuestionThumb` 组件（拼合渲染 + 正确 rotation + 放大），用白屏修复后的独立挂载点模式（`canvasMountRef`）。
4. **UX-1 布局**：`SimpleGrid` → `Stack`，渲染 `QuestionCard`。
5. **UX-3 标注**：题目卡加题号+题型 Badge（级别1）。
6. **UX-3 增强**（可选）：加套用模板下拉（级别2）。
7. 全套验证。

---

## 7. 涉及文件

| 文件 | 改动 |
|---|---|
| `src/renderer/src/services/PostProcessService.ts` | **新增**：`derivePreviewQuestions` 纯函数 |
| `src/renderer/src/services/PostProcessService.test.ts` | **新增**：推导单测 |
| `src/renderer/src/views/PostProcessView.tsx` | 重构：Stack 布局 + QuestionCard + QuestionThumb + types 加载 + reloadAll 带 rotation |
| `src/renderer/src/services/QuestionRenderService.ts` | 可复用 `composeQuestionCanvas` 思路（低 DPI 预览版可新增函数或参数化） |
| `src/renderer/src/services/RenderService.ts` | 不改签名，QuestionThumb 传正确 rotation |

**IPC 契约不改**——`listQuestionTypes`/`listTemplates`/`listRules`/`applyTemplate` 都已存在。

---

## 8. 红线与约束

- **白屏修复模式必须遵守**：QuestionThumb 的 canvas 必须挂到独立的 `canvasMountRef` 空 div，不能和 React 子节点混用（见 `2026-07-07-workflow-whitescreen-diagnosis.md`）。
- **`deriveSegments` 纯函数不动**——裁切派生逻辑锁定。`derivePreviewQuestions` 是新函数，只读不写。
- **`handleFinalize` 入库逻辑不动**——previewNumber 的推导必须与它的题号逻辑一致（都按 order_index 排序，合并组取组内最小 order_index）。这是**一致性红线**：UI 预览的题号必须等于入库后的真实题号，否则用户在后期处理看到"第3题"，入库后变成"第4题"，就失去了"一一对应"的意义。
- **"先写库再更新 state"**：套用模板（UX-3 级别2）在后期处理阶段**只显示不写库**，不违反 A12（因为没写库操作）。真正写题型在复查环节。
- **性能**：题目卡放大 + 拼合渲染，片段多时 canvas 开销增大。保留 IntersectionObserver 虚拟化思路（可给 QuestionThumb 也加可见性懒渲染）。canvas 用完 `width=height=0` 释放（A11）。

---

## 9. 验证清单

**自动**：
- [ ] `npm run typecheck` 全过
- [ ] `npm run build` 全过
- [ ] `npm test`：原 28 单测 + 新增 `derivePreviewQuestions` 单测全过

**人测（后期处理页）**：
- [ ] 片段/题目**纵向从上到下排列**，顺序与试卷一致（UX-1）
- [ ] 每道题的**缩略图够大、内容清晰可辨**（能看清题文/公式）（UX-2）
- [ ] 旋转页的片段渲染**正立不错位**（UX-2 rotation 修复）
- [ ] 合并题的多个片段**拼成一张完整题图**（UX-2 方案A）
- [ ] 每道题显示**第X题 + 题型**标注（UX-3）
- [ ] （若做级别2）选模板后题型实时更新，不写库
- [ ] **预览题号 == 入库后真实题号**（一致性红线：入库后进复查页对比）
- [ ] 软删除/恢复/多选合并/取消合并功能正常
- [ ] 完成入库 → 进度条 → 复查页题目与后期处理预览一一对应

---

## 10. 一句话总结

把 PostProcessView 从"片段网格"重构为"题目列表"：新增 `derivePreviewQuestions` 纯函数，把 segments+合并关系实时推导成"预览题目"列表（题号与入库逻辑严格一致），UI 用 Stack 纵向排列题目卡（UX-1），每卡渲染拼合大图（UX-2，含 rotation 修复），卡上标注题号+题型（UX-3，题型可选接模板）。改动集中在 PostProcessView + 一个新纯函数，不碰 IPC 契约、不碰裁切派生、不碰入库逻辑，遵守白屏修复的挂载点模式。
