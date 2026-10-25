# M22 单题录入体验交付记录

日期：2026-10-25。版本：1.1.0-beta.9。基于 beta.8。用户明确要求补齐录题标签、题卡同步及简化步骤，暂不做批量录题。

## 已实现

- 同一校对页选择题型、章节、难度、多个知识点、年份和出处；知识点可新增，已有题卡有“编辑题目 / 标签”入口。
- 内容和标签同一事务保存；正文版本和标签打开时的值分别检查冲突；整题保存入库失败时整体回滚。
- 题库卡片和放大预览优先展示最新保存的文字、公式、图片；原图另设对照入口，已保存文字答案计入卡片与筛选。
- 单张图片、截图、文字快捷进入校对；PDF/DOCX 当前选区直接作为单题；输入文字在暂存或继续时自动加入；组合预览可选；一次整题确认后保存入库。
- 编辑器支持粘贴单张 PNG/JPEG 配图；沿用原件、恢复草稿、内容历史和 Doc2X 上传确认。

方案见 [M22 实施方案](../plans/2026-10-25-single-question-workflow-plan.md)，入口、操作与用户验收见 [M22 使用说明](2026-10-25-single-question-workflow-guide.md)。

## 开发检查与边界

- 静态审查涉及标签关联校验、乐观冲突、事务回滚、按当前页读取题卡、过期异步结果处理、原图保留及上传边界。
- 主进程和界面类型检查通过；代码差异空白检查通过。
- `npm run dist:mac`：编译、原生依赖准备与 Apple Silicon DMG 制作完成；保留已有 RenderService 导入提示。
- DMG 镜像校验通过；文件级核对版本、应用标识、arm64 主程序和数据库组件、内置字体及许可。安装副本的应用归档、主程序及数据库组件摘要与 DMG 一致。
- 本机已更新到 beta.9。GitHub 五个发布附件已完整上传并发布为预发布版本，服务器记录的大小及 SHA-256 与本机一致。
- **没有编写或运行冒烟测试、自动功能测试、界面走查脚本或打包应用功能测试，没有启动应用验收，也没有调用真实 Doc2X。功能验收交由用户。**

Word 仍按导出模式选择内容；PDF/PPT 仍使用原图，未新增 PNG 合成导出。旧 DOC、复杂 Word 排版、宏和特殊对象的边界保持不变。没有批量录题、自动知识点推荐或 AI 解题。标签使用现有分类体系，内容历史恢复不回滚标签。Windows 没有新安装包或功能验收。Mac 包仍未做 Developer ID 签名及公证。

## 发布与安装

安装包：`physics-question-bank-1.1.0-beta.9-mac-arm64.dmg`，203,651,402 字节。

SHA-256：`6d1f91d0c306c42e20b7063e1c0fb12d95796c30329f17e7c35a1ffd82be1677`。

发布附件包括安装包、`SHA256SUMS.txt`、本阶段方案、使用说明和交付记录。分支：`codex/single-question-workflow`，基于 `codex/multi-source-intake`。

GitHub 已于 2026-10-25T12:56:48Z 发布：[beta.9 下载页](https://github.com/chengyingzh433-stack/physics-question-bank/releases/tag/v1.1.0-beta.9)。运行代码提交：`18dfbd4730fd66acfaf116f95ad7c107d35efa4f`；[草稿 PR #6](https://github.com/chengyingzh433-stack/physics-question-bank/pull/6) 供审阅，尚未合并。上传/发布核验记录保存于忽略目录 `release/1.1.0-beta.9/github-upload-receipt.json`、`github-publication-receipt.json`。

本机已于 2026-10-25T20:51:51.093177+08:00 更新 `/Applications/物理教师题库管理系统.app`。旧 beta.8 程序、构建副本、DMG 和 blockmap 共 4 项移入废纸篓，保留恢复能力；题库数据库、原稿及 API Key 未读取或修改。安装后未启动应用。文件检查与本机替换记录保存于忽略目录 `release/1.1.0-beta.9/package-inspection.json`、`local-install-receipt.json`。
