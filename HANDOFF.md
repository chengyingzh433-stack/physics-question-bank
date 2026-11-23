# 教师题库开发交接 · 2026-11-23

**接手分支为 `codex/continuous-intake-beta14`。** GitHub 默认打开 `main`。本次交接以前者为准。版本为 1.1.0-beta.14，Mac 安装包对应源码提交 `33f7395`，安装记录提交为 `86c5e2c`。

## 取得同一份代码

[开发分支](https://github.com/chengyingzh433-stack/physics-question-bank/tree/codex/continuous-intake-beta14) · [仓库主页](https://github.com/chengyingzh433-stack/physics-question-bank) · [beta.14 发布与下载](https://github.com/chengyingzh433-stack/physics-question-bank/releases/tag/v1.1.0-beta.14)

新电脑或云端 agent 可直接用 HTTPS 克隆公开仓库，读取无需登录。

```sh
git clone --branch codex/continuous-intake-beta14 https://github.com/chengyingzh433-stack/physics-question-bank.git
cd physics-question-bank
git status --short --branch
```

这台 Mac 已有工作区，直接用编辑器打开现有目录即可。在项目目录核对 `git remote -v`、`git status --short --branch` 和 `git log -3 --oneline`。需要拉取且工作树干净时用 `git pull --ff-only`。新功能从这个基线建立自己的 `codex/…` 分支。

写入 GitHub 需有仓库写权限。使用自己的授权环境，通过 `gh auth status` 核对账号。新机确需写入时，可执行 `gh auth login --hostname github.com --git-protocol https --web` 和 `gh auth setup-git`。Git 克隆只取得代码、文档和锁定依赖清单。教师题库数据、原稿、Doc2X Key 存在用户机器上。

## 当前产品和下一步

| 模块 | 已交付能力及接手位置 |
| --- | --- |
| 录题与校对 | 图片、剪贴板、PDF、DOCX、手工文字，支持整题或分区、标签与可选 Doc2X。原稿管理见 `src/main/intake/IntakeService.ts`，工作区和校对入口见 `src/renderer/src/views/IntakeView.tsx`、`QuestionEditorView.tsx`。 |
| 检索与组卷 | beta.13 已实现已保存题干与答案检索、统一选用最新稿或原图、Word 可编辑内容及 PDF/PPT 编辑稿排版导出。见 `src/shared/contentSelection.ts`、`src/main/storage/repositories/` 和 `src/main/export/`。PDF/PPT 页面为图片。 |
| 连续录题 | beta.14 已实现保存并录下一题、来源引用复用、标签选择性沿用、页码与滚动缩放恢复、PDF 选区取字候选。见 `src/renderer/src/components/intake/`。扫描件需要另行识别，Word 取整页文字。 |

接手顺序：

1. 先读 [AGENTS.md](AGENTS.md) 和 [beta.14 交付与用户自测记录](docs/superpowers/specs/2026-11-15-continuous-intake-beta14-delivery.md)。beta.14 已安装、已发布，交付记录中的实际功能验收仍由用户执行。若已有使用反馈，优先处理影响录题和保存的问题。
2. 读 [三阶段计划](docs/superpowers/plans/2026-11-14-product-improvement-roadmap.md)。阶段三尚待实施。先提出一份可审阅的图文校对方案，明确如何调整文字、公式和配图，再细化可逐项采用的知识点或配图建议。Doc2X 已接入文字识别，知识点建议需要另行设计。
3. 对照 [ZhiTi 源码分析](docs/superpowers/specs/2026-11-13-zhiti-source-comparison.md)。该报告记录的是早期差异，已交付功能以 beta.13、beta.14 记录和当前代码为准。
4. 每阶段先写范围和方案，再实现、静态审查、类型检查、编译和打包。用户明确禁止编写或运行冒烟测试、自动化功能测试、界面走查脚本或打包应用功能测试。保留原 PDF、题图和答案图。调用云识别需要用户主动操作。主要平台为 Apple Silicon Mac，同时维护 Windows 的路径、快捷键及存储兼容。

## 恢复开发环境

使用 Node.js 24（见 `.nvmrc`），Mac 原生依赖编译需要 Xcode Command Line Tools。清理后首次准备环境，在项目根目录执行：

```sh
npm ci
npm run rebuild
```

实施改动后用 `npm run typecheck` 检查类型，`npm run build` 编译。发行新 Mac 版本时同步更新 package.json 与锁文件的版本，运行 `npm run dist:mac`、`npm run release:checksums`，用 `hdiutil verify` 校验 DMG。发布时将新 tag 指向实际构建的提交，并核对 GitHub 附件摘要。更新本机前先保存、退出软件并备份资料。当前 DMG 为 macOS 13+ arm64，尚无 Apple Developer ID 签名和公证。
