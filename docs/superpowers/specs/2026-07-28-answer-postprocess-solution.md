# 答案卷后期处理 + 匹配流程对齐（技术手册）

- 日期：2026-07-28
- 需求来源：`2026-07-28-answer-postprocess-issues.md`
- 实施代号：**M14.5**（B1–B7）

---

## 总体判断

五个改动点相互独立，可按顺序单独实施和自测。核心思路是**零新增表、最小侵入**——让答案卷的 `question` 行复用题目侧已有的全套合并/删除机制（`question_segments` + `createQuestionWithSegments`），PostProcessView 加一个 kind 判断分支，AnswerMatchView 从 question 层读合并信息而不是直接从 segment 层。

不涉及几何表（`pages/segments/cut_lines/column_dividers/manual_boxes`），不新增 DB 表，不改 IPC 协议（除加一条 `questions:listByAnswerPaper` 见下文说明，实际可复用现有 `listByPaper`），不改导出链路。

---

## B2：题库查询加 `kind='paper'` 隔离

**为什么优先做这个**：这是防御性改动。一旦 B3/B4 让 PostProcessView 开始给答案卷创建 `question` 行，若 B2 还没做，这些行会污染题库（`listBankQuestions` 是全库扫，即使当前 `image_path IS NOT NULL` 侥幸过滤，也是巧合，不可依赖）。B2 必须在 B3/B4 之前上线。

### 改动 1：`questionFilter.ts`

`buildQuestionFilter`（第 27 行）的初始 conditions 数组只有 `'q.image_path IS NOT NULL'`，改为同时加入 `'p.kind = \'paper\''`。

**关键**：`buildQuestionQuery`（第 64 行）本身不用改——它调 `buildQuestionFilter`，过滤条件会自动携带。但 `buildQuestionQuery` 的 SQL 模板已经有 `JOIN papers p`（见第 66 行），所以 `p.kind` 可以直接引用。

### 改动 2：`questionRepo.ts` 的 `buildQuestionFilterWithJoin`

**注意**：`questionRepo.ts` 里有一个内部私有函数 `buildQuestionFilterWithJoin`（第 86–126 行），它与 `questionFilter.ts` 中的 `buildQuestionFilter` 是**两套独立逻辑**，`listBankQuestions` 用的是这套内部版本。同样在 conditions 数组初始位置加 `'p.kind = \'paper\''`。

### 改动 3：`listYearSources`（第 64–84 行）

years 和 sources 两个子查询都有 `WHERE q.image_path IS NOT NULL`，分别加上 `AND p.kind = 'paper'`。两个查询都已经 `JOIN papers p`，无需加 JOIN。

### 单测

`questionFilter.test.ts` 里有两个 `describe` 块，在 `buildQuestionFilter` 的空 criteria 用例（第 6 行）里加断言：`expect(r.where).toContain("p.kind = 'paper'")`。`buildQuestionQuery` 的基础断言（`toContain('JOIN papers p')`）不动。

**验收**：`vitest` 全绿，且用 `--reporter=verbose` 确认新断言执行。

---

## B3：CropView 答案卷跳后期处理

`CropView.tsx` 第 56–58 行：

```
const isAnswer = crop.paper.kind === 'answer'
const nextPath = isAnswer ? `/answer/${crop.paper.parent_paper_id ?? ''}` : `/post/${pid}`
const nextLabel = isAnswer ? '去匹配答案' : '去后期处理'
```

改为：

- `nextPath`：答案卷改跳 `/post/${pid}`（即答案卷自己的 id，不再跳父卷的答案匹配页）
- `nextLabel`：答案卷改为 `'去后期处理'`（和题目卷一样）

这是一行改动。`pid` 就是当前 `crop.paper.id`，已经在作用域内（第 42 行 `const pid = crop.paper.id`，需确认实际变量名）。

**验收**：裁切答案卷后"完成裁切"按钮跳到 `/post/{答案卷id}`。

---

## B4：PostProcessView 答案模式

这是改动量最大的一步，但全部集中在 `PostProcessView.tsx` 内部，不改任何 IPC 和 DB 层。

### 4.1 加载时识别 kind

`reloadAll`（第 155–192 行）加载 `paper` 对象，已有 `paper.kind` 字段。读完 paper 后，`setIsAnswerMode(paper.kind === 'answer')`（加一个 `boolean` state）。

### 4.2 标题区

当 `isAnswerMode` 时：
- 页面标题显示"答案后期处理"（而不是试卷名）
- 隐藏"一键入库""选择模板"等题目侧专属按钮

### 4.3 完成按钮逻辑

当 `isAnswerMode` 时，"完成"按钮的行为：
- **不调 `handleFinalize`**（绝对禁止，见红线 #7）
- 直接跳转到 `/answer/${paper.parent_paper_id}`（答案匹配页，传的是**父卷 id**，不是答案卷 id）
- 跳转前可选调一次 `window.api.setPaperStatus(pid, 'processing')`，让答案卷有状态记录

**关键**：`handleFinalize` 里有 `setPaperStatus(pid, 'done')`、`applyTemplate`、`saveQuestionPng`、`setQuestionImage`——这些对答案卷全是错的。答案卷的 `question` 行不产生 `image_path`，答案图是在匹配页渲染写入的。

### 4.4 答案模式下 reloadAll 的差异

题目侧 `reloadAll` 会 load types、templates、chapters、kps、diffs（第 168–187 行），答案模式下这些全不需要。可以用 `if (!isAnswerMode)` 跳过这些加载，减少无用 IPC。但这是优化，不是必须——先让它能跑，再优化。

### 4.5 QuestionCard 渲染

答案模式下，`QuestionCard` 的标签区（类型、章节、难度）不显示。可以在 `QuestionCard` 组件加 `isAnswerMode` prop 控制，或直接在 PostProcessView 渲染时条件渲染。

### 4.6 `handleMerge` 和 `handleDelete`

这两个函数直接调 `createQuestionWithSegments(pid, ...)` 和 `setSegmentDeleted`，**不需要任何改动**——答案模式下 `pid` 是答案卷 id，`question` 行就创建在答案卷下，完全正确。

### 4.7 已有问题二次确认弹框

`handleFinalize` 里有"是否重新生成"的 `isRedo` 判断（`paperStatus === 'done'`）。答案模式完全绕开 `handleFinalize`，所以这个弹框不出现，符合预期。

**验收**：
1. 进入答案卷后期处理页，标题显示"答案后期处理"
2. 可以软删除片段（删后灰显 / 隐藏，可撤销）
3. 可以合并多个片段为一个答案单元
4. 点"完成"跳到 `/answer/{父卷id}`，不报错，不产生 `image_path`

---

## B5：`deriveAnswerItems` 支持合并组

**文件**：`src/renderer/src/services/AnswerMatchService.ts`

### 现状

`deriveAnswerItems(segments, pageIndexMap?)` 把每个未删除的 segment 映射为一个 `AnswerItem`（key=`a{segmentId}`），按 `(page_index, order_index)` 排序，顺序编号。

### 改动

答案卷经过 B4 的后期处理后，合并关系存储在 `question_segments` 表（通过 `createQuestionWithSegments` 写入）。`AnswerMatchView` 已经能取到 `segments`，现在还需要取到"哪些 segments 被合并成了一个 answer question"。

**新签名建议**：

```
deriveAnswerItems(
  segments: SegmentDTO[],
  answerQuestions: QuestionDTO[],            // 答案卷的 question 行
  segmentMap: Map<number, number[]>,         // questionId → segmentIds[]（按 merge_order）
  pageIndexMap?: Map<number, number>
): AnswerItem[]
```

- `answerQuestions`：通过 `window.api.listQuestionsByPaper(answerPaperId)` 取，传进来
- `segmentMap`：`answerQuestions` 里每个 question，调 `window.api.getQuestionSegments(qid)` 取到 segments，组成 `segmentId[] → questionId` 的反向索引，或直接用 `questionId → segmentIds[]` 正向 Map

**新的 `AnswerItem` 结构**：

```ts
interface AnswerItem {
  key: string                 // 'q{questionId}'（之前是 'a{segmentId}'，改为以 question 为主键）
  answerNumber: number
  questionId: number          // 对应 answer paper 的 question 行
  segmentIds: number[]        // 按 merge_order 排列，单片段时 length=1
  segments: SegmentDTO[]      // 用于渲染缩略图
  // 不再是单个 segment，而是有序的 segment 数组
}
```

**排序口径不变**：以 `segmentIds[0]`（第一个 segment）的 `(page_index, order_index)` 为排序基准，保持视觉顺序。

**向后兼容**：老答案卷（B4 之前导入的，没有 question 行的）的 segments 不在任何 question 下。处理方法：`deriveAnswerItems` 遇到不在任何 question 里的 segment，退化为"单 segment 的 AnswerItem"（`segmentIds=[s.id]`）。这样老数据不崩，用户可以选择重新裁切或直接匹配。

**`autoPairAnswers` 不改签名**，它接受 `questionIds[]` 和 `answerItems[]`，只要 `AnswerItem` 还是顺序数组，index-for-index 配对仍然有效。

**单测**：
- 新增：3 个 segment → 2 个合并组（question 1: seg[1,2], question 2: seg[3]）→ 2 个 AnswerItem，顺序正确
- 新增：1 个 segment 不在任何 question 里 → 退化为单 segment AnswerItem
- 现有测试：签名变了需要更新调用方式，但逻辑用例结果不变

---

## B6：AnswerMatchView 渲染合并组

**文件**：`src/renderer/src/views/AnswerMatchView.tsx`

### 6.1 数据加载变化

`reload` 函数里加：
1. `listQuestionsByPaper(answerPaperId)` → 取答案卷的 question 行
2. 对每个 question，`getQuestionSegments(qid)` → 取 segments（按 merge_order）

这些调用只在 `answerPaper != null` 时执行。现有 `segments` 加载（`getSegmentsByPaper`）保留，因为 `AnswerSegThumb` 还需要原始 segment 数据。

然后把上面的数据传给改造后的 `deriveAnswerItems`。

### 6.2 `AnswerSegThumb` 改为 `AnswerItemThumb`

当前的 `AnswerSegThumb` 组件渲染单个 segment 的 canvas。改为接受 `AnswerItem`（含有序 `segments[]`），渲染时：
- 单 segment：行为完全不变
- 多 segments：纵向拼合，canvas 高度 = 各 segment 高度之和（按比例，使用同一份 pageIndexMap 换算像素）。渲染时按 `segments` 顺序，从上到下 `drawImage` 各 segment 对应的页面图像切片

纵向拼合的逻辑可以参考 `handleBindAll` 里现有的答案图渲染代码（它已经做了多 segment 的纵向拼合），或直接复用 `RenderService` 里的相关逻辑——**不要重复造轮子**，先 Grep 确认现有拼合代码位置，复用它。

### 6.3 配对逻辑调整

`togglePairing`：当前以 `segmentId` 为 key，对应 `AnswerPairing.segmentIds[]`。改为以 `AnswerItem.key`（`q{questionId}`）为 key，`segmentIds` 直接取 `AnswerItem.segmentIds`（一次性写入，不再逐个 segment 勾选）。

`handleBindAll`：遍历 pairings 时，`segmentIds` 已经是完整的合并组 ids，渲染逻辑不变（它本来就支持多 segment）。

### 6.4 UI 标签

答案区候选格子的标题从"答案 N"改为"答案组 N"（仅当 `segments.length > 1` 时，否则仍显示"答案 N"）——这是小 UX 改进，不影响功能。

**验收**：
1. 答案卷经过后期处理（有合并组）后，匹配页显示纵向拼合的整体缩略图
2. 点击合并组缩略图 → 该答案组整体与当前选中题目配对
3. `handleBindAll` 渲染结果与之前多段勾选的结果一致（视觉上无差异）
4. 老答案卷（无 question 行）退化正常，不崩溃

---

## B7：全量自测

```
tsc -p tsconfig.node.json --noEmit   # node 侧
tsc -p tsconfig.web.json --noEmit    # renderer 侧
npx vitest run                        # 单测（当前 69/69）
npm run build                         # 打包
```

单测增量：B2 加至少 2 个新用例，B5 加至少 3 个新用例。总数应达到 **74+**。

---

## 实施顺序

```
B2（防御先行）→ B3（路由）→ B4（PostProcessView 答案模式）→ B5（纯函数 + 单测）→ B6（View 改造）→ B7（全量自测）
```

每步完成后单独跑 typecheck + 相关单测，不攒到最后一起验。

---

## 红线（必须遵守）

1. **`handleFinalize` 绝不对答案卷执行**。加 `if (isAnswerMode) return` 守卫，或让答案模式的完成按钮完全绕开 `handleFinalize`。违反后果：答案卷的 question 行被写入 `image_path`、`setPaperStatus('done')`、套题型模板，数据语义错乱，难以回滚。

2. **`listBankQuestions` / `listYearSources` 的 `p.kind = 'paper'` 过滤必须在 B2 做完，早于 B3/B4 上线**。顺序颠倒会导致答案 question 行污染题库。

3. **`AnswerItem.key` 改为 `q{questionId}` 后，`AnswerPairing` 的 key 也同步改**。两者必须同步，否则 `pairings` Map 里的 key 对不上，配对 UI 失效。

4. **纵向拼合逻辑复用现有代码，不新写独立实现**。Grep `handleBindAll` 或 `RenderService` 确认现有位置，抽取共用，避免两套拼合逻辑不一致导致预览图和最终写入图不同。

5. **`deriveAnswerItems` 改签名后，`AnswerMatchView` 里的调用必须同步更新**。不能留下旧签名的调用点——TypeScript 会报错，但还是要 grep 确认没有在测试文件外遗漏。

6. **答案卷 question 行不写 `image_path`、`year_override`、`source_override`、`type_id`、`chapter_id`、`difficulty_id`**。这些字段全是题目侧语义，答案侧 question 行只用 `paper_id`、`is_merged`、`order_in_paper`。

7. **`(page_index, order_index)` 排序口径不动**。`deriveAnswerItems` 的排序基准改为以 `segmentIds[0]` 对应 segment 的 `(page_index, order_index)` 排序，不要改为按 questionId 排序（questionId 是自增，创建顺序不等于视觉顺序）。

8. **A12：DB 写入先于 state 更新**。B4 里 `handleDelete`、`handleMerge`、undo 全部已经遵守（见现有代码），不要改变这个顺序。

---

## 一句话总结

答案卷走与题目卷一致的后期处理流程：B2 先封堵题库污染 → B3 改路由 → B4 让 PostProcessView 支持答案模式（复用全部删除/合并逻辑，守卫 handleFinalize）→ B5/B6 让匹配页以 question（合并组）为单位而不是 segment 为单位操作。
