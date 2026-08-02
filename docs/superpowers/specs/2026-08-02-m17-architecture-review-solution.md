# M17 架构审视与清理技术手册

- 日期：2026-08-02
- 目标：功能全部完成后做一轮代码减脂，不改行为
- 红线：行为零变化，79个单测全绿是底线
- 预估工作量：~4-6小时

---

## 1. 背景

M13-M16 完成后，代码库已经具备完整功能链路（导入→裁切→后期处理→入库→答案匹配→组卷→导出PDF/PPT）。在这个过程中积累了一些技术债：

1. **PostProcessView.tsx** 膨胀到 1000+ 行
2. **N+1 查询**：`reloadAll`/`reload` 里逐题查询知识点和片段
3. **未用导入**（TS6133 警告）
4. **内联逻辑**：PDFViewer 的 ViewportController 可抽出
5. **Bundle 体积**：1.7MB（pdfjs/Mantine），但桌面应用非关键
6. **技术路线**：pdfjs v4 锁定原因、Zustand 是否需要、双函数合并可能性

现在是清理的最佳时机：功能稳定、测试覆盖充分、用户反馈积极。

---

## 2. 清理清单

### 2.1 PostProcessView 拆分（P0，必做）

**现状**：
- `PostProcessView.tsx`：1030行（含 QuestionCard/DeletedPlaceholderCard/QuestionThumb 内嵌组件）
- 标签区 UI 与 `PaperReviewView.tsx` 高度重复
- 可读性差，维护成本高

**目标**：
- 拆成独立组件文件：
  - `QuestionCard.tsx` — 题目卡片（~150行）
  - `DeletedPlaceholderCard.tsx` — 已删除占位卡片（~50行）
  - `QuestionThumb.tsx` — 题目缩略图（~80行）
  - `QuestionTagEditor.tsx` — 标签编辑区（~100行，PostProcessView 和 PaperReviewView 共享）
- `PostProcessView.tsx` 缩减到 ~600行（主逻辑+布局）

**拆分策略**：
1. 识别组件边界：每个内嵌 function 组件 → 独立文件
2. Props 接口明确化：所有回调通过 props 传递，不依赖闭包
3. 共享组件（QuestionTagEditor）抽到 `src/renderer/src/components/`
4. 非共享组件放 `src/renderer/src/views/PostProcess/`（新目录）

**验证**：
- TypeCheck 0错误
- 79测试全绿
- 人工测试后期处理页：合并/取消合并/标签编辑/撤销/入库全流程

---

### 2.2 N+1 查询优化（P1，必做）

**现状**：
- `PostProcessView.tsx` 的 `reloadAll()`:
  ```ts
  for (const q of questions) {
    const kps = await window.api.getQuestionKnowledgePoints(q.id)
    const segs = await window.api.getQuestionSegmentMap(q.id)
    // ...
  }
  ```
- 50题 → 100次 IPC（50次 kps + 50次 segs）

**目标**：
- 新增批量 IPC：
  - `questions:batchKnowledgePoints(questionIds: number[])` → `Map<number, KnowledgePointDTO[]>`
  - `questions:batchSegmentMaps(questionIds: number[])` → `Map<number, Map<number, number[]>>`
- `reloadAll` 改为一次批量查询

**实现**：
1. **`src/main/storage/repositories/questionRepo.ts`**：
   ```ts
   export function batchGetQuestionKnowledgePoints(
     db: DB,
     questionIds: number[]
   ): Map<number, KnowledgePointDTO[]> {
     if (questionIds.length === 0) return new Map()
     const placeholders = questionIds.map(() => '?').join(',')
     const rows = db.prepare(`
       SELECT qkp.question_id, kp.*
       FROM question_knowledge_points qkp
       JOIN knowledge_points kp ON qkp.kp_id = kp.id
       WHERE qkp.question_id IN (${placeholders})
       ORDER BY qkp.question_id, kp.name
     `).all(...questionIds) as Array<{ question_id: number } & KnowledgePointDTO>
     
     const map = new Map<number, KnowledgePointDTO[]>()
     for (const row of rows) {
       const qid = row.question_id
       if (!map.has(qid)) map.set(qid, [])
       const { question_id, ...kp } = row
       map.get(qid)!.push(kp)
     }
     return map
   }
   
   export function batchGetQuestionSegmentMaps(
     db: DB,
     questionIds: number[]
   ): Map<number, Map<number, number[]>> {
     if (questionIds.length === 0) return new Map()
     const placeholders = questionIds.map(() => '?').join(',')
     const rows = db.prepare(`
       SELECT question_id, segment_id, merge_order
       FROM question_segments
       WHERE question_id IN (${placeholders})
       ORDER BY question_id, merge_order
     `).all(...questionIds) as Array<{
       question_id: number
       segment_id: number
       merge_order: number
     }>
     
     const outerMap = new Map<number, Map<number, number[]>>()
     for (const row of rows) {
       if (!outerMap.has(row.question_id)) {
         outerMap.set(row.question_id, new Map())
       }
       const innerMap = outerMap.get(row.question_id)!
       if (!innerMap.has(row.question_id)) {
         innerMap.set(row.question_id, [])
       }
       innerMap.get(row.question_id)!.push(row.segment_id)
     }
     return outerMap
   }
   ```

2. **IPC/preload/types** 添加新方法

3. **`PostProcessView.tsx`** 改用批量查询：
   ```ts
   const questions = await window.api.listQuestionsByPaper(pid)
   const qids = questions.map(q => q.id)
   const [kpMap, segMap] = await Promise.all([
     window.api.batchQuestionKnowledgePoints(qids),
     window.api.batchQuestionSegmentMaps(qids)
   ])
   
   for (const q of questions) {
     const kps = kpMap.get(q.id) || []
     const segs = segMap.get(q.id) || new Map()
     // ...
   }
   ```

**验证**：
- TypeCheck 0错误
- 79测试全绿
- 人工测试：50题试卷后期处理页加载时间从 ~500ms 降到 ~100ms

---

### 2.3 TS6133 清理（P2，可选）

**现状**：
- 代码中存在未使用的导入（如早期重构遗留的旧组件导入）
- 不影响功能，但污染代码可读性

**目标**：
- 运行 `tsc --noEmit --listFiles | grep "TS6133"` 找出所有未用导入
- 逐文件清理

**策略**：
- 仅删除明确未用的导入
- 保留"看似未用但实际用于类型推断"的导入
- 不强求100%清理，优先清理主流程文件

**验证**：
- TypeCheck 0错误
- Build 通过

---

### 2.4 ViewportController 抽出（P3，可选）

**现状**：
- `PDFViewer.tsx` 内嵌 viewport 计算逻辑（~100行）
- 可读性尚可，但职责不够单一

**目标**：
- 抽成 `useViewportController` hook 或独立函数

**决策**：
- 如果时间充裕且不影响稳定性，可做
- 否则推迟到下一轮重构

---

### 2.5 Bundle 体积评估（P3，可选）

**现状**：
- `index.js` 1.7MB（pdfjs 1.3MB + Mantine + 业务代码）
- Vite 警告：chunk size exceeds 500KB

**分析**：
- pdfjs-dist 必需，无法tree-shake（worker整体加载）
- Mantine 按需导入已做（只导入用到的组件）
- 桌面应用首次加载后缓存，体积影响不大

**决策**：
- 本次不做优化（非关键）
- 记录到文档，标记为"已评估，暂不处理"

---

### 2.6 技术路线审视（P3，讨论性）

**议题**：
1. **pdfjs v4 锁定原因**：Electron 31 + pdfjs v6 的 `Promise.try` 兼容问题是否已修复？
2. **Zustand 是否需要**：当前 React state + hooks 够用，引入 Zustand 是否过度设计？
3. **双函数合并**：`derivePreviewQuestions` 和 `derivePreviewItems` 逻辑重复，是否可合并？

**结论**：
- pdfjs v4 锁定：保持现状，Electron 31 稳定
- Zustand：当前不引入，除非出现跨组件状态管理痛点
- 双函数合并：延后到大版本重构（需改单测）

---

## 3. 实施顺序

**第一阶段（必做）**：
1. PostProcessView 拆分（~2小时）
2. N+1 查询优化（~1.5小时）

**第二阶段（可选）**：
3. TS6133 清理（~30分钟）
4. ViewportController 抽出（~1小时）

**第三阶段（评估）**：
5. Bundle 体积评估（文档记录）
6. 技术路线审视（结论记录）

---

## 4. 风险控制

**红线**：
- 行为零变化（后期处理/答案匹配/组卷/导出 全流程不受影响）
- 79测试全绿（不改单测逻辑，只重构代码结构）

**验证步骤**：
1. 每个重构步骤后立即 TypeCheck + Test
2. Build 通过后人工测试关键流程
3. 发现问题立即回滚，不强推

**回滚策略**：
- 每个重构独立 commit
- 发现问题用 `git revert` 回滚单个commit
- 不做破坏性大规模重构

---

## 5. 预期产出

**代码**：
- PostProcessView.tsx：1030行 → ~600行
- 新增5个组件文件（QuestionCard/DeletedPlaceholderCard/QuestionThumb/QuestionTagEditor + 目录结构）
- 新增2个批量IPC + repo函数
- 删除若干未用导入

**文档**：
- 本技术手册
- development-progress.md 更新 M17 章节
- 技术路线结论记录

**性能**：
- 50题试卷后期处理页加载时间：~500ms → ~100ms

---

## 6. 时间估算

- PostProcessView 拆分：2小时
- N+1 查询优化：1.5小时
- TS6133 清理：30分钟（可选）
- ViewportController 抽出：1小时（可选）
- 文档更新：30分钟

**总计**：4-6小时

---

## 7. 开始实施

按顺序执行：
1. ✅ 创建技术手册
2. 🔄 PostProcessView 拆分
3. 🔄 N+1 查询优化
4. 🔄 TS6133 清理（可选）
5. 🔄 文档更新
6. 🔄 提交推送

现在开始第2步：PostProcessView 拆分。
