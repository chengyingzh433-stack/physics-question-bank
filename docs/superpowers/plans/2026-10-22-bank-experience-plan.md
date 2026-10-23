# 题库分类、检索与选题 Implementation Plan

> **For agentic workers:** 按下列复选项逐项执行与核验，当前会话直接实现；后续阶段见 [执行目录](2026-10-22-execution-roadmap.md)。

**Goal:** 在现有题图题库上完成个人归类、快速找题、批量选题闭环。

**Architecture:** 主进程 SQLite 存题夹及关联、执行组合检索和事务；preload 暴露类型化 API；BankView 组合分类侧栏、筛选、卡片和预览。保留已有裁切、题图、答案和导出格式。

**Tech Stack:** Electron、better-sqlite3、React、Mantine、TypeScript、Vitest；不新增产品依赖。

**完成记录（2026-10-23）：** 本轮代码和以下检查已完成，分支 `codex/bank-experience`，未提交/推送。单层题夹与分页是本轮明确范围；正文搜索和编辑留在第二阶段。

## 1. 存储和检索

文件：`src/main/storage/schema.ts`、`questionFilter.ts`、`repositories/questionRepo.ts`、新建 `repositories/folderRepo.ts`、`repositories/setRepo.ts`、`src/shared/types.ts`。

- [x] 扩展筛选 DTO：`search?: string; folder_id?: number | null; unfiled?: boolean; answer_status?: 'with' | 'without' | null`。
- [x] 新建题夹表和关联表；实现名字校验、CRUD、计数、批量加入/移出；删除只影响关联。
- [x] 统一实际查询与单测使用的过滤器，正确绑定知识点与其他条件的参数。
- [x] 搜索五种既有文本来源，转义 LIKE 特殊字符；实现题夹、未归类、答案筛选。
- [x] 增加事务批量入篮、按题 ID 出篮；复用原去重语义。
- [x] 加入内存库行为测试，使用 Electron 的 Node 模式加载现有 native SQLite，避免改动用户数据和重编译生产依赖。断言多题夹不重复、目录删除保留题/答案/篮、组合筛选、特殊字符和批量失败回滚。

## 2. IPC 和界面

文件：`src/main/ipc/index.ts`、`src/preload/index.ts`、`src/shared/types.ts`、`src/renderer/src/views/BankView.tsx`、新建 `src/renderer/src/components/bank/QuestionPreview.tsx`、`src/renderer/src/components/useBasketCount.ts`、`src/renderer/src/views/BasketView.tsx`。

- [x] 接通题夹接口及组卷批量接口，返回真实变化数量。
- [x] 题库页增加题夹导航/管理、关键字、答案状态，保留现有筛选；知识点用可搜索多选框。
- [x] 分离选中态与篮内态；24 题分页；当前页全选；批量归类、当前题夹移出、入篮；结果和选择数量始终可见。
- [x] 预览完整题/答案和标签、相邻题导航、可取消入篮；导航篮计数实时更新。
- [x] 请求以序号/清理保护避免旧结果覆盖；失败保留选择并提示；写入期间防连点。

## 3. 检查与交付记录

- [x] `npm run typecheck`：主进程及渲染进程零错误。
- [x] `npm test`：原有单测及新行为测试通过；修改错误的参数顺序测试，使其检查真实 SQL 绑定顺序。
- [x] `npm run build`：三部分构建完成，记录既有警告。
- [x] 隔离数据 GUI 检查，记录实际覆盖范围；不能以代码完成代替真实题库人工验收。
- [x] 更新本计划复选框、执行目录和开发日志，说明后续两阶段仍排队。

## 检查证据与复跑

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | node/web 均通过，包含新增界面测试脚本的类型检查 |
| `npm test` | 7 个文件、89 项通过，其中 10 项使用真实 SQLite 内存库验证题夹/检索/篮行为 |
| `npm run build` | main/preload/renderer 构建成功；原有 RenderService 静态/动态导入警告仍存在 |
| `npm run test:bank-ui` | 实际 Electron + preload + IPC + 临时 SQLite，900×670 / 1320×850 窗口检查通过 |

界面脚本位于 `scripts/bank-ui-smoke.ts`，启动器为 `scripts/run-bank-ui-smoke.mjs`。必须先构建再运行界面检查。脚本设置独立临时 userData，生成 30 道示意题，验证跨页勾选、筛选重置、入篮/取消、预览、搜索及题夹管理，并将截图写入 `out/bank-ui-900.png`、`out/bank-ui-1320.png`。不使用真实用户资料；临时数据库路径在执行输出中可追溯。

初次界面脚本尝试中遇到模拟 Escape 事件和弹窗渲染等待问题，已改为点击关闭按钮并等待目标控件出现；随后完整检查通过。未据此声称用户真实 PDF、旧安装包和全部导出链路已再次验收。

## 待真实资料体验验收

- [ ] 启动开发版，检查原题目和答案显示；新题夹初始为空，旧题在“未归类”中可找到。
- [ ] 用自己的资料建立题夹，组合出处/年份/知识点找题，试用跨页批量入篮；确认分类和选题习惯是否顺手。
- [ ] 基于体验反馈调整第一阶段，再按执行目录推进第二阶段。当前没有生成新安装包。
