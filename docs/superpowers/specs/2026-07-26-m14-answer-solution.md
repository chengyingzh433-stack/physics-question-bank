# M14 技术手册：答案导入 + 裁切 + 匹配

- 日期：2026-07-26
- 角色：高级工程师（技术指导，不含实现代码）
- 输入：`2026-07-26-roadmap-m13-m17.md` 阶段 2 + 用户已确认决策 2（复用 papers 表）、决策 4（导出时三选）
- 前置：M13 已完成（年份/出处）

---

## 0. 总体判断

这是路线图里最大的一块，但**杠杆点很明确：不要造第二套裁切系统**。

答案 PDF 的处理流程和试卷完全同构——导入、分页、分列、横切、框选、推导片段。现有 `pages`/`column_dividers`/`cut_lines`/`manual_boxes`/`segments` 五张表加整个 CropView 交互层，只要"答案也是一份 paper"就能**零改动复用**。

代价是 `papers` 表要能区分两种 paper，且所有"列出试卷"的地方都要过滤——**这是本阶段最容易漏的坑，见红线 1**。

三个子问题按依赖排：**数据模型 → 匹配界面 → 导出**。匹配界面是唯一有真实交互设计难度的。

---

## 1. 数据模型

### 1.1 papers 表加两列（幂等迁移）

- `kind TEXT NOT NULL DEFAULT 'paper'` — `'paper'` | `'answer'`
- `parent_paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE` — 仅 `kind='answer'` 时非空

**关键**：`ON DELETE CASCADE` 让"删题目试卷 → 答案卷自动删"，答案卷的 pages/segments 再级联删。磁盘目录由 `deletePaperDir` 处理（答案卷有自己的 `projects/{answerPaperId}/` 目录存 source.pdf）。

老库迁移：`DEFAULT 'paper'` 保证存量行自动是题目卷，无需数据修复。

### 1.2 questions 表加三列（答案绑定）

- `answer_image_path TEXT`
- `answer_width_px INTEGER`
- `answer_height_px INTEGER`

**答案图存在题目试卷的目录下**：`projects/{题目paperId}/images/a_{questionId}.png`。

理由：删题目卷时 `deletePaperDir(题目paperId)` 一并清掉答案图，不留孤儿文件；且 `app://` URL 的 paperId 与题目一致，前端拼 URL 不需要额外查答案卷 id。

### 1.3 为什么不建 answer_papers/answer_segments 平行表

会复制一整套 CRUD + IPC + 裁切逻辑（约 5 张表 × CRUD + 20 个 IPC + CropView 分支），且两套代码必然逐渐不一致。复用 papers 只付出"列表要过滤"的代价，明显划算。

---

## 2. 导入答案卷

现有 `papers:import` 只建 `kind='paper'`。**加可选参数**而不是新 IPC：

- `papers:import(name, options?: { kind?: 'paper'|'answer', parentPaperId?: number })`
- 渲染侧 `importPaper(name, options?)`，默认行为完全不变（红线：不破坏现有调用点）
- 建卷后仍走 `importPagesFromPdf`（ImportService 零改动——它只认 `PaperDTO.id`）

答案卷的 `name` 建议自动取"{题目卷名} - 答案"，用户不用起名。

### 2.1 答案卷状态机

答案卷复用 `status` 字段，但语义独立：`importing → cropping → processing`（**答案卷不需要 `done`**，因为它不入题库；"入库"这一步在匹配界面完成，写的是题目行的 answer_* 字段）。

不要试图让答案卷复用 `handleFinalize`——那会给答案片段建 questions 行，污染题库。

---

## 3. 匹配界面（AnswerMatchView）

### 3.1 入口与路由

- 新路由 `/answer/:paperId`（paperId = **题目卷** id），挂在 `WorkflowLayout` 下
- `WorkflowLayout` 的 STEPS 加第 4 步"答案匹配"（`{ path: 'answer', label: '答案匹配' }`）
- 入口按钮：复查页顶栏 / 主页试卷卡片，仅 `status==='done'` 开放（与复查页同样的门禁逻辑）

### 3.2 页面的三种状态

进页面先查该题目卷有无 `kind='answer'` 的子卷（新 IPC `papers:getAnswerPaper(parentId)`）：

1. **无答案卷** → 显示引导："导入答案 PDF"按钮 → 建答案卷 + 导入 → 跳 `/crop/{答案卷id}`
2. **有答案卷但答案片段为空** → 提示"答案尚未裁切" + 跳 `/crop/{答案卷id}` 按钮
3. **有答案卷且有片段** → 显示匹配界面（下节）

裁切完答案后如何回到匹配页：CropView 的"下一步"按钮当前跳 `/post/{id}`。**答案卷要跳回 `/answer/{parentId}`**——CropView 里按 `paper.kind` 分支（这是 CropView 唯一需要改的地方）。

### 3.3 匹配界面主体

**左列：题目**（来自 `listQuestionsByPaper(题目卷id)`，已入库故都有图和 order_in_paper）
**右列：答案片段**（来自答案卷的 segments，按 `(page_index, order_index)` 排序推导出序号）

**默认自动配对**：按序号一一对应（第 1 题 ↔ 第 1 个答案片段）。这覆盖绝大多数场景。

**手动微调**（必须有，因为答案片段数常与题数不等）：
- 每道题一行，右侧显示当前配对的答案片段缩略图
- 点击可改配对：从答案片段列表里选（支持多选 → 一题对多段答案，纵向拼合，复用 `composeQuestionCanvas`）
- 支持"无答案"（某题答案缺失）

**配对状态存哪**：**只存在 React state，不落库**。理由——配对是一次性操作，确认后直接渲染 PNG 写进 `questions.answer_image_path`，配对关系本身没有长期价值。不要为此建 `answer_segments_map` 表。

**建议抽纯函数 + 单测**：`deriveAnswerItems(segments, pageIndexMap)` 推导答案片段的有序列表（与 `derivePreviewQuestions` 同构但更简单——答案不需要合并组概念）。再加 `autoPairAnswers(questions, answerItems)` 产出默认配对。这两个是本阶段唯二值得单测的纯逻辑。

### 3.4 确认写入

点"确认绑定"后，逐题：
1. 取该题配对的答案片段（可能多段）
2. `renderSegmentsAtDpi(答案doc, segs, pagesMap, dpi)` — **注意 doc 是答案卷的 PDF**
3. `composeQuestionCanvas` 纵向拼合
4. `saveAnswerPng(题目paperId, questionId, buf)` → 新 IPC，写 `a_{qid}.png`
5. `setQuestionAnswer(qid, relPath, w, h)` → 新 IPC

进度条复用 PostProcessView 的 `finalizeProgress` 模式。

**FileService**：`saveQuestionPng` 已硬编码 `q_` 前缀。加一个 `saveAnswerPng` 薄封装（或给现有函数加 prefix 参数，但**加参数会改现有 IPC 签名**，倾向新加一个函数 + 新 IPC）。

---

## 4. 导出（决策 4：三选）

`exportBasketPdf(setId, title)` 加第三参数 `answerMode: 'none' | 'append' | 'inline'`：

- `'none'` — 当前行为，只出题目（**默认值，保证不传时行为不变**）
- `'append'` — 题目正文后新起一页"参考答案"，按题号顺序列答案图
- `'inline'` — 每题图后紧跟其答案图

BasketView 导出按钮旁加 Select 或导出前弹 Modal 让用户选。缺答案的题在 append/inline 模式下跳过（不显示空白）。

**PPT 导出（M16）也会用到 answerMode**，届时复用同一枚举。

---

## 5. 新增 IPC 清单（本阶段申报）

1. `papers:import` **改签名**（加可选 options 参数，向后兼容）
2. `papers:getAnswerPaper(parentPaperId)` — 查某题目卷的答案卷（无则 null）
3. `files:saveAnswerPng(paperId, questionId, data)` — 写 `a_{qid}.png`
4. `questions:setAnswerImage(questionId, path, w, h)` — 写答案绑定
5. `questions:clearAnswer(questionId)` — 解绑（可选，用于重新匹配）
6. `export:basketPdf` **改签名**（加 answerMode 参数，默认 'none' 向后兼容）

`listPapers` **不新增参数**，改为默认只返回 `kind='paper'`（见红线 1）。

---

## 6. 实施顺序

1. **数据层**：schema 加 5 列 + 幂等迁移 + DTO 字段 → typecheck + 58 单测不退化
2. **列表过滤**：`listPapers` 加 `WHERE kind='paper'`，全局排查所有"列试卷"的地方（红线 1）→ 人测：主页/题库筛选不出现答案卷
3. **导入答案卷**：`papers:import` 加 options + `getAnswerPaper` IPC → 人测：能建答案卷并导入 PDF
4. **裁切复用**：CropView 按 `paper.kind` 决定"下一步"跳向 → 人测：答案卷能正常裁切、下一步回匹配页
5. **纯函数**：`deriveAnswerItems` + `autoPairAnswers` + 单测（约 6-8 个）
6. **匹配界面**：AnswerMatchView 三态 + 配对 UI → 人测：自动配对正确、能手动改
7. **确认写入**：渲染 + saveAnswerPng + setAnswerImage + 进度条 → 人测：答案图生成、重启仍在
8. **导出三选**：ExportService 加 answerMode + BasketView 选项 → 人测：三种模式导出正确
9. 全量自测

**建议 1-4 做完先提交一次**（数据层 + 裁切复用是独立可验证的），5-7 再一次，8 单独一次。

---

## 7. 红线（必须遵守）

1. **所有"列出试卷"的地方必须过滤 `kind='paper'`**。已知调用点：`HomeView`（主页列表）、`BankView`（来源试卷筛选下拉）、`listPapers` IPC 本身。**这是本阶段最易漏的坑**——漏了会让答案卷出现在主页和筛选器里。做完第 2 步要全局 grep `listPapers` 逐个确认。
2. **答案卷不走 `handleFinalize`**：答案片段绝不能建 questions 行，否则污染题库。匹配界面自己渲染写图。
3. **现有纯函数全部不动**：`derivePreviewQuestions`/`derivePreviewItems`/`deriveSegments`/`deriveAllSegments`/`applyTemplate`/`buildQuestionFilter`。答案推导走**新函数** `deriveAnswerItems`。
4. **`papers:import` 和 `export:basketPdf` 改签名必须向后兼容**：新参数可选、默认值等于现有行为。改完跑一遍现有导入/导出确认零变化。
5. **答案图存题目卷目录**（`projects/{题目paperId}/images/a_{qid}.png`），不存答案卷目录——保证删题目卷时一并清理。
6. **配对关系不落库**：确认即渲染写图，不建映射表。
7. **A12 先库后 state**：所有写操作先 IPC。
8. **`ON DELETE CASCADE` 必须验证**：删题目卷后，答案卷行、答案卷的 pages/segments、磁盘目录全部清掉，无孤儿。
9. **答案卷的 status 不流转到 `done`**：`done` 是题库入库的语义，答案卷不入库。
10. **M13 的 COALESCE 口径不受影响**：`listBankQuestions` JOIN 的是题目卷（`q.paper_id`），答案卷没有 questions 行，天然不干扰。第 2 步改完要跑一遍题库筛选确认。

---

## 8. 一句话总结

答案 PDF 当成 `kind='answer'` 且挂在题目卷下的一份特殊 paper，五张几何表和整个裁切界面零改动复用；匹配界面按序号自动配对+手动微调，确认后把答案渲染成 `a_{qid}.png` 写进题目行的 answer_* 字段（答案跟题走）；配对关系不落库；最大的坑是所有"列试卷"的地方都要过滤 `kind='paper'`。
