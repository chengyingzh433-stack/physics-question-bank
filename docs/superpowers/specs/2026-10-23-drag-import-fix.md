# 测试版问题 1：PDF 拖放导入

用户反馈：不能拖动导入试题。发布目标：1.1.0-beta.2。

## 原因和修复

原主页仅有 `importPaper` 文件选择入口，没有 drag/drop 事件，也没有从原生 File 对象取得路径的 preload 方法。新文件拖放检查在已发布 beta.1 上复现失败：主页不会出现拖放提示。

- 主页整个窗口接收文件拖放，显示“松开鼠标，导入 PDF 试卷”；空库和已有试卷两种状态都可用。
- 一次拖入多份 PDF 时按顺序导入并显示进度；单份失败不阻止后续有效文件。
- preload 使用 Electron `webUtils.getPathForFile` 取得真实文件路径，IPC 只传路径，不把整份 PDF 读进渲染进程内存。
- 文件选择与拖放共用 `src/main/files/importPaper.ts`。主进程检查绝对路径、PDF 扩展名及普通文件属性；同样支持大写 `.PDF`。
- 保留 pdfjs 解析和原有失败回滚：损坏 PDF 不留下空试卷或残余项目目录。
- 全应用阻止文件拖放触发浏览器默认导航，避免 PDF 覆盖程序页面；导入动作在主页提供。
- 保留原按钮导入以及答案卷的 kind / parentPaperId 语义。

## 回归范围

`scripts/test-packaged-app.mjs` 使用发布 EXE 的 Chromium 原生文件拖放（CDP Input.dispatchDragEvent 的 files 字段），实际走 File → preload → IPC → 文件复制 → pdfjs 页解析链路；没有用伪造 File 对象或直接调用导入 IPC 代替拖放。

覆盖：非 PDF 拒绝、空库单份、已有试卷多份、中文含空格文件名、大写扩展名、损坏文件清理并继续、源文件复制一致性、页数与状态、按钮及答案导入兼容。仍使用隔离测试 profile，不写用户真实题库。

## 验证与交付

2026-10-23：类型检查通过；7 个测试文件、89 项测试通过；Windows 打包通过。上述真实发布 EXE 拖放回归全部通过，原有题库、选题、PDF/PPTX 三种答案模式导出、PDF 渲染与单实例启动检查也通过。

- 版本：**1.1.0-beta.2**。
- 程序：`release/1.1.0-beta.2/win-unpacked/物理教师题库管理系统.exe`。
- 安装程序：`release/1.1.0-beta.2/教师题库-测试版-1.1.0-beta.2-安装程序.exe`。
- 机器检查报告：`release/1.1.0-beta.2/packaged-test-report.json`。
- 桌面“教师题库测试版”和项目内“打开题库测试版”快捷方式均指向新版；启动脚本与使用说明同步更新。若旧版仍在运行，先关闭旧窗口，再双击快捷方式。

本轮针对 PDF 拖放导入；Word、图片的结构化导入仍按后续执行目录推进。
