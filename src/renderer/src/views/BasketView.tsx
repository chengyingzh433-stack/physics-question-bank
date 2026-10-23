import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Text, Group, TextInput, Button, Paper, ActionIcon, Stack, Tooltip,
  LoadingOverlay, Select, NumberInput, Switch, Modal, Badge, Alert, Loader, Divider
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowUp, IconArrowDown, IconTrash, IconFileExport, IconFileTypePpt,
  IconClipboardList, IconFileTypeDocx, IconEdit, IconEye
} from '@tabler/icons-react'
import type { PaperSetItemDTO } from '@shared/types'
import { assetUrl, DEFAULT_WORD_OPTIONS } from '@shared/editable'
import type { EditableQuestionDTO, WordExportOptions } from '@shared/editable'
import { EmptyState } from '../components/EmptyState'
import { notifyBasketChanged } from '../components/useBasketCount'
import { DocumentPreview } from '../components/editor/DocumentPreview'
import { useUnsavedNavigation } from '../components/useUnsavedNavigation'
import './BasketView.css'

function QuestionBody({ detail, answer = false }: { detail: EditableQuestionDTO; answer?: boolean }) {
  const content = detail.content
  const editable = (answer ? content?.answerMode : content?.questionMode) === 'editable'
  const original = answer ? detail.question.answer_image_path : detail.question.image_path
  if (editable && content) return <DocumentPreview document={answer ? content.answerBody : content.questionBody} assets={detail.assets} />
  if (original) return <img className="basket-original-image" src={assetUrl(original)} alt={answer ? '原始答案图' : '原始题图'} />
  return <Text size="sm" c="dimmed">{answer ? '暂无参考答案' : '缺少原题图，请回到试卷重新入库或编辑题目内容'}</Text>
}

export default function BasketView(): React.JSX.Element {
  const navigate = useNavigate()
  const [setId, setSetId] = useState<number | null>(null)
  const [items, setItems] = useState<PaperSetItemDTO[]>([])
  const [details, setDetails] = useState<Record<number, EditableQuestionDTO>>({})
  const [options, setOptions] = useState<WordExportOptions>({ ...DEFAULT_WORD_OPTIONS })
  const [savedOptions, setSavedOptions] = useState(JSON.stringify(DEFAULT_WORD_OPTIONS))
  const [headers, setHeaders] = useState<Record<number, string>>({})
  const [numbers, setNumbers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)

  const loadItems = useCallback(async (sid: number) => {
    const nextItems = await window.api.listSetItems(sid)
    const records = await Promise.all(nextItems.map((it) => window.api.getEditableQuestion(it.question_id)))
    setItems(nextItems)
    setDetails(Object.fromEntries(records.map((entry) => [entry.question.id, entry])))
    setHeaders(Object.fromEntries(nextItems.map((it) => [it.id, it.group_header ?? ''])))
    setNumbers(Object.fromEntries(nextItems.map((it) => [it.id, it.display_number ?? ''])))
  }, [])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const sid = await window.api.getOrCreateDraftSet()
      const initialOptions = await window.api.getWordExportOptions(sid)
      setSetId(sid); setOptions(initialOptions); setSavedOptions(JSON.stringify(initialOptions))
      await loadItems(sid)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [loadItems])
  useEffect(() => { void reload() }, [reload])

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() }
    catch (e) { setError(String(e)); notifications.show({ title: '操作未完成', message: String(e), color: 'red' }) }
    finally { setBusy(false) }
  }
  const persistOptions = async () => {
    if (setId == null) throw new Error('组卷篮尚未加载')
    await window.api.saveWordExportOptions(setId, options)
    setSavedOptions(JSON.stringify(options))
  }
  const persistRows = async () => {
    for (const item of items) {
      const group = (headers[item.id] ?? '').trim() || null
      const number = (numbers[item.id] ?? '').trim() || null
      if (group !== item.group_header || number !== item.display_number) {
        await window.api.updateSetItem(item.id, { group_header: group, display_number: number })
      }
    }
    setItems((current) => current.map((item) => ({ ...item,
      group_header: (headers[item.id] ?? '').trim() || null,
      display_number: (numbers[item.id] ?? '').trim() || null
    })))
    setHeaders(Object.fromEntries(items.map((item) => [item.id, (headers[item.id] ?? '').trim()])))
    setNumbers(Object.fromEntries(items.map((item) => [item.id, (numbers[item.id] ?? '').trim()])))
  }
  const persistAll = async () => { await persistRows(); await persistOptions() }
  const move = (index: number, direction: -1 | 1) => run(async () => {
    const target = index + direction
    if (setId == null || target < 0 || target >= items.length) return
    await persistRows()
    await window.api.reorderBasketItems(setId, items.map((item, i) =>
      i === index ? items[target].id : i === target ? items[index].id : item.id))
    await loadItems(setId)
  })
  const openEditor = (questionId: number) => run(async () => {
    await persistAll()
    navigate(`/questions/${questionId}/edit?from=/basket`)
  })
  const exportFile = (format: 'docx' | 'pdf' | 'pptx') => run(async () => {
    if (setId == null) return
    await persistAll()
    const path = format === 'docx' ? await window.api.exportBasketDocx(setId, options)
      : format === 'pdf' ? await window.api.exportBasketPdf(setId, options.title, options.answerMode)
      : await window.api.exportBasketPptx(setId, options.title, options.answerMode)
    if (path) notifications.show({ title: '导出成功', message: path, color: 'green' })
  })
  const numberFor = (item: PaperSetItemDTO, index: number) => numbers[item.id]?.trim() || String(index + 1)
  const rowsDirty = items.some((it) => (headers[it.id] ?? '') !== (it.group_header ?? '') || (numbers[it.id] ?? '') !== (it.display_number ?? ''))
  const settingsDirty = JSON.stringify(options) !== savedOptions || rowsDirty
  useUnsavedNavigation(settingsDirty || busy)
  const editableCount = items.filter((it) => details[it.question_id]?.content?.questionMode === 'editable').length

  if (loading) return <Group justify="center" p="xl"><Loader size="sm" /><Text>正在读取组卷内容…</Text></Group>
  if (error && items.length === 0) return <Alert color="red" title="组卷篮加载失败">{error}<Button ml="sm" onClick={() => void reload()}>重试</Button></Alert>
  if (items.length === 0) return <EmptyState icon={IconClipboardList} title="组卷篮为空" description="在题库中选择题目，然后编辑内容或直接用原图组卷。" actionLabel="去题库选题" onAction={() => navigate('/bank')} />

  return <Stack pos="relative" gap="md">
    <LoadingOverlay visible={busy} />
    <Group justify="space-between">
      <div><Text size="xl" fw={700}>组卷与 Word 导出</Text><Text size="sm" c="dimmed">{items.length} 题 · {editableCount} 题使用可编辑内容 · {items.length - editableCount} 题使用原图</Text></div>
      <Button variant="default" disabled={busy} onClick={() => run(async () => { await persistAll(); navigate('/bank') })}>继续选题</Button>
    </Group>
    {error && <Alert color="red" title="请先处理以下问题" withCloseButton onClose={() => setError('')}>{error}</Alert>}
    <div className="basket-workspace">
      <Stack gap="sm">
        {items.map((item, index) => {
          const detail = details[item.question_id]
          const q = detail?.question
          return <Paper key={item.id} p="md" radius="md" withBorder>
            <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
              <Stack gap={4}>
                <Text fw={600}>第 {index + 1} 项 <Text span size="sm" c="dimmed">{q?.paper_name} · 原第 {q?.order_in_paper ?? '—'} 题</Text></Text>
                <Group gap={6}>
                  <Badge color={detail?.content?.questionMode === 'editable' ? 'teal' : 'gray'} variant="light">{detail?.content?.questionMode === 'editable' ? '可编辑题干' : '原图题干'}</Badge>
                  <Badge color={detail?.content?.answerMode === 'editable' ? 'teal' : 'gray'} variant="outline">{detail?.content?.answerMode === 'editable' ? '可编辑答案' : q?.answer_image_path ? '原图答案' : '暂无答案'}</Badge>
                </Group>
              </Stack>
              <Group gap={3} wrap="nowrap">
                <Tooltip label="上移"><ActionIcon variant="subtle" aria-label="上移题目" disabled={busy || index === 0} onClick={() => void move(index, -1)}><IconArrowUp size={16} /></ActionIcon></Tooltip>
                <Tooltip label="下移"><ActionIcon variant="subtle" aria-label="下移题目" disabled={busy || index === items.length - 1} onClick={() => void move(index, 1)}><IconArrowDown size={16} /></ActionIcon></Tooltip>
                <Tooltip label="移出组卷篮"><ActionIcon variant="subtle" color="red" aria-label="移出组卷篮" disabled={busy} onClick={() => run(async () => {
                  if (setId == null) return
                  await persistAll(); await window.api.removeFromSet(item.id); notifyBasketChanged(); await loadItems(setId)
                })}><IconTrash size={16} /></ActionIcon></Tooltip>
              </Group>
            </Group>
            <Group grow align="end" mb="sm">
              <TextInput label="本题之前的分组标题" placeholder="例如：一、选择题" size="xs" maxLength={200} value={headers[item.id] ?? ''}
                onChange={(event) => setHeaders({ ...headers, [item.id]: event.currentTarget.value })} />
              <TextInput label="题号（Word / PPT）" placeholder={`自动：${index + 1}`} size="xs" maxLength={30} value={numbers[item.id] ?? ''}
                onChange={(event) => setNumbers({ ...numbers, [item.id]: event.currentTarget.value })} />
            </Group>
            <div className="basket-question-thumbnail">{detail && <QuestionBody detail={detail} />}</div>
            <Button mt="sm" variant="light" size="xs" leftSection={<IconEdit size={14} />} onClick={() => void openEditor(item.question_id)}>编辑题目与答案</Button>
          </Paper>
        })}
      </Stack>
      <Paper withBorder radius="md" p="md" className="basket-settings">
        <Stack gap="sm">
          <Text fw={700}>Word 排版</Text>
          <TextInput label="试卷标题" maxLength={200} value={options.title} onChange={(event) => setOptions({ ...options, title: event.currentTarget.value })} />
          <TextInput label="副标题 / 考试信息" placeholder="姓名：____  班级：____" maxLength={500} value={options.subtitle} onChange={(event) => setOptions({ ...options, subtitle: event.currentTarget.value })} />
          <Select label="参考答案" value={options.answerMode} allowDeselect={false} onChange={(value) => setOptions({ ...options, answerMode: value as WordExportOptions['answerMode'] })}
            data={[{ value: 'none', label: '不含答案' }, { value: 'append', label: '末尾参考答案' }, { value: 'inline', label: '每题后紧跟答案' }]} />
          <Group grow>
            <NumberInput label="字号（磅）" value={options.fontSize} min={8} max={24} step={1} allowDecimal={false} allowNegative={false}
              onChange={(value) => setOptions({ ...options, fontSize: typeof value === 'number' ? value : 12 })} />
            <NumberInput label="边距（毫米）" value={options.marginMm} min={10} max={35} step={1} allowNegative={false}
              onChange={(value) => setOptions({ ...options, marginMm: typeof value === 'number' ? value : 20 })} />
          </Group>
          <NumberInput label="题后留白（磅）" value={options.questionSpacing} min={0} max={60} allowNegative={false}
            onChange={(value) => setOptions({ ...options, questionSpacing: typeof value === 'number' ? value : 12 })} />
          <Switch label="每道题从新页开始" checked={options.questionStartNewPage} onChange={(event) => setOptions({ ...options, questionStartNewPage: event.currentTarget.checked })} />
          <Button variant="default" size="xs" disabled={!settingsDirty} onClick={() => run(async () => {
            await persistAll(); if (setId != null) await loadItems(setId)
            notifications.show({ message: '排版设置已保存', color: 'green' })
          })}>{settingsDirty ? '保存排版与题号设置' : '排版设置已保存'}</Button>
          <Button variant="light" leftSection={<IconEye size={16} />} onClick={() => run(async () => { await persistAll(); setPreview(true) })}>预览试卷内容</Button>
          <Button leftSection={<IconFileTypeDocx size={18} />} onClick={() => void exportFile('docx')}>导出 Word</Button>
          <Text size="xs" c="dimmed">已选可编辑内容的题目导出文字、公式和独立配图；其余保留原图。Word / WPS 内可继续排版。</Text>
          <Divider label="原图导出" />
          <Group grow>
            <Button variant="default" size="xs" leftSection={<IconFileExport size={14} />} onClick={() => void exportFile('pdf')}>原图 PDF</Button>
            <Button variant="default" size="xs" leftSection={<IconFileTypePpt size={14} />} onClick={() => void exportFile('pptx')}>原图 PPT</Button>
          </Group>
          <Text size="xs" c="dimmed">PDF / PPT 使用原始题图和原始答案图。PDF 按顺序编号，PPT 沿用自定义题号；上方字号、边距与逐题新页用于 Word。</Text>
        </Stack>
      </Paper>
    </div>
    <Modal opened={preview} onClose={() => setPreview(false)} title="试卷内容预览" size="min(1000px, 96vw)">
      <Text size="sm" c="dimmed" mb="md">按 A4 内容宽度显示题序、图文和答案位置。实际换行、分页以 Word / WPS 为准。</Text>
      <div className="basket-preview-scroll">
        <article className="basket-paper-preview" style={{ padding: `${options.marginMm}mm`, fontSize: `${options.fontSize}pt` }}>
          <h1>{options.title || '物理试卷'}</h1>
          {options.subtitle && <p className="basket-paper-subtitle">{options.subtitle}</p>}
          {items.map((item, index) => <section key={item.id} className={options.questionStartNewPage && index > 0 ? 'basket-preview-new-page' : undefined} style={{ marginBottom: `${options.questionSpacing}pt` }}>
            {headers[item.id]?.trim() && <h2>{headers[item.id].trim()}</h2>}
            <p className="basket-preview-number">{numberFor(item, index)}.</p>
            {details[item.question_id] && <QuestionBody detail={details[item.question_id]} />}
            {options.answerMode === 'inline' && <div className="basket-preview-answer"><p>参考答案</p><QuestionBody detail={details[item.question_id]} answer /></div>}
          </section>)}
          {options.answerMode === 'append' && <section className="basket-preview-new-page"><h2>参考答案</h2>
            {items.map((item, index) => <div key={item.id} style={{ marginBottom: `${options.questionSpacing}pt` }}>
              <p className="basket-preview-number">{numberFor(item, index)}.</p><QuestionBody detail={details[item.question_id]} answer />
            </div>)}
          </section>}
        </article>
      </div>
    </Modal>
  </Stack>
}
