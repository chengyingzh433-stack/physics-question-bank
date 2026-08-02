# M15 走查问题技术手册

**日期**: 2026-08-02  
**工程师**: 高级工程师（刘程阶段1）  
**审查范围**: M15走查发现的3个问题  

---

## 问题 1：撤销上一刀始终从第一页开始 🔴

### 现象描述

用户在CropView的第2页、第3页等非首页操作时，点击"撤销上一刀"按钮，撤销动作总是作用于第1页的最后一刀，而不是当前可见页。

### Root Cause

**PDFViewer.tsx 从未实际调用 `onVisiblePageChange` 回调**。

#### 代码分析

1. **CropView.tsx:28-34** - `activePageId` 初始化逻辑正确：
```tsx
const [activePageId, setActivePageId] = useState<number | null>(null)

useEffect(() => {
  if (crop.pages.length > 0 && activePageId === null) {
    setActivePageId(crop.pages[0].id)
  }
}, [crop.pages, activePageId])
```

2. **CropView.tsx:148-151** - 正确传递回调给PDFViewer：
```tsx
onVisiblePageChange={(idx) => {
  const p = crop.pages[idx]
  if (p) setActivePageId(p.id)
}}
```

3. **CropView.tsx:111** - 撤销逻辑依赖 `activePageId`：
```tsx
onClick={() => activePage && crop.undoLastCutLine(activePage.id)}
```

4. **PDFViewer.tsx:17** - 定义了prop：
```tsx
onVisiblePageChange?: (pageIndex: number) => void
```

5. **PDFViewer.tsx:44** - 解构了prop但从未使用：
```tsx
const { sourceUrl, pages, zoomMode, zoomPercent, onZoomPercentChange, overlayForPage } = props
// ⚠️ onVisiblePageChange 被解构了，但全文搜索无任何调用！
```

6. **PDFViewer.tsx:302-311** - `PageCanvas` 的 IntersectionObserver 只用于虚拟化渲染：
```tsx
useEffect(() => {
  const el = containerRef.current
  if (!el) return
  const io = new IntersectionObserver(
    (entries) => { for (const e of entries) setVisible(e.isIntersecting) },
    { rootMargin: '1000px 0px' }
  )
  io.observe(el)
  return () => io.disconnect()
}, [])
```
这个Observer设置的是local `visible` state，从未向父组件报告可见性变化。

### 影响范围

- **CropView**: 撤销上一刀、撤销上一框 → 始终作用于第1页
- **PostProcessView**: 如果有类似"当前页"相关操作，同样受影响

### 技术方案

#### 方案A：滚动监听 + getBoundingClientRect（推荐）

在`PDFViewer.tsx`的`scrollRef`容器上添加scroll listener，检测哪个页面容器的中心点最接近viewport中心，触发`onVisiblePageChange`。

**实现要点**：
```tsx
useEffect(() => {
  const scroller = scrollRef.current
  if (!scroller || !onVisiblePageChange) return
  
  const handleScroll = () => {
    const viewportCenter = scroller.clientHeight / 2
    let closestIdx = 0
    let minDistance = Infinity
    
    const pageElements = scroller.querySelectorAll('[data-page-id]')
    pageElements.forEach((el, idx) => {
      const rect = el.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const pageCenter = rect.top - scrollerRect.top + rect.height / 2
      const distance = Math.abs(pageCenter - viewportCenter)
      
      if (distance < minDistance) {
        minDistance = distance
        closestIdx = idx
      }
    })
    
    onVisiblePageChange(closestIdx)
  }
  
  scroller.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll() // 初次调用
  
  return () => scroller.removeEventListener('scroll', handleScroll)
}, [onVisiblePageChange])
```

**优点**：
- 直接利用DOM查询，简单可靠
- 25-30行代码
- 不依赖现有IntersectionObserver逻辑

**缺点**：
- scroll事件频繁触发（需throttle或依赖passive优化）

---

#### 方案B：改造PageCanvas IntersectionObserver

让每个`PageCanvas`向上报告可见性变化，父组件维护"当前最可见页"状态。

**实现要点**：
1. 给`PageCanvas`加`onVisibilityChange(pageIndex, isVisible)`prop
2. IntersectionObserver触发时调用回调
3. PDFViewer维护`visiblePages: Set<number>`
4. 选择intersection ratio最大的页作为active page

**优点**：
- 复用现有IntersectionObserver
- 可获得精确的可见性比例

**缺点**：
- 需要重构PageCanvas通信（30-40行）
- 多个页同时可见时需额外逻辑判断优先级

---

#### 推荐：方案A

理由：
- 实现成本低（1个useEffect）
- 逻辑集中在PDFViewer，不污染PageCanvas
- scroll被动监听性能可接受（viewport只有2-3页可见）

---

### 实施清单

**文件**: `src/renderer/src/views/PDFViewer.tsx`

1. 在第44行添加`onVisiblePageChange`到解构列表（当前漏了）
2. 在第153行后（`if (!doc) return`之前）添加scroll listener useEffect
3. 确保`data-page-id`属性已存在（当前342行已有）

**测试**：
- [ ] 裁切第1页后滚动到第2页，撤销应作用于第2页
- [ ] 裁切第3页后滚动到第1页，撤销应作用于第1页
- [ ] 缩放时activePageId不应意外跳变

---

## 问题 3：完成流程无结束提示 🟡

### 现象描述

用户在`AnswerMatchView`点击"确认绑定"后，答案图渲染完成，只显示toast notification（右上角5秒消失），无明确的"流程完成"提示和后续引导。

用户期望：
- 弹出Modal总结本次操作（试卷名、题目数、已绑定答案数）
- 提供导航按钮：返回主页、查看题库、继续配对

### Root Cause

当前`handleConfirm`成功路径只调用了`notifications.show`，未使用`modals.open`提供强引导。

#### 代码分析

**AnswerMatchView.tsx:297-299** - 当前成功反馈：
```tsx
setProgress(null)
await reload()
notifications.show({ 
  title: '答案绑定完成', 
  message: `${todo.length} 道题已绑定答案`, 
  color: 'green' 
})
```

**问题**：
- toast 5秒后自动消失，用户可能错过
- 无"下一步做什么"的引导
- 无试卷整体完成度反馈（总题数vs已绑定数）

### 技术方案

#### 方案：成功后弹出Modal总结页

在`notifications.show`前加`modals.open`：

```tsx
modals.open({
  title: '✅ 答案匹配完成',
  children: (
    <Stack gap="md">
      <Text size="sm">
        试卷《<strong>{paper.name}</strong>》共 <strong>{questions.length}</strong> 道题，
        已成功绑定 <strong>{todo.length}</strong> 道题的答案。
      </Text>
      {todo.length < questions.length && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          还有 {questions.length - todo.length} 道题未绑定答案。
          您可以稍后返回此页面继续配对。
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        答案图已保存到题库，可在主页查看完整题目。
      </Text>
    </Stack>
  ),
  onClose: () => {
    // Modal关闭后询问导航意图
    modals.openConfirmModal({
      title: '下一步',
      children: <Text size="sm">是否返回主页查看题库？</Text>,
      labels: { confirm: '返回主页', cancel: '留在此页' },
      onConfirm: () => {
        window.location.hash = '#/'
      }
    })
  }
})
```

**优点**：
- 明确的完成感
- 显示完整统计（总数/已绑定/未绑定）
- 自然引导用户返回主页

**成本**：
- 15-20行代码
- 复用现有`@mantine/modals` API

---

### 实施清单

**文件**: `src/renderer/src/views/AnswerMatchView.tsx`

1. 在文件头部导入：
```tsx
import { IconAlertCircle } from '@tabler/icons-react'
```

2. 在第299行`notifications.show`**之前**插入Modal逻辑

3. （可选）去掉toast notification，避免重复

**测试**：
- [ ] 全部题目配对完成 → Modal显示"X道题全部绑定"
- [ ] 部分题目配对 → Modal显示黄色Alert提示未完成数
- [ ] 关闭Modal后二次询问是否返回主页

---

## 问题 2：框选片段需手动调整位置 🟡

### 现象描述

框选模式（box-split）裁切的片段，如果跨多行且每行缩进不同（如选择题选项A/B/C/D），拼接后会出现错位。

用户需求：
- 手动拖动每个片段微调Y轴偏移
- 偏移量持久化到`question_segments.y_offset`

### 技术分析（简要）

**涉及改动**：
1. DB Schema: `question_segments`表加`y_offset INTEGER DEFAULT 0`字段
2. `QuestionRenderService.ts`: `composeQuestionCanvas`逻辑支持`y_offset`
3. `PostProcessView.tsx`: 选中答案组后显示片段列表，每个片段可拖动微调
4. UI: 拖动条或数字输入框，实时预览

**成本估算**：
- Schema迁移：10行
- 渲染逻辑：20行
- UI交互：50-80行
- 测试：15个case

**建议**：
- 优先级低于问题1/3
- 可推迟到M16或M17
- 用户可通过"重新裁切"绕过（手动切得更精细）

---

## 总结

| # | 问题 | 优先级 | 成本估算 | 阻塞下游 |
|---|---|---|---|---|
| 1 | 撤销上一刀bug | 🔴 P0 | 30行 | 是（基本操作不可用）|
| 3 | 完成流程反馈 | 🟡 P1 | 20行 | 否（UX改进）|
| 2 | 手动调整片段 | 🟡 P2 | 120行 | 否（有绕过方案）|

**实施顺序**：1 → 3 → 2

**下一步**：阶段2高级实施工程师接手，按本手册实现问题1和3的修复。
