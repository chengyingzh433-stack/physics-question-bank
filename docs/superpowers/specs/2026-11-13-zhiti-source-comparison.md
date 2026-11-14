# ZhiTi 与教师题库：源码对照报告

日期：2026-11-13。

**结论：ZhiTi 最值得借鉴的是围绕一份试卷持续切题、按选区读取 PDF 文字，以及把识别结果组织成可对照原图的题目文档。我们已有的结构化编辑、版本恢复和 Word 原生内容导出应当继续保留；当前最明确的缺口，是连续录题的上下文恢复，以及 PDF/PPT 导出没有接入已编辑正文。没有必要为了借鉴这些体验更换框架或重写题库。**

## 1. 研究对象与证据边界

- 参考仓库：[oostart/ZhiTi](https://github.com/oostart/ZhiTi)，已下载至 `/Users/metric/有趣的项目/题库参考/ZhiTi`。本报告固定参考提交为 [`2d86eb37dff4b35c1be69cd1e84c760fe163cf1f`](https://github.com/oostart/ZhiTi/tree/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f)，包版本 `2.0.0`。
- 本项目：`/Users/metric/有趣的项目/教师题库`，当前 HEAD `99617c3ed737937336b844b8800d98a2689c1368`，包版本 `1.1.0-beta.12`。本项目引用指向本次读取的工作区文件。
- 方法：只读源码、配置和已有文档；没有安装依赖、启动应用、调用识别服务，也没有运行冒烟测试、自动化功能测试、界面走查或打包应用功能测试。本次仅新增本报告，未修改应用代码。
- 下文“实现”表示存在相应代码路径，不表示运行验收通过。对识别准确率、真实交互体验、安装包可用性和不同平台可靠性不作实测结论。风险均区分代码事实与推断。

版本证据：[ZhiTi package.json](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/package.json#L1-L10)、[本项目 package.json](/Users/metric/有趣的项目/教师题库/package.json:1)。

## 2. 两者的产品路线

| 维度 | ZhiTi 的源码路线 | 本项目的源码路线 | 对我们的意义 |
| --- | --- | --- | --- |
| 技术结构 | Vue 3 + Tauri 2，Rust 文件存储，桌面端按记录写 JSON | React + Electron，SQLite，独立资源文件 | 框架不同不构成产品优劣；应借鉴操作流程和数据契约 |
| 原稿入口 | 主导入入口仅接受 PDF；另有答案图片上传、粘贴 | PDF、图片、DOCX 预览，整题框选与分区组题 | 我们入口更宽，不能简单照搬它的 PDF 专用流程 |
| 切题 | 一题包含多个区域，可跨页合成；区域内提取 PDF 文本 | 整题选区与结构化组成部分；当前文字按钮读取整页 | 优先补“选区对应文字”，保留现有整题语义 |
| AI | 兼容聊天接口的视觉模型转录、知识点建议、题目理解 | Doc2X 识别任务与人工校对链路 | 两种处理路线不同，不能仅凭代码判断识别质量高低 |
| 编辑 | 题目文档、公式和配图，原图对照面板 | Tiptap + MathLive，题干/答案文档、历史版本 | 我们已有编辑基础，无需从零重做 |
| 导出 | PDF、PPTX、ZIP；正文渲染为图片再嵌入 PDF/PPT | DOCX 可编辑文字和原生公式；现有 PDF/PPT 读取原题图 | 我们 Word 更适合继续编辑，但 PDF/PPT 的最新内容一致性需要补齐 |

架构证据：[ZhiTi 依赖](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/package.json#L14-L39)、[逐条 JSON 存储](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src-tauri/src/storage.rs#L292-L316)、[本项目依赖](/Users/metric/有趣的项目/教师题库/package.json:30)、[本项目事务化内容保存](/Users/metric/有趣的项目/教师题库/src/main/storage/repositories/contentRepo.ts:238)。其余各项证据见下文。

## 3. 真正值得借鉴的地方

### 3.1 按题目区域提取 PDF 文字，而不是让教师清理整页文字

ZhiTi 的 `saveRegions()` 同时保存区域合成图、区域坐标和对应文字。`extractTextFromRegions()` 将 PDF 文字片段换算到页面坐标，按片段中心是否落在选区内过滤，再组织行序。多个区域按页码和纵向位置排序，因此同一道跨页题可以同时获得合成图与合并文字。[CutView.vue:249](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/CutView.vue#L249-L277)、[pdf.ts:108](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/pdf.ts#L108-L143)

本项目 `IntakePreview` 已读取 PDF 文本层，但目前把整页 `items` 拼成字符串；按钮名称也是“读取本页文字到输入框”，未按当前选区过滤。这里是明确、局部、值得优先改进的差距。[IntakePreview.tsx:101](/Users/metric/有趣的项目/教师题库/src/renderer/src/components/intake/IntakePreview.tsx:101)、[文字按钮](/Users/metric/有趣的项目/教师题库/src/renderer/src/components/intake/IntakePreview.tsx:127)

建议学习其坐标关联思路，但不要把文本层提取称作 OCR。扫描 PDF 可能根本没有文字层；多栏、旋转文字、公式和重叠选区仍需人工校对。ZhiTi 自己在提取结果为空时也提示可能为扫描件。[空文本提示](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/CutView.vue#L280-L293)

### 3.2 保持同一份原稿的连续切题上下文

ZhiTi 创建题目后清空待处理框，但没有在该保存路径中离开切题视图；原试卷仍是 `activePaperId`。这让“切一道、保存、继续切下一道”的源码流程很直接。多个框组成的是**同一道题**，不应误读成整卷自动切题或批量智能分题。[createFromPending](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/CutView.vue#L266-L299)

我们并非完全没有下一题入口：录入页已有“沿用原稿，新建另一题”和“沿用原稿录下一题”；但编辑完成页的“继续录下一题”目前直接导航到 `/intake`。原页码、滚动、缩放、来源和可选标签继承形成一个完整连续工作流，仍是已有方案中的待实现内容。[IntakeView.tsx:304](/Users/metric/有趣的项目/教师题库/src/renderer/src/views/IntakeView.tsx:304)、[QuestionEditorView.tsx:262](/Users/metric/有趣的项目/教师题库/src/renderer/src/views/QuestionEditorView.tsx:262)、[连续录题方案](/Users/metric/有趣的项目/教师题库/docs/superpowers/plans/2026-10-28-continuous-single-question-plan.md:1)

建议把这一点作为下一个完整大功能：保存成功后才创建下一题草稿，恢复原稿位置，清空上题正文、答案和选区，来源/年份默认可沿用，知识点等由教师选择。它比新增一轮批量识别更贴合当前逐题校对的工作方式。

### 3.3 将识别结果变成“文字、公式、配图”的可校对文档

ZhiTi 的视觉提示词要求输出行内文字、LaTeX 公式及插图边界框；模型给出配图坐标，应用以原图为来源处理图像。题干和答案都有转录入口，提示词明确禁止补写图片中不存在的内容。编辑界面还提供原题图与答案原图的对照区域。[题干结构与请求](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/layout.ts#L17-L84)、[答案转录](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/layout.ts#L94-L169)、[原图对照](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/components/QuestionPaperView.vue#L483-L494)

这值得借鉴为“识别候选与原图并排校对、配图候选可调整”的产品能力。我们已有 Tiptap 文档编辑、MathLive 公式输入与版本保存，适合在现有数据模型上增强，不需要复制它的整套编辑器。[QuestionDocumentEditor.tsx](/Users/metric/有趣的项目/教师题库/src/renderer/src/components/editor/QuestionDocumentEditor.tsx:4)、[MathContent.tsx](/Users/metric/有趣的项目/教师题库/src/renderer/src/components/editor/MathContent.tsx:3)、[版本保存与恢复](/Users/metric/有趣的项目/教师题库/src/main/storage/repositories/contentRepo.ts:238)

### 3.4 关键词应当能搜到题干与答案

ZhiTi 的关键词集合包含 `q.text` 和 `q.answer`，以及题型、知识点和试卷信息。本项目现有关键词 SQL 仅匹配试卷名、来源、题型、章节和知识点，没有将已编辑正文及答案纳入搜索。这是比框架差异更直接的使用差距：教师记得题干里的“斜面”或答案中的某个词时，目前可能搜不到已保存的题目。[ZhiTi 搜索范围](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/BankView.vue#L142-L160)、[本项目关键词 SQL](/Users/metric/有趣的项目/教师题库/src/main/storage/questionFilter.ts:73)。

建议在本机提取已保存题干、答案的可检索文字，并随正式版本保存更新；未识别原图不能凭空搜索其中的字。SQLite 本身不意味着已经实现正文全文检索，也不意味着本次已证明大题库性能更优。

## 4. 不能被 README 或“AI”名称掩盖的实际边界

### 4.1 主导入是 PDF，但不是整个应用都不支持图片

`ImportView` 拒绝非 PDF，文件选择器也只接受 PDF；这一判断只针对主试卷导入入口。`QuestionPaperView` 另有答案图片文件处理与剪贴板图片粘贴，不能概括成“ZhiTi 不支持图片”。本项目已有图片、PDF 和 DOCX 的原稿分支，DOCX 预览也明确提示分页和字体可能有差异。[PDF 限制](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/ImportView.vue#L53-L57)、[文件选择器](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/ImportView.vue#L205)、[答案图片](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/components/QuestionPaperView.vue#L132-L179)、[答案粘贴](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/components/QuestionPaperView.vue#L212-L219)、[我们的预览分支与限制](/Users/metric/有趣的项目/教师题库/src/renderer/src/components/intake/IntakePreview.tsx:91)。

### 4.2 AI 是兼容聊天接口调用，不能直接等同于 Doc2X 或自动解题

ZhiTi 的 `chat()` 向用户配置的 `${baseUrl}/chat/completions` 发送请求；视觉识别通过 `image_url` 发送题目图片。其实现是通用视觉模型的结构化转录，本次所查识别路径没有调用 Doc2X。本项目则明确实现了 Doc2X 任务接口，且提交入口要求本次上传确认。[ai.ts:34](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/ai.ts#L34-L57)、[layout.ts:57](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/layout.ts#L57-L73)、[Doc2xService.ts:154](/Users/metric/有趣的项目/教师题库/src/main/ocr/Doc2xService.ts:154)。

README 声称“生成参考答案”，但本次追踪到的实际能力包括知识点推荐、题目理解、已有题图转录和已有答案图转录。答案转录提示词还明确禁止解答和补充。没有找到可据以确认“从题干独立生成完整参考答案”的独立业务功能，所以不能把 README 的这一句直接当成已实现能力；题目理解中的“解题思路”也不等于完整答案。[README:10](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/README.md#L10)、[知识点与题目理解](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/ai.ts#L108-L175)、[答案转录约束](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/layout.ts#L94-L113)。

两边配置云服务后都会存在外部请求路径，不能将“原稿本地保存”理解为“所有识别都离线”。本次未发出任何识别请求，也不比较识别准确率、耗时或费用。

### 4.3 ZhiTi 的最新内容能进 PDF/PPT，但产物正文仍是图片

ZhiTi 导出器先把题目文档渲染到 canvas，再将 JPEG 嵌入 PDF/PPTX；渲染失败有回退原图的分支。ZIP 保存原题图及清单，格式枚举没有 DOCX。它的优势是导出路径使用编辑后的文档，不能因此称为 Word 式原生文字/公式导出。[文档渲染与原图回退](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/exporters.ts#L122-L134)、[PDF 图片嵌入](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/exporters.ts#L141-L166)、[PPT 图片嵌入](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/exporters.ts#L290-L300)、[ZIP 与格式范围](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/utils/exporters.ts#L314-L369)。

还有一个应避免照搬的门槛：导出视图发现所选题缺少文档内容时，会拦下非 ZIP 导出并要求处理；生成文档的入口需要 AI 配置。底层虽有渲染失败回退原图，前端“缺少文档”的门槛仍是另一件事。我们应该允许明确选择原图导出，而不是让基础导出必须依赖云识别。[导出前置检查](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/ExportView.vue#L177-L186)、[生成文档](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/ExportView.vue#L231-L247)。

**我们的明确缺口：当前 PDF/PPT 导出仍读取原题图和答案图，未接入已编辑的题干/答案文档。** 因而不能承诺“题卡修改后的内容在所有导出格式中一致”。Word 路径则根据编辑模式读取文档，文字转为 `TextRun`，公式经 `wordMath` 转为 Office 数学内容。这项优势需要继续保留，但 Office 各软件实际打开效果不在本次验证范围内。[PDF 原图读取](/Users/metric/有趣的项目/教师题库/src/main/export/ExportService.ts:46)、[PPT 原图读取](/Users/metric/有趣的项目/教师题库/src/main/export/ExportServicePpt.ts:97)、[Word 原生段落与公式](/Users/metric/有趣的项目/教师题库/src/main/export/ExportServiceDocx.ts:170)、[Word 模式选择](/Users/metric/有趣的项目/教师题库/src/main/export/ExportServiceDocx.ts:195)。

### 4.4 题库卡片同步方面，我们已有更合适的实现

ZhiTi 卡片缩略图仍使用 `question.image`，下面的摘要使用 `question.text`；保存编辑会更新正文文本，所以不能说“修改完全不反映在题卡上”，准确说法是原图缩略图与已编辑文字摘要可能呈现不同版本。本项目 `SavedQuestionBody` 默认优先显示已保存的文档，明确选择原图时才显示原图，更贴合“题卡代表当前版本”的预期。[ZhiTi 卡片](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/BankView.vue#L755-L763)、[保存文字](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/BankView.vue#L269-L284)、[SavedQuestionBody.tsx:9](/Users/metric/有趣的项目/教师题库/src/renderer/src/components/bank/SavedQuestionBody.tsx:9)。

## 5. 存储、失败处理和发布边界

以下是静态风险分析，不代表已复现数据丢失，也不是对两者全部可靠性的评级。

| 代码事实 | 影响或风险推断 | 证据 |
| --- | --- | --- |
| ZhiTi 默认数据目录优先放在可执行文件父目录的 `StudySI数据` | 在典型 macOS `.app` 布局中可能落入应用包内部；升级替换或目录写权限需要重点核查。此处未运行安装包，也未复现 | [storage.rs:43](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src-tauri/src/storage.rs#L43-L52) |
| ZhiTi `updateQuestion` 先更新内存再等待磁盘写入；保存异常只提示而不继续抛出；切换题目前等待保存后仍替换草稿 | 写入失败后内存与磁盘可能不一致；切题可能失去当前未落盘草稿的明确状态，重启后存在修改丢失风险 | [store.ts:304](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/store.ts#L304-L314)、[BankView.vue:247](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/views/BankView.vue#L247-L294) |
| ZhiTi 采用临时文件写入再 rename；读取集合时跳过无法解析的 JSON，单条读取解析失败返回空值 | 有单文件替换保护，不能说“毫无保护”；但坏记录可能表现为消失，尚不足以等同完整恢复机制 | [原子写入](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src-tauri/src/storage.rs#L85-L94)、[读取坏记录](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src-tauri/src/storage.rs#L268-L289) |
| ZhiTi AI 设置整体持久化到 JSON，包含 API Key，未在该路径看到加密层 | 不能把“仅本地保存”当作凭据已加密；我们的系统安全存储方案应保留 | [设置保存](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src/store.ts#L208-L215)、[设置 JSON 写入](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/src-tauri/src/storage.rs#L300-L307)、[本项目 safeStorage](/Users/metric/有趣的项目/教师题库/src/main/ocr/OcrCredentials.ts:16) |
| 我们的正文保存检查期望版本，在事务中同时写历史与当前内容；恢复历史仍产生新版本 | 这是值得保留的编辑安全设计；不应因参考项目流程简洁而删掉 | [contentRepo.ts:238](/Users/metric/有趣的项目/教师题库/src/main/storage/repositories/contentRepo.ts:238)、[历史恢复](/Users/metric/有趣的项目/教师题库/src/main/storage/repositories/contentRepo.ts:299) |

发布方面，ZhiTi README 主要描述 Windows，但实际工作流已包含 Windows x64、macOS Intel 和 Apple Silicon。不能根据 README 断言其只有 Windows 版；也不能根据构建矩阵断言三端安装包都已成功构建并可用。本次没有运行这些任务。[release.yml](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/.github/workflows/release.yml#L59-L85)

授权方面，`package.json` 声明 `ISC`，本次检出的仓库未找到独立 `LICENSE`、`COPYING` 或 `NOTICE` 文件。因此应表述为“存在 ISC 元数据声明，但独立授权文本与署名材料尚需补充核对”，不能说“没有任何许可证”，也不宜据此直接复制大段代码并宣称授权核查完成。本阶段采用行为和设计层面的借鉴即可。[package.json 授权声明](https://github.com/oostart/ZhiTi/blob/2d86eb37dff4b35c1be69cd1e84c760fe163cf1f/package.json#L40-L50)

## 6. 建议的实施顺序

### P1：完成同一原稿连续录题，并让文字提取对应选区

交付范围：保存并录下一题、恢复页码/缩放/滚动、按规则继承元数据、清空上一题组成部分、保留本次录题列表；PDF 选区读取文字保留本机处理路径。已有连续录题方案可作为起点，避免再开一个相互冲突的新流程。

用户自测重点：同页连续两题、跨页题、保存失败后不跳转、不重复创建下一题、退出后恢复位置、选区外文字不误带入；扫描页无文本时给出清楚提示。DOCX 复杂分页仍需保留现有限制说明。

### P2：统一最新内容的展示、搜索与导出

交付范围：把已保存题干和答案纳入本机关键词检索；让 PDF/PPT 明确使用当前已保存的题干与答案文档，并保留原图模式；统一内容版本和答案开关。可先渲染最新文档为图片进入 PDF/PPT，解决“导出旧内容”的问题，再考虑更深的原生对象编辑能力。Word 继续使用原生文字和公式，不能为了统一而退回整题截图。

用户自测重点：修改一个数字、一条公式、一幅配图与答案后，题卡及三种导出都对应同一版本；原图模式仍能导出原件；纯手工题没有原题图时也有明确处理结果。图片化 PDF/PPT 不应标成正文可编辑。

### P3：把 AI 用于可审核的辅助候选

交付范围：可选知识点建议、配图定位候选及原图对照校对；用户确认后才采用。保留当前上传确认、候选与正式版本分离、失败时保留原件的契约。先确认教师实际需要哪种辅助，再决定是否新增通用视觉模型供应商。

用户自测重点：建议错误可以拒绝；配图框不准可以调整；重试不会覆盖已保存正文；取消或失败不破坏原题图、答案图与原 PDF。不因引入 AI 自动改写题目、生成未经审核的答案或自动批量上传试卷。

以上仅为基于源码对照的后续方案，不表示这些新增项已经实现。本次交付是参考源码下载与研究报告；未改业务功能、未提交或推送代码。
