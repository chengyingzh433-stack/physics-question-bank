# 教师题库管理系统

面向教师个人积累与复用好题的桌面工具，当前 Mac 人工验收版：**1.1.0-beta.7**；Windows 已验证版本：**1.1.0-beta.3**。

## 下载与使用

从 [GitHub Releases](https://github.com/chengyingzh433-stack/physics-question-bank/releases) 下载对应平台的文件。Mac（Apple Silicon，M 系列）下载 `mac-arm64.dmg`，打开后将应用拖入“应用程序”；Windows 下载 beta.3 的 EXE 安装程序。日常使用无需命令行或 Node.js。beta.7 起可在软件内检查和安装后续版本，首次仍需安装 DMG；操作与 Doc2X Key 配置见 [更新使用说明](docs/superpowers/specs/2026-10-25-in-app-update-guide.md)。

Mac 版尚无 Apple Developer ID 签名和公证，本版仅完成静态检查与构建，功能验收由用户执行；下载后可能需要系统的开发者信任确认。Intel Mac 未验证，本轮不提供 Intel 安装包。

资料默认保存在 Windows 的 `%APPDATA%/physics-question-bank` 或 Mac 的 `~/Library/Application Support/physics-question-bank`；原 PDF 与题图的存储位置可在应用设置查看。仓库和安装程序不包含个人题库资料。

## 当前功能

- 单份或多份 PDF 拖放导入，人工裁切、跨页拼接、编号和题图入库。
- 答案 PDF 导入、裁切、匹配与答案图管理。
- 个人题夹、资料及标签检索、组合筛选、批量归类、选题入篮、题目与答案预览。
- 人教版（2019）高中物理六册章节模板，支持自定义章节及子章节；按上级章节筛选时包含下级题目。
- 知识点搜索多选，输入前几个字显示匹配候选，也可新建并选中。
- 题干/答案对照编辑、可视公式、本地配图与原图裁取、图片缩放、保存及历史恢复。
- Doc2X 单题云识别：题干或答案图片上传预览、独立候选校对、待处理事项、采用前恢复草稿与任务续查；默认关闭，逐次确认。
- Word 组卷：原图与编辑内容混排、自定义题号、分组标题、页边距、题后留白和答案位置；公式以 Word 原生公式输出。
- 原图 PDF / PPTX 导出继续保留。
- 软件更新：启动检查、正式版/测试版选择、更新说明、下载与校验、Mac 应用替换及旧版恢复副本；从顶部或设置进入。

扫描 PDF 仍以题图保留；可手工录入，或自行配置 Doc2X API 后识别单张题图。识别按服务额度计费，结果需人工校对，不包含整卷批量 OCR、Word 导入或可编辑表格。入口和自测步骤见 [M19 使用说明](docs/superpowers/specs/2026-10-25-doc2x-ocr-guide.md)；已有编辑及 Word 操作见 [M18 使用说明](docs/superpowers/specs/2026-10-24-editable-word-guide.md)。章节预设按公开教材目录核对，尚未与学科网页面逐项对照。

## 开发与交付

技术栈：Electron 44.9.3、React 18、TypeScript、Mantine 7、SQLite、pdfjs、pdf-lib、pptxgenjs，以及 Tiptap / MathLive / docx.js。开发使用 Node.js 24（见 `.nvmrc`），Mac 编译原生模块需安装 Xcode Command Line Tools。

```sh
npm ci
npm run rebuild
npm run dev
```

首次安装后执行 `npm run rebuild`，下载 Electron 运行文件并准备原生依赖。当前 better-sqlite3 13 使用 Node-API 预编译模块。

**按用户指定准则：不编写、不运行冒烟测试或自动功能测试；功能验收由用户完成。** 开发者负责实现、静态审查、类型检查、编译与安装包交付，详见 [AGENTS.md](AGENTS.md)。构建与打包：

```sh
npm run typecheck
npm run build
# Windows 发布构建在 Windows 上执行
npm run dist
# Mac：生成 Apple Silicon .app 与 DMG，输出到 release/<版本>/
npm run dist:mac
# 发布前为安装包生成 SHA-256 文件
npm run release:checksums
```

Windows 发布产物位于 `release/<版本>/`。安装程序上传到 Releases，`node_modules`、构建目录和本机快捷方式不进入源码仓库。仓库保留历史测试脚本，本阶段没有新增或运行；请勿将历史测试结果当作 beta.5、beta.6 或 beta.7 的功能验收。本阶段没有调用真实识别 API，也没有消耗用户识别额度。

**历史记录：** Mac beta.4 已通过类型检查、114 项自动测试及三套界面回归；修复了 Electron 启动、PDF 协议读取、知识点下拉布局、旋转页出图和手动答案配对持久化。初次接手时 Electron 31 的拦截记录保留在[接手验证记录](docs/superpowers/specs/2026-10-23-mac-takeover-validation.md)，最新验证及发布边界见 [Mac beta.4 交付记录](docs/superpowers/specs/2026-10-23-mac-beta4-release.md)。

Windows beta.3 的 99 项测试、GUI 和 EXE 验证是历史基线。升级后的 beta.4 尚未在 Windows 复测，Windows 的 `.bat`、`.vbs` 入口不用于 Mac。真实 Windows 题库资料尚未迁移。

## 参考项目与来源

文档中确实记录了 **Doc2X 教师题库**：参考其导入、分类检索、选题组卷和导出流程，详见[模块对照](docs/superpowers/specs/2026-10-22-bank-experience-design.md)和[可编辑题目调研](docs/superpowers/specs/2026-10-22-editable-question-solutions-research.md)。官方[教师题库教程](https://doc2x.noedgeai.com/help/en/tutorials/teacher-question-bank.html)介绍的是独立 Web 应用；公开的 [doc2x-mcp 仓库](https://github.com/NoEdgeAI/doc2x-mcp)是 MCP 接入工具，不能据此认定整套教师题库产品开源。

M19 已实现 Doc2X 单图 API 接入，默认关闭，用户使用自己的 Key 和额度；没有分发其识别引擎，也不声称整套 Doc2X 产品开源。本轮编辑能力复用 Tiptap / MathLive，Word 导出复用 docx.js / mathml2omml，均在本机工作；选型与边界见 [M18 方案](docs/superpowers/plans/2026-10-24-editable-word-plan.md)。识别结果使用 unified/remark 解析，受限文档与原图分开保存在本机。MinerU、PaddleOCR、Pix2Text 仍是后续本地识别候选。第三方许可及 mathml2omml 对应源码随安装包提供，见 [组件说明](resources/third-party-licenses/README.txt)。

## 开发记录

- [M20 软件更新方案](docs/superpowers/plans/2026-10-25-in-app-update-plan.md)
- [M20 更新使用、Doc2X Key 配置与用户验收](docs/superpowers/specs/2026-10-25-in-app-update-guide.md)
- [M20 交付与本机安装记录](docs/superpowers/specs/2026-10-25-in-app-update-delivery.md)

- [M19 单题识别与校对方案](docs/superpowers/plans/2026-10-25-single-question-ocr-review-plan.md)
- [M19 操作说明、费用与用户验收清单](docs/superpowers/specs/2026-10-25-doc2x-ocr-guide.md)
- [M19 实际交付与检查记录](docs/superpowers/specs/2026-10-25-doc2x-ocr-delivery.md)
- [M18 开发方案与后续计划](docs/superpowers/plans/2026-10-24-editable-word-plan.md)
- [M18 交付记录](docs/superpowers/specs/2026-10-24-editable-word-delivery.md)
- [M18 操作说明与用户验收清单](docs/superpowers/specs/2026-10-24-editable-word-guide.md)

- [Mac beta.4 交付与验证](docs/superpowers/specs/2026-10-23-mac-beta4-release.md)

- [Mac 开发接手计划与兼容性待办](docs/superpowers/plans/2026-10-23-mac-takeover-plan.md)
- [后续执行目录](docs/superpowers/plans/2026-10-22-execution-roadmap.md)
- [开发日志](docs/superpowers/specs/2026-07-06-development-progress.md)
- [beta.3 章节模板与知识点改进](docs/superpowers/specs/2026-10-23-chapter-templates.md)
- [PDF 拖放修复](docs/superpowers/specs/2026-10-23-drag-import-fix.md)
- [项目接手计划](docs/superpowers/plans/2026-10-22-project-takeover-plan.md)
