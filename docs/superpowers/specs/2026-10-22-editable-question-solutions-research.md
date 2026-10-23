# 可编辑题目与组卷导出：现成方案调研

核查日期：2026-10-22。范围：官方 GitHub 仓库、产品文档、许可证和发布信息；未安装识别模型、未上传真实试卷、未做识别准确率对比。

## 1. 结论与当前开发方向

用户已测试现有“导入 PDF → 切题 → 编号 → 入库 → 匹配答案”流程，下一阶段重点是让题目可以编辑和重新排版。建议继续沿用现有主流程，优先做可编辑内容的纵向验证；上一份接手计划中的全面加固和组件拆分不作为新功能探索的强制前置。

**有成熟组件可以复用，不需要自己训练 OCR、实现数学公式编辑器或从零编写 Word 公式格式。** 但本轮没有找到可直接证明“任意 PDF/扫描图/Word 全自动无损转换，且可原样嵌入本项目”的完整方案。识别、编辑、排版导出是不同环节，需要接起来并用真实题目验收。

初步建议（工程判断，尚未经过本项目实测）：

- 产品操作参考：优先看 **Doc2X 教师题库**，官方已有非常相近的录题、核对、组卷和可编辑导出流程。
- 识别候选：**MinerU / PaddleOCR** 作为本地路线候选；**Doc2X / Mathpix** 作为云端路线及效果对照；**Pix2Text / SimpleTex** 补充单题或公式识别评测。
- 应用内编辑：**Tiptap + MathLive**，前者管理文字、图片与文档结构，后者提供可操作的公式编辑。两者不是即插即用的完整题库，需要节点、交互和保存适配。
- 可编辑 Word：优先验证 **Pandoc → DOCX 原生公式（OMML）**，避免把公式重新导出成图片。
- 若目标是完整 Word 式页面编辑和 Office 文件打开体验，比较 **ONLYOFFICE Docs**；其部署和授权方案需要单独评估。

## 2. 查阅来源

以下均为一手来源。网页通过检索/打开读取；版本通过 GitHub API 和 npm 元数据只读查询。没有以第三方排行榜判断中文物理题准确率。

| 编号 | 来源 | 本轮用途 |
|---|---|---|
| S1 | [Doc2X 教师题库教程](https://doc2x.noedgeai.com/help/zh-cn/tutorials/teacher-question-bank.html) | 验证成品流程、截图录题、题目编辑、组卷和导出 |
| S2 | [Doc2X 图片 API](https://doc2x.noedgeai.com/help/zh-cn/api/doc2x-api-v2-image-interface.html)、[CLI 文档](https://doc2x.noedgeai.com/help/en/api/doc2x-cli.html) | 验证可集成的解析/转换接口 |
| S3 | [Doc2X Word 公式说明](https://doc2x.noedgeai.com/help/zh-cn/faq/export-word-math-type.html) | 区分 OMML、MathType 对象和图片 |
| S4 | [MinerU 仓库](https://github.com/opendatalab/MinerU)、[开源项目文档](https://opendatalab.github.io/MinerU/)、[云 API 文档](https://mineru.net/doc/docs/index_en/) | 区分本地引擎和云端接口，确认结构化解析能力 |
| S5 | [MinerU LICENSE](https://github.com/opendatalab/MinerU/blob/master/LICENSE.md) | 核对当前 Apache 2.0 加附加条件；GitHub HTML 未展示正文时通过 raw 原文读取 |
| S6 | [PaddleOCR 仓库](https://github.com/PaddlePaddle/PaddleOCR)、[PP-StructureV3](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-StructureV3.en.md)、[公式识别](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/formula_recognition.md) | 版面、文字、图片、公式识别与输出格式 |
| S7 | [Pix2Text 仓库](https://github.com/breezedeus/Pix2Text)、[模型说明](https://github.com/breezedeus/Pix2Text/blob/main/docs/models.md) | 单题图文公式混排、中文、基础与付费模型区别 |
| S8 | [Mathpix 文档](https://docs.mathpix.com/)、[支持格式](https://docs.mathpix.com/reference/supported-formats) | STEM OCR 与格式转换服务 |
| S9 | [SimpleTex API](https://doc.simpletex.cn/zh/api/) | 通用图片、混排和公式识别接口 |
| S10 | [MathLive 仓库](https://github.com/arnog/mathlive)、[公式编辑交互文档](https://mathlive.io/mathlive/guides/interacting/) | 可视公式编辑与 LaTeX 读写 |
| S11 | [Tiptap 仓库](https://github.com/ueberdosis/tiptap)、[数学节点](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)、[可缩放节点](https://tiptap.dev/docs/editor/api/resizable-nodeviews) | 富文本、公式节点和图片缩放基础能力 |
| S12 | [Tiptap 公式转换限制](https://tiptap.dev/docs/conversion/content-types/structures-and-media/math-equations) | 验证 DOCX 公式导入/导出不对称 |
| S13 | [Pandoc 手册](https://pandoc.org/MANUAL.html#math)、[仓库](https://github.com/jgm/pandoc)、[许可证](https://github.com/jgm/pandoc/blob/main/COPYING.md) | TeX 数学内容转 DOCX/PowerPoint OMML；分发许可 |
| S14 | [Microsoft Office Math](https://learn.microsoft.com/en-us/office/math/) | 确认 Office 原生公式存储格式 |
| S15 | [ONLYOFFICE 开发者版](https://www.onlyoffice.com/for-developers)、[版本比较](https://www.onlyoffice.com/compare-editions)、[公式 API](https://api.onlyoffice.com/docs/office-api/usage-api/document-api/ApiDocument/Methods/AddMathEquation) | 完整文档编辑器集成与版本边界 |
| S16 | [Docling 仓库](https://github.com/docling-project/docling)、[支持格式](https://docling-project.github.io/docling/usage/supported_formats/) | 多格式统一结构化解析备选 |
| S17 | [Marker 仓库](https://github.com/datalab-to/marker) | 文档解析备选及代码/模型许可区别 |
| S18 | [pdf-lib 仓库的 Limitations](https://github.com/Hopding/pdf-lib#limitations) | 确认现有 PDF 库不是通用正文编辑器 |

## 3. 关键原文摘录

先提取能力和限制，再作选型判断；以下每条均为短摘录。

> “Word 原生公式” —— S1，导出格式选项。

> “with additional conditions” —— S4/S5，MinerU 许可说明。

> “以LaTeX源码形式输出” —— S6，公式识别介绍。

> “Math equations are not imported” —— S12，DOCX 导入限制。

> “It will be rendered using OMML math markup.” —— S13，Docx and PowerPoint 输出。

> “Web components for math input, display, and accessibility.” —— S10，MathLive 项目说明。

这些证据确认的是工具接口和表示方式，不是本项目实题的识别准确率。

## 4. 识别与转换候选

| 方案 | 官方确认的能力 | 对本项目的用途判断 | 主要边界 |
|---|---|---|---|
| **Doc2X** | 官方已有个人题库、截图录题、题目编辑、选题组卷与 Word 原生公式导出；公开图片布局解析 API 和 CLI | 最值得先体验的成品；可比较其解析服务，参考题目核对与编辑交互 | 公开 API 不等于整个题库编辑器开放嵌入；本轮未验证整套 UI 的 SDK/嵌入授权。云接口需要网络和账户权益。S1–S3 |
| **MinerU** | 文档解析引擎；云接口文档列出 PDF/图片/Office 输入，文字、图片、表格、公式结构化输出 | 本地解析与云解析均值得比较；利用现有裁切范围，可仅转换需要编辑的题 | 云 API 与本地不同版本不能混用能力表；运行资源按引擎和模型实测。当前许可有附加条件。S4–S5 |
| **PaddleOCR** | PP-StructureV3 版面分析及结构化输出，公式产线输出 LaTeX；文档提供 `save_to_word()` | 本地优先路线的重要候选，可按题图调用 | 生成 `.docx` 不自动证明每个公式都是目标编辑器可改的对象，必须检查文件及实际编辑；需处理推理运行环境。S6 |
| **Pix2Text** | 中文文字、公式检测/识别、图片、版面与表格解析，可输出 Markdown | 已切好的单题图尤其值得纳入对比，不必以整份 PDF 为唯一入口 | 基础开源模型与在线/高级模型不同，在线效果不能直接视为本地效果。S7 |
| **Mathpix** | 印刷/手写 STEM 内容识别，图片/PDF 处理，转换到 DOCX、LaTeX 等 | 适合做数学与物理公式效果对照，也可作为云识别候选 | 本轮未核验实际账户费用、网络延迟和中文物理题表现。S8 |
| **SimpleTex** | 图片中的文字和 LaTeX、矩阵、复杂算式、图文混排；提供 API | 单公式和单题截图识别的补充候选 | 不能由公式接口推断完整 Word 导入、配图归属和组卷排版都能自动完成。S9 |

备选：**Docling** 提供多种文件输入和统一文档表示，可用于多格式解析层；**Marker** 提供 Markdown/JSON/HTML 等输出及公式处理。当前先不同时接入所有引擎，以免把验证成本扩散。它们的相对识别效果仍需本项目样本比较。S16–S17。

## 5. 编辑与导出该复用什么

### 5.1 Tiptap + MathLive：更贴近现有 React 桌面应用

Tiptap 已有数学节点和可缩放节点基础，MathLive 提供公式输入、显示及 LaTeX 读写。建议将公式存成结构化公式节点，点击时打开 MathLive 编辑；独立配图保存原图资源和展示尺寸。此组合是工程建议，不是官方保证的现成集成包。S10–S11。

需要自己补的主要是题目编辑界面、识别结果到编辑器节点的转换、图片资源管理、保存/撤销和组卷排版。选择成熟编辑器可以复用底层编辑能力，不能省略这些产品层工作。

**Tiptap 的重要限制：** 当前转换文档写明，DOCX 公式导出支持 LaTeX → OMML，但公式导入不支持，会跳过 Word 数学元素。因此不能直接把其 DOCX 导入接上，就宣布 Word 题目完整可编辑。需选择另一条保留公式的导入路径或专门适配，并检查导入前后公式数量及内容。S12。

### 5.2 Pandoc：优先验证原生公式导出

Pandoc 手册明确 DOCX/PowerPoint 数学内容输出为 OMML；Microsoft 说明 OMML 是 Office 数学内容的存储形式。因此建议先用它验证“修改文字和公式 → 导出 Word → 在 Word 内继续修改”的通路。复杂公式、图文混排、分页和目标 WPS 版本兼容性仍需实际验收。S13–S14。

不建议把 LaTeX 先画成 PNG 再塞进 Word：那只保留外观，不能实现用户要求的公式结构编辑。PDF 应作为排版后的交付格式，题库内保留可编辑源；不要依赖重新打开导出的普通 PDF 恢复所有题目结构。S3、S14、S18。

### 5.3 ONLYOFFICE：完整文档编辑体验的备选

ONLYOFFICE Docs 提供文档编辑器集成，公式 API 支持 LaTeX、Unicode 和 MathML。建议在确实要求 Word 式整页编辑、Office 文件打开保存时评估；Docs 是服务型集成路线，不应把它当成装一个 React 包即可完成的本地控件。官方区分 Community 与 Developer 等版本。S15。

我倾向于先用轻量题目编辑验证需求，再决定是否需要整套 Office 编辑器。这是基于现有 Electron/React 项目和当前需求范围的取舍，不是对两者编辑能力的排名。

## 6. 维护与许可核查

### 发布活动

以下为本轮只读查询得到的记录，日期为来源提供的发布日期（UTC）。不是性能或兼容性认证。

| 项目 | 查询结果 | 证据 |
|---|---|---|
| MinerU | `mineru-4.0.12-released`，2026-10-11 | [GitHub Release](https://github.com/opendatalab/MinerU/releases/tag/mineru-4.0.12-released) |
| PaddleOCR | `v3.7.0`，2026-06-11 | [GitHub Release](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.7.0) |
| Pix2Text | `v1.1.7`，2026-08-23 | [GitHub Release](https://github.com/breezedeus/Pix2Text/releases/tag/v1.1.7) |
| Tiptap | `v3.32.0`，2026-10-13 | [GitHub Release](https://github.com/ueberdosis/tiptap/releases/tag/v3.32.0) |
| Pandoc | `3.12.1`，2026-10-08 | [GitHub Release](https://github.com/jgm/pandoc/releases/tag/3.12.1) |
| MathLive | npm 当前返回 `0.111.1`，包元数据修改时间 2026-10-09 | 本轮执行 `npm view mathlive version time.modified --json`；[npm 页面](https://www.npmjs.com/package/mathlive) |

MathLive 的 GitHub `releases/latest` 返回较早的 `v0.100.0`，与 npm 记录不同，因此不能只依据该 GitHub Release 日期判断停止维护。

### 许可信息

本节只记录官方许可标签和区别，不对具体商业分发方式作法律结论。

- MinerU 当前为 Apache 2.0 加附加条款，包含特定规模的商业授权门槛及在线服务标识要求；不要引用旧文章把现行版本简单标成纯 Apache 或旧 AGPL。S5。
- PaddleOCR 仓库许可证为 Apache 2.0；若组合额外模型，需按实际模型及依赖分别确认。[LICENSE](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)。
- Pix2Text 代码为 MIT，另有高级付费模型及不同许可版本。S7。
- Tiptap 开源核心、MathLive 仓库均为 MIT；Tiptap 的商业转换/扩展服务与开源核心不是同一购买边界。S10–S12。
- Pandoc 为 GPLv2 或更新版本；分发时保留实际版本及许可材料，不据此直接推断整个 Electron 应用必须或不必采用同一许可。S13。
- ONLYOFFICE Community 标注 AGPLv3，Developer 提供商业集成选项；按选择的版本评估。S15。
- Marker 当前代码为 Apache 2.0，模型权重另用带条件的许可；Docling 仓库为 MIT，模型许可也应另核。S16–S17。

## 7. 建议的产品流程与难度判断

建议保留用户想要的轻量录入方式：

```text
导入原文件 / 截图
    → 人工切题、编号、入库、匹配答案（沿用已有流程）
    → 需要编辑时，生成“可编辑副本”
    → 对照原题校对文字、公式、配图
    → 保存该题的编辑版本
    → 选题组卷，在工具内排版
    → 导出可编辑 DOCX / 用于打印的 PDF
```

这是产品建议，依据是识别引擎能提供结构化内容（S2、S4、S6–S9），编辑器能修改文字/公式（S10–S12），导出工具能写入 Office 公式（S13–S14）。

每道题建议保留三部分：原文件及裁切位置、原始题图、可编辑内容与资源。Word 本来有原生公式和文字时，应优先保留结构；若统一只保存一张 PNG，之后必须再识别，已经丢掉的语义不能靠换导出格式自动回来。对扫描图中电路图、受力图等配图，第一阶段保留为独立图片并支持缩放，不承诺把图里的每条线和每个字都变成独立对象。S3、S14 提供结构与图片的区别；其余为本项目设计建议。

难度判断：

| 目标 | 本项目预计难度（工程判断） |
|---|---|
| 文字编辑、独立图片缩放、公式可视编辑 | 中等，有现成组件，主要是接入与保存 |
| 单题截图识别并校对后导出 Word | 中等偏高，关键是配图切分、公式识别和输出验证 |
| 任意复杂扫描件无需校对、完全保持原排版且全部对象可编辑 | 本轮没有足够证据可承诺 |
| 任意 Word 原样导入、编辑再导出无格式变化 | 超出轻量富文本编辑器的默认保证，需要完整文档引擎或限定格式 |

**“原图不丢”和“识别结果零错误”必须分开：** 前者可以通过保留原件和原图设计保证；后者本轮没有任何实际题目证据，不能承诺。建议让识别错误可以被校对，暂时无法编辑的复杂块保留原图，并明确状态。

## 8. 下一步最小验证，不先重构全系统

本节是建议的验证任务，尚未执行。

1. 建立 30 道有代表性的测试题：清晰 PDF 6、扫描题 6、公式密集题 6、图文混排物理题 6、带原生公式/图片公式的 Word 题 6。尽量复用同一份题干作为各引擎输入。
2. 首轮只比较 2–3 条路线：MinerU、PaddleOCR，以及一个云接口（优先验证 Doc2X；Mathpix 可作公式效果对照）。不要一次集成所有方案。
3. 逐题记录：文字与关键数值错误、公式结构错误、漏图/错图、阅读顺序、教师校对时间、运行耗时、实际费用。没有样本结果前不宣称谁最准。
4. 做一个独立演示：打开一道识别后的题 → 改题干数字 → 改一个分式 → 单独缩放配图 → 保存重开 → 导出 Word → 在 Word/WPS 中再次修改公式并重开确认。
5. 检查 `.docx` 是否含原生公式节点、图片是否独立；再检查实际 Office 编辑行为。仅看截图漂亮、能复制文字或公式预览不算通过。
6. 单独测试 Word 导入中的原生公式、MathType 对象和普通公式图片；三者分别记录，不承诺一个解析器能无损处理全部。
7. 通过后才为现有题目增加可编辑版本和状态字段，继续兼容历史图片题。组卷排版修改默认作用于本次组卷副本；修改题库原题作为显式操作，避免一次备课改动污染老师积累的原题。

建议验收底线：校对后的样本关键数值、公式结构和配图完整；失败项可明确定位与回退；保存重开不丢修改；导出文件可以继续编辑。识别时延、成本和自动通过率待样本测量后再定阈值。

## 9. 可信度与未决事项

| 结论 | 可信度 | 原因 |
|---|---|---|
| 识别、公式编辑、OMML 导出都有现成组件 | 高 | 官方接口文档直接支持；不等于整个组合已实测 |
| Doc2X 有相近的教师题库成品 | 高（文档层面） | 官方有完整教程；本轮未登录亲测 |
| Tiptap 默认 DOCX 导入存在公式缺口 | 高 | 官方转换文档明确写出 |
| Tiptap + MathLive + Pandoc 适合本项目第一轮演示 | 中 | 基于接口能力和现有架构的工程判断，尚未验证集成 |
| 哪个 OCR 对本项目最准确、最快、最划算 | 未知 | 缺真实物理题和目标电脑对比数据 |
| “任意来源全自动无损编辑” | 未证实 | 没有可支持该保证的实测或完整兼容证据 |

自查：没有将厂商宣称的准确率作为本项目效果，没有以 GitHub 星数代替质量，没有把“支持公式显示”当成“Word 公式可编辑”，也没有把公开 API 当成完整产品可嵌入许可。本轮不作已完成集成或实测的声明。
