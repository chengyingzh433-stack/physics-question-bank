# 教师题库管理系统

面向教师个人积累与复用好题的 Windows 桌面工具。当前测试版：**1.1.0-beta.3**。

## 下载与使用

从 [GitHub Releases](https://github.com/chengyingzh433-stack/physics-question-bank/releases) 下载最新测试版安装程序，双击并按中文向导安装，随后从桌面“教师题库”打开。日常使用无需命令行或安装 Node.js。

资料默认保存在本机用户目录 `AppData/Roaming/physics-question-bank`；原 PDF 与题图的存储位置可在应用设置查看。仓库和安装程序不包含个人题库资料。

## 当前功能

- 单份或多份 PDF 拖放导入，人工裁切、跨页拼接、编号和题图入库。
- 答案 PDF 导入、裁切、匹配与答案图管理。
- 个人题夹、资料及标签检索、组合筛选、批量归类、选题入篮、题目与答案预览。
- 人教版（2019）高中物理六册章节模板，支持自定义章节及子章节；按上级章节筛选时包含下级题目。
- 知识点搜索多选，输入前几个字显示匹配候选，也可新建并选中。
- 组卷题序、标题和答案位置设置，导出 PDF 或 PPTX。

扫描 PDF 当前以题图保留。文字与公式编辑、图片独立调整和 Word 导出排在后续阶段，尚未实现。章节预设按公开教材目录核对，尚未与学科网页面逐项对照。

## 开发与验证

技术栈：Electron 31、React 18、TypeScript、Mantine 7、SQLite、pdfjs、pdf-lib、pptxgenjs。

```sh
npm ci
npm run rebuild
npm run dev
```

`better-sqlite3` 需要匹配 Electron 的原生模块 ABI，因此首次安装依赖后执行 `npm run rebuild`。构建检查与打包：

```sh
npm run typecheck
npm test
npm run build
npm run test:bank-ui
npm run test:chapters-ui
npm run dist
node scripts/test-packaged-app.mjs
```

Windows 发布产物位于 `release/<版本>/`。安装程序上传到 Releases，`node_modules`、构建目录和本机快捷方式不进入源码仓库。GUI 与发布程序检查使用隔离的临时数据，不能替代用户真实资料验收。

beta.3 已通过类型检查、99 项自动测试、实际鼠标界面回归及发布 EXE 复测。

## 开发记录

- [后续执行目录](docs/superpowers/plans/2026-10-22-execution-roadmap.md)
- [开发日志](docs/superpowers/specs/2026-07-06-development-progress.md)
- [beta.3 章节模板与知识点改进](docs/superpowers/specs/2026-10-23-chapter-templates.md)
- [PDF 拖放修复](docs/superpowers/specs/2026-10-23-drag-import-fix.md)
- [项目接手计划](docs/superpowers/plans/2026-10-22-project-takeover-plan.md)
