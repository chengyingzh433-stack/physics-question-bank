# M16 PPT导出技术手册

- 日期：2026-08-02
- 目标：从选题篮导出可编辑 .pptx，每题一页（题号+题图+可选答案）
- 工具：pptxgenjs（纯JS，主进程可跑）
- 验收：WPS/PowerPoint 打开，题图清晰、文本可编辑、顺序正确

---

## 1. 需求

**功能点**：
- 从 BasketView 导出选题篮中的题目为 .pptx 文件
- 每题一页：题号标题（可编辑）+ 题图（等比缩放居中）+ 可选出处角标
- 答案模式（三选一）：
  - **无答案**（默认）：只导出题目
  - **每题后紧跟**：题目页后插入答案页
  - **末尾集中**：所有题目后统一放参考答案区
- 与PDF导出共存（BasketView 两个导出按钮并列）

**交互**：
- BasketView 顶部工具栏："导出 PDF"、"导出 PPT" 两个按钮
- 点击"导出 PPT"弹出对话框：
  - 标题输入框（默认"试卷-日期"）
  - 答案模式 Radio：无答案/每题后紧跟/末尾集中
  - 确认/取消
- 确认后主进程生成 .pptx → 弹原生保存对话框选择路径 → 保存成功提示

---

## 2. 技术选型

**pptxgenjs** v3.12（当前最新）

**理由**：
- 纯 JS，主进程可跑（无需调用 Office COM）
- 支持文本框、图片、布局自定义
- MIT协议，依赖体积~120KB

**安装**：
```bash
npm install pptxgenjs@^3.12.0
```

**API概览**：
```ts
import pptxgen from 'pptxgenjs'

const pptx = new pptxgen()
const slide = pptx.addSlide()

// 文本框
slide.addText('题目1', { x: 0.5, y: 0.5, fontSize: 18 })

// 图片（base64 or path）
slide.addImage({ data: 'data:image/png;base64,...', x: 1, y: 1.5, w: 4, h: 3 })

// 保存
await pptx.writeFile({ fileName: 'output.pptx' })
```

---

## 3. 数据流

```
用户点击"导出PPT" 
  → 渲染层：BasketView 弹出对话框（输入标题+答案模式）
  → 用户确认
  → IPC调用 export:basketPptx(setId, title, answerMode)
  → 主进程ExportService：
      1. 读取 paper_set_items JOIN questions（题号、题图路径、答案图路径、出处年份）
      2. 创建 pptxgen 实例
      3. 逐题/逐答案添加slide（按answerMode布局）
      4. 弹原生保存对话框
      5. writeFile() 保存
      6. 返回保存路径或null（取消）
  → 渲染层显示成功通知
```

---

## 4. 新增/修改文件

### 4.1 `src/main/services/ExportService.ts`

**新增方法**：`exportBasketPptx(setId, title, answerMode)`

**逻辑**：
1. **查询数据**：
   ```sql
   SELECT 
     q.id, q.image_path, q.answer_image_path, q.width_px, q.height_px,
     q.answer_width_px, q.answer_height_px,
     COALESCE(q.year_override, p.year) AS effective_year,
     COALESCE(q.source_override, p.source) AS effective_source,
     qt.name AS type_name,
     i.order_index, i.display_number
   FROM paper_set_items i
   JOIN questions q ON i.question_id = q.id
   LEFT JOIN papers p ON q.paper_id = p.id
   LEFT JOIN question_types qt ON q.type_id = qt.id
   WHERE i.set_id = ?
   ORDER BY i.order_index ASC
   ```

2. **创建PPT实例**：
   ```ts
   const pptx = new pptxgen()
   pptx.layout = 'LAYOUT_16x9' // 16:9宽屏
   pptx.author = 'Physics Question Bank'
   pptx.title = title
   ```

3. **逐题添加slide**：
   ```ts
   for (const [idx, item] of items.entries()) {
     const slide = pptx.addSlide()
     
     // 题号标题（可编辑文本框）
     const titleText = item.display_number || `${idx + 1}`
     slide.addText(titleText, {
       x: 0.5, y: 0.3, w: 9, h: 0.5,
       fontSize: 24, bold: true, color: '363636'
     })
     
     // 出处角标（右上角小字）
     if (item.effective_source || item.effective_year) {
       const caption = `${item.effective_source || ''} ${item.effective_year || ''}`.trim()
       slide.addText(caption, {
         x: 8, y: 0.3, w: 1.5, h: 0.4,
         fontSize: 10, color: '999999', align: 'right'
       })
     }
     
     // 题图（居中，等比缩放到最大 w=8, h=4.5）
     if (item.image_path && existsSync(item.image_path)) {
       const imgData = readFileSync(item.image_path).toString('base64')
       const aspectRatio = item.width_px / item.height_px
       let imgW = 8, imgH = 8 / aspectRatio
       if (imgH > 4.5) { imgH = 4.5; imgW = 4.5 * aspectRatio }
       
       slide.addImage({
         data: `data:image/png;base64,${imgData}`,
         x: (10 - imgW) / 2,  // 居中
         y: 1.2,
         w: imgW,
         h: imgH
       })
     }
     
     // 答案逻辑（根据answerMode）
     if (answerMode === 'inline' && item.answer_image_path) {
       // 紧跟模式：插入答案slide
       const ansSlide = pptx.addSlide()
       ansSlide.addText(`${titleText} 答案`, {
         x: 0.5, y: 0.3, w: 9, h: 0.5,
         fontSize: 20, bold: true, color: '0066CC'
       })
       
       const ansImgData = readFileSync(item.answer_image_path).toString('base64')
       const ansRatio = item.answer_width_px / item.answer_height_px
       let ansW = 8, ansH = 8 / ansRatio
       if (ansH > 5) { ansH = 5; ansW = 5 * ansRatio }
       
       ansSlide.addImage({
         data: `data:image/png;base64,${ansImgData}`,
         x: (10 - ansW) / 2,
         y: 1,
         w: ansW,
         h: ansH
       })
     }
   }
   
   // 答案末尾集中模式
   if (answerMode === 'append') {
     const ansSlide = pptx.addSlide()
     ansSlide.addText('参考答案', {
       x: 0.5, y: 0.3, w: 9, h: 0.6,
       fontSize: 28, bold: true, color: '0066CC'
     })
     
     let yOffset = 1.2
     for (const item of items) {
       if (!item.answer_image_path) continue
       
       // 题号
       ansSlide.addText(`${item.display_number || item.order_index+1}.`, {
         x: 0.5, y: yOffset, w: 1, h: 0.4,
         fontSize: 14, bold: true
       })
       
       // 答案图（缩小版）
       const ansData = readFileSync(item.answer_image_path).toString('base64')
       const ansRatio = item.answer_width_px / item.answer_height_px
       let ansW = 3, ansH = 3 / ansRatio
       if (ansH > 1.5) { ansH = 1.5; ansW = 1.5 * ansRatio }
       
       ansSlide.addImage({
         data: `data:image/png;base64,${ansData}`,
         x: 1.5,
         y: yOffset,
         w: ansW,
         h: ansH
       })
       
       yOffset += ansH + 0.3
       if (yOffset > 5) {
         // 换新页
         const newSlide = pptx.addSlide()
         newSlide.addText('参考答案（续）', {
           x: 0.5, y: 0.3, w: 9, h: 0.6,
           fontSize: 24, bold: true, color: '0066CC'
         })
         yOffset = 1.2
       }
     }
   }
   ```

4. **弹保存对话框**：
   ```ts
   const { dialog } = await import('electron')
   const { filePath } = await dialog.showSaveDialog({
     title: '导出PPT',
     defaultPath: `${title}.pptx`,
     filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
   })
   if (!filePath) return null // 用户取消
   ```

5. **写文件**：
   ```ts
   await pptx.writeFile({ fileName: filePath })
   return filePath
   ```

**错误处理**：
- setId不存在 / 无题目 → 抛出错误
- 图片文件不存在 → 跳过该题图片，继续后续
- 保存失败 → 抛出错误，渲染层显示错误通知

---

### 4.2 IPC Handler

**`src/main/ipc/index.ts`**：
```ts
ipcMain.handle(
  'export:basketPptx',
  async (_e, setId: number, title: string, answerMode?: 'none' | 'append' | 'inline') => {
    return exportService.exportBasketPptx(setId, title, answerMode || 'none')
  }
)
```

**`src/shared/types.ts`**：
```ts
exportBasketPptx(setId: number, title: string, answerMode?: 'none' | 'append' | 'inline'): Promise<string | null>
```

**`src/preload/index.ts`**：
```ts
exportBasketPptx: (setId, title, answerMode) =>
  ipcRenderer.invoke('export:basketPptx', setId, title, answerMode),
```

---

### 4.3 UI改动

**`src/renderer/src/views/BasketView.tsx`**

**新增导出按钮**（顶部工具栏）：
```tsx
import { IconFileTypePpt } from '@tabler/icons-react'
import { modals } from '@mantine/modals'

// 在 "导出PDF" 按钮后加：
<Button
  leftSection={<IconFileTypePpt size={16} />}
  color="orange"
  onClick={handleExportPpt}
  disabled={basket.length === 0}
>
  导出 PPT
</Button>
```

**新增handleExportPpt**：
```tsx
const handleExportPpt = useCallback(() => {
  modals.open({
    title: '导出为 PowerPoint',
    children: <ExportPptModal setId={draftSetId} onSuccess={handleExportPptSuccess} />,
    size: 'md'
  })
}, [draftSetId])

const handleExportPptSuccess = useCallback((path: string) => {
  notifications.show({
    title: '导出成功',
    message: `PPT 已保存至 ${path}`,
    color: 'green'
  })
}, [])
```

**新增 ExportPptModal 组件**（同文件内或独立组件）：
```tsx
function ExportPptModal({ 
  setId, 
  onSuccess 
}: { 
  setId: number
  onSuccess: (path: string) => void 
}) {
  const [title, setTitle] = useState(`试卷-${new Date().toISOString().slice(0, 10)}`)
  const [answerMode, setAnswerMode] = useState<'none' | 'append' | 'inline'>('none')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      const path = await window.api.exportBasketPptx(setId, title, answerMode)
      if (path) {
        modals.closeAll()
        onSuccess(path)
      } // 用户取消 → path=null，不显示任何提示
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="md">
      <TextInput
        label="PPT标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <Radio.Group
        label="答案模式"
        value={answerMode}
        onChange={(v) => setAnswerMode(v as any)}
      >
        <Stack gap="xs" mt="xs">
          <Radio value="none" label="不含答案" />
          <Radio value="inline" label="每题后紧跟答案页" />
          <Radio value="append" label="末尾集中放参考答案" />
        </Stack>
      </Radio.Group>
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="flex-end">
        <Button variant="subtle" onClick={() => modals.closeAll()}>
          取消
        </Button>
        <Button onClick={handleConfirm} loading={loading} disabled={!title.trim()}>
          导出
        </Button>
      </Group>
    </Stack>
  )
}
```

---

## 5. 自测清单

| 检查项 | 预期 |
|---|---|
| npm install pptxgenjs | ✅ 安装成功，无冲突 |
| TypeScript typecheck | ✅ 0错误 |
| Build | ✅ 通过 |
| 单元测试 | ✅ 79个全绿（无新增测试） |
| 功能测试 | 见下表 |

**功能测试**：

| TC | 操作 | 预期 |
|---|---|---|
| PPT-1 | 空篮导出 | 按钮disabled |
| PPT-2 | 选5题→导出PPT（无答案） | 弹对话框→输入标题→确认→选路径→成功，5页 |
| PPT-3 | 打开生成的PPT | WPS/PowerPoint能打开，5题清晰，题号可编辑 |
| PPT-4 | 导出PPT（每题后紧跟） | 10页（5题+5答案交替） |
| PPT-5 | 导出PPT（末尾集中） | 6页（5题+1参考答案页） |
| PPT-6 | 题目无答案图 | inline/append模式跳过该题答案 |
| PPT-7 | 题图路径不存在 | 跳过图片，页面只有题号 |
| PPT-8 | 对话框点取消 | 无操作，不弹通知 |
| PPT-9 | 保存对话框点取消 | 无操作，不弹通知 |
| PPT-10 | 题目带出处年份 | 右上角小字显示 |

---

## 6. 注意事项

**坐标单位**：pptxgenjs 使用英寸（16:9默认10x5.625英寸）

**base64编码**：`readFileSync(path).toString('base64')`，不要用 `readFileSync(path, 'base64')`（TypeScript报错）

**图片尺寸计算**：等比缩放，先按宽度上限，若高度超出再按高度上限反算宽度

**答案append模式分页**：单页放不下时需换页，yOffset累加超阈值时创建新slide

**错误边界**：单个图片失败不阻塞整体导出，记录warning继续

---

## 7. 验收标准

1. ✅ BasketView 出现"导出PPT"按钮
2. ✅ 点击弹出对话框，可输入标题、选择答案模式
3. ✅ 确认后弹原生保存对话框
4. ✅ 生成的.pptx在WPS/PowerPoint中能打开
5. ✅ 每题一页，题号标题可编辑
6. ✅ 题图清晰居中，比例正确
7. ✅ 答案模式按预期工作（无/inline/append）
8. ✅ 出处年份显示在右上角
9. ✅ typecheck=0, test=79✅, build=0

---

## 8. 时间估算

- 安装依赖：5分钟
- ExportService.exportBasketPptx：60分钟（SQL查询+pptx布局+3种答案模式）
- IPC/preload/types：10分钟
- BasketView UI + Modal：30分钟
- 自测：20分钟

**总计**：~2小时

---

## 9. 下一步

M16完成后更新 `development-progress.md`，标记 M16 ✅，然后进入 M17 架构审视。
