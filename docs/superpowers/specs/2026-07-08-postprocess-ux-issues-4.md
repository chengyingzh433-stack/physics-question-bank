# 第四轮 UX 问题：独立片段标签/复查不可用

- 日期：2026-07-08
- 来源：第三轮 UX 人测反馈
- 关联文档：`2026-07-06-development-progress.md`（项目现状）

---

## 背景

第三轮 UX 实现了软删除原地显示、标签现场创建、模板现场编辑。人测后发现标签赋值功能存在门控缺陷：只有经过"合并"操作的题目才能看到和设置标签，大量未合并的独立片段无法赋标签。同时复查页对未合并题目的显示也有问题。

---

## 问题 1：后期处理页——独立片段无法设置标签

### 现状

`PostProcessView.tsx` 的 `QuestionCard` 组件中，标签区（章节/难度/知识点）用 `preview.questionId != null` 门控（第 828 行）：

```tsx
{preview.questionId != null && (
  <Stack gap="xs" mt="sm">
    {/* 章节/难度/知识点 Select + 现场创建 */}
  </Stack>
)}
```

`preview.questionId` 来自 `derivePreviewItems` 纯函数：合并组有 questionId（来自 `question_segments` 关联），**独立片段的 questionId 为 null**。

结果：用户在后期处理页只能给"合并过的题目"赋标签，大量独立片段（占大多数）完全无法赋标签。标签赋值功能形同虚设。

### 期望

**所有题目（无论是否合并）都能设置标签**。独立片段也应能选章节/难度/知识点。

### 涉及文件

- `src/renderer/src/views/PostProcessView.tsx`（第 828 行门控条件）
- `src/renderer/src/services/PostProcessService.ts`（`derivePreviewItems` 的 questionId 语义）

---

## 问题 2：复查页——未合并题目不显示/信息缺失

### 现状

`PaperReviewView.tsx` 的数据来源是 `listQuestionsByPaper`（第 48 行），遍历 `questions.map`（第 177 行）。入库时 `handleFinalize`（PostProcessView 第 308 行）会给每个未删除的独立片段也创建 question 行，所以**理论上**未合并片段入库后应出现在复查页。

但用户反馈复查页"只要合并过的题目才出现"，并且"不显示原图"。可能原因：

1. 独立片段入库后 `image_path` 为 null（渲染/保存环节对独立片段有问题）
2. 复查页的标签 UI（章节/难度/知识点）对所有题目都显示（不受 questionId 门控），但如果图片不显示，用户看不到题目的视觉内容，无法有效复查
3. 复查页当前用 SimpleGrid 平铺卡片，但缺少题号排序（`order_in_paper`），且没有原图时卡片只有文字标签，信息量不足

### 期望

- 复查页所有入库题目都应显示，按 `order_in_paper` 排序
- 每道题都能看到原图（如果有的话）和完整标签信息（题型/章节/难度/知识点）
- 如果 `image_path` 为空（比如入库环节出了问题），显示占位提示而非完全隐藏
- 标签赋值对合并和未合并的题目都可用

### 涉及文件

- `src/renderer/src/views/PaperReviewView.tsx`（数据显示和图片渲染）
- `src/renderer/src/views/PostProcessView.tsx`（`handleFinalize` 入库流程——确认独立片段入库是否正确设置了 `image_path`）
- `src/main/files/FileService.ts`（`saveQuestionPng`——确认独立片段入库时的图片保存路径）

---

## 红线提醒

1. **`derivePreviewItems` 纯函数和 14 个单测不动**——标签门控问题在 UI 层（门控条件），不在纯函数层
2. **入库流程 `handleFinalize` 的核心逻辑不动**（`.filter((s) => !s.is_deleted)` 过滤是红线）——但如果入库流程对独立片段的 `image_path` 设置有 bug，需修复
3. **先写库再 state（A12）**——所有标签写操作先 IPC 再更新 state
4. **复查页的模板套用/标签赋值功能保留**——不因修 bug 而退减现有功能
5. **走现有 IPC**——不新增 IPC 方法

---

## 一句话总结

标签赋值被 `questionId != null` 门控限制，导致大量独立片段无法赋标签；复查页对未合并题目的显示不完整（可能缺图片）。核心问题是 UI 层对"合并组 vs 独立片段"做了不必要的区分——从用户视角看，所有题目都应能赋标签和查看原图。
