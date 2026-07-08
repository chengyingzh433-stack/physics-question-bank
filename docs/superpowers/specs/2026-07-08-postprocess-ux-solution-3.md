# 后期处理第三轮 UX 技术方案（高级工程师指导）

- 日期：2026-07-08
- 关联文档：`2026-07-08-postprocess-ux-issues-3.md`（需求，本方案输入）、`2026-07-06-development-progress.md`（项目现状）
- 文档性质：**技术指导，非实现细则**。定方向、划边界、点关键坑、给实施顺序和红线。具体代码由实现模型（Sonnet）完成。实现前请通读第 6 节红线。
- 覆盖需求：问题1（软删除原地显示）、问题2（标签现场创建）、问题3（模板现场编辑）、问题4（答案导入，本轮只记录不实现）。

---

## 0. 总体判断

四个问题的难度和性质差异很大，**不要当成一个整体做**，按独立子任务拆：

- **问题 1（软删除原地显示）**：唯一有真实架构难点的。核心是"原位"的定义——已删除片段现在被 `derivePreviewQuestions` 直接过滤掉，要原位显示必须新增一条"占位"数据通路，且不能污染题号推导。**这是本轮重点，单独一个纯函数 + 单测。**
- **问题 2（标签现场创建）**：一半已存在（知识点有 `handleCreateKp`），补章节 + 修掉现有的 state 串味 bug 即可。低风险。
- **问题 3（模板现场编辑）**：TemplateView 已有完整的规则增删交互（`handleAddRule`/`handleDeleteRule`），本质是把它抽成可复用组件，塞进后期处理/复查页的 Drawer。中风险（抽组件要小心不破坏 TemplateView）。
- **问题 4（答案导入）**：纯新功能，**本轮不动代码**，方案末尾只给方向性建议供未来评估。

**关键决策**：问题 1、2、3 相互独立，可各自独立提交、独立自测。问题 1 优先（用户最痛），问题 2/3 是工作流顺滑度优化。

---

## 1. 问题 1：软删除原地显示

### 1.1 核心难点

需求要"已删除片段显示在原来位置"。但"原来位置"不是一个存储字段——它是**该片段如果没被删、会排在第几题的位置**。现状 `derivePreviewQuestions`（`PostProcessService.ts:38`）第一步就 `.filter((s) => !s.is_deleted)`，删除片段根本不进列表。

不要试图给已删除片段算"精确插进第几题之间"——那会让题号推导和占位逻辑纠缠。**正确的抽象**：已删除片段按其自身的 `(page_index, order_index)` 排序，与未删除片段**共用同一个排序空间**，渲染时穿插进去，但**只有未删除片段参与题号计数**。

### 1.2 决策：扩展 `derivePreviewQuestions` 输出"含占位"的统一列表

新增一个纯函数（建议名 `derivePreviewItems` 或给 `derivePreviewQuestions` 加参数），产出一个**统一的有序列表**，每个元素是"题目"或"已删除占位"两种之一：

```
type PreviewItem =
  | { kind: 'question'; ...PreviewQuestion 现有字段 }
  | { kind: 'deleted'; segment: SegmentDTO }   // 单个已删除片段占位
```

排序键仍是 `(page_index, order_index)`——已删除片段和题目**在同一个排序空间里穿插**。题号（`previewNumber`）**只对 `kind:'question'` 递增**，已删除占位不占号。

**为什么不动现有 `derivePreviewQuestions`**：它有 8 个单测覆盖（红线）。两条路：
- 路 A（推荐）：新增 `derivePreviewItems`，内部可复用 `derivePreviewQuestions` 的分组逻辑，额外把已删除片段作为 `kind:'deleted'` 穿插。现有函数和单测不动。
- 路 B：给 `derivePreviewQuestions` 加 `includeDeleted` 参数。不推荐——改签名会牵动现有调用点和单测。

**走路 A。**

### 1.3 排序穿插的关键坑

已删除片段的 `order_index` 和未删除片段在**同一页内共享序号空间**（都来自 `deriveSegments`/`deriveAllSegments`）。但注意：合并组（question）取的是组内**最小** `(page_index, order_index)`。所以穿插时：
- 未删除项用其"题目位置"（合并组取最小键，独立片段取自身键）。
- 已删除项用其自身 `(page_index, order_index)`。
- 两者混排序，题号只给 `kind:'question'`。

**边界**：一个已删除片段的 order_index 可能正好等于某题的 order_index（比如它原本和相邻片段同序号区间）。排序稳定即可，穿插在前在后不影响用户理解——它显示为半透明占位，用户能认出来。

### 1.4 交互与显示

- 「显示已删除」Switch（`PostProcessView.tsx:487`）语义变更：ON = 已删除片段在原位半透明显示；OFF = 完全隐藏（现有行为，只渲染 `kind:'question'`）。
- 删除区**从末尾移除**（`PostProcessView.tsx:543-557` 那段 `deletedSegs` 集中显示删掉）。
- 已删除占位卡：复用一个轻量版 QuestionThumb（同样渲染该片段图像，但整体加 `opacity: 0.4` + 红色左边框 + "已删除"Badge + 一键恢复按钮）。恢复调现有 `handleRestore`（`PostProcessView.tsx:208`，已有）。
- 已删除占位**不显示题号**、不可选中、不可合并。

### 1.5 入库不变

`handleFinalize`（`PostProcessView.tsx:292`）已经 `.filter((s) => !s.is_deleted)`（第 308 行），入库时天然排除已删除片段。**这段一行不改，红线。** 需求说的"入库后才彻底删除"其实语义上已满足——入库不碰已删除片段，它们留在 `segments` 表但永不入库。不需要真正 DELETE 行。

### 1.6 验收

- 删除一个片段 → 它变半透明留在原位，后续题号自动重排（后面的题号 -1）。
- 关闭「显示已删除」→ 占位消失，题号连续。
- 点占位的恢复按钮 → 片段回归正常，题号重排。
- 入库 → 已删除片段不生成题图。
- 新纯函数单测：见第 5 节。

---

## 2. 问题 2：标签现场创建

### 2.1 现状盘点

`PaperReviewView.tsx` 已有：
- 知识点现场创建 `handleCreateKp`（第 107 行）——**但有 bug**：`newKpName` 是**组件级单个 state**（第 43 行），所有题目卡共用一个输入框状态，多卡同时输入会串味。
- 章节：只能从 `chapterData` 选，**无现场创建**。
- 难度：同章节，无现场创建（需求没提，可不做）。

### 2.2 决策

- **章节现场创建**：在章节 Select 旁加"+ 新建"入口（小按钮弹 Popover/Inline Input），调现有 `createChapter` IPC（已有），创建后 `listChapters` 刷新、自动选中到当前题。
- **修知识点 state 串味**：`newKpName` 从组件级单 state 改为**按题 id 的局部 state**，或更简单——把新建知识点的输入框抽进一个独立小组件（每张卡片自己的 state）。实现模型自行决定，但必须消除多卡串味。
- **后期处理页也要能创建**：需求说后期处理页（PostProcessView）也要能建标签。但 PostProcessView 现在**根本没有标签 UI**（它只做片段删除/合并/入库，标签是复查页 PaperReviewView 的事）。**决策：不在 PostProcessView 加标签 UI**——那会让后期处理页职责膨胀。标签创建/赋值统一在复查页 PaperReviewView 做（它本就是干这个的）。若用户坚持要在后期处理页赋标签，那是另一个更大的需求（把复查页能力并入后期页），本轮不做，需向用户澄清。

⚠️ **这一点实现模型必须停下向用户确认**：需求文档问题2/3 说"后期处理工作台"能创建标签和改模板，但后期处理页当前无标签 UI。是要（a）在复查页 PaperReviewView 补齐现场创建（推荐，职责清晰），还是（b）把标签能力搬进后期处理页（大改，不推荐）？**默认走 (a)，但开工前和用户确认一句。**

### 2.3 验收

- 复查页章节 Select 旁可新建章节，即时可选。
- 知识点新建不再多卡串味。
- 首页 TemplateView 预创建功能不动。

---

## 3. 问题 3：模板现场编辑

### 3.1 决策：抽共享组件 `TemplateRulesEditor`

TemplateView 的规则编辑区（`TemplateView.tsx:222-301`，规则 Table + 增删 + NumberInput/Select 行内表单）是完整可用的。抽成一个独立组件 `TemplateRulesEditor`（props: `templateId`, `types`, `onChange?`），在三处复用：
- TemplateView（重构为用新组件，行为不变）
- PaperReviewView 的模板工具栏旁加"编辑模板"按钮 → 弹 Drawer 内嵌 `TemplateRulesEditor`
- （可选）PostProcessView 侧栏的模板预览下拉旁同样加编辑入口

### 3.2 关键坑

- **抽组件不能破坏 TemplateView 现有行为**：TemplateView 的规则编辑和"题型管理""模板增删"是耦合在一个 Paper 里的。只抽**规则编辑那一段**（Table + 增删表单），题型/模板列表管理留在 TemplateView。抽完 TemplateView 必须行为完全一致（人测 + 现有交互不退化）。
- **编辑后即时刷新预览**：PaperReviewView/PostProcessView 里编辑模板规则后，`rules` state 要重新 `listRules` 拉取，模板预览标注（`templateTypeMap`）自动重算。这些页面已有 `rules` state 和 `listRules` 调用，复用即可。
- **模板编辑不改已入库题目**：改规则只影响预览标注（`applyTemplate` 算出的 `templateTypeMap`），不自动改 `questions.type_id`。用户要应用到题目仍需手动"套用模板"（PaperReviewView 已有 `handleApply`）。红线。

### 3.3 验收

- TemplateView 抽组件后行为不变（现有规则增删照常）。
- 复查页可弹 Drawer 编辑当前模板规则，改完预览标注即时更新。
- 编辑模板不动已入库题目类型。

---

## 4. 问题 4：答案导入（本轮不实现，方向建议）

**本轮不写代码。** 供未来评估的方向性判断：

- 答案 PDF 确实需要走和试卷类似的"导入→裁切→片段"流程，复用现有 CropView/deriveAllSegments 能力。
- **关联关系**建议用"按题号自动匹配 + 手动微调"：答案也切成片段并推导题号，按题号与试卷题目对应。数据上可新增 `answer_papers`/`answer_segments` 表，或给 `questions` 加 `answer_image_path` 字段。
- 导出时 `exportBasketPdf` 加 `includeAnswers` 开关，答案图接在题目后或单独成页。
- 这是一个**完整的新里程碑（M13 答案）**，需要独立的需求细化 + 方案。本轮跳过。

---

## 5. 实施顺序与单测要求

| 序 | 步骤 | 独立自测 |
|---|---|---|
| 1 | 问题1：新增 `derivePreviewItems` 纯函数（穿插已删除占位）+ 单测 | 新单测全过，现有 8 个 `derivePreviewQuestions` 单测不退化 |
| 2 | 问题1：PostProcessView 改用 `derivePreviewItems` 渲染，删末尾删除区，加占位卡（半透明+恢复） | typecheck + 人测：删除→原位半透明→恢复 |
| 3 | 问题2：PaperReviewView 补章节现场创建 + 修知识点 state 串味（**开工前确认 2.2 的 a/b**） | typecheck + 人测：新建章节/知识点 |
| 4 | 问题3：抽 `TemplateRulesEditor` 组件，TemplateView 复用（行为不变） | typecheck + 人测：TemplateView 规则增删照常 |
| 5 | 问题3：PaperReviewView（和可选 PostProcessView）加"编辑模板"Drawer 复用组件 | typecheck + 人测：现场改规则→预览更新 |
| 6 | 全量自测：typecheck + build + 单测 | 全绿 |

### 问题1 新纯函数单测（至少覆盖）

1. 无已删除片段 → `derivePreviewItems` 的 `kind:'question'` 项与 `derivePreviewQuestions` 结果一致（题号、顺序）
2. 一个已删除片段 → 产出一个 `kind:'deleted'` 项，穿插在正确位置（按 page_index, order_index）
3. 已删除片段不占题号：删中间片段后，后续题目 previewNumber 连续递减
4. 跨页：已删除片段按 (page_index, order_index) 穿插，不因 order_index 页内序而错位
5. 合并组 + 已删除片段混排：合并组按最小键定位，已删除按自身键，顺序正确
6. showDeleted=false 等价：只取 `kind:'question'` 项时，与 `derivePreviewQuestions` 完全一致

---

## 6. 红线（实现时必须遵守）

1. **`derivePreviewQuestions` 纯函数不动**：8 个单测覆盖。问题1 走新函数 `derivePreviewItems`，不改现有函数签名和逻辑。
2. **题号推导只数未删除项**：已删除占位永不占 `previewNumber`。这保证「显示已删除」ON/OFF 时题号一致。
3. **`handleFinalize` 的 `!s.is_deleted` 过滤不动**（`PostProcessView.tsx:308`）：入库天然排除已删除片段，不需要真正 DELETE segments 行。
4. **跨页排序键 `(page_index, order_index)` 不动**：`derivePreviewItems` 穿插排序仍用这个键，与 `derivePreviewQuestions`/`handleFinalize` 严格一致。已删除片段用自身键，不特殊处理。
5. **抽 `TemplateRulesEditor` 不破坏 TemplateView**：只抽规则编辑段，题型/模板列表管理留原处。抽完 TemplateView 行为逐项不退化。
6. **模板编辑不自动改已入库题目**：改规则只影响预览标注（`templateTypeMap`），`questions.type_id` 只由用户手动"套用模板"改。
7. **标签现场创建走现有 IPC**：`createChapter`/`createKnowledgePoint` 已有，直接调，不新增 IPC。
8. **不在 PostProcessView 加标签赋值 UI**（除非用户确认要）：标签是复查页职责，后期处理页保持"片段删除/合并/入库"单一职责。见 2.2，开工前确认。
9. **答案需求本轮不动代码**：只保留第 4 节方向建议。
10. **先写库再 state（A12）**：所有新增写操作（建章节、改模板规则）先 IPC 写库再更新 state。

---

## 7. 一句话总结

问题1（软删除原地显示）是本轮唯一有架构难点的：新增纯函数 `derivePreviewItems` 产出"题目+已删除占位"的统一有序列表，按 (page_index, order_index) 穿插，题号只数未删除项，`derivePreviewQuestions` 和 `handleFinalize` 都不动；PostProcessView 删末尾删除区、改为原位半透明占位卡+恢复。问题2（标签现场创建）补章节创建 + 修知识点 state 串味，标签能力留在复查页（开工前确认是否要搬进后期处理页）。问题3（模板现场编辑）把 TemplateView 的规则编辑段抽成 `TemplateRulesEditor` 共享组件，复查页弹 Drawer 复用，编辑只影响预览不改已入库题目。问题4（答案导入）本轮只记录方向不写代码。十条红线守：三个纯函数/过滤不动、题号只数未删除、跨页排序键不变、抽组件不破坏原页、模板编辑不改已入库、走现有 IPC、后期页职责单一、先写库再 state。
