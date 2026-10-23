# Mac 接手验证记录

> **后续实施更新：** 本文保留首次接手的失败证据。随后已升级到 Electron 44.9.3，在本机通过 SQLite、PDF、GUI 和实际打包程序检查，继续修复旋转页及答案配对。最新状态以 [Mac beta.4 交付记录](2026-10-23-mac-beta4-release.md) 为准。

日期：2026-10-23，Asia/Shanghai。代码：`50eb217340d99b41cbd5ed7c75a63d5bc6af201c`，`1.1.0-beta.3`。对应 [接手计划](../plans/2026-10-23-mac-takeover-plan.md)。

## 范围

从 GitHub 私有仓库克隆到 `/Users/metric/有趣的项目/教师题库`，读取需求、开发日志、近期交付和路线文档，并审阅主进程、IPC、数据模型、仓储、裁切/出图、答案、题库、组卷及导出主流程。检查远端分支、Issues、PR 和 Release。本次没有改业务源码、升级依赖、推送源码、发布安装包或迁移真实题库。

## 环境与复现

| 项目 | 实测 |
|---|---|
| 平台 | macOS 26.6，arm64 |
| Node / npm | 24.22.1 / 11.19.1 |
| Git / Python | 2.56.0 / 3.14.8 |
| 锁定 Electron | 31.7.7 |
| 锁定 better-sqlite3 | 11.10.0 |
| 初始工作区 | 克隆后干净，main 跟踪 origin/main |

执行结果：

1. `npm ci`：成功，安装 540 个包；未修改锁文件。审计报告 34 项告警，未逐项分析其生产影响。
2. `npm run typecheck`：node 和 web 均通过。
3. `npm run build`：main/preload/renderer 全部成功；已有 RenderService 静态/动态导入警告继续存在。
4. `npm run rebuild`：退出码 0，`Rebuild Complete`。`better_sqlite3.node` 检查为 Mach-O arm64。
5. `npm test`：19:58:28 开始，8 个文件，79 通过、20 失败。
6. `npm run test:bank-ui`、`npm run test:chapters-ui`：由于第 5 项失败，中止后续串行执行；未声称通过。

通过的 79 项分别为：ColumnCropService 14、deriveAllSegments 10、TemplateService 7、questionFilter 16、PostProcessService 14、AnswerMatchService 18。

失败的 20 项分别为：bankStorage 10、chapterTemplates 10。两组都通过子进程启动 Electron 运行内存 SQLite；初始子进程异常退出，后续报 `spawnSync .../Electron.app/Contents/MacOS/Electron ENOENT`。不能将此结果解读为 20 个业务断言已证实失败。

## Mac 启动阻碍证据

`syspolicyd` 的对应日志摘录：

```text
2026-10-23 19:58:30.398 Attempting to move malware to trash ... (id: Electron), (bundle_id: com.github.Electron)
2026-10-23 19:58:30.399 Prompt could not be shown ... (id: Electron)
2026-10-23 19:58:30.405 Evaluating blocked code ... (id: Electron)
```

项目 `node_modules/electron/dist/` 只剩许可和版本文件，`Electron.app` 已不存在；`/Users/metric/.Trash/Electron.app` 存在。本轮未恢复或运行废纸篓中的应用，未关闭或绕过系统保护。

缓存包 `electron-v31.7.7-darwin-arm64.zip` 的 SHA-256：

```text
e81b75a185376effcc7dd15aef8877ab48474633e5ac7417810a3b28e694bbfa
```

实际摘要与该 Electron npm 包的 `checksums.json` 一致。该校验只能说明下载包与包内预期摘要一致；不代表系统误报，也不代表业务源码被判定有恶意行为。具体检测依据尚未确定。

另外尝试了一次内存库诊断，准备检查 rotation 落库和重裁关联；由于 Electron 已不存在，诊断也未完成。接手计划中的这些观察仍标为源码依据，未写成实测复现。

## 当前结论与下一次验证门槛

本机具备源码审阅、类型检查和构建条件，**尚不具备已验证的 Electron 运行条件**。第一项后续开发应是受维护的官方 Electron 运行时及配套原生依赖兼容升级，完成实际启动、SQLite、PDF worker、preload、GUI 和 Windows 回归，再处理业务缺陷及新功能。详见接手计划 A0。

本轮没有打开用户真实题库，也没有完整验证文件选择、拖放、答案图生成、PDF/PPT 导出和重启续编。Windows beta.3 的 99 项测试及 GUI/发布 EXE 通过记录来自已有文档，不能替代这台 Mac 的验证。
