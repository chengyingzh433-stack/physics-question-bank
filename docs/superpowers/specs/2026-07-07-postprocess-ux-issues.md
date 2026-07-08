# 后期处理 UX 问题清单（供高级工程师评估技术方案）

- 日期：2026-07-07
- 来源：首次人测发现
- 关联文档：`2026-07-06-development-progress.md`（第 5.3 节）、`2026-07-06-physics-question-bank-technical-design.md`（技术设计，M3 后期处理模型）
- 本文档目的：**把人测发现的 3 个 UX 问题完整呈现给高级工程师，含业务场景、现状代码分析、问题本质、改动约束。本文不含技术方案，只做问题定义。**

---

## 0. 业务背景

这个系统的工作流是：**导入 PDF → 裁切（分列+横切派生片段）→ 后期处理（删不要的、合并该合的、入库）→ 复查（赋题型/标签）→ 入库→ 组卷→ 导出**。

后期处理（M3）是**用户第一次看到裁切产物的环节**——他们需要逐个判断每个片段是否是一道完整的题、哪些片段应该合并、哪些是垃圾（如页眉页脚/题目中间误切的多余部分）。**这是整个工作流中人工判断最密集的环节**。

---

## 1. 问题 UX-1：片段应纵向排列，而非平面网格

### 用户反馈

> "每个题是平面排列的，但其实作为题目处理来讲，依次纵向排列是最好的"

### 现状代码

`PostProcessView.tsx` 第 296 行：

```tsx
<SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }} spacing="sm">
  {visibleSegs.map((s) => (
    <Card key={id} ...>
      <SegmentThumb ... />
      ...
    </Card>
  ))}
</SimpleGrid>
```

当前用 `SimpleGrid` 做多列自适应网格（最多 6 列），片段按网格铺满。

### 为什么这是个问题

物理试卷的题目天然是**从上到下纵向排列**的。裁切派生的 segments 按 `order_index` 排序（`deriveSegments` 保证从上到下、从左到右的顺序）。当这些片段被铺成 6 列网格时：
- 用户必须**跳来跳去**才能追踪"第1题在哪、第2题在哪"
- 合并操作需要多选**连续的片段**，但网格布局下连续片段散在不同行不同列，选择困难
- 纵向列表天然保持"从上到下"的试卷顺序，与裁切时的视觉顺序一致

### 改动方向

把 `SimpleGrid` 改为**单列纵向列表**（或窄列如 1-2 列），片段按 `order_index` 从上到下排列。每个片段/合并组占一整行，内部可横向展示缩略图+操作按钮。

### 约束

- `visibleSegs` 的排序逻辑不变（已按 `order_index` 排好）
- 多选合并操作必须继续可用
- 软删除/恢复操作不变

---

## 2. 问题 UX-2：片段缩略图看不到裁切内容

### 用户反馈

> "处理裁切完成的题目时，具体的裁切内容不显示，这样我怎么知道哪些是需要的，哪些是不需要的呢？"

### 现状代码

`PostProcessView.tsx` 的 `SegmentThumb` 组件（行 350-395）：

```tsx
function SegmentThumb(props: { doc, segment, pages }): React.JSX.Element | null {
  ...
  renderPageRegion(
    doc, page.page_index,
    { x0: segment.x_start_ratio, x1: segment.x_end_ratio,
      y0: segment.y_start_ratio, y1: segment.y_end_ratio },
    { rotation: 0, widthPt: page.width_pt, heightPt: page.height_pt, maxPx: 1000 }
  ).then(({ result, cancel, done }) => {
    const c = result.canvas
    const maxW = 172                    // ← 缩略图最大宽度 172px
    const scale = Math.min(1, maxW / c.width)
    c.style.width = `${c.width * scale}px`
    c.style.height = `${c.height * scale}px`
    mount.appendChild(c)
  })
  ...
}
```

`renderPageRegion` 调用 `RenderService` 的区域渲染接口，传入 `segment` 的比例坐标（`x_start_ratio` 等）和 `maxPx: 1000` 像素上限，然后缩放到 `maxW=172px` 宽度。

### 可能的原因

1. **缩略图太小**：172px 宽度对于包含文字的物理题来说根本看不清——尤其是公式、图表、小字
2. **canvas 渲染成功但被 CSS 缩放模糊**：`maxPx: 1000` 限制了渲染分辨率，再缩小到 172px 其实够用；但如果 `maxPx` 在某些场景下实际渲染出低分辨率，再放大就会糊
3. **`rotation: 0` 硬编码**：如果 PDF 有旋转页，片段渲染会错位（T5 已修旋转页支持，但 SegmentThumb 仍写死 `rotation: 0`——需从 pages 数据取 rotation）
4. **白屏修复前的残留问题**：之前 `host.innerHTML=''` 会清掉 React 的状态文本，可能导致 canvas 渲染时机异常。此问题已修复，但用户可能是在修复前观察到的

### 改动方向

- **放大缩略图**：从 172px 增大到至少 300-400px（或改为占满列表行宽）
- **确保 rotation 正确传入**：`{ rotation: page.rotation ?? 0 }` 而非硬编码 0
- **考虑更高质量的渲染**：`maxPx` 可随缩略图尺寸同比增大

### 约束

- `renderPageRegion` 是纯渲染函数，不改签名
- 缩略图增大后页面性能需关注（大量片段时 canvas 渲染可能慢）
- 内存：每个缩略图是一个 canvas，放大后像素增多，需确认不爆内存

---

## 3. 问题 UX-3：应在片段上显示题号和题型标注

### 用户反馈

> "既然我们分了模板，那么在后期处理的时候其实就可以在相应的合并后或者不需要合并的图片上面显示题号题型，这样处理完的结果刚好就是一一对应，这样方便检查"

### 现状代码

`PostProcessView.tsx` 当前在每个片段卡片上显示：
```tsx
<Text size="xs" c="dimmed">
  seg#{id} · 第{s.order_index ?? 0}序
  {qid !== undefined && <Badge size="xs" variant="light" ml={4}>题#{qid}</Badge>}
  {s.is_deleted && <Badge size="xs" color="red" variant="light" ml={4}>已删</Badge>}
</Text>
```

即 `seg#5 · 第3序` + 可选的 `题#2` Badge。这是**数据库 ID**，对用户毫无意义。

### 期望的行为

用户希望看到的是：
- **"第1题 · 单选题"**——人类可读的题号（从1开始递增）+ 题型名称
- 合并组应显示合并后的题号和题型
- 独立片段（未合并）应显示预估题号

### 数据流分析

题号和题型的来源：

1. **题号**：`questions.order_in_paper` 字段，入库时由 `setQuestionOrder` 按 1,2,3... 设置。但**后期处理阶段还未入库**，此时只有 segments 和可能的 question 占位行（合并操作创建的）。需要在后期处理阶段**预计算题号**——基于 `order_index` 和合并关系推导。

2. **题型**：有两种来源：
   - **模板推导**（M5）：`TemplateService.applyTemplate` 根据题号区间映射题型。但这个函数目前只在 `PaperReviewView` 里调用，PostProcessView 未使用。
   - **手动设定**：`questions.type_id` 字段。但后期处理阶段用户通常还没设题型。

3. **数据可得性**：`PostProcessView` 已有 `questions`（`listQuestionsByPaper`）和 `types`（可通过 IPC 获取 `listQuestionTypes`）。合并操作创建 question 时有 `qid`，可以显示题号。但**未合并的独立片段没有 question**——它们要到"完成入库"时才创建 question 行。

### 改动方向

- 对已有 question 的片段/合并组：显示 `第{order_in_paper}题` + 题型名称（如果有 `type_id`）
- 对未合并的独立片段（无 question）：按 `order_index` 预推题号（从1开始，考虑前面已合并的组）
- 可选：在后期处理阶段就允许**套模板**——把 `PaperReviewView` 的模板功能前置到 `PostProcessView`，这样题号+题型在后期处理时就可显示。这涉及较大的交互重构。

### 约束

- `TemplateService.applyTemplate` 是纯函数，可直接在 PostProcessView 复用
- 题号预推逻辑需要与"完成入库"时的 `setQuestionOrder` 保持一致
- IPC 契约不变（`listQuestionTypes` 等已存在）
- 合并/取消合并后题号需重新计算

---

## 4. 三个问题的关联性

三个问题不是孤立的——它们共同指向同一个结论：**后期处理视图需要从"技术导向的网格卡片"重构为"用户导向的题目列表"**。

- 纵向排列（UX-1）是为了让题目顺序符合阅读习惯
- 显示内容（UX-2）是为了让用户能看清每道题
- 显示题号题型（UX-3）是为了让用户知道处理结果与最终产物一一对应

如果三个问题分别改，可能会互相冲突（比如 UX-1 改成列表后 UX-2 的缩略图宽度变了，UX-3 的标注位置也变了）。**建议高级工程师整体规划 PostProcessView 的重构方案，而非逐个打补丁**。

---

## 5. 涉及的文件与关键数据

| 文件 | 当前职责 | 改动范围 |
|---|---|---|
| `PostProcessView.tsx` | 后期处理主视图 | 三个问题都涉及，可能需整体重构 |
| `SegmentThumb`（同文件内） | 片段缩略图渲染 | UX-2（缩略图尺寸/rotation）、UX-3（标注位置） |
| `RenderService.ts` | 区域渲染 | UX-2（rotation 传入） |
| `TemplateService.ts` | 模板套用 | UX-3（可能需要在 PostProcessView 调用 applyTemplate） |
| `shared/types.ts` | DTO | UX-3（可能需要扩展 question/segment DTO） |

### 关键数据字段

| 数据 | 来源 | 当前在 PostProcessView 的可用性 |
|---|---|---|
| `segment.order_index` | deriveSegments 派生 | ✅ 已有 |
| `segment.x/y_start/end_ratio` | deriveSegments 派生 | ✅ 已有（缩略图渲染用） |
| `question.order_in_paper` | 入库时 setQuestionOrder | ✅ 已有（合并组有 question，独立片段无） |
| `question.type_id` | 手动设定或模板套用 | ✅ 已有（但通常为 null——后期处理阶段未套模板） |
| `question.is_merged` | 合并操作时标记 | ✅ 已有 |
| `question_type.name` | listQuestionTypes | ⚠️ 需要额外 IPC 调用（当前未调） |
| `page.rotation` | 导入时从 PDF 读取 | ⚠️ SegmentThumb 的 pages prop 不含 rotation（只有 id/page_index/width_pt/height_pt） |

---

## 6. 红线提醒

- **`deriveSegments` 纯函数不动**——裁切派生逻辑由 10 个单测锁定
- **"先写库再更新 state"不动**——useCropData/A12
- **IPC 契约不改**——已有的 IPC 足够（`listQuestionTypes`/`applyTemplate` 相关 IPC 都存在）
- **SegmentThumb 的 `renderPageRegion` 调用方式不变**——只改参数（rotation/maxPx）和容器布局

---

## 7. 优先级建议

| 问题 | 优先级 | 理由 |
|---|---|---|
| UX-1 纵向排列 | 高 | 改动小（换 SimpleGrid 为列表），效果大，不依赖其他改动 |
| UX-2 显示裁切内容 | 高 | 用户核心需求——看不到内容就无法判断；含 rotation 修复（功能性 bug） |
| UX-3 显示题号题型 | 中 | 提升检查效率，但依赖题号预推逻辑，改动较复杂；可分步实现（先显示题号，再加题型） |
