# M18 / Mac beta.5 交付记录

日期：2026-10-24。版本：1.1.0-beta.5。开发分支：`codex/editable-questions`，基于 Mac beta.4。

## 实际交付

已实现可编辑题目与 Word 组卷模块：题干/答案对照编辑、可视公式、本地配图和原图裁取、宽度/对齐/图注、草稿与导出模式、保存和历史恢复、组卷排版预览、Word 原生公式与图文混排。

- [开发方案、成熟方案参考与下一步](../plans/2026-10-24-editable-word-plan.md)
- [用户操作说明与验收清单](2026-10-24-editable-word-guide.md)
- [开发准则](../../../AGENTS.md)
- [beta.5 GitHub Release](https://github.com/chengyingzh433-stack/physics-question-bank/releases/tag/v1.1.0-beta.5)

## 本轮实际执行的检查

| 项目 | 结果 |
| --- | --- |
| 静态源码审查 | 完成，覆盖保存/恢复、资源归属、编号复用、旧合并保护、离开保护、Word 数学转换边界 |
| `npm run typecheck` | 通过，主进程和界面 TypeScript 均无错误 |
| `npm run build` | 通过；`dist:mac` 内也已完成最终构建 |
| `npm run dist:mac` | 通过，生成 Apple Silicon `.app` 与 `.dmg` |
| 冒烟、功能、GUI、打包程序运行测试 | **未编写、未执行，按用户要求由用户自行功能验收** |
| Word / WPS 打开、修改公式、分页与重开 | **未执行，等待用户验收** |

本记录不将历史 beta.4 自动测试结果当成本版结果。构建成功不等于功能测试通过。

## 安装包

- 文件：`physics-question-bank-1.1.0-beta.5-mac-arm64.dmg`
- 字节数：200790736（约 191.5 MiB）
- SHA-256：`4454d7368b92d64f1c37a42da6600f0dc9611abb503f700ba5ef49bd786f1f1d`
- 安装包在 GitHub Releases 分发，不加入源码 Git 历史；另附校验文件和用户验收说明。
- 数学字体、第三方许可证及 mathml2omml 0.5.0 对应源码随包提供，无额外系统转换工具依赖。

## 数据与兼容性

新增表采用幂等建表，原图和可编辑内容分离，配图使用不可变文件，历史恢复追加新版本。保存版本号检查防止覆盖他处改动；题目编号不再因删除复用；旧合并流程不能无提示丢弃已保存编辑内容。

本阶段没有迁移或上传个人题库资料，没有接入识别 API。不能把“备份数据库”当作包含全部 PDF/图片的完整备份。

Mac 安装包适用于 Apple Silicon，最低 macOS 13；未进行 Apple Developer ID 签名及公证。未生成 Intel Mac 或新 Windows 安装包，Windows 新模块使用效果仍待用户验收。

本次安装依赖仍报告原有 15 项依赖告警（5 moderate、8 high、2 critical），没有执行破坏性的自动强制升级；依赖全面升级属于后续维护。构建保留原有 RenderService 动态/静态导入提示，不影响此次编译完成。

## 下一步

由用户根据清单验收真实题目的编辑、保存、公式及 Word/WPS 效果；先修复反馈中的具体问题，再进入“单题识别并校对”模块。Doc2X 是流程参考及识别候选，尚未接入。
