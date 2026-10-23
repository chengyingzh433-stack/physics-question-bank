# Mac beta.4 交付与验证

日期：2026-10-23。版本：1.1.0-beta.4。基于 Windows beta.3 的 `50eb217`，在 `codex/mac-compatibility` 分支继续开发。

## 本轮完成

- Mac 开发栈固定为 Node 24、Electron 44.9.3、better-sqlite3 13.0.3、@electron/rebuild 4.2.1、electron-builder 26.15.3。保留现有 React/Mantine/pdfjs/Vite 主版本。
- `npm run rebuild` 显式先安装 Electron 运行文件，避免新版按需下载与并行测试竞争。SQLite 13 使用 Node-API 预编译模块，实际运行及打包验收均加载 arm64 模块。
- 新版 Electron 要求显式启用自定义协议跨 scheme 读取：为 `app://` 配置 `corsEnabled`，PDF worker、文件读取和沙箱 preload 均保持正常。没有关闭系统保护或设置 `webSecurity:false`。
- GUI 错误监听升级为新版 `console-message` 事件对象；修复知识点保存时浮层仍观察隐藏输入框引发的 ResizeObserver 布局通知，保存前关闭候选列表。
- Mac 关闭最后一个窗口后保留进程，Dock 激活或重新启动可以恢复窗口；保留单实例行为。
- 旋转角度写入 pages，并经统一几何映射传递给题图和答案图高清渲染；覆盖 0/90/180/270 度。历史记录中已丢失的旋转角度不能由本次代码自动还原，需用原始 PDF 重新导入复核。
- 答案配对新增 `answer_pairings` 表。确认绑定时，整卷配对及答案图元数据事务提交；新 PNG 先写独立文件，失败不会覆盖旧图。成功后回收被替换且无引用的旧图。明确的空配对与“从未保存”的自动配对区分，重开不会覆盖用户选择。
- 删除/软删/重裁答案片段时清除受影响的整组配对及图片引用，防止 SQLite 行号复用造成错误关联；删除答案卷时清除旧答案图引用。失败或来源作废可能留下不再引用的 PNG，不影响旧版本完整性，磁盘孤儿整理另列后续维护。
- 新增 Apple Silicon DMG 打包和跨平台打包验收脚本；明确 Doc2X 来源与集成状态。

## 验证结果

环境：macOS 26.6（25G72）、arm64、Node 24.22.1、npm 11.19.1。全部使用自行生成 PDF、临时资料和隔离数据库，没有读取或迁移用户真实题库。

| 检查 | 结果 |
|---|---|
| 类型检查 | 通过，主进程与界面均无错误 |
| 单元及 SQLite 测试 | 10 个文件、114 项通过 |
| 题库 GUI | 选择/入篮分离、题夹、筛选、分页、题图/答案预览通过 |
| 章节 GUI | 158 节点模板、知识点搜索多选、新建、保存重载、真实 PDF 后期处理通过 |
| 答案 GUI | 真实 90 度 PDF 导入、高清题图/答案图尺寸与中心像素、交换配对、保存重载、明确无答案重载通过 |
| 构建 | 通过；既有 RenderService 静态/动态导入提示仍存在 |
| DMG 与最终打包程序 | 通过：真实打包程序、原生文件拖放、三种答案模式 PDF/PPTX 导出、中文字体/PDF worker、单实例及 Mac 窗口重建 |
| DMG 校验 | hdiutil verify 通过；只读挂载后 .app 与被测目录逐文件一致 |
| 开发入口 | npm run dev 实际启动，通过原生窗口确认 beta.4 主页；默认资料目录为 ~/Library/Application Support/physics-question-bank |

新增 15 项自动测试覆盖旋转页落库、渲染参数、缺页拒绝、交换配对后关闭重开数据库、空配对、多段顺序、事务回滚、跨卷/重复/失效输入拒绝、重裁/软删/删除的关联清理及重复建表。

验收中的问题及处理：新版 Electron 首次启动按需下载，因此准备命令增加显式安装；自定义协议缺少 CORS 声明导致 PDF 读取失败，补齐后通过；知识点浮层布局通知通过调整保存生命周期修复，没有在测试中忽略错误。Mac `/var` 与 `/private/var` 是同一路径，打包验收改为比较真实路径；关闭窗口断言等待 `closed` 事件。重载测试增加导航查询参数，确保真正重建页面，而非仅改变 hash。

## 运行与发布

开发：`npm ci` → `npm run rebuild` → `npm run dev`。

检查：`npm run typecheck` → `npm test` → `npm run build` → `npm run test:bank-ui` → `npm run test:chapters-ui` → `npm run test:answers-ui`。

Mac 交付：`npm run dist:mac` → `npm run test:packaged`。产物为 `release/1.1.0-beta.4/physics-question-bank-1.1.0-beta.4-mac-arm64.dmg`，对应 `.app` 位于 `mac-arm64/`。

DMG SHA-256：`2fea60e50026465dd50299dfb8debec5ac75517adb887b6ff064b8ffd49c5e89`。

本机未配置 Apple Developer ID 证书或公证凭证。本次为未进行 Developer ID 签名/公证的测试版，不能据本机成功启动承诺其他电脑下载后无系统提示。只提供 Apple Silicon 版本；Windows beta.4 和 Intel Mac 未验证。已有 Windows beta.3 Release 保留。

## Doc2X 结论与后续

已有[模块对照](2026-10-22-bank-experience-design.md)与[技术调研](2026-10-22-editable-question-solutions-research.md)确实记载 Doc2X。它在本项目中是操作流程参考与云识别候选，源码和 package.json 未接入其 SDK/API；[官方教师题库教程](https://doc2x.noedgeai.com/help/en/tutorials/teacher-question-bank.html)介绍独立 Web 产品，[开源 doc2x-mcp](https://github.com/NoEdgeAI/doc2x-mcp)是接入工具，不能等同于整套教师题库开源。

后续顺序：真实教学样本体验验收；完整备份/恢复及 Windows 路径迁移方案；原图与结构化内容双存储、文字/图片/公式编辑最小闭环；识别候选对比及 DOCX 原生公式验收。OCR、公式编辑、Word 导出本轮未实现。

仍需独立处理：Windows 升级版构建/安装/导出回归、真实题库迁移、长题 PPT/PDF 分页、题目重裁的标签/组卷引用保护、依赖审计。升级后 npm 审计仍报告 15 项（5 moderate / 8 high / 2 critical），未进行强制自动修复，不把通过功能测试等同于审计完成。
