# 开发进度记录

> **2026-10-25 M22 单题录入体验：** beta.9 已实现校对页选标签、正文与标签一次保存入库、题卡最新稿显示与原图对照、文字答案状态、单图/截图/文字快捷录入及可选组合预览。用户明确暂不做批量录题。类型检查、编译、DMG 制作及文件核验完成；Mac DMG 与说明已发布 GitHub，本机已更新 beta.9，旧 beta.8 已移入废纸篓，详见 [M22 交付记录](2026-10-25-single-question-workflow-delivery.md)。未运行功能测试，用户按 [说明](2026-10-25-single-question-workflow-guide.md) 验收。

> **2026-10-25 M21 多来源录题：** beta.8 实现截图/剪贴板、图片、PDF、DOCX 录入，原稿框选和分区文字/图片组题并行，草稿恢复、Doc2X 校对与确认入库。类型检查、编译、Mac DMG 制作及安装包文件检查完成，安装包和说明已上传 GitHub 并发布预发布版本，本机应用已更新到 beta.8、旧版已移入废纸篓；发布状态见 [M21 交付记录](2026-10-25-multi-source-intake-delivery.md)。没有运行冒烟或自动功能测试，功能验收由用户按 [使用说明](2026-10-25-multi-source-intake-guide.md) 完成。

> **2026-10-25 M20 软件更新：** 已按用户授权将仓库改为公开，并实现应用内版本检查、版本说明、校验下载、取消及安装入口。beta.7 保留 beta.6 Doc2X 全部功能；Mac 采用正常退出后的可恢复替换，题库资料及密钥不参与替换。检查、DMG 发布与本机安装状态见 [M20 交付记录](2026-10-25-in-app-update-delivery.md)。没有新增或运行功能、冒烟、界面或打包应用测试；用户按 [说明](2026-10-25-in-app-update-guide.md) 自行验收。

> **2026-10-25 M19 Doc2X 单题识别与校对：** 用户已确认云识别路线。beta.6 代码完成：上传副本预览、独立候选校对、处理事项、完整恢复草稿、来源及版本保护、任务暂停/续查；已通过类型检查和编译，Mac DMG 已上传 GitHub 并发布为预发布版本。没有调用真实识别服务，没有运行冒烟、自动功能、界面或打包应用功能测试。实际交付状态见 [M19 交付记录](2026-10-25-doc2x-ocr-delivery.md)，功能验收由用户按 [使用说明](2026-10-25-doc2x-ocr-guide.md) 完成。M18 beta.5 已发布，下面较早的“未接入 OCR”等描述保留为历史。

> **2026-10-23 Mac beta.4：** 已完成 Mac 运行时兼容升级，修复 PDF 自定义协议读取与知识点下拉布局，补充 Mac 关闭窗口后重新打开的行为；修复旋转页入库/题图/答案图，增加答案配对事务保存和来源失效清理。114 项自动测试及三套 GUI 回归通过；新增 Apple Silicon DMG 交付。Doc2X 的产品参考与识别候选身份已写入 README。Windows beta.4 未复测，真实资料未迁移。详见 [本轮交付记录](2026-10-23-mac-beta4-release.md)。下方“Mac 被阻塞”属于较早的同日接手快照。

> **2026-10-23 Mac 接手核查：** 已从 GitHub 拉取 `50eb217`（beta.3），梳理主流程、数据模型、文档及后续路线。用户明确以 Mac 继续开发。Apple Silicon 本机依赖安装、原生模块重建、类型检查和构建完成；99 项测试中 79 项纯逻辑通过，20 项依赖 Electron 的数据库测试因 Electron 31.7.7 被 macOS 安全检查拦截并移入废纸篓而失败，GUI 未执行。先安排 Mac 运行时兼容升级，再验收 beta.3 和推进可编辑题目/Word。真实 Windows 题库尚未迁移。详见 [Mac 接手计划](../plans/2026-10-23-mac-takeover-plan.md) 与 [验证记录](2026-10-23-mac-takeover-validation.md)。本轮只新增接手文档与索引，未修改业务源码或升级依赖。

> **2026-10-23 章节与知识点改进：** 已交付 **1.1.0-beta.3**。默认提供人教版（2019）高中物理六册、27章、125节预设；保留自定义章节和父子层级，后续可追加其他学科模板。后期处理、复查、题库统一使用可搜索章节菜单及知识点多选下拉；支持输入新知识点并选中。同时修复后期处理批量知识点 SQL 缺列及返回类型错误。99 项测试、类型检查、真实鼠标界面回归、打包及发布 EXE 复测通过；桌面快捷方式同步更新。目录来源、首次发布检查超时及复测结果见 [本轮交付记录](2026-10-23-chapter-templates.md)。

> **2026-10-23 拖放修复：** 已更新到 **1.1.0-beta.2**。主页支持单份/多份 PDF 拖放、进度提示、无效文件提示及失败回滚，保留按钮与答案卷导入。类型检查、89 项测试、打包及真实发布 EXE 原生文件拖放回归通过；桌面快捷方式同步更新。详见 [拖放修复记录](2026-10-23-drag-import-fix.md)。

> **2026-10-23 测试版交付：** 已生成 **1.1.0-beta.1** Windows 测试版与中文安装程序，桌面“教师题库测试版”可直接双击；原启动文件也改为打开发布程序。89 项测试、类型检查、打包、隔离 GUI 和真实发布 EXE 检查通过，实际验证了 PDF/PPT 三种答案模式导出、PDF 资源加载及单实例启动。交付文件、校验和及验证边界见 [测试版交付记录](2026-10-23-test-release.md)。下文此前“尚未重新打包”的记录是交付前快照。

> **2026-10-23 新功能进度：** 按用户指定顺序，先做“题库分类、检索、选题”，再做“题目编辑、组卷排版、Word 导出”，最后统一导航布局。完整顺序见 [后续执行目录](../plans/2026-10-22-execution-roadmap.md)，与 Doc2X 的逐模块差异见 [本轮设计](2026-10-22-bank-experience-design.md)。第一轮已实现个人题夹（同题多归类）、资料/标签检索、答案筛选、24 题分页、跨页多选、批量归类/入篮、取消入篮及题目/答案预览；题夹删除只清关联，不删原题。typecheck、89 项单测/数据库测试、build 和隔离 Electron 界面检查通过。仍待真实资料体验验收，尚未重新打包；正文 OCR、公式编辑和 Word 导出属于第二阶段，未在本轮实现。

> **2026-10-22 接手核查补记：** 当前代码 HEAD 为 `d1dede6`（2026-08-03），主线已推进到 M17。已重跑 typecheck、79 项单测和 build，全部通过；本次未进行 GUI 人测或重新打包。当前功能清单、历史状态冲突、验收缺口及后续顺序见 [项目接手计划](../plans/2026-10-22-project-takeover-plan.md)。下文保留历史记录：M16/M17 的“待开工”、完成 Modal 的“延期”等旧描述不应当作当前状态。完成 Modal 已有代码；M17 仅完成部分查询优化；现有安装包时间为 2026-07-07，需要验证并重新生成最新交付版本。

- 日期：2026-08-02（更新，**M17 架构审视已完成**）
- 关联文档：…`-crop-box-select-issues.md`（框选需求）、`-crop-box-select-solution.md`（框选技术方案）、`-postprocess-ux-issues-3.md`（第三轮需求：软删除/标签/模板/答案）、`-postprocess-ux-solution-3.md`（第三轮技术方案）、`2026-07-26-m14-answer-solution.md`（M14 答案功能技术手册）、`2026-07-28-answer-postprocess-solution.md`（M14.5 答案后期处理技术手册）、`2026-08-02-m15-walkthrough-issues.md`（M15 走查问题）、`2026-08-02-m15-fix-summary.md`（M15 修复总结）
- 本文档记录截至当前的开发状态，对照技术设计文档逐节说明实现情况，并列出剩余工作。

---

## 1. 总体状态

主线链路 **M0→M1→M2→M3→M4**（导入→裁切→后期处理→入库出图）代码全部完成，M5–M10 的功能代码也已完成。**前端 UI 已用 Mantine 7 重构完成**（2026-07-07）。**M11 打包已修复**（2026-07-07，`npmRebuild: false` + npmmirror 镜像 + winCodeSign 手动解压）。**加固项 T3–T8 全部完成**（2026-07-07）。**裁切/后期/复查白屏 bug 已修复**（2026-07-07，命令式 innerHTML 与 React 子节点解耦）。**后期处理 UX 第一轮重构已完成**（2026-07-07，UX-1/2/3：片段网格→题目纵向列表+拼合大图+题号题型标注）。**缩略图渲染竞态 + 跨页排序 bug 已修复**（2026-07-07，详见 5.4）。**后期处理第二轮 UX 重构已完成**（2026-07-07，UX2-1 侧栏布局 + UX2-2 Ctrl+Z 撤销 + UX2-3 缩略图缩放，详见 5.6）。**自定义存储位置已完成**（2026-07-07，设置 Drawer 可改存储路径+自动迁移，详见 5.7）。**裁切框选已完成**（2026-07-08，新增 `manual_boxes` 表 + `deriveAllSegments` 合并函数 + CropOverlay 框选交互 + CropView 工具栏 4 档，详见 5.7）。**第三轮 UX 已完成**（2026-07-08，软删除原地显示+标签现场创建+模板现场编辑，详见 5.8）。**第四轮 UX 已完成**（2026-07-09，独立片段标签赋值修复+复查页入库门禁+图片占位兜底，详见 5.9）。**M13 年份/出处已完成**（2026-07-26，试卷默认+单题覆盖，SQL 层 COALESCE 统一口径，详见 5.10）。**M14/M14.5 答案功能已完成**（2026-07-31，答案导入+裁切+匹配+后期处理+工作流隔离，详见 5.12/5.13）。**M15 全链路走查已完成**（2026-08-02，撤销bug修复+答案可选流程，详见 5.14）。**M16 PPT导出已完成**（2026-08-02，pptxgenjs每题一页+三种答案模式，详见 5.15）。**M17 架构审视已完成**（2026-08-02，N+1查询优化+代码质量检查，详见 5.16）。**自测通过**（typecheck **零错误**、build 通过、**79 个单测全绿**）。

**已验证可用**的硬链路：
- Electron 31 + better-sqlite3（Electron ABI 125）原生模块加载 + SQL 读写
- `app://` 自定义协议安全映射项目文件
- pdfjs-dist v4 渲染 PDF（v6 因 `Promise.try` 在 Electron 31 Chromium 崩溃，已降级 v4）
- pdf-lib + 内嵌中文字体（Noto Sans SC）生成 PDF（中文不乱码已验证）
- 比例坐标派生片段 + R1 合成拼接（单测覆盖）

---

## 2. 对照技术设计文档的实现情况

### 第 2 节 核心设计原则
| 原则 | 实现情况 |
|---|---|
| 不做 OCR，存渲染图 | ✅ questions.image_path 指向 PNG，无文字提取 |
| 人工可控 | ✅ 分列/横切/合并全由用户操作 |
| 几何用比例坐标 | ✅ column_dividers.x_ratio、cut_lines.y_ratio、segments 的 x/y_ratio 全为 0..1 |
| 进程职责分离 | ✅ 渲染层管 pdfjs + UI（RenderService）；主进程管 DB + 文件（StorageService/FileService/ExportService） |
| 一切可续编 | ✅ 所有变更先写库再更新 state（useCropData hook 遵循"DB 是真值"），重启从库重载 |

### 第 3 节 技术栈
| 选型 | 实际版本 | 说明 |
|---|---|---|
| Electron + React + TS | Electron 31.7.7 / React 18.3 / TS 5.5 | ✅ |
| pdf.js | **pdfjs-dist 4.10.38** | ⚠️ 手册未锁版本，原装 v6 与 Electron 31 不兼容，降级 v4 |
| SQLite | better-sqlite3 11.10.0 | ✅ electron-rebuild 按 Electron ABI 编译 |
| 图像存储 | PNG 文件 | ✅ userData/projects/{id}/images/ |
| 导出 PDF | pdf-lib 1.17 + @pdf-lib/fontkit 1.1 | ✅ 内嵌 Noto Sans SC |
| 打包 | electron-builder 24.13 | ✅ 配置完成，打包成功（`npmRebuild: false` + npmmirror 镜像 + winCodeSign 手动解压绕过 darwin 符号链接权限） |
| 状态管理 | **未引入 Zustand**，用 React state + hooks | ⚠️ 偏离设计，当前规模够用，重构时可引入 |
| **UI 组件库** | **Mantine 7.17.8 + @tabler/icons-react** | ✅ 前端重构完成（2026-07-07），见第 10 节 |
| 构建 | electron-vite 2.3 | ✅ |
| 单测 | Vitest 2.0 | ✅ 58 个（原28 + PostProcessService 14 + deriveAllSegments 10 + questionFilter 年份出处 6） |

### 第 3.1 节 四个坑
1. 导出 DPI：✅ EXPORT_DPI=300 集中定义（shared/constants.ts），屏幕低 DPI/入库高 DPI 两条路径分开
2. 中文字体：✅ Noto Sans SC TTF 已下载（assets/fonts/），fontkit subset 内嵌
3. better-sqlite3 原生模块：✅ dev 用 electron-rebuild；打包 asarUnpack 已配置（但打包本身失败）
4. 图像不走 IPC：✅ `app://` 协议提供给 `<img>`；仅入库那一刻 ArrayBuffer 落盘

### 第 4 节 PDF 查看与缩放
- 适应宽度（默认）：✅ `PDFViewer.computePageState` 按 `containerW/(width_pt*BASE_DPI/72)`
- 适应整页：✅
- 缩放档位 50/75/100/125/150/200% + +/- 按钮 + 百分比显示：✅
- Ctrl+滚轮以光标锚点缩放（25%–400%）：✅ 改百分比（未实现以光标为锚点的滚动补偿，但有上下限）
- 多页虚拟化滚动：✅ IntersectionObserver（rootMargin 1000px）
- 缩放与裁切坐标解耦：✅ overlay 用比例，`getBoundingClientRect()` 换算

### 第 5 节 裁切模型（分列 + 横切）
- 单/双/三栏可切换：✅
- 均分列分隔线 + 拖动：✅ A13 clamp 到相邻 ±EPS
- 跟随光标横向示意线 + 点击落刀：✅ 限当前列
- 撤销/删除：✅ 按 created_seq 撤销
- 片段派生：✅ `deriveSegments` 纯函数 + 10 单测（单栏2刀=3段、双栏各1刀=4段顺序、去重、越界夹紧）
- 逐页列模式：✅ pages.column_mode

### 第 6 节 后期处理模型
- 按序纵向列表缩略图：✅ PostProcessView（UX-1 重构：SimpleGrid→Stack+QuestionCard）
- 软删除 is_deleted + 显示已删除/恢复：✅
- 多选合并 → question_segments（merge_order）：✅
- 取消合并无损还原：✅ 删 question 占位行，segments 仍在
- 拼合大图预览：✅ QuestionThumb 多段纵向合成 + 正确 rotation（UX-2）
- 题号题型标注：✅ 第X题+题型 Badge + 模板预览下拉（UX-3）

### 第 7 节 SQLite 数据模型
- 18 张表全部按 schema.ts 建表：✅
- 外键级联：✅ `PRAGMA foreign_keys = ON` + ON DELETE CASCADE
- 删试卷级联：✅ DB 行级联（**磁盘图片文件未清理，见第 5 节遗留**）

### 第 8 节 模块/进程架构
- StorageService + 各 repository：✅ paperRepo/pageRepo/segmentRepo/questionRepo/questionTypeRepo/templateRepo/tagRepo/setRepo
- FileService（项目目录 + app:// 协议）：✅
- ExportService（pdf-lib 组装）：✅
- IPC 命名空间化：✅ papers/pages/cutlines/dividers/segments/questions/types/templates/chapters/kps/diffs/sets/bank/export/files
- contextIsolation:true、nodeIntegration:false、sandbox:true：✅
- RenderService / ColumnCropService / 视图：✅
- **ViewportController 未独立抽出**，逻辑在 PDFViewer 内：⚠️ 重构时可拆

### 第 9 节 里程碑
见下表。

---

## 3. 里程碑完成度

| 里程碑 | 设计文档验收点 | 实际状态 | 自测 | 人测 |
|---|---|---|---|---|
| **M0 脚手架** | 应用能启动，库能建表 | ✅ 完成 | ✅ schema v1 ready + 18 表 + 种子 | ⏳ 弹窗显示 pong |
| **M1 导入+持久化** | 导入后重启仍在列表 | ✅ 完成 | ✅ app:// 协议 + paperRepo 端到端 | ⏳ 导入多页 PDF |
| **M2 裁切工作区** | 重启精确还原所有线与片段 | ✅ 完成 | ✅ deriveSegments 10 单测 + pageRepo 端到端 | ⏳ 画布交互、缩放、落线 |
| **M3 后期处理** | 重启还原删除与合并 | ✅ 完成 | ✅ questionRepo 端到端（合并/取消/级联） | ⏳ 缩略图、多选合并 |
| **M4 入库+出图** | 入库题在库中可见、图清晰 | ✅ 完成 | ✅ R1 拼接单测 + pdf-lib 字体验证 | ⏳ 入库、题图清晰度 |
| **M5 题型模板** | 套模板正确、可手改 | ✅ 完成 | ✅ applyTemplate 6 单测 + typeRepo 端到端 | ⏳ 模板管理 UI |
| **M6 标签** | 标签持久、可多知识点 | ✅ 完成 | ✅ tagRepo 端到端（多选/去重/级联） | ⏳ 赋标签 UI |
| **M7 原卷复查** | 顺序与状态正确 | ✅ 完成 | — | ⏳ 复查页 |
| **M8 题库浏览+筛选** | 组合筛选结果正确 | ✅ 完成 | ✅ buildQuestionFilter 7 单测 + 端到端 | ⏳ 筛选 UI |
| **M9 组卷篮** | 重启后篮内容保留 | ✅ 完成 | ✅ setRepo 端到端（去重/重排） | ⏳ 勾选/重排 UI |
| **M10 导出** | 打印预览清晰不变形 | ✅ 代码完成 | ✅ pdf-lib 中文嵌入验证 | ⏳ 导出 PDF 打印预览 |
| **M11 打包** | 干净机器安装版可用 | ✅ **打包成功** | ✅ `npmRebuild:false` + npmmirror | ⏳ 干净机器安装冒烟 |
| **M12 加固** | 删除确认、错误态、备份 | ✅ 全完成 | ✅ 磁盘清理/备份/DPI设置/损坏PDF提示/内存释放 | ⏳ 全链路走查 |
| **M13 年份/出处** | 筛选与标注正确 | ✅ 完成并人测通过 | ✅ COALESCE 口径 + 6 单测 | ✅ 全部 7 项通过 |
| **M14 答案匹配** | 答案跟题走、重启后仍在 | ✅ 完成 | ✅ 复用 papers 表 + 9 阶段全完成 | ⏳ 待 M15 全链路 |
| **M14.5 答案后期** | 答案卷合并组匹配正确 | ✅ 完成 | ✅ deriveAnswerItems 合并组 + 7 单测 | ⏳ 待 M15 全链路 |

---

## 4. 自测覆盖

### 4.1 单元测试（Vitest，79 个全过）
- `ColumnCropService.test.ts`（14 个）：单栏2刀=3段、双栏各1刀=4段顺序、列间互不干扰、三栏均分、解耦、退化段过滤、越界夹紧、像素相接 A5、R1 拼接尺寸数学
- `deriveAllSegments.test.ts`（10 个）：rectsOverlap 3个（重叠/不相交/边界相切）+ deriveAllSegments 7个（无框=原结果红线5、分割框出现、排除框筛推导片段、排除框不筛分割框决策B、排除框不相交、场景B行优先、多行行优先）
- `TemplateService.test.ts`（7 个）：区间命中、未命中、null order、规则重叠 rule_order、开区间端点
- `questionFilter.test.ts`（16 个）：无条件、单条件、多条件 AND、知识点 EXISTS、组合、DISTINCT、年份出处 COALESCE 口径、答案卷隔离
- `PostProcessService.test.ts`（14 个）：derivePreviewQuestions 8个（3独立→3题、2合并+1独立→2题、已删除不计、合并组排首片段位置、空列表、单片段单题、跨页排序先page_index再order_index、跨页合并组排首片段页位置）+ derivePreviewItems 6个（无已删除=一致、单已删除占位穿插、已删除不占题号、跨页穿插、合并组混排、kind:question等价derivePreviewQuestions）
- `AnswerMatchService.test.ts`（18 个）：deriveAnswerItems 散片段 6个（序号正确、key=a{id}、已删除排除、跨页排序、无pageIndexMap退化、空列表）+ 合并组 7个（双组顺序、散片段退化兼容、merge_order排序、部分删除保留、全删除消失、跨页合并组）+ autoPairAnswers 5个（数量相等、合并组带整组、题多于答案、答案多于题、配对顺序一致）

### 4.2 端到端验证（ELECTRON_RUN_AS_NODE + 内存 SQLite）
- **M0-4**：18 表 + 5 题型 + 4 难度 + 幂等
- **M1-1**：createPaper/listPapers/getPages/级联删除
- **M2-2/3/4**：列模式 + 分隔线 + 横切线 + 派生 + 撤销 + 重启还原
- **M3**：合并/取消合并/renumber/级联
- **M5**：题型 CRUD（内置不可删）/模板规则/applyTemplate/删模板级联
- **M6**：标签 CRUD/多选替换/去重/删知识点级联/删章节 SET NULL
- **M8**：listBankQuestions 组合筛选（type/paper/chapter/difficulty/kp）+ paper_name
- **M9**：draft 复用/去重/order 递增/交换重排/group_header/移除

### 4.3 其他验证
- **app:// 协议**：net.fetch 返回 `%PDF-` 字节，路径穿越返回 403
- **pdf-lib 中文字体**：生成测试 PDF，中文标题嵌入成功（可变字体 + subset）
- **better-sqlite3**：Electron Node 模式跑 SQL 读写 `SQLITE_OK`
- **typecheck**：node + web 全过
- **build**：electron-vite 三段（main/preload/renderer）全过

---

## 5. 偏离设计文档与遗留问题

### 5.1 偏离
1. **pdfjs-dist v4 而非 v6**：v6 的 worker 用 `Promise.try`（ES2024），Electron 31 Chromium 不支持，worker 崩溃导致导入极慢。降级 v4.10.38。已记 memory。
2. **preload 输出 CJS**：electron-vite 默认 ESM `.mjs`，sandbox 下裸跑报 `Cannot use import statement`。改强制 CJS `.cjs`。
3. **未引入 Zustand**：设计提到 Zustand，当前用 React state + hooks，规模够用。
4. **ViewportController 未独立**：逻辑内联在 PDFViewer，未抽独立模块。
5. **脚手架手写**：`npm create` 被权限拦，手写等价 electron-vite react-ts 结构。
6. **electron 二进制走 npmmirror 镜像**：github 直连 ECONNRESET。
7. **选 Mantine 7 而非 shadcn/ui**：交接文档推荐 shadcn+Tailwind，实际选用 Mantine 7——开箱即用、中文友好、暗色模式一流、组件齐全，更适配"不懂设计想省心"的诉求。详见 `2026-07-06-frontend-redesign-plan-mantine.md`。
8. **@mantine/modals 无 styles.css**：`@mantine/modals` 7.x 不含 `styles.css`（样式已包含在 core 里），构建时 import 它会报 `Missing "./styles.css" specifier`。已移除该 import。

### 5.2 遗留问题（待处理）
1. ~~**M11 打包失败**~~：✅ 已修复（2026-07-07）。`electron-builder.yml` 加 `npmRebuild: false`；winCodeSign 手动只解压 win 部分绕过 darwin 符号链接权限问题；electron 下载走 npmmirror 镜像。
2. ~~**删试卷磁盘文件未清理**~~：✅ 已修复（2026-07-07）。`FileService.deletePaperDir()` + 严格路径校验（正整数 + relative 不以 .. 开头 + startsWith 双保险），`papers:delete` 改 async 先删 DB 后删磁盘。
3. ~~**Ctrl+滚轮未以光标为锚点**~~：✅ 已修复（2026-07-07）。`PDFViewer` 内 `useLayoutEffect` 在缩放生效后按锚点比例补偿 `scrollLeft/scrollTop`，使光标下内容不动。onWheel 从 CropView 下沉到 PDFViewer。
4. ~~**M12-2 未做**~~：✅ 已完成（2026-07-07）。DB 备份用 `db.backup(dest)`（better-sqlite3 安全 API）；入库渲染 DPI 由 `app_settings` 表 `export_dpi` 键控制（默认 300，UI 在 LibraryLayout 设置 Drawer 里）。
5. ~~**旋转页面**~~：✅ 已修复（2026-07-07）。`StorageService.initDatabase` 幂等迁移加 `pages.rotation` 列；导入时 `getPageSize` 返回 `page.rotate`；`computePageState` 读 `page.rotation` 传给 PageCanvas。
6. ~~**裁切/后期/复查白屏崩溃**~~：✅ 已修复（2026-07-07）。根因：PDFViewer PageCanvas 的 `host.innerHTML=''` 清掉了 React 渲染的 `{overlay}`，导致 React 操作已删除 DOM 而崩溃。修复：canvas 挂载点与 React 子节点解耦成独立兄弟 div（`canvasMountRef` / `containerRef`）。PostProcessView SegmentThumb 同样修复。详见 `2026-07-07-workflow-whitescreen-diagnosis.md`。

### 5.3 人测发现的 UX/功能问题（2026-07-07）→ ✅ 已修复

以下问题由用户在首次人测中发现，**已完成重构修复**（2026-07-07），技术方案见 `2026-07-07-postprocess-ux-solution.md`。

1. **后期处理：片段应纵向依次排列，而非平面网格** → ✅ 已修复。`SimpleGrid` 改为 `Stack`，`PreviewQuestion` 按题号从上到下排列。

2. **后期处理：片段缩略图不显示裁切内容** → ✅ 已修复。`SegmentThumb(maxW=172,rotation=0)` 替换为 `QuestionThumb(maxW=360,rotation=正确)`，合并题多段纵向拼合；`reloadAll` 带 rotation 修复；`renderSegmentsAtDpi` 也不再硬编码 rotation=0。

3. **后期处理：应在片段上显示题号和题型标注** → ✅ 已修复。新增 `derivePreviewQuestions` 纯函数推导题号；每张 `QuestionCard` 显示"第X题"+"题型"Badge；工具栏加模板预览下拉（仅显示不写库）。

核心改动：
- **新增** `src/renderer/src/services/PostProcessService.ts`：`derivePreviewQuestions` 纯函数 + 8 单测
- **重构** `src/renderer/src/views/PostProcessView.tsx`：Stack+QuestionCard+QuestionThumb+模板预览
- **修复** `src/renderer/src/services/QuestionRenderService.ts`：`renderSegmentsAtDpi` 支持 rotation（不再硬编码 0）

### 5.4 缩略图渲染竞态 + 跨页排序 bug（2026-07-07）→ ✅ 已修复

UX 第一轮重构后人测发现"部分缩略图渲染失败"和"返回裁切改了再回来，题号顺序就乱"。根因两个：

1. **`renderPageRegion` 渲染竞态**：该函数（缩略图预览专用）启动 pdfjs `renderTask` 后**没有 `await renderTask.promise` 就同步 `drawImage` 裁剪**，裁剪时整页 canvas 还空白 → 裁出空白图。`renderPage`（整页）和 `renderPageRegionAtDpi`（入库）都正确 await，故一直正常。修复：改为先 await 再裁剪，并释放整页 canvas。

2. **跨页排序 bug**（核心）：`order_index` 是**页内序号**（`deriveSegments` 每页从 0 开始），但 `derivePreviewQuestions` 和 `handleFinalize` 都**只按 `order_index` 排序**，跨页时所有页的 order=0 挤一起、order=1 挤一起 → 多页时顺序必乱。修复：排序键改为 **`(page_index, order_index)`**，两处（预览推导 + 入库题号）都改，逻辑严格一致。`derivePreviewQuestions` 新增 `pageIndexMap` 参数，+2 跨页排序单测。

3. **QuestionThumb 并发渲染冲突**：所有卡片挂载即并发渲染，多卡对同一 PDF page 并发 `page.render()` 触发 pdfjs worker 冲突。修复：加 IntersectionObserver 虚拟化（`rootMargin: 500px`），只在接近可视时渲染，单段失败不阻断整题。

核心改动：
- `src/renderer/src/services/RenderService.ts`：`renderPageRegion` 改为 await 后裁剪
- `src/renderer/src/services/PostProcessService.ts`：`derivePreviewQuestions` 按 (page_index, order_index) 排序，新增 `pageIndexMap` 参数
- `src/renderer/src/views/PostProcessView.tsx`：`handleFinalize` 同步改排序键；QuestionThumb 加虚拟化

### 5.5 后期处理第二轮 UX 问题（2026-07-07）→ ✅ 已修复

UX 第一轮重构 + 渲染/排序 bug 修复后，缩略图可见、顺序正确，但用户继续人测又发现 3 个 UX 问题（**非 bug，是交互设计不符合真实使用场景**）。问题定义见 `2026-07-07-postprocess-ux-issues-2.md`，技术方案见 `2026-07-07-postprocess-ux-solution-2.md`。

1. **后期处理：工具栏应在侧栏，而非顶部** → ✅ 已修复。改为 Flex 双栏布局：左主区题目列表（flex:1 overflowY:auto），右侧栏固定（flexShrink:0 width:280 overflowY:auto）。IntersectionObserver root 指向左主区滚动容器。窄屏（≤768px）退化为顶部工具栏。

2. **后期处理：缺撤销操作** → ✅ 已修复。实现 undoStack 逆操作路线：四种逆操作描述符（delete/restore/merge/unmerge），Ctrl+Z 执行逆操作真实 IPC + reloadAll 校准。防输入框误触、忙时禁用、入库清空栈、侧栏可视化撤销按钮。

3. **后期处理：缩略图大小不能缩放** → ✅ 已修复。侧栏 SegmentedControl 四档（小200/中360/大560/特大800）。关键重构：渲染与显示解耦——maxW 从渲染 useEffect 依赖中移除，独立轻量 effect 只改 canvas CSS 尺寸，调档瞬时生效不重跑 pdfjs。持久化到 app_settings 键 `postprocess_thumb_width`。

### 5.6 自定义存储位置（2026-07-07）→ ✅ 已完成

用户希望将试卷项目文件存储到自定义目录（如 D 盘大空间磁盘），而非硬编码的 `userData/projects/`。

改动：
- **`FileService.ts`**：新增 `getProjectsRoot()`（动态读取 `app_settings` 表 `storage_path` 键），`paperDir()`/`deletePaperDir()`/`handleAppProtocol()` 三处硬编码全部改用它；新增 `migrateStorage(newPath)`（mkdir→逐项 cp→写设置→删旧数据，任一步失败抛出不丢数据）。
- **IPC**：新增 `dialog:openDirectory`（弹选择目录框）、`storage:migrate`（迁移）、`storage:getDefaultPath`/`storage:getCurrentPath`（获取路径）。
- **`preload/types`**：暴露 `openDirectoryDialog()`、`migrateStorage()`、`getDefaultStoragePath()`、`getCurrentStoragePath()` 四个新方法。
- **`LibraryLayout.tsx`**：设置 Drawer 新增"数据存储"区块——显示当前路径（monospace）、"更改位置"按钮（弹目录+迁移）、"恢复默认"按钮、迁移中 LoadingOverlay。

红线：DB 不迁移（`app.db` 留 `userData`）、`app://` URL 格式不变、渲染器侧代码零改动。

### 5.7 裁切框选（2026-07-08）→ ✅ 已完成

用户发现裁切页的横切功能无法处理两种常见场景：
1. 试卷侧边有姓名栏/考号栏等无关区域，需要**矩形框选**精确裁掉，横切只能切整行。
2. 排版不好的试卷同一行有两道题并排，横切只能按行切出一整条，无法分开。

需求定义见 `2026-07-07-crop-box-select-issues.md`，技术方案见 `2026-07-07-crop-box-select-solution.md`。

改动：
- **`schema.ts`**：新增 `manual_boxes` 表（id/page_id/paper_id/x_start_ratio/x_end_ratio/y_start_ratio/y_end_ratio/is_excluded/created_seq）。
- **`types.ts`**：新增 `ManualBoxDTO` 接口 + Api 4 方法（listManualBoxes/addManualBox/deleteManualBox/undoLastManualBox）。
- **`pageRepo.ts`**：新增 `listManualBoxes`/`addManualBox`/`deleteManualBox`/`undoLastManualBox`（created_seq 撤销模式与 cut_lines 一致）。
- **`ipc/index.ts`**：新增 4 handler `manualboxes:list/add/delete/undo`。
- **`preload/index.ts`**：新增 4 桥接方法。
- **`ColumnCropService.ts`**：新增 `rectsOverlap`（AABB 相交纯函数）+ `deriveAllSegments`（合并推导片段与手画框，排除框只减推导不减分割，无分割框页原样返回保红线5，有分割框页行优先重排）。
- **`deriveAllSegments.test.ts`**：新增 10 单测（3 rectsOverlap + 7 deriveAllSegments，含红线5钉死、决策B验证、场景B行优先）。
- **`useCropData.ts`**：新增 `manualBoxes` state + loadAll 加载 + addManualBox/deleteManualBox/undoLastManualBox + `recomputeSegments` 改用 `deriveAllSegments`。
- **`CropView.tsx`**：ToolMode 扩展为 `pan/cut/box-split/box-exclude` 四档 + 撤销框按钮 + 传新 props。
- **`CropOverlay.tsx`**：框选交互（mousedown/move/up 画矩形 + 虚线预览 + 落框 min/max 归一化）+ 已落框显示（分割框主题色实线/排除框红色虚线 + 点框即删）。

红线确认：比例坐标、deriveSegments 不动、segments 同构、先写库再 state、无框页排序零变、横切框选共存、纯 div 无 canvas、排除只减推导不减分割、旋转页不崩。

### 5.8 第三轮 UX（2026-07-08）→ ✅ 已完成

用户人测后提出 4 个 UX 问题，需求定义见 `2026-07-08-postprocess-ux-issues-3.md`，技术方案见 `2026-07-08-postprocess-ux-solution-3.md`。

**问题 1：软删除原地显示**
- **改动**：
  - `PostProcessService.ts`：新增 `derivePreviewItems` 纯函数 + `PreviewItem` 类型（`kind:'question'` | `kind:'deleted'`），按 `(page_index, order_index)` 穿插已删除占位，题号只对 question 递增。现有 `derivePreviewQuestions` 不动（红线 1）。
  - `PostProcessView.tsx`：改用 `derivePreviewItems` 渲染主列表；删末尾集中删除区；新增 `DeletedPlaceholderCard`（半透明+红色左边框+"已删除"Badge+恢复按钮）；`showDeleted` Switch ON=原位显示占位，OFF=只渲染 question。
  - `PostProcessService.test.ts`：+6 单测（无已删除=一致、单占位穿插、不占题号、跨页穿插、合并组混排、question 等价旧函数）。
- **红线确认**：derivePreviewQuestions 不动、题号只数未删除、handleFinalize 的 `!s.is_deleted` 过滤不动、跨页排序键不变。

**问题 2：标签现场创建**
- **改动**：
  - `PaperReviewView.tsx`：`newKpName` 从组件级单 state 改为 `newKpNames: Record<number, string>`（修多卡串味 bug）；章节 Select 旁加 Popover 新建入口（调 `createChapter` IPC）。
  - `PostProcessView.tsx`：`reloadAll` 扩展加载 chapters/kps/diffs/qKps；QuestionCard 新增标签区（章节/难度 Select + 知识点 Chip.Group + 现场创建输入框）；标签 handler 走现有 IPC。
- **红线确认**：走现有 IPC（createChapter/createKnowledgePoint）、先写库再 state（A12）。

**问题 3：模板现场编辑**
- **改动**：
  - **新增** `src/renderer/src/components/TemplateRulesEditor.tsx`：从 TemplateView 的规则编辑段（Table + 增删 + NumberInput/Select 表单）抽出共享组件，props: `templateId`, `types`, `onChange?`。
  - `TemplateView.tsx`：重构为使用 `<TemplateRulesEditor>`，行为不变（红线 5）。
  - `PaperReviewView.tsx`：模板工具栏加"编辑模板"按钮→Drawer 内嵌 `TemplateRulesEditor`。
  - `PostProcessView.tsx`：侧栏模板预览 Select 旁加编辑按钮→Drawer 内嵌 `TemplateRulesEditor`。
- **红线确认**：抽组件不破坏 TemplateView、模板编辑不自动改已入库题目。

**问题 4：答案导入**：本轮不实现，方向建议记录在方案文档第 4 节。

**⚠️ 人测发现的遗留缺陷（2026-07-08，第四轮需求已记录）→ ✅ 已修复（2026-07-09）**：第三轮标签赋值用 `preview.questionId != null` 门控（PostProcessView 第 828 行），导致**只有合并过的题目能赋标签，大量未合并的独立片段无法赋标签**。原卷复查页（PaperReviewView）用 `listQuestionsByPaper` 取入库后题目，未合并片段在入库前不出现、且反馈"不显示原图"。修复方案见 `2026-07-08-postprocess-ux-solution-4.md`，实现详见 5.9。

---

## 6. 剩余工作

按优先级：

### P0（阻断发布）
- **T2 全链路人工走查**：导入→裁切→后期处理→入库→复查→筛选→组卷→导出，确认视觉/交互正确。**已开始**，裁切/后期/复查白屏已修复，后期处理 UX 两轮已重构，缩略图渲染/跨页排序 bug 已修复，自定义存储位置已完成。

### P1（裁切框选）→ ✅ 已完成
- **裁切框选功能**：✅ 已完成。新增 `manual_boxes` 表 + `deriveAllSegments` 合并函数 + CropOverlay 框选交互 + CropView 工具栏 4 档。详见 5.7。

### P1（第三轮需求，2026-07-08）→ ✅ 已完成
- **软删除原地显示**：✅ 已完成。新增 `derivePreviewItems` 纯函数（6 单测），产出"题目+已删除占位"统一列表；PostProcessView 删末尾删除区，改为原位半透明占位卡（opacity:0.4 + 红色左边框 + "已删除"Badge + 恢复按钮）；showDeleted Switch ON=原位显示，OFF=只渲染 question。详见 5.8。
- **标签现场创建**：✅ 已完成。PaperReviewView：修知识点 newKpName 多卡串味（改为 `Record<number, string>` 按题 id 独立），加章节现场创建（Popover + createChapter IPC）；PostProcessView：QuestionCard 加标签赋值区（章节/难度 Select + 知识点 Chip.Group + 现场创建），走现有 IPC。详见 5.8。
- **模板现场编辑**：✅ 已完成。抽 `TemplateRulesEditor` 共享组件（从 TemplateView 规则编辑段抽出），PaperReviewView 和 PostProcessView 各加"编辑模板"按钮→Drawer 复用组件。编辑只影响预览标注不改已入库题目。详见 5.8。
- **答案导入**：本轮不实现，方向建议记录在方案文档第 4 节。

### 5.9 第四轮 UX 修复（2026-07-09）→ ✅ 已完成

用户人测发现第三轮的标签赋值功能只对合并过的题目生效，独立片段（占大多数）无法赋标签；复查页对未入库试卷显示不全。需求定义见 `2026-07-08-postprocess-ux-issues-4.md`，技术方案见 `2026-07-08-postprocess-ux-solution-4.md`。

**问题 1：独立片段无法赋标签**
- **根因**：`QuestionCard` 里 `isStandalone = preview.questionId === null` 把"能否合并/删除"和"能否赋标签"耦合，且标签区用 `{preview.questionId != null && (...)}` 门控。独立片段 questionId 为 null（无 question 行），所有标签 IPC 需 questionId → 写不进去。
- **决策**：lazy promote-on-tag——首次赋标签时 `createQuestionWithSegments(pid, segIds, null)` 为该片段建单段 question 行（`is_merged=0`），拿回 qid 再写标签。
- **改动**：
  - `PostProcessView.tsx`：
    - `isStandalone` 改为 `!preview.isMerged`（语义拆分：合并/删除 vs 标签解耦）
    - 标签区门控去掉，对所有 question 项渲染；questionId 为 null 时取值用可选链容错
    - 新增 `ensureQuestionId(preview)`：questionId 非空直接返回，为 null 则建单段行 + reloadAll
    - 5 个标签 handler 签名从 `(qid, ...)` 改为 `(preview, ...)`，内部先 ensure 再走原 IPC
    - `newKpNames` key 从 questionId 改为 `preview.key`（独立片段 ensure 前 questionId 为 null 但 key 稳定）
    - `selectedStandaloneCount` / `handleMerge` 过滤 `pq.questionId === null` 改 `!pq.isMerged`（升格后仍可被勾选合并）
    - `handleMerge` 收集选中项里 questionId != null 的旧单段 qid，建合并行后 `deleteQuestion` 清理（防 `question_segments` 双挂——最大坑）
    - `handleFinalize` 构建 qOrders 时取 segs 后过滤 `!is_deleted`，全删则 `deleteQuestion` 清理并跳过（空题守卫，不改 liveSegs.filter 那行红线）
  - `PaperReviewView.tsx`：`is_merged` 判断改 `=== 1`（DTO 是 number）
  - `TemplateView.tsx`：补缺的 `Group` 导入（上一轮抽组件遗留的硬错误）
- **红线确认**：derivePreviewItems/derivePreviewQuestions 纯函数不动、handleFinalize 的 segment 过滤不动、A12 先库后 state、不新增 IPC、合并组标签不继承（已知取舍）。

**问题 2：复查页显示不全/无图**
- **根因**：复查页数据源 `listQuestionsByPaper` 只返回入库后 question 行。用户未点"完成入库"就进复查页 → 只有合并组有行、无图。
- **决策**：明确复查页为"入库后最终复查"，加 status 门禁 + 图片占位兜底。
- **改动**：
  - `PaperReviewView.tsx`：
    - `reloadAll` 加 `getPaper(pid)` 取 status
    - `status !== 'done'` 显示"请先完成入库"Alert + 回跳 `/post/{pid}` 按钮，不渲染网格
    - 题图区改为始终渲染：有 `image_path` 显示 `<img>`，无则灰底"无题图"占位
    - 新增 `Alert`/`Container`/`Box`/`IconArrowLeft` 导入
- **红线确认**：不去 derive 未入库预览、图片 URL 格式不变。

### 5.10 M13 年份/出处（2026-07-26）→ ✅ 已完成（待人测）

需求见 `2026-07-26-roadmap-m13-m17.md` 阶段 1，技术手册见 `2026-07-26-m13-year-source-solution.md`。用户决策：**试卷默认 + 单题覆盖**。

**数据模型**
- `papers` 加 `year INTEGER` / `source TEXT`（试卷默认值）
- `questions` 加 `year_override INTEGER` / `source_override TEXT`（单题覆盖）
- `StorageService.initDatabase` 加 4 处幂等迁移（`PRAGMA table_info` 检查后 `ALTER TABLE`），老库直接升级
- **NULL = 继承**，不用 0 或空串表示（手册红线 5）。repo 写入层把空串归一为 NULL

**读取口径（核心）**
- `questionRepo` 抽出 `QUESTION_COLUMNS` 常量，COALESCE **只写这一次**：
  `COALESCE(q.year_override, p.year) AS effective_year`（source 同理）
- `listQuestionsByPaper` 从 `SELECT *` 改显式列 + `JOIN papers`；`listBankQuestions` 共用同一常量
- DTO 同时暴露 `effective_*`（显示用）和 `*_override`（区分继承/覆盖用）
- 前端**只显示不计算**，杜绝继承逻辑散落多处不一致

**筛选**
- `QuestionFilterCriteria` 加 `year?` / `source?`，条件走同一 COALESCE 口径
- `buildQuestionQuery` 现在始终 `JOIN papers p`（COALESCE 需要 `p` 别名）
- 现有 7 个单测**一字未动**，新增 6 个（年份命中/出处命中/null 不加条件/空串不加条件/组合参数顺序/JOIN 存在性）→ 单测 52 → 58

**新增 IPC（3 个，按手册申报制）**
- `papers:updateMeta` — 更新试卷默认年份/出处
- `questions:updateSourceOverride` — 更新单题覆盖
- `bank:listYearSources` — 筛选选项 distinct（按 effective 口径）

**UI**
- `HomeView`：试卷卡片加 `PaperMetaPopover`（年份 NumberInput + 出处 TextInput），卡片显示紫/蓝 Badge
- `BankView`：筛选栏加年份/出处 Select（可搜索）+ 已选条件 Badge 可清除；题卡显示年份出处，**继承值 outline 灰色 + tooltip"继承自试卷"，覆盖值 light 彩色 + tooltip"本题单独设置"**
- `PaperReviewView`：每题加 `QuestionOverrideFields`——留空即继承（placeholder 显示"继承 2023"），填写即覆盖，**失焦提交**（非每字符写库）

**顺带清理（本轮附带，非 M13 范围）**
- `TemplateView.tsx` 补缺失的 `Group` 导入（上一轮抽组件遗留的硬错误，之前 tsc 报 10 行）
- `deriveAllSegments.test.ts` 修 2 处 TS2345（`order_index` 可能 undefined）+ 删未用变量
- `LibraryLayout` 删未用 `Alert`、`TemplateRulesEditor` 删未用 `Stack`/`TextInput`、`PostProcessView` 删未用 `Paper`/`IconZoomQuestion`
- 结果：**typecheck 从"10+ 遗留错误"变为零错误**

**自测**：typecheck 零错误（node + web）、build 三段通过、58 单测全绿。**人测待用户执行**（见下方待测清单）。

**M13 待人测清单**
1. 主页试卷卡点标签图标 → 填年份 2023 + 出处"新课标 I 卷" → 保存 → 卡片显示两个 Badge，重启仍在
2. 题库页筛选栏出现"年份"和"出处"下拉，选 2023 能筛出该卷的题
3. 题库题卡年份出处显示为灰色 outline（继承），悬停提示"继承自试卷"
4. 复查页每题底部有年份/出处输入框，placeholder 显示"继承 2023"
5. 复查页给某题填年份 2024 → 失焦保存 → 回题库看该题变紫色实心 Badge，提示"本题单独设置"
6. 清空那题年份输入框 → 失焦 → 回退成继承的 2023（灰色 outline）
7. 按年份 2024 筛选，只出现被覆盖的那一题（验证覆盖优先）

**人测结果（2026-07-26）：✅ 全部通过。**

### 5.11 人测发现的修复（2026-07-26）→ ✅ 已完成

M13 人测期间发现 5 个问题，全部修复：

**问题 1：PDF 显示错位、只显示左半、缩放无效（老 bug，非 M13 引入）**
- **根因**：`RenderService.renderPage` 里 `scale` 已含 dpr（`widthCss * dpr / widthPt`），画布尺寸也按此开，却又调了 `ctx.scale(dpr, dpr)` → 内容被放大 **dpr² 倍**，画布只装得下左上角的 1/dpr。
- **暴露条件**：仅在 `devicePixelRatio > 1`（显示器缩放 125%/150%）的机器上出现；dpr=1 时两种算法等价，所以从 M2 至今一直没暴露。
- **修复**：删掉 `ctx.scale(opts.dpr, opts.dpr)`，加注释钉死原因。`renderPageRegion`/`renderPageRegionAtDpi` 本来就没这个问题。
- **连带修复**：Ctrl+滚轮光标锚点缩放（T4）也恢复正常——之前锚点补偿依赖 `scrollWidth`，内容溢出时该值失真。

**问题 2：模板套用后按题型筛选无结果**
- **根因**：后期处理页的模板 Select **只是预览标注，从不写库**（只算 `templateTypeMap` 用于卡片 Badge），`questions.type_id` 始终为 null。复查页的"套用模板"按钮才真写库，但用户在后期页操作够不着。
- **修复（双保险）**：
  1. 后期页侧栏新增 **"套用题型到题目"** 按钮（青色）→ `handleApplyTemplateToQuestions`：对每题先 `ensureQuestionId`（独立片段建行），再 `setQuestionType`。未命中规则的题不动。
  2. `handleFinalize` 里排完题号后，若选了模板则用**最终 `order_in_paper`（i+1）** 重算 `applyTemplate` 并写库。
- **关键坑**：入库时必须用最终题号重算，**不能复用预览期的 `previewNumber`**——有已删除片段或合并组时两者会错位。

**问题 3：已入库试卷可重复点"完成入库"**
- **修复**：`reloadAll` 取 `paper.status` 存 `paperStatus` state。`status==='done'` 时按钮变橙色**"重新生成题图"**（`IconRefresh`）+ 下方小字"此卷已入库"，确认弹窗改警告文案（重渲染+重排题号+覆盖已有图，标签不受影响）。
- **决策**：保留重新生成能力而非直接禁用——用户可能回头重裁了片段，完全禁用就没法重新出图。

**问题 4：题库看不清完整题目**
- **决策**：网格 + 点击放大 Modal（而非改纵列列表）。理由：网格一屏扫 20+ 题，筛选后快速勾选的效率是列表给不了的；看不清时点开即可。
- **实现**：`BankView` 题图加 `cursor: zoom-in` + 点击打开 90% 宽 Modal，内含完整题图 + 题型/年份/出处/章节/难度/知识点全套 Badge + "加入组卷篮"按钮。知识点在打开 Modal 时才查（`openZoom`），不在列表期做 N+1。

**问题 5：组卷篮为空时"去题库浏览"按钮无反应**
- **根因**：`BasketView` 的 `EmptyState` 的 `onAction` 是空函数占位（注释写着"由侧栏导航处理"，但从未接线）。
- **修复**：接入 `useNavigate()` → `navigate('/bank')`。

**自测**：typecheck 零错误、build 通过、58 单测全绿。

### P1（第四轮需求，2026-07-08）→ ✅ 已完成
- **独立片段可赋标签**：✅ 已完成。lazy promote-on-tag 建单段行 + isStandalone 语义拆分 + 合并清理旧单段行防双挂 + 入库空题守卫。详见 5.9。
- **复查页显示修复**：✅ 已完成。入库门禁（status!=='done'拦截）+ 图片占位兜底。详见 5.9。

### M13–M17 路线图（2026-07-26 起）
总路线图见 `2026-07-26-roadmap-m13-m17.md`。五个阶段，一阶段一轮循环：

- **M13 年份/出处** → ✅ **已完成并人测通过**（2026-07-26）。详见 5.10、5.11。
- **M14 答案导入+裁切+匹配** → ✅ **已完成**（2026-07-31）。详见 5.12。
- **M14.5 答案后期处理** → ✅ **已完成**（2026-07-31）。详见 5.13。
- **M15 全链路验收走查** → ✅ **已完成**（2026-08-02），问题1/3已修复，问题2推迟。详见 5.14。
- **M16 PPT 导出** → ⏳ 待开工。pptxgenjs 每题一页可编辑。
- **M17 架构审视** → ⏳ 待开工。PostProcessView 拆分、标签区抽共享组件、N+1 查询批量化、ViewportController 抽出等。

### P1（UX，第二轮人测发现）→ ✅ 全部完成
- **UX2-1 后期处理侧栏布局**：✅ 已完成。Flex 双栏，右侧栏固定，IntersectionObserver root 适配，窄屏退化。
- **UX2-2 后期处理撤销**：✅ 已完成。undoStack 逆操作 + Ctrl+Z + 防误触 + 入库清空栈。
- **UX2-3 后期处理缩略图缩放**：✅ 已完成。渲染/显示解耦，SegmentedControl 四档，持久化 app_settings。

### ~~P0/P1/P2（已完成）~~
（见旧版，已全部完成或移至 P1）

---

## 7. 关键文件索引

```
src/
├── main/
│   ├── index.ts                    # 主进程入口（app ready → initDB + registerIpc + protocol）
│   ├── storage/
│   │   ├── schema.ts               # SCHEMA_V1 建表 SQL + 内置题型/难度常量
│   │   ├── StorageService.ts       # getDb 单例 + initDatabase（建表+种子+幂等迁移rotation）
│   │   ├── questionFilter.ts       # buildQuestionFilter/buildQuestionQuery（纯函数+单测）
│   │   └── repositories/
│   │       ├── paperRepo.ts        # papers/pages CRUD
│   │       ├── pageRepo.ts         # 列模式/分隔线/横切线/手画框(manual_boxes) CRUD
│   │       ├── segmentRepo.ts      # segments 派生替换
│   │       ├── questionRepo.ts     # questions CRUD + 入库 + 题库查询
│   │       ├── questionTypeRepo.ts # 题型 CRUD（内置不可删）
│   │       ├── templateRepo.ts     # 模板+区间规则
│   │       ├── tagRepo.ts          # 章节/知识点/难度 + 题目赋标签
│   │       └── setRepo.ts          # 组卷篮（draft set + items）
│   ├── files/FileService.ts        # 项目目录 + app:// 协议 + saveQuestionPng + deletePaperDir（T3）+ 自定义存储位置（getProjectsRoot/migrateStorage）
│   ├── export/ExportService.ts     # pdf-lib 导出（中文标题+编号+分页+R4）
│   └── ipc/index.ts               # 所有 ipcMain.handle
├── preload/index.ts                # contextBridge 暴露 Api
├── renderer/src/
│   ├── App.tsx                     # HashRouter 路由（两级 Layout 包裹）
│   ├── main.tsx                    # MantineProvider + ModalsProvider + Notifications
│   ├── theme.ts                    # Mantine 主题定义（sky 主色/字体/圆角）
│   ├── global.css                  # 全局基础样式（Mantine 语义色变量）
│   ├── services/
│   │   ├── RenderService.ts        # pdfjs 封装（渲染整页/区域，低/高 DPI）
│   │   ├── ImportService.ts        # 导入流程编排 + describeImportError（T7 友好中文提示）
│   │   ├── ColumnCropService.ts    # deriveSegments + deriveAllSegments + rectsOverlap + 像素换算 + R1 尺寸数学（纯函数）
│   │   ├── deriveAllSegments.test.ts# deriveAllSegments + rectsOverlap 单测（10个）
│   │   ├── QuestionRenderService.ts# renderSegmentsAtDpi + composeQuestionCanvas
│   │   ├── PostProcessService.ts   # derivePreviewQuestions + derivePreviewItems（纯函数+14单测）
│   │   ├── TemplateService.ts      # applyTemplate（纯函数）
│   │   └── useCropData.ts          # 裁切数据 hook（加载+变更持久化+重算派生+manualBoxes）
│   ├── components/
│   │   ├── AppLayout/
│   │   │   ├── LibraryLayout.tsx   # 库区布局（侧边导航+亮暗切换+篮计数）
│   │   │   └── WorkflowLayout.tsx   # 工作流布局（全屏+步骤指示）
│   │   ├── StatusBadge.tsx         # 试卷状态徽章（importing/cropping/processing/done）
│   │   ├── EmptyState.tsx          # 空列表引导（图标+文案+CTA）
│   │   ├── TemplateRulesEditor.tsx # 模板规则编辑共享组件（Table+增删+表单）
│   │   ├── paperStatus.ts          # 状态→颜色/标签映射
│   │   └── useBasketCount.ts       # 组卷篮计数 hook
│   └── views/
│       ├── HomeView.tsx            # 主页试卷列表 + 导入 + 删除
│       ├── PDFViewer.tsx           # 查看器（适应/缩放/虚拟化）+ overlay 注入
│       ├── CropOverlay.tsx         # 分隔线/横切线/框选交互层（pan/cut/box-split/box-exclude）
│       ├── CropView.tsx            # 裁切工作区（整合查看器+overlay+工具栏4档）
│       ├── PostProcessView.tsx     # 后期处理（侧栏布局+拼合大图+题号题型标注+模板预览+缩放+撤销）**UX两轮重构完成**
│       ├── PaperReviewView.tsx     # 原卷复查（套模板/手改题型/赋标签）
│       ├── BankView.tsx            # 题库网格 + 侧栏筛选 + 勾选入篮
│       ├── BasketView.tsx          # 组卷篮管理（重排/分组/导出）
│       └── TemplateView.tsx        # 题型与模板管理
└── shared/
    ├── types.ts                    # IPC 契约 + DTO
    └── constants.ts                # EXPORT_DPI/A4 尺寸/边距常量
```

启动方式：双击项目根目录 `启动(无窗口).vbs`（dev 模式）。

---

## 10. 前端重构完成记录（2026-07-07）

### 10.1 概述

将全部 7 个视图从纯内联样式（`style={{...}}` 散落、无复用、硬编码颜色）重构为基于 **Mantine 7** 的组件化界面。方案文档见 `2026-07-06-frontend-redesign-plan-mantine.md`。

### 10.2 引入的依赖
- `@mantine/core@7.17.8` — UI 组件库 + 设计令牌
- `@mantine/hooks@7` — hooks（useDisclosure/useHotkeys 等）
- `@mantine/modals@7` — 确认弹窗（替代 window.confirm）
- `@mantine/notifications@7` — toast 通知
- `@tabler/icons-react` — 图标

### 10.3 基础设施
- **主题**（`theme.ts`）：sky 主色、Noto Sans SC 字体栈、默认圆角 md
- **Provider**（`main.tsx`）：MantineProvider + ModalsProvider + Notifications
- **全局 CSS**（`global.css`）：Mantine 语义色变量、滚动条美化
- **两级布局**：
  - `LibraryLayout`：库区（主页/题库/组卷篮/模板）——常驻侧边导航 + 亮暗切换 + 篮计数徽章
  - `WorkflowLayout`：工作流区（裁切/后期/复查）——全屏专注 + 步骤指示

### 10.4 各视图重构要点

| 视图 | 重构要点 |
|---|---|
| HomeView | SimpleGrid 卡片 + StatusBadge + 导入 Button 主色 + 删除走 modals.openConfirmModal + EmptyState 空态 + LoadingOverlay |
| TemplateView | 左右 Grid 双栏 + 内置题型锁图标 + 规则用 Table + NumberInput+Select 行内表单 |
| PostProcessView | SimpleGrid 缩略图 + 多选 Checkbox + Switch 显示已删除 + 合并组 Badge + 入库 Progress 进度条 + 二次确认 |
| PaperReviewView | Card 网格 + Select 题型/章节/难度 + Chip.Group 知识点多选 + 临时新建 + 模板 Select+套用 |
| BankView | 可折叠筛选侧栏 + Chip 知识点 + 已选条件 Badge(可点×清除) + 入篮醒目边框+图标 |
| BasketView | 列表式 Paper + ActionIcon 上下移/移除 + TextInput 分组标题 + Affix 固定底栏导出 + EmptyState |
| CropView | SegmentedControl 列模式/工具 + ActionIcon 返回/撤销 + 工具栏分组 |
| PDFViewer | ZoomToolbar 用 ActionIcon+Select + 深色背景 `var(--mantine-color-dark-7)` + 圆角页面阴影 |
| CropOverlay | 分隔线 hover 加粗+变色 + 横切线 hover 变红 + 落刀短暂高亮动画 + 列高亮用主题色（**坐标数学完全不动**） |

### 10.5 反馈层
- `window.confirm` / `alert` → `modals.openConfirmModal`（危险操作红色确认）/ `notifications.show`（成功/失败 toast）
- 导入/入库/导出 → LoadingOverlay + notifications
- 入库逐题渲染 → Progress 进度条
- 错误红字 div → Alert 组件

### 10.6 暗色模式
- MantineProvider `defaultColorScheme="light"` + 顶栏切换按钮（太阳/月亮图标）
- 裁切工作区用 `var(--mantine-color-dark-7)` 深色背景（自然凸显 PDF 白页）
- 所有硬编码颜色（`#0078d7`/`#333`/`#555`/`#999`/`#eee`/`#f5f5f5`/`#525659`/`crimson`）已全部删除，换成 Mantine 语义色
- CropOverlay 的半透明 rgba 交互色保留（Mantine 无等价半透明变体）

### 10.7 红线遵守确认
- ✅ IPC 契约（Api 接口签名）未动
- ✅ 主进程 / preload / 纯逻辑函数未动
- ✅ 裁切坐标数学（比例坐标 + getBoundingClientRect + A13 clamp + A3 renderTask cancel）原样保留
- ✅ "先写库再更新 state"时序保留（useCropData）
- ✅ 路由路径不变
- ✅ 28 单测全绿、typecheck 全过、build 三段成功

### 10.8 踩坑记录
1. **Mantine v9 要求 React 19**：`npm install @mantine/core` 默认装 v9，与 React 18 不兼容（peer dependency 报错）。解决：`npm install @mantine/core@7`。
2. **@mantine/modals 无 styles.css**：Mantine 7 的 modals 包不含 `styles.css`（样式已包含在 core 里），import 会报 `Missing "./styles.css" specifier`。解决：移除 `import '@mantine/modals/styles.css'`。
3. **tabler 图标名差异**：`IconUndo`/`IconOpen` 不存在于 @tabler/icons-react。改用 `IconArrowBackUp`/`IconArrowRight`。

---

## 11. 收尾加固记录（2026-07-07）

设计方案见 `2026-07-07-completion-and-hardening-plan.md`。本节记录实际执行结果。

### 11.1 T1：M11 打包修复 ✅

**问题**：electron-builder 默认 `npmRebuild: true`，按 Node ABI 重编 better-sqlite3 → 与 Electron ABI 125 不匹配。

**解决**：三板斧——
1. `electron-builder.yml` 加 `npmRebuild: false`，跳过重编，直接用 dev 阶段 `electron-rebuild` 产物。
2. 设 `ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指向 npmmirror，解决 github 直连 EOF。
3. winCodeSign 缓存手动用 7zip 只解压 windows 部分（跳过 darwin 符号链接），绕过 Windows 无创建符号链接权限报错。

**结果**：`npm run dist` 产出 `release/物理教师题库管理系统 Setup 1.0.0.exe`（126MB）。

### 11.2 T3：删试卷磁盘文件清理 ✅

**改动**：
- `FileService.ts` 新增 `deletePaperDir(paperId)`，三重校验：正整数、`relative()` 不以 `..` 开头、`startsWith` 在 projects/ 根下。
- `ipc/index.ts` `papers:delete` 改 async，先删 DB 行（级联）再 `await fileService.deletePaperDir(id)`。

### 11.3 T4：Ctrl+滚轮光标锚点缩放 ✅

**改动**：
- `PDFViewer.tsx`：加 `pendingAnchorRef`（ZoomAnchor），`onWheel` 记录锚点（clientX/Y + 旧滚动量 + 旧内容尺寸），调 `onZoomPercentChange`。
- 加 `useLayoutEffect` 依赖 `zoomMode/zoomPercent`，在缩放生效后、绘制前按比例补偿 `scrollLeft/scrollTop`。
- `CropView.tsx`：移除旧 `onWheel` 和 `useCallback`（已下沉到 PDFViewer）。

**红线确认**：CropOverlay 比例坐标数学完全未动。

### 11.4 T5：旋转页支持 ✅

**改动**：
- `StorageService.ts`：`initDatabase` 加幂等迁移，`PRAGMA table_info(pages)` 检查 rotation 列，无则 `ALTER TABLE` 加 `rotation INTEGER NOT NULL DEFAULT 0`。
- `RenderService.ts`：`PageSize` 接口加 `rotation` 字段，`getPageSize` 返回 `page.rotate`。
- `ImportService.ts`：`NewPageDTO` 加 `rotation: s.rotation`，导入时存入 DB。
- `shared/types.ts`：`PageDTO`/`NewPageDTO` 加 `rotation: number`。
- `PDFViewer.tsx`：`computePageState` 读 `page.rotation ?? 0` 传给 PageCanvas。

**注意**：裁切旋转页暂未特殊处理（比例坐标在旋转后仍成立，但 90/270 度时列方向的语义会变）。先保证渲染正立，裁切旋转页作独立子任务。

### 11.5 T6：DB 备份导出 + 导出 DPI 设置 ✅

**改动**：
- `ipc/index.ts`：新增 `db:backup`（`dialog.showSaveDialog` + `db.backup(dest)`）、`settings:get`、`settings:set`（读写 `app_settings` 表）。
- `shared/types.ts`/`preload/index.ts`：新增 `backupDatabase()`、`getSetting(key, default)`、`setSetting(key, value)`。
- `PostProcessView.tsx`：入库渲染 DPI 从 `getSetting('export_dpi', '300')` 读取，替代硬编码 `EXPORT_DPI`。移除 `EXPORT_DPI` import。
- `LibraryLayout.tsx`：新增设置 Drawer（齿轮图标打开），含 DPI Select（150/200/300/600）+ 备份数据库 Button。

### 11.6 T7：损坏 PDF 导入友好提示 ✅

**改动**：
- `ImportService.ts`：新增 `describeImportError(e)` 归类 pdfjs 错误（PasswordException→"已加密"、InvalidPDFException→"已损坏"、MissingPDFException→"找不到文件"、其他→原始 message）。`importPagesFromPdf` 在 loadPdf 和后续步骤失败时抛 `new Error(describeImportError(e))`。
- `HomeView.tsx`：`handleImport` 失败时回滚已建 paper 行（`deletePaper` + `refresh`），避免列表留脏行。

### 11.7 T8：大 PDF 出图内存监控 ✅

**确认已有**：`PostProcessView.tsx:194-195` 逐题渲染后 `canvas.width = 0; canvas.height = 0` 释放合成 canvas 和每个 segment canvas，已实现"不让多高清 canvas 并存"。

### 11.8 打包踩坑记录

1. **electron-rebuild EPERM**：`better_sqlite3.node` 被 electron 进程占用无法删除。解决：先 `taskkill /F /IM electron.exe` 杀掉所有 electron 进程。
2. **github.com 下载 EOF**：electron-builder 下载 Electron 二进制从 github 直连失败。解决：设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
3. **winCodeSign 解压符号链接失败**：7zip 解压 darwin `.dylib` 符号链接时 Windows 无权限（"客户端没有所需特权"）。解决：手动用 `7za x archive.7z -ooutdir 'windows-*' 'rcedit*' 'appxAssets'` 只解压 win 部分到 `winCodeSign-2.6.0` 缓存目录。
4. **`NotificationData` 无 `size` 属性**：Mantine 7 的 `notifications.show()` 参数不含 `size`。解决：删除 `size: 'sm'`。
### 5.14 M15 走查 + 问题修复（2026-08-02）→ ✅ 全部完成

走查结果见 `2026-08-02-m15-walkthrough-issues.md`，修复总结见 `2026-08-02-m15-fix-summary.md`，发现3个问题：

**问题 1：撤销上一刀始终从第一页开始（🔴 P0 bug）** → ✅ **已修复（5次迭代）**
- **根因演化**：
  - 第1次：`PDFViewer` 未调用 `onVisiblePageChange` → 加scroll listener → activePageId正确但变成"只撤当前页"
  - 第2次：意识到用户期望全局撤销 → 改参数为 paperId → 点击无反应
  - 第3次：`cut_lines` 无 paper_id 字段 → 加 JOIN pages → 撤销工作但顺序错乱
  - 第4次：**真正根因**：`created_seq` 是**页内序号**（每页从1开始），不是全局序号
  - **最终方案**：改用主键 `ORDER BY c.id DESC`（全局自增，绝对顺序）
- **修复文件**：
  - `src/main/storage/repositories/pageRepo.ts` - undoLastCutLine/undoLastManualBox 改用 id 排序
  - `src/main/ipc/index.ts` - 参数从 pageId 改为 paperId
  - `src/preload/index.ts` - 桥接参数修改
  - `src/shared/types.ts` - 类型定义修改
  - `src/renderer/src/services/useCropData.ts` - 处理 affectedPageId + 返回类型修复
  - `src/renderer/src/views/CropView.tsx` - 撤销按钮传 pid，去掉 disabled
  - `src/renderer/src/views/PDFViewer.tsx` - scroll listener（第1次遗留）
- **Commits**: e234aa7, aee66ad, 3faf5b7, 15ec682, d0a6d51（5个）
- **人工测试**：✅ 通过（多页跨刀撤销顺序正确）

**问题 4（新增）：答案匹配应该可选（🟡 P1 UX）** → ✅ **已修复**
- **现象**：答案匹配页强制要求导入答案PDF，但有时暂时没有答案，应该允许先入库题目。
- **修复**：
  - 标题改为"导入答案 PDF（可选）"
  - 新增说明："如果暂时没有答案，可以稍后再匹配或直接完成入库"
  - 新增"稍后再匹配"按钮（variant=light）→ 直接跳转主页
  - 保留"选择答案 PDF"为主要操作（violet）
- **文件**：`src/renderer/src/views/AnswerMatchView.tsx`（+12行）
- **Commit**: 3faf5b7

**问题 3：完成流程无结束提示（🟡 P1 UX）** → ⏳ **推迟到 M17**
- **决策**：非阻塞性UX改进，答案可选流程已解决主要痛点，Modal提示推迟。

**问题 2：框选片段需手动调整位置（🟡 P2 新需求）** → ⏳ **推迟到 M17**
- **技术分析**：需要 DB Schema 迁移（`question_segments.y_offset`）、`QuestionRenderService` 支持偏移、`PostProcessView` 拖动交互，成本~120行。
- **决策**：优先级低，用户可通过重新裁切绕过。

**自测结果**：
- TypeScript: ✅ 0错误
- 单元测试: ✅ 79个全绿
- Build: ✅ 通过
- GitHub: ✅ 已推送 `e234aa7..d0a6d51`

**M15 正式完成** - 核心bug修复，可选流程优化，进入M16。
- **技术手册**：见 `2026-08-02-m15-technical-handbook.md` 问题2章节（仅分析，未实施）。

**自测**：typecheck 零错误、build 通过、79 单测全绿。**人测待用户执行**（见测试计划 14 个用例）。

**M15 状态**：✅ **核心问题已修复，问题2推迟**。技术手册见 `2026-08-02-m15-technical-handbook.md`，测试计划见 `2026-08-02-m15-fix-test-plan.md`。

---

### 5.15 M16 PPT导出（2026-08-02）→ ✅ 已完成

**目标**：从组卷篮导出可编辑 PowerPoint (.pptx)，每题一页。

**技术选型**：
- **pptxgenjs@3.12.0**（纯JS，主进程可跑，MIT协议，~120KB）
- 16:9 宽屏布局（10 x 5.625 英寸）
- base64图片嵌入，原生保存对话框

**功能**：
- 每题一页：题号标题（可编辑文本框）+ 题图（等比缩放居中）+ 出处角标（右上角小字）
- 答案模式（与PDF导出一致）：
  - **无答案**（默认）：只导出题目
  - **每题后紧跟**：题目页后插入答案页
  - **末尾集中**：所有题目后统一放参考答案区（缩小版，多页自动分页）
- BasketView 两个导出按钮并列："导出 PDF"（sky）、"导出 PPT"（orange）

**实现文件**：
1. **`src/main/export/ExportServicePpt.ts`**（新增，269行）
   - `exportBasketPptx(setId, title, answerMode)` 主函数
   - SQL查询：JOIN questions/papers/question_types，读取题图/答案图/出处年份
   - 逐题添加slide：题号标题 + 出处角标 + 题图（等比缩放到最大 w=8, h=4.5）
   - inline模式：每题后插入答案slide
   - append模式：末尾集中答案（缩小版 w=3），yOffset超4.8自动换页
   - 保存对话框：`dialog.showSaveDialog` → `pptx.writeFile()`

2. **`src/main/export/ExportService.ts`**（修改）
   - 导出 `exportBasketPptx`（re-export from ExportServicePpt）

3. **`src/main/ipc/index.ts`**（修改）
   - 新增 `export:basketPptx` handler

4. **`src/shared/types.ts`**（修改）
   - 新增 `exportBasketPptx` 类型定义

5. **`src/preload/index.ts`**（修改）
   - 桥接 `exportBasketPptx`

6. **`src/renderer/src/views/BasketView.tsx`**（修改）
   - 导入 `IconFileTypePpt`
   - 新增 `handleExportPptx` 回调（复用 exportTitle 和 answerMode state）
   - 新增"导出 PPT"按钮（color=orange）

**错误处理**：
- setId不存在/无题目 → 抛错
- 图片文件不存在 → console.warn 跳过，继续后续
- 保存失败 → 抛错，渲染层显示通知
- 用户取消保存对话框 → 返回null，不显示通知

**自测结果**：
- TypeScript: ✅ 0错误
- 单元测试: ✅ 79个全绿（无新增测试）
- Build: ✅ 通过
- Commit: 8f1bdda
- GitHub: ⏳ 推送超时，待重试

**人工测试待验证**：
- TC1: 空篮导出 → 按钮disabled ✅
- TC2: 5题导出PPT（无答案）→ 弹对话框 → 输入标题 → 确认 → 选路径 → 5页
- TC3: 打开生成的PPT → WPS/PowerPoint能打开，5题清晰，题号可编辑
- TC4: 5题导出PPT（每题后紧跟）→ 10页（5题+5答案交替）
- TC5: 5题导出PPT（末尾集中）→ 6页（5题+1参考答案页）
- TC6: 题目无答案图 → inline/append模式跳过该题答案
- TC7: 题图路径不存在 → 跳过图片，页面只有题号
- TC8: 对话框点取消 → 无操作，不弹通知
- TC9: 保存对话框点取消 → 无操作，不弹通知
- TC10: 题目带出处年份 → 右上角小字显示

**M16 状态**：✅ **代码已完成，人测待用户执行**。技术手册见 `2026-08-02-m16-ppt-export-solution.md`。

---

### 5.16 M17 架构审视（2026-08-02）→ ✅ 核心优化完成

**目标**：功能全部完成后做一轮代码减脂，不改行为。

**实际完成**：

**1. N+1 查询优化**（✅ 已完成）
- **问题**：`PostProcessView` 的 `reloadAll()` 逐题查询知识点，50题 → 100次IPC
- **方案**：新增批量IPC `questions:batchKps(qids)`，一次查询所有题目的知识点
- **实现**：
  - `questionRepo.batchGetQuestionKnowledgePoints(db, qids)` — 批量SQL查询
  - IPC handler `questions:batchKps` 
  - `PostProcessView` 改用 `window.api.batchQuestionKnowledgePoints(qids)`
- **性能提升**：50题试卷后期处理页加载 ~500ms → ~100ms（理论值，待人测验证）
- **文件**：
  - `src/main/storage/repositories/questionRepo.ts` — +38行批量函数
  - `src/main/ipc/index.ts` — +3行handler
  - `src/shared/types.ts` — +2行类型定义
  - `src/preload/index.ts` — +1行桥接
  - `src/renderer/src/views/PostProcessView.tsx` — -3行循环改批量
- **Commit**: 19f13a3

**2. TS6133 检查**（✅ 已确认干净）
- 运行 `tsc --noEmit | grep TS6133` → 无警告
- 代码质量良好，无需清理

**3. 技术路线审视**（✅ 结论记录）
- **pdfjs v4 锁定**：保持现状（Electron 31 + pdfjs v6 兼容问题未修复）
- **Zustand 状态管理**：当前不引入（React state + hooks 够用，无跨组件状态管理痛点）
- **双函数合并**（derivePreviewQuestions/derivePreviewItems）：延后到大版本重构（需改单测）

**推迟事项**：

**1. PostProcessView 拆分**（⏳ 推迟）
- **原因**：1227行，组件间耦合复杂，工作量巨大（预估4-6小时）
- **决策**：推迟到下次大版本重构（需要更充裕时间，避免引入bug）
- **当前状态**：代码稳定运行，不影响功能

**2. ViewportController 抽出**（⏳ 推迟）
- **原因**：非紧急，可读性尚可
- **决策**：推迟到后续重构

**3. Bundle 体积评估**（✅ 已评估，暂不处理）
- **现状**：1.7MB（pdfjs 1.3MB 必需 + Mantine 按需导入 + 业务代码）
- **结论**：桌面应用首次加载后缓存，影响不大；pdfjs 无法tree-shake
- **决策**：已评估，暂不处理

**自测结果**：
- TypeCheck: ✅ 0错误
- 单元测试: ✅ 79个全绿
- Build: ✅ 通过
- Commit: 19f13a3

**M17 状态**：✅ **核心优化已完成，代码质量良好**。技术手册见 `2026-08-02-m17-architecture-review-solution.md`。

---

## 🎉 M13-M17 全部完成！

**里程碑总结**：
- ✅ M13 年份/出处（2026-07-26）
- ✅ M14 答案匹配（2026-07-31）
- ✅ M14.5 答案后期处理（2026-07-31）
- ✅ M15 全链路走查（2026-08-02）
- ✅ M16 PPT导出（2026-08-02）
- ✅ M17 架构审视（2026-08-02）

**功能链路**：导入PDF → 裁切 → 后期处理 → 入库 → 答案匹配 → 组卷 → 导出PDF/PPT

**代码质量**：
- 79个单测全绿
- TypeCheck 0错误
- 无未用导入（TS6133干净）
- N+1查询已优化

**下一步建议**：
- 人工测试验证所有功能
- 收集用户反馈
- 评估是否需要后续 M18


---

## 2026-10-24：M18 可编辑题目与 Word 组卷

版本：1.1.0-beta.5，基于 Mac beta.4。用户指定本轮不编写、不运行冒烟或自动功能测试，功能验收由用户执行；规则写入根目录 AGENTS.md。

已实现：

- 独立题干/答案编辑稿，对照原图，Tiptap 文字编辑与 MathLive 可视公式。
- PNG/JPEG 配图导入、原图框选裁图、独立宽度/对齐/图注；字体和资源离线打包。
- SQLite 当前内容、追加式历史、版本恢复和乐观版本冲突保护。
- 题库/组卷编辑入口，Word 排版设置与内容预览，原图题和编辑题混排；docx.js + mathml2omml 输出原生公式，转换失败明确报错。
- 题号持久递增，避免删除后复用；阻止旧合并流程无提示丢弃已保存编辑稿及历史。
- 未保存离开提醒；配图原件与历史引用保留；组卷整体排序事务。

Doc2X 继续作为流程参考，尚未接入其识别 API；本轮复用的成熟组件及许可证详见 [M18 方案](../plans/2026-10-24-editable-word-plan.md)。

检查方式与实际交付以 [M18 交付记录](2026-10-24-editable-word-delivery.md) 为准，不沿用此前自动测试结果。下一步由用户验收，再开展单题识别与校对。
