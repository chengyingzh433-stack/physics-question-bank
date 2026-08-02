# M15 问题修复总结

- 日期：2026-08-02
- 修复人：Kiro (Claude Opus 4.8)
- 涉及问题：问题1撤销bug + 问题3完成反馈 + 问题4答案可选（新增）

---

## 修复1：撤销上一刀bug（问题1）

### 修复过程

**第一次尝试（commit e234aa7）**：
- 在 `PDFViewer.tsx` 新增 scroll listener 触发 `onVisiblePageChange`
- 根据 viewport 中心计算当前可见页
- **结果**：activePageId 正确更新，但撤销变成"只撤当前页"

**第二次尝试（commit aee66ad）**：
- 意识到用户期望是"撤销全局最后一刀"（跨所有页）
- 改 `pageRepo.undoLastCutLine` 参数从 `pageId` 改为 `paperId`
- 全链路修改（IPC、preload、types、useCropData、CropView）
- **结果**：点撤销无任何反应

**第三次尝试（commit 3faf5b7）**：
- **根因定位**：`cut_lines` 表没有 `paper_id` 字段，SQL 查询 `WHERE paper_id = ?` 直接失败
- **修复方案**：通过 `JOIN pages` 获取 paper_id 过滤
  ```sql
  SELECT c.id, c.page_id
  FROM cut_lines c
  JOIN pages p ON c.page_id = p.id
  WHERE p.paper_id = ?
  ORDER BY c.created_seq DESC
  LIMIT 1
  ```
- **结果**：✅ 撤销正常工作，全局最后一刀被删除

### 最终方案

**行为定义**：
- "撤销上一刀"撤销**全局最后一刀**（`created_seq` 最大），无论当前在哪一页
- 返回被删刀所在的 `page_id`，前端只刷新该页

**影响文件**：
- `src/main/storage/repositories/pageRepo.ts` - JOIN修复
- `src/main/ipc/index.ts` - 参数改为 paperId
- `src/preload/index.ts` - 桥接参数修改
- `src/shared/types.ts` - 类型定义修改
- `src/renderer/src/services/useCropData.ts` - 处理 affectedPageId
- `src/renderer/src/views/CropView.tsx` - 撤销按钮传 pid
- `src/renderer/src/views/PDFViewer.tsx` - scroll listener（第一次尝试遗留，但不影响最终方案）

### 测试要点

1. 在第1页切2刀
2. 滚动到第2页切3刀
3. 滚动到第3页切1刀
4. 在任意页点"撤销上一刀"
5. **期望**：依次删除第3页刀 → 第2页第3刀 → 第2页第2刀 → 第2页第1刀 → 第1页第2刀 → 第1页第1刀

---

## 修复2：完成流程反馈Modal（问题3）

### 修复方案

**改动**：`AnswerMatchView.tsx` 的 `handleConfirm` 成功路径

**新增行为**：
1. 绑定成功后弹出 Modal：
   - 标题："✅ 答案匹配完成"
   - 统计："共 X 道题，已成功绑定 Y 道题的答案"
   - 部分配对显示黄色 Alert："还有 Z 道题未绑定答案"
   - 提示："答案图已保存到题库，可在主页查看完整题目"

2. 关闭 Modal 后二次询问：
   - "是否返回主页查看题库？"
   - 确认 → 跳转 `#/`
   - 取消 → 留在答案匹配页

**UX决策**：
- 采用"方案B（Modal）"而非Toast（方案A）或专门路由（方案C）
- 分两级反馈：主Modal显示统计 → 二次询问引导导航

### 测试要点

1. 全部配对（5题5答案）→ Modal 无黄色警告
2. 部分配对（5题3答案）→ Modal 显示"还有2题未绑定"
3. 0题配对 → Modal 显示"已绑定0道题" + 黄色警告
4. 二次询问"返回主页" → 路由跳转 `#/`
5. 二次询问"留在此页" → Modal关闭，停留当前页

---

## 修复3：答案匹配改为可选流程（新增问题4）

### 问题发现

用户反馈：有时候试卷暂时没有答案PDF，应该允许直接入库题目，不强制匹配答案。

### 修复方案

**改动**：`AnswerMatchView.tsx` 状态1（无答案卷）的UI

**新增内容**：
1. 标题改为"导入答案 PDF（可选）"
2. 新增说明："如果暂时没有答案，可以稍后再匹配或直接完成入库"
3. 按钮改为并列布局：
   - "选择答案 PDF"（violet，主要操作）
   - "稍后再匹配"（light，直接返回主页）
4. 保留"返回后期处理"按钮在底部

**UX逻辑**：
- 降低答案匹配的强制性，从"必须导入"变为"可选导入"
- "稍后再匹配"直接返回主页，用户可以后续从主页重新进入答案匹配

### 测试要点

1. 新试卷进入答案匹配页 → 显示"（可选）"标题 + 两个按钮
2. 点"选择答案PDF" → 原有导入流程
3. 点"稍后再匹配" → 跳转主页
4. 从主页重新进入该试卷的答案匹配 → 仍可导入答案

---

## 总体自测

| 检查项 | 结果 |
|---|---|
| TypeScript typecheck | ✅ 0 错误 |
| 单元测试 | ✅ 79 个全绿 |
| Build | ✅ 通过 |
| Commits | ✅ 3个（e234aa7, aee66ad, 3faf5b7） |
| GitHub push | ⏳ 网络问题待重试 |

---

## 遗留问题

**问题2（框选手动调整）**：推迟到 M16/M17
- 原因：需要 DB Schema 迁移 + 拖动 UI，成本较高
- 绕过方案：重新框选更精准的区域
- 优先级：P2（中）

---

## 下一步

1. **人工测试**：按测试要点完整验证3个修复
2. **网络恢复后**：重新 `git push origin main`
3. **M15正式完成**：问题1/3/4修复 ✅，问题2推迟 ⏳
4. **进入M16**：PPT导出功能

---

## Commits 记录

1. **e234aa7** - M15 问题1/3修复（第一版，scroll listener）
2. **aee66ad** - 撤销改为全局撤销（参数链式修改，SQL有误）
3. **3faf5b7** - SQL JOIN修复 + 答案匹配可选流程

**总变更**：8个文件，~120行增删
