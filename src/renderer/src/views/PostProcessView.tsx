import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Stack,
  Card,
  Text,
  Group,
  Button,
  Switch,
  Badge,
  ActionIcon,
  Checkbox,
  Alert,
  Progress,
  LoadingOverlay,
  Select,
  SegmentedControl,
  Tooltip,
  Divider,
  Box,
  Drawer
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useHotkeys, useMediaQuery } from '@mantine/hooks'
import {
  IconTrash,
  IconRestore,
  IconLinkOff,
  IconCheck,
  IconTemplate,
  IconArrowBackUp,
  IconEdit,
  IconRefresh
} from '@tabler/icons-react'
import type { ChapterDTO, SegmentDTO, QuestionDTO, QuestionTypeDTO, TemplateRuleDTO } from '@shared/types'
import { ChapterPicker } from '../components/ChapterPicker'
import { KnowledgePointPicker } from '../components/KnowledgePointPicker'
import { sourcePdfUrl } from '../services/ImportService'
import { loadPdf, renderPageRegion, type PdfDocument } from '../services/RenderService'
import {
  renderSegmentsAtDpi,
  composeQuestionCanvas,
  canvasToPngArrayBuffer
} from '../services/QuestionRenderService'
import type { PageGeom } from '../services/ColumnCropService'
import { derivePreviewItems, type PreviewItem, type PreviewQuestion } from '../services/PostProcessService'
import { applyTemplate } from '../services/TemplateService'
import TemplateRulesEditor from '../components/TemplateRulesEditor'

// ---- 撤销栈类型 ----
type UndoAction =
  | { type: 'delete'; segId: number }
  | { type: 'restore'; segId: number }
  | { type: 'merge'; qid: number }
  | { type: 'unmerge'; pid: number; segIds: number[] }

const UNDO_STACK_LIMIT = 20
const THUMB_WIDTH_OPTIONS: Record<string, number> = {
  '小': 200,
  '中': 360,
  '大': 560,
  '特大': 800
}
const THUMB_WIDTH_DEFAULT = '中'
const THUMB_WIDTH_SETTING_KEY = 'postprocess_thumb_width'

interface PageWithRotation {
  id: number
  page_index: number
  width_pt: number
  height_pt: number
  rotation: number
}

function PostProcessView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId)
  const navigate = useNavigate()

  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [docDestroy, setDocDestroy] = useState<(() => Promise<void>) | null>(null)
  const [paper, setPaper] = useState<{ id: number; name: string; kind: 'paper' | 'answer'; parent_paper_id: number | null } | null>(null)
  const [pages, setPages] = useState<PageWithRotation[]>([])
  const [segments, setSegments] = useState<SegmentDTO[]>([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [questions, setQuestions] = useState<QuestionDTO[]>([])
  const [segToQuestion, setSegToQuestion] = useState<Record<number, number>>({})
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [rules, setRules] = useState<TemplateRuleDTO[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paperStatus, setPaperStatus] = useState<string | null>(null)
  const [finalizeProgress, setFinalizeProgress] = useState<{ current: number; total: number } | null>(null)

  // M14.5 B4: 答案模式 —— 答案卷走后期处理流程（删除/合并），但不入库出图
  const isAnswerMode = paper?.kind === 'answer'

  // 标签数据（章节/知识点/难度）
  const [chapters, setChapters] = useState<ChapterDTO[]>([])
  const [kps, setKps] = useState<{ id: number; name: string }[]>([])
  const [diffs, setDiffs] = useState<{ id: number; name: string }[]>([])
  const [qKps, setQKps] = useState<Record<number, Set<number>>>({})
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)

  // UX2-2: 撤销栈
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])

  // UX2-3: 缩放
  const [thumbSizeLabel, setThumbSizeLabel] = useState<string>(THUMB_WIDTH_DEFAULT)
  const thumbMaxW = THUMB_WIDTH_OPTIONS[thumbSizeLabel] ?? 360

  // 左主区滚动容器 ref（IntersectionObserver root 需要）
  const mainScrollRef = useRef<HTMLDivElement>(null)

  // 窄屏检测
  const isNarrow = useMediaQuery('(max-width: 768px)') ?? false

  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => {
      const next = [...prev, action]
      return next.length > UNDO_STACK_LIMIT ? next.slice(-UNDO_STACK_LIMIT) : next
    })
  }, [])

  const clearUndoStack = useCallback(() => {
    setUndoStack([])
  }, [])

  // 加载 doc
  useEffect(() => {
    let cancelled = false
    loadPdf(sourcePdfUrl(pid)).then(({ doc, destroy }) => {
      if (cancelled) { destroy(); return }
      setDoc(doc)
      setDocDestroy(() => destroy)
    })
    return () => { cancelled = true }
  }, [pid])

  useEffect(() => {
    return () => { docDestroy?.() }
  }, [docDestroy])

  // UX2-3: 加载时读取持久化的缩放档位
  useEffect(() => {
    window.api.getSetting(THUMB_WIDTH_SETTING_KEY, THUMB_WIDTH_DEFAULT).then((val) => {
      if (val && THUMB_WIDTH_OPTIONS[val]) {
        setThumbSizeLabel(val)
      }
    })
  }, [])

  const reloadAll = useCallback(async () => {
    const paperRow = await window.api.getPaper(pid)
    setPaperStatus(paperRow?.status ?? null)
    setPaper(
      paperRow
        ? {
            id: paperRow.id,
            name: paperRow.name,
            kind: paperRow.kind,
            parent_paper_id: paperRow.parent_paper_id
          }
        : null
    )
    const answerMode = paperRow?.kind === 'answer'
    const pgs = await window.api.getPages(pid)
    setPages(pgs.map((p) => ({
      id: p.id,
      page_index: p.page_index,
      width_pt: p.width_pt ?? 0,
      height_pt: p.height_pt ?? 0,
      rotation: p.rotation ?? 0
    })))
    const allSegs = await window.api.getSegmentsByPaper(pid)
    setSegments(allSegs)
    const qs = await window.api.listQuestionsByPaper(pid)
    setQuestions(qs)
    const map: Record<number, number> = {}
    for (const q of qs) {
      const segs = await window.api.getQuestionSegments(q.id)
      for (const s of segs) { if (s.id !== undefined) map[s.id] = q.id }
    }
    setSegToQuestion(map)
    // 答案模式不需要题型/模板/标签——答案单元只做删除和合并，
    // 这些 IPC 全部跳过（每题一次 getQuestionKnowledgePoints 在大卷上不便宜）。
    if (answerMode) return
    setTypes(await window.api.listQuestionTypes())
    setTemplates(await window.api.listTemplates())
    // 标签数据
    const [chs, kpsList, dfs] = await Promise.all([
      window.api.listChapters(),
      window.api.listKnowledgePoints(),
      window.api.listDifficulties()
    ])
    setChapters(chs)
    setKps(kpsList)
    setDiffs(dfs)
    // M17: 批量查询知识点（避免 N+1）
    const qids = qs.map((q) => q.id)
    const kpMap = await window.api.batchQuestionKnowledgePoints(qids)
    const kpsMap: Record<number, Set<number>> = {}
    for (const q of qs) {
      kpsMap[q.id] = new Set(kpMap.get(q.id) || [])
    }
    setQKps(kpsMap)
  }, [pid])

  useEffect(() => { reloadAll() }, [reloadAll])

  // 模板规则加载
  useEffect(() => {
    if (selectedTemplate == null) { setRules([]); return }
    window.api.listRules(selectedTemplate).then(setRules)
  }, [selectedTemplate])

  // 推导预览项（含已删除占位）
  const pageIndexMap = useMemo(
    () => new Map(pages.map((p) => [p.id, p.page_index])),
    [pages]
  )
  const allPreviewItems = derivePreviewItems(segments, segToQuestion, questions, pageIndexMap)
  // showDeleted=false 时只渲染 question 项（等价于旧 derivePreviewQuestions 行为）
  const previewItems = showDeleted ? allPreviewItems : allPreviewItems.filter((item) => item.kind === 'question')
  // 兼容：提取 question 项供模板预览和合并逻辑使用
  const previewQuestions: PreviewQuestion[] = allPreviewItems
    .filter((item): item is PreviewItem & { kind: 'question' } => item.kind === 'question')
    .map((item) => ({
      key: item.key,
      previewNumber: item.previewNumber,
      segments: item.segments,
      questionId: item.questionId,
      isMerged: item.isMerged
    }))

  // 题型推导（模板预览，不写库）
  const typeMap = new Map(types.map((t) => [t.id, t.name]))
  const templateTypeMap = new Map<number, number | null>()
  if (selectedTemplate != null && rules.length > 0) {
    const results = applyTemplate(
      previewQuestions.map((pq) => ({ id: pq.previewNumber, order_in_paper: pq.previewNumber })),
      rules
    )
    for (const r of results) {
      templateTypeMap.set(r.questionId, r.typeId)
    }
  }

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    await window.api.setSegmentDeleted(id, true)
    setSegments((arr) => arr.map((s) => (s.id === id ? { ...s, is_deleted: 1 } : s)))
    pushUndo({ type: 'delete', segId: id })
  }, [pushUndo])

  const handleRestore = useCallback(async (id: number) => {
    await window.api.setSegmentDeleted(id, false)
    setSegments((arr) => arr.map((s) => (s.id === id ? { ...s, is_deleted: 0 } : s)))
    pushUndo({ type: 'restore', segId: id })
  }, [pushUndo])

  // 标签操作 handler（先 ensureQuestionId 建单段行，再写库；A12 先库后 state）
  const ensureQuestionId = useCallback(async (preview: PreviewQuestion): Promise<number> => {
    if (preview.questionId != null) return preview.questionId
    // 独立片段：建单段 question 行（is_merged=0），reloadAll 后 preview 即带上 questionId
    const segIds = preview.segments.map((s) => s.id!).filter((id) => id !== undefined)
    const qid = await window.api.createQuestionWithSegments(pid, segIds, null)
    await reloadAll()
    return qid
  }, [pid, reloadAll])

  const handleSetChapter = useCallback(async (preview: PreviewQuestion, cid: number | null) => {
    const qid = await ensureQuestionId(preview)
    await window.api.setQuestionChapter(qid, cid)
    setQuestions((arr) => arr.map((q) => (q.id === qid ? { ...q, chapter_id: cid } : q)))
  }, [ensureQuestionId])

  const handleSetDifficulty = useCallback(async (preview: PreviewQuestion, did: number | null) => {
    const qid = await ensureQuestionId(preview)
    await window.api.setQuestionDifficulty(qid, did)
    setQuestions((arr) => arr.map((q) => (q.id === qid ? { ...q, difficulty_id: did } : q)))
  }, [ensureQuestionId])

  const handleSetKps = useCallback(async (preview: PreviewQuestion, kpIds: number[]) => {
    const qid = await ensureQuestionId(preview)
    await window.api.setQuestionKnowledgePoints(qid, kpIds)
    setQKps((m) => ({ ...m, [qid]: new Set(kpIds) }))
  }, [ensureQuestionId])

  const handleCreateKp = useCallback(async (preview: PreviewQuestion, name: string) => {
    const qid = await ensureQuestionId(preview)
    const id = await window.api.createKnowledgePoint(name, null)
    setKps(await window.api.listKnowledgePoints())
    const cur = new Set(await window.api.getQuestionKnowledgePoints(qid))
    cur.add(id)
    await window.api.setQuestionKnowledgePoints(qid, Array.from(cur))
    setQKps((m) => ({ ...m, [qid]: cur }))
  }, [ensureQuestionId])

  /**
   * 把当前模板预览的题型真正写进数据库。
   * 侧栏"套用题型到题目"按钮调用。独立片段没有 question 行时先建行（ensureQuestionId）。
   * 注意：ensureQuestionId 内部会 reloadAll，所以这里先把要写的 (preview, typeId) 快照下来，
   * 逐个处理时用快照里的 preview 对象（它的 segments 不受 reload 影响）。
   */
  const handleApplyTemplateToQuestions = useCallback(async () => {
    if (selectedTemplate == null || rules.length === 0) return
    const snapshot = previewQuestions.map((pq) => ({
      preview: pq,
      typeId: templateTypeMap.get(pq.previewNumber) ?? null
    }))
    if (snapshot.length === 0) return
    setBusy(true)
    setError(null)
    try {
      let written = 0
      for (const { preview, typeId } of snapshot) {
        if (typeId == null) continue // 未命中规则的题不动
        const qid = await ensureQuestionId(preview)
        await window.api.setQuestionType(qid, typeId)
        written++
      }
      await reloadAll()
      notifications.show({ message: `已为 ${written} 道题写入题型`, color: 'green' })
    } catch (e) {
      setError('套用题型失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [selectedTemplate, rules, previewQuestions, templateTypeMap, ensureQuestionId, reloadAll])

  const handleMerge = useCallback(async () => {
    const ordered = previewQuestions
      .filter((pq) => !pq.isMerged && pq.segments.some((s) => selected.has(s.id!)))
    const segIds = ordered.flatMap((pq) => pq.segments.map((s) => s.id!))
    if (segIds.length < 2) {
      setError('请至少选择 2 个独立片段')
      return
    }
    setError(null)
    setBusy(true)
    try {
      // 收集被选片段中已升格为单段 question 的旧行，合并后必须删除，
      // 否则同一 segment 会同时挂在合并行和旧单段行上（question_segments 无 segment_id 唯一约束）
      const oldQids = ordered
        .map((pq) => pq.questionId)
        .filter((qid): qid is number => qid != null)
      const qid = await window.api.createQuestionWithSegments(pid, segIds, null)
      for (const oldQid of oldQids) {
        await window.api.deleteQuestion(oldQid)
      }
      pushUndo({ type: 'merge', qid })
      setSelected(new Set())
      await reloadAll()
      notifications.show({ message: '片段已合并', color: 'green' })
    } catch (e) {
      setError('合并失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [selected, previewQuestions, pid, reloadAll, pushUndo])

  const handleUnmerge = useCallback(async (questionId: number) => {
    // 取消合并前先抓 segIds（撤销需要）
    const segs = await window.api.getQuestionSegments(questionId)
    const segIds = segs.map((s) => s.id!).filter((id) => id !== undefined)
    await window.api.deleteQuestion(questionId)
    pushUndo({ type: 'unmerge', pid, segIds })
    await reloadAll()
  }, [reloadAll, pid, pushUndo])

  // UX2-2: 撤销执行
  const performUndo = useCallback(async () => {
    if (undoStack.length === 0 || busy) return
    const action = undoStack[undoStack.length - 1]
    setUndoStack((prev) => prev.slice(0, -1))
    setBusy(true)
    try {
      switch (action.type) {
        case 'delete':
          // 原操作是删除，逆操作是恢复
          await window.api.setSegmentDeleted(action.segId, false)
          break
        case 'restore':
          // 原操作是恢复，逆操作是删除
          await window.api.setSegmentDeleted(action.segId, true)
          break
        case 'merge':
          // 原操作是合并，逆操作是取消合并
          await window.api.deleteQuestion(action.qid)
          break
        case 'unmerge':
          // 原操作是取消合并，逆操作是重新合并
          await window.api.createQuestionWithSegments(action.pid, action.segIds, null)
          break
      }
      await reloadAll()
      notifications.show({ message: '已撤销', color: 'blue' })
    } catch (e) {
      setError('撤销失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [undoStack, busy, reloadAll])

  // UX2-2: Ctrl+Z 快捷键
  useHotkeys([
    ['mod+Z', () => {
      // 防输入框误触
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).contentEditable === 'true')) {
        return
      }
      performUndo()
    }]
  ])

  const handleFinalize = useCallback(async () => {
    if (!doc) return
    // 红线守卫：答案卷绝不能走入库出图这条路。它会写 image_path（答案组就成了
    // "已入库题"）、setPaperStatus(pid,'done')、套题型模板——对答案卷全是错的。
    // 答案卷的"完成"走 handleAnswerDone，只跳转不写库。
    if (isAnswerMode) return
    const isRedo = paperStatus === 'done'
    modals.openConfirmModal({
      title: isRedo ? '重新生成题图' : '完成入库',
      children: isRedo ? (
        <Text size="sm">
          此卷<strong>已经入库</strong>。重新生成会重新渲染所有题目的高清图、重排题号，
          并覆盖已有题图。已赋的标签（章节/难度/知识点）不受影响。确认继续？
        </Text>
      ) : (
        <Text size="sm">
          将所有未删除片段正式入库为题目，生成高清 PNG 图片。此操作不可撤销，确认继续？
        </Text>
      ),
      labels: { confirm: isRedo ? '确认重新生成' : '确认入库', cancel: '取消' },
      confirmProps: { color: isRedo ? 'orange' : 'sky' },
      onConfirm: async () => {
        setBusy(true)
        setError(null)
        try {
          const allSegs = await window.api.getSegmentsByPaper(pid)
          const liveSegs = allSegs.filter((s) => !s.is_deleted)
          const existingQs = await window.api.listQuestionsByPaper(pid)

          const groupedSegIds = new Set<number>()
          for (const q of existingQs) {
            const qs = await window.api.getQuestionSegments(q.id)
            qs.forEach((s) => s.id !== undefined && groupedSegIds.add(s.id))
          }
          const newQuestionIds: number[] = [...existingQs.map((q) => q.id)]
          for (const s of liveSegs) {
            if (s.id !== undefined && !groupedSegIds.has(s.id)) {
              const qid = await window.api.createQuestionWithSegments(pid, [s.id], null)
              newQuestionIds.push(qid)
              groupedSegIds.add(s.id)
            }
          }

          const pagesMap = new Map<number, PageGeom>()
          const pageIndexMapFinal = new Map<number, number>()
          const pgs = await window.api.getPages(pid)
          for (const p of pgs) {
            pagesMap.set(p.id, { page_index: p.page_index, width_pt: p.width_pt ?? 0, height_pt: p.height_pt ?? 0 })
            pageIndexMapFinal.set(p.id, p.page_index)
          }

          type QOrder = { qid: number; segs: SegmentDTO[]; pageIdx: number; order: number }
          const qOrders: QOrder[] = []
          for (const qid of newQuestionIds) {
            const segs = await window.api.getQuestionSegments(qid)
            // 空题守卫：若该 question 的所有 segment 都已软删（孤儿行，常见于
            // 升格后又被删除的独立片段），跳过出图并清理该 question 行，
            // 避免入库时多生成一张"已删片段"的题图。不改 liveSegs.filter 那行红线。
            const liveSegs = segs.filter((s) => !s.is_deleted)
            if (liveSegs.length === 0) {
              await window.api.deleteQuestion(qid)
              continue
            }
            let bestPageIdx = Infinity
            let bestOrder = Infinity
            for (const s of liveSegs) {
              const pIdx = pageIndexMapFinal.get(s.page_id!) ?? 0
              const o = s.order_index ?? 0
              if (pIdx < bestPageIdx || (pIdx === bestPageIdx && o < bestOrder)) {
                bestPageIdx = pIdx
                bestOrder = o
              }
            }
            qOrders.push({ qid, segs: liveSegs, pageIdx: bestPageIdx === Infinity ? 0 : bestPageIdx, order: bestOrder === Infinity ? 0 : bestOrder })
          }
          qOrders.sort((a, b) => a.pageIdx !== b.pageIdx ? a.pageIdx - b.pageIdx : a.order - b.order)
          for (let i = 0; i < qOrders.length; i++) {
            await window.api.setQuestionOrder(qOrders[i].qid, i + 1)
          }

          // 若选了模板，用【最终题号】重算题型并写库。
          // 这里必须用 i+1（入库后的 order_in_paper），不能用预览期的 previewNumber——
          // 两者在有已删除片段/合并组时可能不一致。
          if (selectedTemplate != null && rules.length > 0) {
            const results = applyTemplate(
              qOrders.map((qo, i) => ({ id: qo.qid, order_in_paper: i + 1 })),
              rules
            )
            for (const r of results) {
              if (r.typeId != null) {
                await window.api.setQuestionType(r.questionId, r.typeId)
              }
            }
          }

          const dpiStr = await window.api.getSetting('export_dpi', '300')
          const renderDpi = parseInt(dpiStr, 10) || 300
          setFinalizeProgress({ current: 0, total: qOrders.length })
          for (let i = 0; i < qOrders.length; i++) {
            const qo = qOrders[i]
            setFinalizeProgress({ current: i + 1, total: qOrders.length })
            const segMap = await window.api.getQuestionSegmentMap(qo.qid)
            const mergeOrderMap = new Map<number, number>(segMap.map((m) => [m.segment_id, m.merge_order]))
            const rendered = await renderSegmentsAtDpi(doc, qo.segs, pagesMap, renderDpi, mergeOrderMap)
            const { canvas, widthPx, heightPx } = composeQuestionCanvas(rendered)
            const buf = await canvasToPngArrayBuffer(canvas)
            const { relPath } = await window.api.saveQuestionPng(pid, qo.qid, buf)
            await window.api.setQuestionImage(qo.qid, relPath, widthPx, heightPx)
            canvas.width = 0; canvas.height = 0
            rendered.forEach((r) => { r.canvas.width = 0; r.canvas.height = 0 })
          }

          await window.api.setPaperStatus(pid, 'done')
          await reloadAll()
          setFinalizeProgress(null)
          clearUndoStack()
          notifications.show({
            title: isRedo ? '重新生成完成' : '入库完成',
            message: `${qOrders.length} 道题${isRedo ? '已重新生成题图' : '已入库'}`,
            color: 'green'
          })
        } catch (e) {
          setError((isRedo ? '重新生成失败：' : '入库失败：') + String(e))
          setFinalizeProgress(null)
        } finally {
          setBusy(false)
        }
      }
    })
  }, [doc, pid, reloadAll, clearUndoStack, paperStatus, selectedTemplate, rules, isAnswerMode])

  // 答案模式的"完成"：不写库、不出图，只把合并关系留在 question_segments 里，
  // 然后回到答案匹配页。答案图仍在匹配确认时才渲染（写到题目行的
  // answer_image_path），所以这里没有任何持久化动作。
  const handleAnswerDone = useCallback(() => {
    const parentId = paper?.parent_paper_id
    if (parentId == null) {
      setError('答案卷缺少 parent_paper_id，无法回到匹配页')
      return
    }
    navigate(`/answer/${parentId}`)
  }, [paper, navigate])

  // UX2-3: 缩放档位变更时持久化
  const handleThumbSizeChange = useCallback((label: string) => {
    setThumbSizeLabel(label)
    window.api.setSetting(THUMB_WIDTH_SETTING_KEY, label)
  }, [])

  // 工具栏数据
  const templateData = templates.map((t) => ({ value: String(t.id), label: t.name }))

  // 选中的独立片段数
  const selectedStandaloneCount = previewQuestions
    .filter((pq) => !pq.isMerged && pq.segments.some((s) => selected.has(s.id!)))
    .reduce((sum, pq) => sum + pq.segments.filter((s) => selected.has(s.id!)).length, 0)

  if (!doc) {
    return <Text p="md">加载 PDF…</Text>
  }

  // ---- 侧栏内容（窄屏和宽屏复用） ----
  const sidebarContent = (
    <Stack gap="md" p="md">
      {/* 操作区 */}
      <Stack gap="sm">
        <Text size="sm" fw={600}>操作</Text>
        <Group gap="sm">
          <Text size="sm" c="dimmed">已选 {selectedStandaloneCount}</Text>
        </Group>
        <Button
          size="sm"
          variant="light"
          onClick={handleMerge}
          disabled={busy || selectedStandaloneCount < 2}
          fullWidth
        >
          合并选中
        </Button>
        {/* 答案模式没有"入库"概念：合并关系已经随 handleMerge 写进 question_segments，
            这里只是走去匹配页。所以按钮不 disable busy 之外的任何条件，也不显示入库状态。 */}
        {isAnswerMode ? (
          <Button
            size="sm"
            color="violet"
            leftSection={<IconCheck size={14} />}
            onClick={handleAnswerDone}
            disabled={busy}
            fullWidth
          >
            去匹配答案
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              color={paperStatus === 'done' ? 'orange' : 'sky'}
              leftSection={paperStatus === 'done' ? <IconRefresh size={14} /> : <IconCheck size={14} />}
              onClick={handleFinalize}
              disabled={busy}
              fullWidth
            >
              {paperStatus === 'done' ? '重新生成题图' : '完成入库'}
            </Button>
            {paperStatus === 'done' && (
              <Text size="xs" c="dimmed" ta="center">
                此卷已入库
              </Text>
            )}
          </>
        )}
        {/* UX2-2: 撤销按钮 */}
        <Tooltip label={undoStack.length > 0 ? '撤销上一步 (Ctrl+Z)' : '无可撤销操作'}>
          <Button
            size="sm"
            variant="light"
            color="gray"
            leftSection={<IconArrowBackUp size={14} />}
            onClick={performUndo}
            disabled={undoStack.length === 0 || busy}
            fullWidth
          >
            撤销 {undoStack.length > 0 ? `(${undoStack.length})` : ''}
          </Button>
        </Tooltip>
      </Stack>

      {/* 入库进度 */}
      {finalizeProgress && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">入库进度 {finalizeProgress.current}/{finalizeProgress.total}</Text>
          <Progress
            value={(finalizeProgress.current / finalizeProgress.total) * 100}
            size="sm"
            striped
            animated
          />
        </Stack>
      )}

      {error && (
        <Alert color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      <Divider />

      {/* 工具区 */}
      <Stack gap="sm">
        <Text size="sm" fw={600}>工具</Text>
        {/* 题型模板只对题目卷有意义——答案没有题型，整块隐藏（M14.5 B4） */}
        {!isAnswerMode && (
          <>
            <Group gap="xs">
              <IconTemplate size={16} style={{ opacity: 0.5 }} />
              <Select
                placeholder="套用模板预览"
                data={templateData}
                value={selectedTemplate != null ? String(selectedTemplate) : null}
                onChange={(v) => setSelectedTemplate(v ? Number(v) : null)}
                size="sm"
                w={160}
                clearable
              />
              <ActionIcon
                variant="subtle"
                size="sm"
                disabled={selectedTemplate == null}
                onClick={() => setTemplateDrawerOpen(true)}
                title="编辑模板规则"
              >
                <IconEdit size={14} />
              </ActionIcon>
            </Group>
            {/* 模板 Select 只是预览标注，要真正写进库必须点这个按钮（或直接入库时自动写） */}
            <Tooltip label={selectedTemplate == null ? '先选一个模板' : '把预览的题型真正写入数据库'}>
              <Button
                size="sm"
                variant="light"
                color="teal"
                onClick={handleApplyTemplateToQuestions}
                disabled={busy || selectedTemplate == null || rules.length === 0}
                fullWidth
              >
                套用题型到题目
              </Button>
            </Tooltip>
          </>
        )}
        <Switch
          label="显示已删除"
          size="sm"
          checked={showDeleted}
          onChange={(e) => setShowDeleted(e.currentTarget.checked)}
        />
      </Stack>

      <Divider />

      {/* UX2-3: 缩放 */}
      <Stack gap="sm">
        <Text size="sm" fw={600}>缩放</Text>
        <SegmentedControl
          size="xs"
          data={Object.keys(THUMB_WIDTH_OPTIONS).map((label) => ({ label, value: label }))}
          value={thumbSizeLabel}
          onChange={handleThumbSizeChange}
          fullWidth
        />
      </Stack>
    </Stack>
  )

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', overflow: 'hidden' }}>
      <LoadingOverlay visible={busy && !finalizeProgress} />

      {/* 左主区：题目列表 */}
      <div
        ref={mainScrollRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          padding: 'var(--mantine-spacing-md)'
        }}
      >
        <Stack gap="md">
          {previewItems.map((item) =>
            item.kind === 'question' ? (
              <QuestionCard
                key={item.key}
                preview={item}
                doc={doc}
                pages={pages}
                types={typeMap}
                templateTypeMap={templateTypeMap}
                questions={questions}
                selected={selected}
                onToggleSelect={toggleSelect}
                onDelete={handleDelete}
                onUnmerge={handleUnmerge}
                maxW={thumbMaxW}
                scrollContainerRef={mainScrollRef}
                isAnswerMode={isAnswerMode}
                chapters={chapters}
                kps={kps}
                diffs={diffs}
                qKps={qKps}
                onSetChapter={handleSetChapter}
                onSetDifficulty={handleSetDifficulty}
                onSetKps={handleSetKps}
                onCreateKp={handleCreateKp}
                onChaptersChange={setChapters}
              />
            ) : (
              <DeletedPlaceholderCard
                key={item.key}
                segment={item.segment}
                onRestore={handleRestore}
              />
            )
          )}
        </Stack>
      </div>

      {/* 右侧栏（宽屏） / 顶部工具栏（窄屏） */}
      {isNarrow ? (
        <Box
          pos="absolute"
          top={0}
          left={0}
          right={0}
          bg="var(--mantine-color-body)"
          style={{ zIndex: 10, borderBottom: '1px solid var(--mantine-color-default-border)', padding: 'var(--mantine-spacing-sm)' }}
        >
          <Group justify="space-between" wrap="wrap" gap="sm">
            {sidebarContent}
          </Group>
        </Box>
      ) : (
        <div
          style={{
            flexShrink: 0,
            width: 280,
            overflowY: 'auto',
            borderLeft: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-gray-0)'
          }}
        >
          {sidebarContent}
        </div>
      )}

      {/* 模板编辑 Drawer */}
      <Drawer
        opened={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        title="编辑模板规则"
        position="right"
        size="lg"
      >
        <TemplateRulesEditor
          templateId={selectedTemplate}
          types={types}
          onChange={() => {
            if (selectedTemplate != null) {
              window.api.listRules(selectedTemplate).then(setRules)
            }
          }}
        />
      </Drawer>
    </div>
  )
}

// ---- 已删除占位卡 ----
function DeletedPlaceholderCard(props: {
  segment: SegmentDTO
  onRestore: (id: number) => void
}): React.JSX.Element {
  const { segment, onRestore } = props
  return (
    <Card
      shadow="xs"
      padding="sm"
      withBorder
      style={{
        opacity: 0.4,
        borderLeft: '4px solid var(--mantine-color-red-5)',
        background: 'var(--mantine-color-red-0)'
      }}
    >
      <Group justify="space-between">
        <Group gap="xs">
          <Badge color="red" variant="light" size="sm">已删除</Badge>
          <Text size="xs" c="dimmed">片段 #{segment.id}</Text>
        </Group>
        <Tooltip label="恢复此片段">
          <ActionIcon variant="subtle" color="green" size="sm" onClick={() => segment.id !== undefined && onRestore(segment.id)}>
            <IconRestore size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Card>
  )
}

// ---- 题目卡 ----
function QuestionCard(props: {
  preview: PreviewQuestion
  doc: PdfDocument
  pages: PageWithRotation[]
  types: Map<number, string>
  templateTypeMap: Map<number, number | null>
  questions: QuestionDTO[]
  selected: Set<number>
  onToggleSelect: (id: number) => void
  onDelete: (id: number) => void
  onUnmerge: (questionId: number) => void
  maxW: number
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  /** 答案模式（M14.5）：卡片改称"答案 N"，不显示题型、不显示标签区。 */
  isAnswerMode: boolean
  // 标签 props
  chapters: ChapterDTO[]
  kps: { id: number; name: string }[]
  diffs: { id: number; name: string }[]
  qKps: Record<number, Set<number>>
  onSetChapter: (preview: PreviewQuestion, cid: number | null) => Promise<void>
  onSetDifficulty: (preview: PreviewQuestion, did: number | null) => void
  onSetKps: (preview: PreviewQuestion, kpIds: number[]) => Promise<void>
  onCreateKp: (preview: PreviewQuestion, name: string) => Promise<void>
  onChaptersChange: (chapters: ChapterDTO[]) => void
}): React.JSX.Element {
  const {
    preview, doc, pages, types, templateTypeMap, questions,
    selected, onToggleSelect, onDelete, onUnmerge, maxW, scrollContainerRef,
    isAnswerMode,
    chapters, kps, diffs, qKps,
    onSetChapter, onSetDifficulty, onSetKps, onCreateKp, onChaptersChange
  } = props

  // 题型推导
  let typeName = '未定'
  if (templateTypeMap.size > 0) {
    const tid = templateTypeMap.get(preview.previewNumber)
    typeName = tid != null ? (types.get(tid) ?? '未知') : '未定'
  } else if (preview.questionId != null) {
    const q = questions.find((q) => q.id === preview.questionId)
    if (q?.type_id != null) typeName = types.get(q.type_id) ?? '未知'
  }

  const isStandalone = !preview.isMerged
  const allSegIds = preview.segments.map((s) => s.id!)
  const isSelected = isStandalone && allSegIds.some((id) => selected.has(id))

  return (
    <Card
      shadow="xs"
      padding="sm"
      withBorder
      style={{
        borderColor: isSelected ? 'var(--mantine-color-sky-5)' : undefined,
        borderWidth: isSelected ? 2 : undefined
      }}
    >
      {/* 标注条 */}
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge color="sky" variant="filled">
            {isAnswerMode ? `答案 ${preview.previewNumber}` : `第 ${preview.previewNumber} 题`}
          </Badge>
          {!isAnswerMode && <Badge color={typeName === '未定' ? 'gray' : 'teal'} variant="light">{typeName}</Badge>}
          {preview.isMerged && <Badge color="orange" variant="light">合并</Badge>}
        </Group>
        <Group gap="xs">
          {isStandalone && (
            <>
              <Checkbox
                size="xs"
                label="选中"
                checked={isSelected}
                onChange={() => allSegIds.forEach((id) => onToggleSelect(id))}
              />
              {preview.segments.map((s) => (
                <ActionIcon key={s.id} variant="subtle" color="red" size="sm" onClick={() => onDelete(s.id!)}>
                  <IconTrash size={14} />
                </ActionIcon>
              ))}
            </>
          )}
          {preview.isMerged && (
            <ActionIcon variant="subtle" color="orange" size="sm" onClick={() => onUnmerge(preview.questionId!)} title="取消合并">
              <IconLinkOff size={14} />
            </ActionIcon>
          )}
        </Group>
      </Group>

      {/* 拼合缩略图 */}
      <QuestionThumb doc={doc} preview={preview} pages={pages} maxW={maxW} scrollContainerRef={scrollContainerRef} />

      {/* 标签区：答案模式下隐藏（答案组无需章节/难度/知识点）。
          独立片段 questionId 为 null 时，赋标签会先 ensureQuestionId 建单段行。 */}
      {!isAnswerMode && <Stack gap="xs" mt="sm">
        <ChapterPicker chapters={chapters}
          value={questions.find((q) => q.id === preview.questionId)?.chapter_id ?? null}
          onChange={(id) => onSetChapter(preview, id)} onRefresh={onChaptersChange} />
        <Select
          label="难度"
          data={diffs.map((d) => ({ value: String(d.id), label: d.name }))}
          value={(() => {
            const qid = preview.questionId
            if (qid == null) return null
            const did = questions.find((q) => q.id === qid)?.difficulty_id
            return did != null ? String(did) : null
          })()}
          onChange={(v) => onSetDifficulty(preview, v ? Number(v) : null)}
          size="xs"
          clearable
          placeholder="未设"
        />
        <KnowledgePointPicker points={kps}
          value={preview.questionId != null ? Array.from(qKps[preview.questionId] ?? []) : []}
          onChange={(ids) => onSetKps(preview, ids)} onCreate={(name) => onCreateKp(preview, name)} />
      </Stack>}
    </Card>
  )
}

// ---- 拼合缩略图（多段纵向合成，渲染/显示解耦） ----
function QuestionThumb(props: {
  doc: PdfDocument
  preview: PreviewQuestion
  pages: PageWithRotation[]
  maxW: number
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const { doc, preview, pages, maxW, scrollContainerRef } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasMountRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [renderDone, setRenderDone] = useState(false)
  const [renderError, setRenderError] = useState(false)
  const cancelRef = useRef<(() => void) | null>(null)

  // 稳定依赖字符串
  const segDepKey = useMemo(
    () => preview.segments.map((s) => `${s.id}:${s.x_start_ratio}:${s.x_end_ratio}:${s.y_start_ratio}:${s.y_end_ratio}`).join(','),
    [preview.segments]
  )
  const pagesDepKey = useMemo(
    () => pages.map((p) => `${p.id}:${p.rotation}`).join(','),
    [pages]
  )

  // 虚拟化：root 指向滚动容器
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const root = scrollContainerRef.current ?? undefined
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) setVisible(e.isIntersecting) },
      { root, rootMargin: '500px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [scrollContainerRef])

  // 渲染 effect（不含 maxW 依赖）
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const segs = preview.segments
    if (segs.length === 0) { setRenderDone(true); return }
    setRenderDone(false)
    setRenderError(false)

    const renderAndCompose = async () => {
      const renderedCanvases: HTMLCanvasElement[] = []
      const cancelFns: (() => void)[] = []

      for (const s of segs) {
        if (cancelled) return
        const page = pages.find((p) => p.id === s.page_id)
        if (!page) {
          console.warn('[QuestionThumb] 找不到 page_id=', s.page_id, '已有 pages=', pages.map((p) => p.id))
          continue
        }

        try {
          const { result, cancel, done } = await renderPageRegion(
            doc,
            page.page_index,
            { x0: s.x_start_ratio, x1: s.x_end_ratio, y0: s.y_start_ratio, y1: s.y_end_ratio },
            { rotation: page.rotation, widthPt: page.width_pt, heightPt: page.height_pt, maxPx: 1500 }
          )
          if (cancelled) { cancel(); return }
          cancelFns.push(cancel)
          renderedCanvases.push(result.canvas)
          done.catch(() => {})
        } catch (e) {
          if (cancelled) return
          console.error('[QuestionThumb] 渲染段失败 seg#', s.id, e)
        }
      }

      if (cancelled || renderedCanvases.length === 0) {
        if (!cancelled) setRenderError(true)
        return
      }

      // 纵向拼合
      const maxCanvasWidth = Math.max(...renderedCanvases.map((c) => c.width))
      const totalHeight = renderedCanvases.reduce((sum, c) => sum + c.height, 0)

      const composed = document.createElement('canvas')
      composed.width = maxCanvasWidth
      composed.height = totalHeight
      const ctx = composed.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, maxCanvasWidth, totalHeight)

      let y = 0
      for (const c of renderedCanvases) {
        const x = Math.floor((maxCanvasWidth - c.width) / 2)
        ctx.drawImage(c, x, y)
        y += c.height
      }
      renderedCanvases.forEach((c) => { c.width = 0; c.height = 0 })

      // 挂载 canvas（不设 CSS 尺寸，由下面的显示 effect 控制）
      composed.style.display = 'block'
      const mount = canvasMountRef.current
      if (mount && !cancelled) {
        mount.innerHTML = ''
        mount.appendChild(composed)
        setRenderDone(true)
      }
    }

    renderAndCompose().catch((e) => {
      if (!cancelled) {
        console.error('[QuestionThumb] 拼合失败', e)
        setRenderError(true)
      }
    })

    return () => {
      cancelled = true
      cancelRef.current?.()
    }
  }, [doc, preview.key, segDepKey, pagesDepKey, visible])

  // UX2-3: 显示 effect（只改 CSS，不重渲染）—— maxW 驱动
  useEffect(() => {
    if (!renderDone) return
    const mount = canvasMountRef.current
    if (!mount) return
    const canvas = mount.querySelector('canvas')
    if (!canvas) return
    const scale = Math.min(1, maxW / canvas.width)
    canvas.style.width = `${canvas.width * scale}px`
    canvas.style.height = `${canvas.height * scale}px`
  }, [maxW, renderDone])

  return (
    <div ref={containerRef} style={{ minHeight: 60, background: 'var(--mantine-color-gray-1)', borderRadius: 'var(--mantine-radius-sm)', position: 'relative' }}>
      <div ref={canvasMountRef} />
      {!renderDone && !renderError && <Text size="xs" c="dimmed" p="xs">渲染中…</Text>}
      {renderError && <Text size="xs" c="red" p="xs">渲染失败（见控制台）</Text>}
    </div>
  )
}

export default PostProcessView
