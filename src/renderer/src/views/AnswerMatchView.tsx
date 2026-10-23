import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Stack, Card, Text, Group, Button, Badge, ActionIcon,
  Progress, LoadingOverlay, SimpleGrid, Box, Tooltip, Alert
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import {
  IconFileImport, IconArrowLeft, IconArrowRight,
  IconCheck, IconX, IconRefresh, IconTrash, IconFileX, IconAlertCircle
} from '@tabler/icons-react'
import type { AnswerBindingDTO, QuestionDTO, SegmentDTO, PaperDTO, PageDTO } from '@shared/types'
import { sourcePdfUrl } from '../services/ImportService'
import { loadPdf, renderPageRegion, type PdfDocument } from '../services/RenderService'
import {
  renderSegmentsAtDpi, composeQuestionCanvas, canvasToPngArrayBuffer, createPageGeometryMap
} from '../services/QuestionRenderService'
import {
  deriveAnswerItems, autoPairAnswers,
  type AnswerPairing
} from '../services/AnswerMatchService'
import { importPagesFromPdf } from '../services/ImportService'

// ---- 主组件 ----

function AnswerMatchView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId) // 题目卷 id

  // 题目卷数据
  const [paper, setPaper] = useState<PaperDTO | null>(null)
  const [questions, setQuestions] = useState<QuestionDTO[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_questionPages, setQuestionPages] = useState<PageDTO[]>([])

  // 答案卷数据
  const [answerPaper, setAnswerPaper] = useState<PaperDTO | null>(null)
  const [answerSegments, setAnswerSegments] = useState<SegmentDTO[]>([])
  const [answerPages, setAnswerPages] = useState<PageDTO[]>([])
  // M14.5：答案卷的合并组。questionId → segmentIds[]（按 merge_order）。
  // 这些 question 行只承载合并关系，不入题库（题库查询有 p.kind='paper' 过滤）。
  const [answerSegmentMap, setAnswerSegmentMap] = useState<Map<number, number[]>>(new Map())
  const [answerDoc, setAnswerDoc] = useState<PdfDocument | null>(null)
  const [answerDocDestroy, setAnswerDocDestroy] = useState<(() => Promise<void>) | null>(null)

  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 编辑中的配对；确认后与答案图元数据一起保存。
  const [pairings, setPairings] = useState<AnswerPairing[]>([])
  // 当前选中哪道题（用于手动调整配对）
  const [selectedQid, setSelectedQid] = useState<number | null>(null)

  const reload = useCallback(async () => {
    // 路由给了坏 id（如 /answer/undefined → NaN）时不要发 IPC，
    // 否则 better-sqlite3 会因 NaN 绑定参数抛错，整页白屏。
    if (!Number.isFinite(pid) || pid <= 0) {
      setError(`路由参数无效（试卷 id = ${paperId}）。请从主页重新进入。`)
      return
    }
    try {
      const [p, qs, pgs, savedPairings] = await Promise.all([
        window.api.getPaper(pid),
        window.api.listQuestionsByPaper(pid),
        window.api.getPages(pid),
        window.api.getAnswerPairings(pid)
      ])
      setPaper(p)
      setQuestions(qs)
      setQuestionPages(pgs)

      const ap = await window.api.getAnswerPaper(pid)
      setAnswerPaper(ap)
      if (ap != null) {
        const [asegs, apgs, aqs] = await Promise.all([
          window.api.getSegmentsByPaper(ap.id),
          window.api.getPages(ap.id),
          window.api.listQuestionsByPaper(ap.id)
        ])
        setAnswerSegments(asegs)
        setAnswerPages(apgs)
        // 逐个 question 取 merge_order 映射。答案卷的 question 行数量等于合并组数，
        // 通常远少于片段数，所以这里的 N 次 IPC 可以接受。
        const map = new Map<number, number[]>()
        for (const aq of aqs) {
          const rows = await window.api.getQuestionSegmentMap(aq.id)
          map.set(aq.id, rows.map((r) => r.segment_id))
        }
        setAnswerSegmentMap(map)
        const saved = new Map(savedPairings.map((pairing) => [pairing.questionId, pairing]))
        const items = deriveAnswerItems(asegs, map, new Map(apgs.map((page) => [page.id, page.page_index])))
        setPairings(autoPairAnswers(qs.map((q) => q.id), items).map((pairing) => saved.get(pairing.questionId) ?? pairing))
      } else {
        // 答案卷已删除，必须清空旧状态，否则旧片段数据残留会误判为状态3
        setAnswerSegments([])
        setAnswerPages([])
        setAnswerSegmentMap(new Map())
        setPairings([])
      }
    } catch (e) {
      setError('加载数据失败：' + String(e))
      console.error('[AnswerMatchView] reload failed', e)
    }
  }, [pid])

  useEffect(() => { reload() }, [reload])

  // 加载答案卷 PDF doc（用于渲染答案图）
  useEffect(() => {
    if (answerPaper == null) {
      setAnswerDoc(null)
      return
    }
    let cancelled = false
    loadPdf(sourcePdfUrl(answerPaper.id))
      .then(({ doc, destroy }) => {
        if (cancelled) { destroy(); return }
        setAnswerDoc(doc)
        setAnswerDocDestroy(() => destroy)
      })
      .catch((e) => {
        if (cancelled) return
        console.error('[AnswerMatchView] loadPdf failed', e)
        // PDF 文件缺失或损坏：不崩溃，仅显示错误提示
        setError('答案 PDF 无法读取（文件可能已丢失）。请点击"重新导入"重新选择。')
        setAnswerDoc(null)
      })
    return () => { cancelled = true }
  }, [answerPaper?.id])

  useEffect(() => {
    return () => { answerDocDestroy?.() }
  }, [answerDocDestroy])

  // 页索引映射
  const answerPageIndexMap = useMemo(
    () => new Map(answerPages.map((p) => [p.id, p.page_index])),
    [answerPages]
  )

  // 推导有序答案单元（M14.5：单元 = 合并组或散片段）
  const answerItems = useMemo(
    () => deriveAnswerItems(answerSegments, answerSegmentMap, answerPageIndexMap),
    [answerSegments, answerSegmentMap, answerPageIndexMap]
  )

  // 导入答案 PDF
  const handleImportAnswer = useCallback(async () => {
    setImporting(true)
    setError(null)
    try {
      const defaultName = paper ? `${paper.name} - 答案` : '答案'
      const ap = await window.api.importPaper(defaultName, {
        kind: 'answer', parentPaperId: pid
      })
      if (!ap) return // 用户取消
      await importPagesFromPdf(ap)
      await reload()
      notifications.show({ message: '答案 PDF 导入成功，请前往裁切页切割答案', color: 'green' })
    } catch (e) {
      setError('导入失败：' + String(e))
    } finally {
      setImporting(false)
    }
  }, [paper, pid, reload])

  // 重新导入答案：先清掉旧绑定（DB + 磁盘 a_*.png），再删答案卷，回到状态 1。
  // 顺序很关键——答案图挂在【题目卷】的题目行上，光删答案卷不会带走它们，
  // 会留下"已有答案图"标记指向已不存在的答案来源。
  const handleReimport = useCallback(() => {
    if (answerPaper == null) return
    modals.openConfirmModal({
      title: '重新导入答案',
      children: (
        <Text size="sm">
          将删除当前答案卷「<strong>{answerPaper.name}</strong>」及其所有裁切片段，
          并清除已绑定到本卷各题的答案图。
          <br />
          题目本身和题图不受影响。此操作不可恢复。
        </Text>
      ),
      labels: { confirm: '删除并重新导入', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setBusy(true)
        setError(null)
        try {
          await window.api.clearAnswersByPaper(pid)
          await window.api.deletePaper(answerPaper.id)
          setSelectedQid(null)
          await reload()
          notifications.show({ message: '已清除，请重新选择答案 PDF', color: 'green' })
        } catch (e) {
          setError('清除失败：' + String(e))
        } finally {
          setBusy(false)
        }
      }
    })
  }, [answerPaper, pid, reload])

  // 只清答案图绑定，保留答案卷和裁切片段——用于"配对错了想重来"，
  // 不用重新导入 PDF、不用重新裁切。
  const handleClearBindings = useCallback(() => {
    modals.openConfirmModal({
      title: '清除答案绑定',
      children: (
        <Text size="sm">
          将清除本卷所有题目已绑定的答案图，回到未绑定状态。
          <br />
          答案 PDF 和裁切好的片段都会保留，可以直接重新配对。
        </Text>
      ),
      labels: { confirm: '确认清除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setBusy(true)
        setError(null)
        try {
          const n = await window.api.clearAnswersByPaper(pid)
          setSelectedQid(null)
          await reload()
          notifications.show({ message: `已清除 ${n} 道题的答案绑定`, color: 'green' })
        } catch (e) {
          setError('清除失败：' + String(e))
        } finally {
          setBusy(false)
        }
      }
    })
  }, [pid, reload])

  // 手动改某道题的配对（toggle 整个答案单元：单元的全部 segmentIds 一起加/去）
  const togglePairing = useCallback((qid: number, itemSegIds: number[]) => {
    setPairings((prev) => prev.map((p) => {
      if (p.questionId !== qid) return p
      // 只要有一个 seg 在里面就算"已选中"（整组一起翻转）
      const anySelected = itemSegIds.some((sid) => p.segmentIds.includes(sid))
      return {
        ...p,
        segmentIds: anySelected
          ? p.segmentIds.filter((id) => !itemSegIds.includes(id))
          : [...p.segmentIds, ...itemSegIds]
      }
    }))
  }, [])

  // 确认绑定：渲染答案图并写库
  const handleConfirm = useCallback(async () => {
    if (!answerDoc || !paper || !answerPaper) return
    setBusy(true)
    setError(null)
    try {
      const dpiStr = await window.api.getSetting('export_dpi', '300')
      const dpi = parseInt(dpiStr, 10) || 300

      const answerPageMap = createPageGeometryMap(answerPages)

      const bindings: AnswerBindingDTO[] = pairings.map((p) => ({
        ...p, imagePath: null, widthPx: null, heightPx: null
      }))
      const todo = pairings.filter((p) => p.segmentIds.length > 0)
      setProgress({ current: 0, total: todo.length })

      for (let i = 0; i < todo.length; i++) {
        const pairing = todo[i]
        setProgress({ current: i + 1, total: todo.length })

        const segs = pairing.segmentIds
          .map((sid) => answerSegments.find((s) => s.id === sid))
          .filter((s): s is SegmentDTO => s != null)

        const mergeOrderMap = new Map(segs.map((s, idx) => [s.id!, idx]))
        const rendered = await renderSegmentsAtDpi(answerDoc, segs, answerPageMap, dpi, mergeOrderMap)
        const { canvas, widthPx, heightPx } = composeQuestionCanvas(rendered)
        const buf = await canvasToPngArrayBuffer(canvas)
        // 答案图存在题目卷目录下（pid = 题目卷 id）
        const { relPath } = await window.api.saveAnswerPng(pid, pairing.questionId, buf)
        Object.assign(bindings.find((b) => b.questionId === pairing.questionId)!, {
          imagePath: relPath, widthPx, heightPx
        })
        canvas.width = 0; canvas.height = 0
        rendered.forEach((r) => { r.canvas.width = 0; r.canvas.height = 0 })
      }

      await window.api.commitAnswerBindings(pid, answerPaper.id, bindings)

      setProgress(null)
      await reload()

      // 弹出完成总结Modal
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
    } catch (e) {
      setError('绑定失败：' + String(e))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }, [answerDoc, answerPaper, answerPages, answerSegments, pairings, questions, pid, reload])

  // paper 取不到时：有 error 就把 error 显示出来（否则永远停在"加载中…"，看起来像白屏）
  if (paper == null) {
    return (
      <Stack p="xl" gap="md" align="center" maw={480} mx="auto" mt="xl">
        {error ? (
          <>
            <Alert color="red" w="100%" title="无法打开答案匹配">{error}</Alert>
            <Button variant="light" component={Link} to="/">返回主页</Button>
          </>
        ) : (
          <Text c="dimmed">加载中…</Text>
        )}
      </Stack>
    )
  }

  // ---- 状态 1：无答案卷 ----
  if (answerPaper == null) {
    return (
      <Stack p="xl" gap="md" align="center" maw={480} mx="auto" mt="xl">
        <IconFileImport size={56} stroke={1.2} color="var(--mantine-color-violet-5)" />
        <Text size="xl" fw={600}>导入答案 PDF（可选）</Text>
        <Text size="sm" c="dimmed" ta="center">
          为《{paper.name}》导入对应的答案 PDF。答案将按题号自动匹配，支持手动调整。
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          如果暂时没有答案，可以稍后再匹配或直接完成入库。
        </Text>
        {error && <Alert color="red" w="100%">{error}</Alert>}
        <Group>
          <Button
            leftSection={<IconFileImport size={16} />}
            onClick={handleImportAnswer}
            loading={importing}
            color="violet"
            size="md"
          >
            选择答案 PDF
          </Button>
          <Button
            variant="light"
            component={Link}
            to="/"
            size="md"
          >
            稍后再匹配
          </Button>
        </Group>
        <Button variant="subtle" component={Link} to={`/post/${pid}`} leftSection={<IconArrowLeft size={14} />}>
          返回后期处理
        </Button>
      </Stack>
    )
  }

  // ---- 状态 2：有答案卷但尚未裁切（无片段）----
  if (answerItems.length === 0) {
    return (
      <Stack p="xl" gap="md" align="center" maw={480} mx="auto" mt="xl">
        <Badge size="lg" variant="light" color="violet">答案 PDF 已导入</Badge>
        <Text size="sm" c="dimmed" ta="center">
          答案 PDF 已导入（{answerPaper.name}），但还没有裁切。
          请进入裁切页切割答案片段，裁完后回来匹配。
        </Text>
        <Group>
          <Button
            leftSection={<IconArrowRight size={14} />}
            component={Link}
            to={`/crop/${answerPaper.id}`}
            color="violet"
          >
            前往裁切答案
          </Button>
          <Button
            variant="light"
            color="red"
            size="sm"
            leftSection={<IconFileX size={14} />}
            onClick={handleReimport}
          >
            换一份答案 PDF
          </Button>
        </Group>
        <Button variant="subtle" component={Link} to={`/post/${pid}`} leftSection={<IconArrowLeft size={14} />}>
          返回后期处理
        </Button>
      </Stack>
    )
  }

  // ---- 状态 3：匹配界面 ----
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <LoadingOverlay visible={busy && !progress} />

      {/* 顶栏 */}
      <Group
        p="sm"
        justify="space-between"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <Group gap="sm">
          <Button variant="subtle" size="xs" component={Link} to={`/post/${pid}`} leftSection={<IconArrowLeft size={14} />}>
            返回
          </Button>
          <Text fw={600}>{paper.name} — 答案匹配</Text>
          <Badge variant="light" color="violet">{answerItems.length} 个答案片段</Badge>
        </Group>
        <Group gap="sm">
          {progress && (
            <Text size="xs" c="dimmed">写入 {progress.current}/{progress.total}</Text>
          )}
          <Button
            variant="light"
            color="gray"
            size="sm"
            leftSection={<IconTrash size={14} />}
            onClick={handleClearBindings}
            disabled={busy}
          >
            清除绑定
          </Button>
          <Button
            variant="light"
            color="red"
            size="sm"
            leftSection={<IconFileX size={14} />}
            onClick={handleReimport}
            disabled={busy}
          >
            换答案 PDF
          </Button>
          <Button
            leftSection={<IconCheck size={14} />}
            onClick={handleConfirm}
            disabled={busy || !answerDoc}
            color="violet"
          >
            确认绑定
          </Button>
        </Group>
      </Group>

      {progress && (
        <Progress
          value={(progress.current / progress.total) * 100}
          size="xs"
          striped
          animated
          style={{ flexShrink: 0 }}
        />
      )}
      {error && (
        <Alert color="red" p="xs" style={{ flexShrink: 0 }} onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* 说明文字 */}
      <Text size="xs" c="dimmed" px="md" pt="xs" style={{ flexShrink: 0 }}>
        左列为题目，右侧为答案片段。默认按序号自动配对（第1题←→第1个答案片段）。
        点击题目行可展开手动调整：勾选/取消勾选右侧答案片段来修改绑定；点击“确认绑定”后保存，重开会保留。
      </Text>

      {/* 主体 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--mantine-spacing-md)' }}>
        <Stack gap="sm">
          {pairings.map((pairing) => {
            const q = questions.find((q) => q.id === pairing.questionId)
            if (!q) return null
            const isExpanded = selectedQid === pairing.questionId
            // 答案单元的任一片段在配对里 → 该单元被绑定
            const boundItems = answerItems.filter((ai) =>
              ai.segmentIds.some((sid) => pairing.segmentIds.includes(sid))
            )
            return (
              <Card key={pairing.questionId} data-testid={`answer-pairing-${pairing.questionId}`} shadow="xs" padding="sm" withBorder
                style={{ borderColor: isExpanded ? 'var(--mantine-color-violet-4)' : undefined }}
              >
                <Group justify="space-between" wrap="nowrap">
                  {/* 题目信息 */}
                  <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                    <Badge color="sky" size="sm">第 {q.order_in_paper} 题</Badge>
                    {pairing.segmentIds.length === 0 ? (
                      <Badge color="red" size="xs" variant="light">无答案</Badge>
                    ) : (
                      <Badge color="green" size="xs" variant="light">{pairing.segmentIds.length} 段</Badge>
                    )}
                    {q.answer_image_path && !isExpanded && (
                      <Badge color="gray" size="xs" variant="outline">已有答案图</Badge>
                    )}
                  </Group>
                  {/* 当前绑定的答案缩略图（小图） */}
                  {boundItems.length > 0 && !isExpanded && (
                    <Group gap={4}>
                      {boundItems.slice(0, 2).map((ai) => (
                        <AnswerItemThumb
                          key={ai.key}
                          item={ai}
                          pages={answerPages}
                          doc={answerDoc}
                          size={60}
                        />
                      ))}
                      {boundItems.length > 2 && (
                        <Text size="xs" c="dimmed">+{boundItems.length - 2}</Text>
                      )}
                    </Group>
                  )}
                  <Tooltip label={isExpanded ? '收起' : '展开调整配对'}>
                    <ActionIcon
                      aria-label={`调整第 ${q.order_in_paper} 题答案`}
                      variant="subtle"
                      color={isExpanded ? 'violet' : 'gray'}
                      onClick={() => setSelectedQid(isExpanded ? null : pairing.questionId)}
                    >
                      {isExpanded ? <IconX size={14} /> : <IconRefresh size={14} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>

                {/* 展开后：所有答案单元供选择（M14.5：单元可能是合并组） */}
                {isExpanded && (
                  <Box mt="sm">
                    <Text size="xs" c="dimmed" mb="xs">点击选中/取消。可多选（一题多段答案将纵向拼合）：</Text>
                    <SimpleGrid cols={{ base: 3, sm: 4, md: 5, lg: 6 }} spacing="xs">
                      {answerItems.map((ai) => {
                        const selected = ai.segmentIds.some((sid) => pairing.segmentIds.includes(sid))
                        const label = ai.segments.length > 1 ? `答案组 ${ai.answerNumber}` : `答案 ${ai.answerNumber}`
                        return (
                          <Box
                            key={ai.key}
                            role="checkbox" aria-label={label} aria-checked={selected}
                            tabIndex={busy ? -1 : 0}
                            onKeyDown={(e) => {
                              if (!busy && (e.key === ' ' || e.key === 'Enter')) {
                                e.preventDefault(); togglePairing(pairing.questionId, ai.segmentIds)
                              }
                            }}
                            onClick={() => !busy && togglePairing(pairing.questionId, ai.segmentIds)}
                            style={{
                              border: `2px solid ${selected ? 'var(--mantine-color-violet-5)' : 'var(--mantine-color-default-border)'}`,
                              borderRadius: 'var(--mantine-radius-sm)',
                              cursor: 'pointer',
                              background: selected ? 'var(--mantine-color-violet-0)' : undefined,
                              padding: 4,
                              position: 'relative'
                            }}
                          >
                            <Text size="xs" c="dimmed" ta="center" mb={2}>{label}</Text>
                            <AnswerItemThumb
                              item={ai}
                              pages={answerPages}
                              doc={answerDoc}
                              size={100}
                            />
                            {selected && (
                              <Box
                                style={{
                                  position: 'absolute', top: 2, right: 2,
                                  background: 'var(--mantine-color-violet-5)',
                                  borderRadius: '50%', width: 16, height: 16,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                              >
                                <IconCheck size={10} color="white" />
                              </Box>
                            )}
                          </Box>
                        )
                      })}
                    </SimpleGrid>
                  </Box>
                )}
              </Card>
            )
          })}
        </Stack>
      </div>
    </div>
  )
}

// ---- 答案单元缩略图（M14.5：单/多段纵向拼合）----
function AnswerItemThumb(props: {
  item: { segments: SegmentDTO[]; key: string }
  pages: PageDTO[]
  doc: PdfDocument | null
  size: number
}): React.JSX.Element {
  const { item, pages, doc, size } = props
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  // 稳定依赖字符串（避免 segments 数组每次 reload 换引用触发重渲染）
  const segDepKey = useMemo(
    () => item.segments.map((s) => `${s.id}:${s.x_start_ratio}:${s.x_end_ratio}:${s.y_start_ratio}:${s.y_end_ratio}`).join(','),
    [item.segments]
  )

  useEffect(() => {
    if (!doc || item.segments.length === 0) return
    let cancelled = false
    setStatus('loading')

    const renderAndCompose = async () => {
      const renderedCanvases: HTMLCanvasElement[] = []

      for (const s of item.segments) {
        if (cancelled) return
        const page = pages.find((p) => p.id === s.page_id)
        if (!page) continue

        try {
          const { result, done } = await renderPageRegion(
            doc,
            page.page_index,
            { x0: s.x_start_ratio, x1: s.x_end_ratio, y0: s.y_start_ratio, y1: s.y_end_ratio },
            { rotation: page.rotation ?? 0, widthPt: page.width_pt ?? 595, heightPt: page.height_pt ?? 842, maxPx: 600 }
          )
          if (cancelled) { result.canvas.width = 0; result.canvas.height = 0; return }
          renderedCanvases.push(result.canvas)
          done.catch(() => {})
        } catch (e) {
          if (cancelled) return
          console.error('[AnswerItemThumb] 渲染失败 seg#', s.id, e)
        }
      }

      if (cancelled || renderedCanvases.length === 0) {
        if (!cancelled) setStatus('error')
        return
      }

      // 纵向拼合（复用 PostProcessView QuestionThumb 的逻辑）
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

      composed.style.width = '100%'
      composed.style.height = 'auto'
      composed.style.display = 'block'
      const mount = mountRef.current
      if (mount && !cancelled) {
        mount.replaceChildren(composed)
        setStatus('done')
      }
    }

    renderAndCompose().catch((e) => {
      if (!cancelled) {
        console.error('[AnswerItemThumb] 拼合失败', e)
        setStatus('error')
      }
    })

    return () => {
      cancelled = true
      mountRef.current?.replaceChildren()
    }
  }, [doc, segDepKey, pages])

  return (
    <div
      style={{
        width: size,
        minHeight: size / 2,
        background: 'var(--mantine-color-gray-1)',
        borderRadius: 'var(--mantine-radius-xs)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div ref={mountRef} />
      {status !== 'done' && (
        <Text
          size="xs"
          c="dimmed"
          p="xs"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {status === 'error' ? '渲染失败' : '…'}
        </Text>
      )}
    </div>
  )
}

export default AnswerMatchView
