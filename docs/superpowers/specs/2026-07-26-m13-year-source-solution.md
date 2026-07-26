# M13 技术手册：题目年份 + 出处（试卷默认 + 单题覆盖）

- 日期：2026-07-26
- 角色：高级工程师（技术指导，不含实现代码）
- 输入：`2026-07-26-roadmap-m13-m17.md` 阶段 1 + 用户已确认决策 1（试卷默认 + 单题覆盖）
- 红线基线：纯函数红线延续、A12 先库后 state、schema 只加不改（幂等迁移）

---

## 0. 总体判断

小阶段，但有一个必须想清楚的点：**COALESCE 口径只在一个地方实现**。年份/出处的"继承+覆盖"逻辑如果散落在 UI、筛选、导出三处各写一遍，必然不一致。正确做法：SQL 查询层统一算好 `effective_year`/`effective_source` 返回给前端，前端只显示不计算。

## 1. Schema（幂等迁移，照 pages.rotation 先例）

- `papers` 加列：`year INTEGER`（可空）、`source TEXT`（可空）
- `questions` 加列：`year_override INTEGER`（可空）、`source_override TEXT`（可空）
- `StorageService.initDatabase` 用 `PRAGMA table_info` 检查后 `ALTER TABLE ADD COLUMN`，共 4 处，老库升级不丢数据
- `SCHEMA_V1` 常量同步加列（新装直接建全）

## 2. 数据读取口径（核心）

- `questionRepo.listQuestionsByPaper` 和 `questionFilter.buildQuestionQuery` 的 SELECT 改为 JOIN papers 并输出：
  - `COALESCE(q.year_override, p.year) AS effective_year`
  - `COALESCE(q.source_override, p.source) AS effective_source`
  - 同时保留原始 `year_override`/`source_override`（UI 需要区分"继承"还是"覆盖"来显示淡色/实色）
- `QuestionDTO`/`BankQuestionDTO` 加 `effective_year`/`effective_source`/`year_override`/`source_override` 四字段
- **注意**：`listQuestionsByPaper` 现在是 `SELECT *`，改成显式列名 + JOIN。这是行为等价的扩展，不算破坏红线，但要跑全量单测确认 `buildQuestionFilter` 7 个单测不退化

## 3. 筛选

- `QuestionFilterCriteria` 加 `year?: number | null`、`source?: string | null`
- `buildQuestionFilter` 加条件：`COALESCE(q.year_override, p.year) = ?`（source 同理）。**补新单测**（年份命中/出处命中/覆盖值优先于试卷值/组合），现有 7 个单测一字不动
- BankView 筛选侧栏加"年份"Select + "出处"Select，选项从现有数据 distinct 取（新增轻量 IPC `bank:listYearSources` 或复用查询，开工时定——尽量一个 IPC 返回 `{years[], sources[]}`）

## 4. UI 编辑

- **HomeView 试卷卡片**：编辑入口（年份 NumberInput + 出处 TextInput，Popover 或行内），写库走新 IPC `papers:updateMeta(paperId, {year, source})`
- **复查页/题库题卡**：显示 effective 值；复查页可单题覆盖（两个小输入，空=继承、填=覆盖，清空即回退继承），写库走新 IPC `questions:updateSourceOverride(questionId, {year_override, source_override})`
- 显示规范：继承值淡色（c="dimmed"）+ tooltip"继承自试卷"，覆盖值正常色

## 5. 新增 IPC 清单（本阶段申报）

1. `papers:updateMeta` — 更新试卷 year/source
2. `questions:updateSourceOverride` — 更新单题覆盖
3. `bank:listYearSources` — 筛选选项 distinct（若能并入现有查询则省掉）

## 6. 实施顺序

1. schema 迁移 + DTO + repo 读取口径（COALESCE）→ typecheck + 现有单测全绿
2. buildQuestionFilter 加条件 + 新单测 → 单测全绿
3. IPC + preload 三个方法
4. HomeView 试卷编辑 UI → 人测：填年份出处、重启仍在
5. BankView 筛选 + 题卡显示 → 人测：按年份筛、覆盖优先
6. 复查页单题覆盖 UI → 人测：覆盖/清空回退
7. 全量自测 typecheck + build + 单测

## 7. 红线

1. `buildQuestionFilter` 现有 7 单测一字不动，新条件只加新测
2. COALESCE 只在 SQL 层实现一次，前端不做继承计算
3. A12：先 IPC 后 state
4. 幂等迁移，老库可直接升级
5. 空值语义：`year_override IS NULL` = 继承；不要用 0 或空串表示继承

## 8. 一句话总结

papers 存默认、questions 存覆盖、SQL 层 COALESCE 统一出 effective 值，前端只显示不计算；筛选条件走同一口径，新增 3 个 IPC，全程幂等迁移不动现有单测。
