# Windows 测试版交付记录

日期：2026-10-23（Asia/Shanghai）。版本：**1.1.0-beta.1**。用户要求测试版容易使用、双击打开，不依赖命令行。

## 交付入口

- 桌面：`教师题库测试版.lnk`。
- 项目根目录：`打开题库测试版.lnk`，以及更新后的 `启动(无窗口).vbs` / `启动.bat`。均直接启动发布 EXE，不再运行 npm 或开发服务器。
- 程序：`release/1.1.0-beta.1/win-unpacked/物理教师题库管理系统.exe`。免安装使用需要保留整个 `win-unpacked` 文件夹。
- 中文安装程序：`release/1.1.0-beta.1/教师题库-测试版-1.1.0-beta.1-安装程序.exe`。大小 **126,537,023 字节**。可选择安装位置，并创建桌面/开始菜单入口。
- 用户说明：根目录 `测试版使用说明.html`，浏览器双击打开。

安装程序 SHA-256：

```text
2910C728B78D4C791C1341F44A6CD6C304FD75C562C6CF4371CEFA59EB746983
```

## 功能范围

包含当前已实现的 PDF 导入、裁切编号、题图入库、答案匹配、题夹与标签检索、多选与组卷、PDF/PPT 导出。第二阶段的结构化题目编辑、独立图片调整、公式编辑、正文检索及 Word 导出没有包含在本轮。三阶段顺序见 [执行目录](../plans/2026-10-22-execution-roadmap.md)。

为方便测试，窗口默认调为 1200×800、下限 900×670，顶部显示版本。重复双击会唤回原窗口，避免重复实例。启动失败使用中文系统提示框展示错误和数据位置。

沿用原有应用名称和数据路径，未改名建立另一份正式题库。所有自动测试使用临时 profile 或内存数据库，未写入真实用户题库。

## 实际验证

| 检查 | 结果与范围 |
|---|---|
| TypeScript | node/web 通过 |
| Vitest | 7 文件、89 项通过 |
| 构建与 NSIS | `npm run dist` 成功，历史 1.0.0 安装包保留，新产物进入版本目录 |
| 隔离 GUI | `npm run test:bank-ui` 通过：默认/宽窗口、题夹管理、跨页选择、筛选、预览、入篮/取消 |
| 实际发布 EXE | `node scripts/test-packaged-app.mjs` 通过：从 `win-unpacked` 启动，不是开发 Electron 替代运行 |
| 原生与资源 | 打包 SQLite 可读写，preload/IPC、题图路径、中文字体、PDF worker 正常；源 PDF 实际渲染并留截图 |
| 导出 | PDF/PPTX 各自 none/inline/append 三种答案模式均生成文件；PDF 可解析，PPTX 包含幻灯片及图片资源 |
| 重复启动 | 第二个进程退出，原进程保留一个窗口 |
| 打包内容 | 排除 `out` 下测试脚本、调试辅助脚本和截图；保留应用三部分及生产依赖 |
| 快捷方式 | 核实目标 EXE 存在、工作目录正确、参数为空，不经过命令解释器 |

实际发布程序测试报告：`release/1.1.0-beta.1/packaged-test-report.json`。源 PDF 渲染截图：同目录 `打包版PDF渲染检查.png`。报告中的 ISO 时间为 UTC，交付日期按北京时间记录。

验证中的主进程调试只通过命令行启用的本地 inspector 和临时 profile 完成；调试脚本从外部替代保存对话框选择测试输出路径，未在产品内增加测试入口。第一次尝试遇到 ESM 调试上下文无法直接访问 require 的问题，改为版本 IPC 断点取得已有模块绑定后完成整体验证。

## 验证边界

- 未在另一台无开发环境的干净 Windows 机器安装；本轮没有运行安装器覆盖用户的现有安装或注册信息。
- 导出文件完成结构验证，未据此声称所有复杂题图在 WPS/PowerPoint 中排版均已人工验收。
- 本轮发布流程保留原有 RenderService 静态/动态导入警告和 Electron 默认图标；二者未阻止打包与运行。
- 用户真实资料的使用体验仍需验收。

## 开发者复现

```powershell
npm run typecheck
npm test
npm run dist
npm run test:bank-ui
node scripts/test-packaged-app.mjs
./scripts/prepare-test-release.ps1
```

最后一步重新生成本机桌面/项目快捷方式、旧启动入口和用户说明。未来升级版本时以 package.json 版本号生成新路径；所有测试/打包产物留在已忽略的 `release` / `out` 目录，快捷方式按本机路径生成。
