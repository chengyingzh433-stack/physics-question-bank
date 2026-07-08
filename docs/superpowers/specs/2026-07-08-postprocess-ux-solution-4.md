# 第四轮 UX 技术手册：独立片段标签 + 复查页修复

- 日期：2026-07-08
- 角色：高级工程师（技术指导，不含实现代码）
- 输入：`2026-07-08-postprocess-ux-issues-4.md`（需求）+ `2026-07-06-development-progress.md`（现状）
- 关联红线：`derivePreviewItems` 纯函数 + 14 单测不动；`handleFinalize` 的 `.filter((s) => !s.is_deleted)` 不动；A12 先库后 state；走现有 IPC 不新增

---

## 总体判断

两个问题的根因**不同**，不要用同一把锤子：

- **问题 1（独立片段无法赋标签）是真 bug，且有硬约束**：标签（章节/难度/知识点）全部挂在 `questions` 表列上（`chapter_id`/`difficulty_id` + `question_knowledge_points` 关联表），`setQuestionChapter(questionId, ...)` 等所有标签 IPC 都**必须传 questionId**。而独立片段在合并/入库前**根本没有 question 行**（questionId 为 null）。所以这不是"UI 门控删掉就行"——删掉门控后 `preview.questionId!` 会是 null，IPC 写不进去。**必须让独立片段在被赋标签的那一刻拥有一个 question 行**。

- **问题 2（复查页显示不全/无图）本质是"进入时机"问题，不是显示 bug**：复查页数据源 `listQuestionsByPaper` 只返回 `questions` 表已有行，且图片来自入库时生成的 `q_{id}.png`。**入库（handleFinalize）之前**：只有"合并组"有 question 行（合并时立即建行），独立片段还没有行、更没有图。用户在没点"完成入库"就切到复查页，自然"只有合并过的题出现且无图"。复查页定位应是**入库后的最终复查**——修复方向是加入库门禁 + 图片占位兜底，而不是去 derive 未入库的预览。

一句话：问题 1 要"标签触发即建行"，问题 2 要"卡住未入库的进入 + 兜底显示"。

---

## 核心概念澄清（实现前必须理解）

当前 `QuestionCard` 里 `isStandalone = preview.questionId === null` 把两件事**耦合**在了一起：
1. 能否合并/删除（片段级操作）
2. 能否赋标签（题目级操作）

这个耦合是问题 1 的病根。正确的语义拆分：

| 概念 | 判据 | 用途 |
|---|---|---|
| **是否合并组** | `preview.isMerged`（来自 questions.is_merged=1，即 ≥2 段） | 决定显示"取消合并"按钮、"合并"徽章；决定片段级删除/勾选是否可用 |
| **是否已有 question 行** | `preview.questionId != null` | 决定标签能否**直接**写；为 null 时需先建行 |

关键事实（已核对源码）：
- `createQuestionWithSegments` 中 `is_merged = segmentIds.length > 1 ? 1 : 0`。**单段建行 → is_merged=0**。所以"给独立片段建行"后，它仍是 `isMerged=false`，UI 上仍表现为可勾选/可删的独立片段，只是多了 questionId。
- `question_segments` **没有 segment_id 唯一约束**。若一个片段先被单独建行、之后又参与合并而不清理旧行，该片段会同时挂在两个 question 上，`segToQuestion` 映射错乱、入库重复出图。**这是最大的坑。**

---

## 问题 1：后期处理页——独立片段可赋标签

### 决策：标签触发即建行（lazy auto-promote），不改纯函数

采用**"首次赋标签时自动为该片段建单段 question 行"**的方案（lazy promote-on-tag）。理由：
- 相比"进后期页就给所有 live 片段建行"（eager），lazy 改动面小、不在数据加载期写库、不打乱现有 merge/undo 语义。
- 完全走现有 IPC（`createQuestionWithSegments` 建行 → 拿到 qid → 再调 `setQuestionChapter` 等）。
- 单段建行 `is_merged=0`，视觉与交互仍是"独立片段"，符合用户"所有题都能赋标签"的期望，且不破坏合并流程。

**不采用**的两个方案及原因：
- ❌ 只删 UI 门控 `preview.questionId != null`：删完 questionId 仍是 null，IPC 无 questionId 可传，写不进库。
- ❌ 标签暂存在 React state、入库时统一写：违反 A12（先库后 state），且崩溃/刷新即丢，标签是长期数据不能只存内存。

### 关键指导

**1. 抽一个 `ensureQuestionId(preview)` 辅助（在 PostProcessView 内）**
- 若 `preview.questionId != null`：直接返回它。
- 若为 null（纯独立片段）：调 `createQuestionWithSegments(pid, preview.segments.map(s=>s.id), null)` 建单段行，返回新 qid，然后 `await reloadAll()` 让 `segToQuestion`/`questions` 刷新（此后该 preview 项会带上 questionId）。
- 所有标签 handler（`handleSetChapter`/`handleSetDifficulty`/`handleSetKps`/`handleCreateKp`/`handleCreateChapter`）改为：**先 `const qid = await ensureQuestionId(preview)`，再用 qid 走原有 IPC**。注意 handler 签名当前收的是 `qid: number`——要改成收 `preview`（或收 preview + 值），在内部 ensure 后再写。

**2. QuestionCard 的语义拆分（病根修复）**
- `isStandalone` 的定义从 `preview.questionId === null` 改为 **`!preview.isMerged`**。这样：单纯独立片段、以及"已升格但未合并的单段"都算 standalone → 保留勾选框 + 片段删除按钮。
- 标签区的门控 `{preview.questionId != null && (...)}` **整段去掉门控**，改为对所有 `kind:'question'` 项都渲染标签 UI。
- 但标签 UI 内部大量用 `preview.questionId!`（非空断言）取值/回写。对 questionId 为 null 的项：
  - **回写**没问题（handler 内 ensure）。
  - **取当前值**（章节/难度/知识点回显）需容错：questionId 为 null 时显示"未设"/空选中，不要 `questions.find(...)!` 崩溃。用可选链 + null 合并。
- `selectedStandaloneCount` 和 `handleMerge` 里的过滤条件 `pq.questionId === null` 改为 **`!pq.isMerged`**（否则升格后的单段无法再被勾选合并）。

**3. 合并必须清理旧单段行（最大的坑）**
`handleMerge` 现在只 `createQuestionWithSegments` 建合并行。改后：选中的片段里可能有"已升格的单段行"，必须**先删这些旧 question 行再建合并行**，否则 segment 双挂。
- 收集选中 standalone 项里 `questionId != null` 的那些 qid（旧单段行）。
- `createQuestionWithSegments(pid, segIds, null)` 建合并行**之后**，对每个旧 qid 调 `deleteQuestion(oldQid)`（级联删旧 `question_segments`，segment 本身不动）。
- 顺序：先建新行再删旧行，或先删旧行再建新行皆可（segments 表不受影响），但**必须在同一 `reloadAll` 前全部做完**。
- ⚠️ 旧单段行若已赋过标签，合并后标签**不自动继承**到合并行（本轮可接受，合并组重新赋标签即可）。若想继承需额外读旧行 chapter/diff/kp 再写新行——**本轮不做，避免超范围**，但在手册里标注为已知取舍。

**4. 删除已升格片段的孤儿行处理（防入库重复出图）**
片段被软删后，若它之前已升格出 question 行，该行变"孤儿"（其唯一 segment 已 is_deleted）。入库 `handleFinalize` 会遍历所有 existing question 出图 → 孤儿行会渲染一张"已删片段"的图，错误。
- **推荐做法（不动 finalize 的 filter 红线）**：在 `handleFinalize` 遍历 `newQuestionIds`/`qOrders` 构建阶段，**跳过"所有 segment 都已删"的 question**——取该 question 的 segments，过滤 `!is_deleted` 后为空则 `continue`（并可顺手 `deleteQuestion` 清理）。这不改 `liveSegs.filter((s) => !s.is_deleted)` 那行红线，是在题目层面加一道"空题跳过"守卫。
- 这样也顺带正确处理"合并组所有段被删"的极端情况。

### 验收（问题 1）
- 未合并的独立片段卡片上能看到章节/难度/知识点 Select + Chip + 现场新建，且能成功写库（切走再回来标签仍在）。
- 给独立片段赋标签后，它**仍可勾选、仍可与其他片段合并**；合并后旧单段行不残留（`listQuestionsByPaper` 数量正确，无双挂）。
- 赋过标签的片段被删除后入库，**不会**多出一张已删片段的题图。
- 合并组仍能赋标签（原功能不退减）。

---

## 问题 2：复查页——入库后完整显示 + 兜底

### 决策：明确复查页为"入库后最终复查"，加门禁 + 兜底，不去 derive 未入库预览

复查页（PaperReviewView）的正确定位是**入库完成后的最终检查**：浏览所有已入库题目的题号/题型/章节/难度/知识点 + 原图。不要试图在这里显示"未入库的预览"（那是后期处理页的职责）。用户"只有合并题出现、无图"的根因是**在未入库时就进了复查页**。

### 关键指导

**1. 加入库门禁**
- `reloadAll` 里额外 `getPaper(pid)` 拿 `status`。
- 若 `status !== 'done'`：整页显示一个 `Alert`/空状态提示"请先在'后期处理'页完成入库，再来复查"，给个跳转回 `/post/{pid}` 的按钮。不渲染题目网格。
- 若 `status === 'done'`：正常渲染。这样入库后所有题（含由独立片段升格的单段题）都在 `questions` 表里、都有 `order_in_paper` 和图，自然全部显示。

**2. 图片兜底**
- 现在 `{q.image_path && (<img .../>)}`：image_path 为空则整块不渲染，卡片只剩文字。改为**始终渲染图片区**：有 `image_path` 显示 `<img>`，无则显示占位（灰底 + "无题图"文字），让用户看到"这题缺图"而非误以为没这题。
- 图片 URL 保持 `app://projects/${pid}/images/q_${q.id}.png` 不变（与 `saveQuestionPng` 存的 `q_{questionId}.png` 一致，已核对）。

**3. 排序与信息完整性**
- `listQuestionsByPaper` 已 `ORDER BY order_in_paper ASC`，复查页 `questions.map` 直接用即可，**无需**前端再排（但要确认没有被 state 打乱）。
- 卡片信息补全：题号（order_in_paper）、题型、章节、难度、知识点 Chip——这些 UI 第三轮已加，本轮确认对**所有**题都显示（复查页本就无 merge 门控，天然满足，只需验证）。

**4. 标签对合并/未合并题都可用（确认，非新增）**
- 复查页取的是入库后的 question 行，**每题都有 questionId**，标签 IPC 天然可用，无需 ensure 逻辑（与后期页不同）。只需确认第三轮的 per-question `newKpNames` 隔离修复还在，无串味。

### 验收（问题 2）
- 未入库时进复查页 → 显示"请先完成入库"提示 + 回跳按钮，不显示半成品。
- 入库后进复查页 → 所有题（合并 + 由独立片段升格的）按题号顺序全部显示，每题有原图（或"无题图"占位）+ 完整标签。
- 复查页改标签能写库、切走再回保留。

---

## 实施顺序（建议分步自测）

1. **问题 2 先做（独立、低风险）**：PaperReviewView 加入库门禁 + 图片占位兜底 + 信息确认。这块不依赖问题 1，先落地先自测。
2. **问题 1 的语义拆分**：QuestionCard 里 `isStandalone` 改 `!isMerged`、标签区去门控 + 取值容错。先让 UI 对独立片段显示标签控件（此时写库可能还没通，先看渲染）。
3. **问题 1 的 ensureQuestionId + handler 改造**：标签 handler 收 preview、内部 ensure 建行再写。自测：独立片段赋标签能持久化。
4. **问题 1 的合并清理 + 选择过滤**：`handleMerge`/`selectedStandaloneCount` 过滤改 `!isMerged`，合并时删旧单段行。自测：升格片段能再合并、无双挂。
5. **问题 1 的入库空题守卫**：`handleFinalize` 构建 qOrders 时跳过全删空题。自测：赋标签后删片段再入库，无多余题图。
6. **全量自测**：typecheck + build + 现有 52 单测全绿（本轮不新增纯函数，故单测数不变；若给 ensure/合并清理加了纯逻辑可补测但非必须）。

---

## 红线（必须遵守）

1. **`derivePreviewItems` / `derivePreviewQuestions` 纯函数 + 14 单测不动**——本轮全部改动在 PostProcessView/PaperReviewView 的 UI 层与 handler 层。
2. **`handleFinalize` 的 `liveSegs.filter((s) => !s.is_deleted)` 那行不动**——空题守卫加在"题目层面"（遍历 question 时跳过全删题），不是改这行 segment 过滤。
3. **A12 先库后 state**——ensureQuestionId 建行、标签写入、合并清理，全部先 IPC 成功再更新 state / reloadAll。
4. **不新增 IPC**——全用现有：`createQuestionWithSegments`、`deleteQuestion`、`getPaper`、`setQuestion*`、`getQuestionSegments`。
5. **`question_segments` 无 segment_id 唯一约束**——合并前**务必**清理被选片段的旧单段 question 行，否则片段双挂、`segToQuestion` 错乱、入库重复出图。这是本轮最易踩的坑。
6. **合并组标签不继承**是本轮已知取舍（升格单段被合并后需重新赋标签），不要为此偷偷扩范围去做继承逻辑；如需做，先跟用户确认。
7. **复查页不 derive 未入库预览**——它是入库后视图，靠 `listQuestionsByPaper` + 门禁，不引入 `derivePreviewItems`。
8. **图片 URL 格式 `app://projects/{pid}/images/q_{qid}.png` 不变**。

---

## 一句话总结

问题 1 的钥匙是"标签触发即为独立片段建单段 question 行（lazy promote）"并把 `isStandalone` 从 `questionId===null` 改判为 `!isMerged`，同时合并时清理旧单段行、入库时跳过全删空题；问题 2 的钥匙是"复查页定位为入库后视图，加 status 门禁 + 图片占位兜底"。两者都不碰纯函数和 finalize 的 segment 过滤红线，全走现有 IPC。


