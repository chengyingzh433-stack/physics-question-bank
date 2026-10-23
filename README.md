# 教师题库管理系统

面向教师个人积累与复用好题的桌面工具，当前 Mac 测试版：**1.1.0-beta.4**；Windows 已验证版本：**1.1.0-beta.3**。

## 下载与使用

从 [GitHub Releases](https://github.com/chengyingzh433-stack/physics-question-bank/releases) 下载对应平台的文件。Mac（Apple Silicon，M 系列）下载 `mac-arm64.dmg`，打开后将应用拖入“应用程序”；Windows 下载 beta.3 的 EXE 安装程序。日常使用无需命令行或 Node.js。

Mac 版尚无 Apple Developer ID 签名和公证，是本机验证过的测试构建；下载后可能需要系统的开发者信任确认。Intel Mac 未验证，本轮不提供 Intel 安装包。

资料默认保存在 Windows 的 `%APPDATA%/physics-question-bank` 或 Mac 的 `~/Library/Application Support/physics-question-bank`；原 PDF 与题图的存储位置可在应用设置查看。仓库和安装程序不包含个人题库资料。

## 当前功能

- 单份或多份 PDF 拖放导入，人工裁切、跨页拼接、编号和题图入库。
- 答案 PDF 导入、裁切、匹配与答案图管理。
- 个人题夹、资料及标签检索、组合筛选、批量归类、选题入篮、题目与答案预览。
- 人教版（2019）高中物理六册章节模板，支持自定义章节及子章节；按上级章节筛选时包含下级题目。
- 知识点搜索多选，输入前几个字显示匹配候选，也可新建并选中。
- 组卷题序、标题和答案位置设置，导出 PDF 或 PPTX。

扫描 PDF 当前以题图保留。文字与公式编辑、图片独立调整和 Word 导出排在后续阶段，尚未实现。章节预设按公开教材目录核对，尚未与学科网页面逐项对照。

## 开发与验证

技术栈：Electron 44.9.3、React 18、TypeScript、Mantine 7、SQLite、pdfjs、pdf-lib、pptxgenjs。开发使用 Node.js 24（见 `.nvmrc`），Mac 编译原生模块需安装 Xcode Command Line Tools。

```sh
npm ci
npm run rebuild
npm run dev
```

首次安装后执行 `npm run rebuild`，显式下载 Electron 运行文件并准备原生依赖，避免并行测试首次启动时竞争下载。当前 better-sqlite3 13 使用 Node-API 预编译模块；实际可用性以 SQLite 测试和打包程序加载为准。构建检查与打包：

```sh
npm run typecheck
npm test
npm run build
npm run test:bank-ui
npm run test:chapters-ui
npm run test:answers-ui
# Windows 发布构建在 Windows 上执行
npm run dist
# Mac：生成 Apple Silicon .app 与 DMG，输出到 release/<版本>/
npm run dist:mac
# 根据当前平台检查上述打包产物
npm run test:packaged
```

Windows 发布产物位于 `release/<版本>/`。安装程序上传到 Releases，`node_modules`、构建目录和本机快捷方式不进入源码仓库。GUI 与发布程序检查使用隔离的临时数据，不能替代用户真实资料验收。

Mac beta.4 已通过类型检查、114 项自动测试及三套界面回归；修复了 Electron 启动、PDF 协议读取、知识点下拉布局、旋转页出图和手动答案配对持久化。初次接手时 Electron 31 的拦截记录保留在[接手验证记录](docs/superpowers/specs/2026-10-23-mac-takeover-validation.md)，最新验证及发布边界见 [Mac beta.4 交付记录](docs/superpowers/specs/2026-10-23-mac-beta4-release.md)。

Windows beta.3 的 99 项测试、GUI 和 EXE 验证是历史基线。升级后的 beta.4 尚未在 Windows 复测，Windows 的 `.bat`、`.vbs` 入口不用于 Mac。真实 Windows 题库资料尚未迁移。

## 参考项目与来源

文档中确实记录了 **Doc2X 教师题库**：参考其导入、分类检索、选题组卷和导出流程，详见[模块对照](docs/superpowers/specs/2026-10-22-bank-experience-design.md)和[可编辑题目调研](docs/superpowers/specs/2026-10-22-editable-question-solutions-research.md)。官方[教师题库教程](https://doc2x.noedgeai.com/help/en/tutorials/teacher-question-bank.html)介绍的是独立 Web 应用；公开的 [doc2x-mcp 仓库](https://github.com/NoEdgeAI/doc2x-mcp)是 MCP 接入工具，不能据此认定整套教师题库产品开源。

本仓库目前用 React/Mantine/SQLite 自行实现相关功能，源码和依赖中未接入 Doc2X SDK、API 或识别模型。Doc2X 属于产品参考及云识别候选；MinerU、PaddleOCR、Pix2Text 是调研中的本地识别候选，均尚未集成。后续继续借鉴公开操作流程，并单独评估识别和可编辑导出能力。

## 开发记录

- [Mac beta.4 交付与验证](docs/superpowers/specs/2026-10-23-mac-beta4-release.md)

- [Mac 开发接手计划与兼容性待办](docs/superpowers/plans/2026-10-23-mac-takeover-plan.md)
- [后续执行目录](docs/superpowers/plans/2026-10-22-execution-roadmap.md)
- [开发日志](docs/superpowers/specs/2026-07-06-development-progress.md)
- [beta.3 章节模板与知识点改进](docs/superpowers/specs/2026-10-23-chapter-templates.md)
- [PDF 拖放修复](docs/superpowers/specs/2026-10-23-drag-import-fix.md)
- [项目接手计划](docs/superpowers/plans/2026-10-22-project-takeover-plan.md)
