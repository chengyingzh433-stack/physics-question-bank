import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Divider, Drawer, Group, Loader, Paper, Select, Stack, Tabs, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconDeviceFloppy, IconHistory } from '@tabler/icons-react'
import { assetUrl, hasEditableContent, newQuestionContent, type ContentRevisionDTO, type EditableQuestionDTO, type QuestionContentDTO, type QuestionContentInput } from '@shared/editable'
import { QuestionDocumentEditor } from '../components/editor/QuestionDocumentEditor'
import { DocumentPreview } from '../components/editor/DocumentPreview'
import '../components/editor/QuestionEditor.css'
import { useUnsavedNavigation } from '../components/useUnsavedNavigation'

const errorMessage = (error: unknown) => String(error).replace(/^Error: (?:Error invoking remote method '[^']+': Error: )?/, '')
const contentInput = (value: QuestionContentInput): QuestionContentInput => ({ schemaVersion: 1,
  questionMode: value.questionMode, answerMode: value.answerMode, questionBody: value.questionBody, answerBody: value.answerBody })


export default function QuestionEditorView() {
  const { questionId: questionIdParam } = useParams()
  const questionId = Number(questionIdParam)
  const [search] = useSearchParams()
  const from = search.get('from') === '/basket' ? '/basket' : '/bank'
  const navigate = useNavigate()
  const [data, setData] = useState<EditableQuestionDTO | null>(null)
  const [content, setContent] = useState<QuestionContentInput>(newQuestionContent)
  const [baseline, setBaseline] = useState('')
  const [revision, setRevision] = useState(0)
  const [savedAt, setSavedAt] = useState('')
  const [tab, setTab] = useState<'question' | 'answer'>('question')
  const [editorVersion, setEditorVersion] = useState(0)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ContentRevisionDTO[]>([])
  const [historyValue, setHistoryValue] = useState<string | null>(null)
  const [historyContent, setHistoryContent] = useState<QuestionContentDTO | null>(null)
  const [historyError, setHistoryError] = useState('')
  const writeLock = useRef(false)
  const dirty = Boolean(data && JSON.stringify(content) !== baseline)
  const busy = saving || editorBusy
  useUnsavedNavigation(dirty || busy)
  const applySaved = (value: QuestionContentDTO) => {
    const next = contentInput(value)
    setContent(next); setBaseline(JSON.stringify(next)); setRevision(value.revision); setSavedAt(value.updatedAt)
  }
  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setData(null); setHistoryOpen(false)
    if (!Number.isSafeInteger(questionId) || questionId < 1) {
      setError('题目编号无效'); setLoading(false); return
    }
    window.api.getEditableQuestion(questionId).then((result) => {
      if (!alive) return
      const next = result.content ? contentInput(result.content) : newQuestionContent()
      setData(result); setContent(next); setBaseline(JSON.stringify(next)); setRevision(result.content?.revision ?? 0)
      setSavedAt(result.content?.updatedAt ?? ''); setTab('question'); setEditorVersion((value) => value + 1)
    }).catch((e) => { if (alive) setError(errorMessage(e)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [questionId, reload])

  const save = async () => {
    if (!data || writeLock.current || editorBusy || !dirty) return
    writeLock.current = true; setSaving(true); setError('')
    try {
      const result = await window.api.saveQuestionContent(questionId, content, revision)
      applySaved(result)
      notifications.show({ title: '编辑内容已保存', message: `版本 ${result.revision}，Word 导出按所选内容模式使用。`, color: 'green' })
    } catch (e) { setError(errorMessage(e)) }
    finally { writeLock.current = false; setSaving(false) }
  }
  const saveRef = useRef(save); saveRef.current = save
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); void saveRef.current()
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])
  const handleEditorBusy = useCallback((value: boolean) => setEditorBusy(value), [])
  useEffect(() => {
    if (!historyOpen) return
    let alive = true
    setHistoryLoading(true); setHistoryError(''); setHistoryRows([]); setHistoryContent(null); setHistoryValue(null)
    window.api.listContentRevisions(questionId).then((rows) => {
      if (!alive) return
      setHistoryRows(rows); setHistoryValue(rows[0] ? String(rows[0].revision) : null)
    }).catch((e) => { if (alive) setHistoryError(errorMessage(e)) }).finally(() => { if (alive) setHistoryLoading(false) })
    return () => { alive = false }
  }, [historyOpen, questionId])
  useEffect(() => {
    if (!historyOpen || !historyValue) return
    let alive = true
    setHistoryContent(null); setHistoryError('')
    window.api.getContentRevision(questionId, Number(historyValue)).then((value) => { if (alive) setHistoryContent(value) })
      .catch((e) => { if (alive) setHistoryError(errorMessage(e)) })
    return () => { alive = false }
  }, [historyOpen, historyValue, questionId])
  const restore = async () => {
    if (!historyContent || writeLock.current || busy) return
    if (!window.confirm(`将版本 ${historyContent.revision} 恢复为新的当前版本。${dirty ? '当前未保存的修改会被替换。' : '已有历史版本会保留。'}继续？`)) return
    writeLock.current = true; setSaving(true); setHistoryError('')
    try {
      const saved = await window.api.restoreContentRevision(questionId, historyContent.revision, revision)
      applySaved(saved); setEditorVersion((value) => value + 1); setHistoryOpen(false); setError('')
      notifications.show({ message: `已恢复内容，并保存为版本 ${saved.revision}`, color: 'green' })
    } catch (e) { setHistoryError(errorMessage(e)) }
    finally { writeLock.current = false; setSaving(false) }
  }
  const leave = () => {
    if (busy) return
    if (dirty && !window.confirm('还有未保存的修改。放弃这些修改并返回？')) return
    navigate(from)
  }
  const body = tab === 'question' ? content.questionBody : content.answerBody
  const mode = tab === 'question' ? content.questionMode : content.answerMode
  const original = tab === 'question' ? data?.question.image_path : data?.question.answer_image_path
  const sources = data ? [
    ...(data.question.image_path ? [{ label: '原题图', url: assetUrl(data.question.image_path) }] : []),
    ...(data.question.answer_image_path ? [{ label: '答案图', url: assetUrl(data.question.answer_image_path) }] : [])
  ] : []

  return <div className="question-editor-view">
    <Paper className="question-editor-header" withBorder p="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} disabled={busy} onClick={leave}>返回{from === '/basket' ? '组卷篮' : '题库'}</Button>
          <div><Title order={3}>可编辑题目</Title><Text size="xs" c="dimmed">{data ? `${data.question.paper_name} · 第 ${data.question.order_in_paper ?? '—'} 题 · #${questionId}` : '读取题目内容'}</Text></div></Group>
        <Group gap="xs"><Badge color={dirty ? 'orange' : 'gray'} variant="light">{dirty ? '有未保存修改' : revision ? `已保存 · 版本 ${revision}` : '尚未保存编辑内容'}</Badge>
          <Button variant="default" disabled={!data || busy} leftSection={<IconHistory size={16} />} onClick={() => setHistoryOpen(true)}>历史版本</Button>
          <Button disabled={!data || !dirty || editorBusy} loading={saving} leftSection={<IconDeviceFloppy size={16} />} onClick={() => void save()}>保存（⌘ / Ctrl + S）</Button></Group>
      </Group>
    </Paper>
    {loading ? <Group justify="center" p="xl"><Loader /><Text>读取题目…</Text></Group> : <Stack p="md">
      {error && <Alert color="red" title="暂未完成操作">{error}<Text size="xs" mt="xs">当前编辑内容仍保留在此页。若提示版本已变化，请先复制需要保留的文字，再重新进入。</Text>
        {!data && <Button mt="sm" variant="light" onClick={() => setReload((value) => value + 1)}>重新读取</Button>}</Alert>}
      {data && <>
        <Alert variant="light" color="blue">左侧原图保留作对照，右侧可录入或粘贴文字、编辑公式与配图。本阶段不自动识别原图。可先保存草稿；选择“可编辑内容”并保存后，Word 导出才使用编辑稿。</Alert>
        <Tabs value={tab} onChange={(value) => { if (!busy && value) setTab(value as 'question' | 'answer') }}>
          <Tabs.List><Tabs.Tab value="question" disabled={busy}>题干</Tabs.Tab><Tabs.Tab value="answer" disabled={busy}>答案与解析</Tabs.Tab></Tabs.List>
        </Tabs>
        <div className="question-editor-columns">
          <Paper withBorder p="md" className="original-panel">
            <Group justify="space-between" mb="sm"><Text fw={600}>{tab === 'question' ? '原题图' : '原答案图'}</Text><Badge variant="outline" color="gray">原件保留</Badge></Group>
            {original ? <img src={assetUrl(original)} alt={tab === 'question' ? '完整原题图' : '完整原答案图'} className="original-question-image" />
              : <Text c="dimmed" py="xl">{tab === 'question' ? '此题暂无原题图' : '此题尚未匹配原答案图，可在右侧手动编写答案。'}</Text>}
          </Paper>
          <Paper withBorder p="md" className="editable-panel">
            <Stack gap="sm">
              <Group justify="space-between"><Text fw={600}>{tab === 'question' ? '题干编辑稿' : '答案编辑稿'}</Text>
                <Button variant="subtle" size="xs" disabled={busy} onClick={() => setPreview((value) => !value)}>{preview ? '继续编辑' : '预览编辑稿'}</Button></Group>
              <Select label="Word 导出使用" value={mode} allowDeselect={false} disabled={busy}
                description={mode === 'original' ? '编辑稿可先保存为草稿，导出仍使用原图。' : '导出使用下方文字、公式和独立配图。'}
                data={[{ value: 'original', label: original ? '原图' : '原图（当前暂无原图）' }, { value: 'editable', label: '可编辑内容', disabled: !hasEditableContent(body) }]}
                onChange={(value) => { if (value === 'original' || value === 'editable') setContent((prev) => ({ ...prev, [tab === 'question' ? 'questionMode' : 'answerMode']: value })) }} />
              {mode === 'editable' && !hasEditableContent(body) && <Alert color="orange">编辑稿已清空，请补充内容或改用原图后保存。</Alert>}
              <div style={{ display: preview ? 'none' : undefined }}><QuestionDocumentEditor key={`${questionId}-${editorVersion}-${tab}`}
                questionId={questionId} initialDocument={body} assets={data.assets} sources={sources} disabled={saving}
                onBusy={handleEditorBusy} onChange={(document) => setContent((prev) => ({ ...prev, [tab === 'question' ? 'questionBody' : 'answerBody']: document }))}
                onAsset={(asset) => setData((prev) => prev ? { ...prev, assets: [...prev.assets.filter((value) => value.id !== asset.id), asset] } : prev)} /></div>
              {preview && <div className="editor-paper"><DocumentPreview document={body} assets={data.assets} /></div>}
              {savedAt && <Text size="xs" c="dimmed">上次保存：{new Date(savedAt).toLocaleString()}</Text>}
            </Stack>
          </Paper>
        </div>
      </>}
    </Stack>}
    <Drawer opened={historyOpen} onClose={() => { if (!saving) setHistoryOpen(false) }} position="right" size="xl" title="内容历史版本" closeOnEscape={!saving} closeOnClickOutside={!saving} withCloseButton={!saving}>
      <Stack>
        <Text size="sm" c="dimmed">每次保存会生成新版本。恢复旧版本会再生成一个新版本，不覆盖原 PDF、原题图或旧记录。</Text>
        {historyError && <Alert color="red">{historyError}</Alert>}
        {historyLoading ? <Loader /> : historyRows.length === 0 ? <Text c="dimmed">还没有保存过编辑内容。</Text> : <>
          <Select label="选择版本" value={historyValue} disabled={saving} allowDeselect={false}
            data={historyRows.map((row) => ({ value: String(row.revision), label: `版本 ${row.revision} · ${new Date(row.createdAt).toLocaleString()}` }))} onChange={setHistoryValue} />
          {historyContent ? <>
            <Group justify="space-between"><Text size="sm">题干：{historyContent.questionMode === 'original' ? '原图' : '可编辑'}；答案：{historyContent.answerMode === 'original' ? '原图' : '可编辑'}</Text>
              <Button loading={saving} onClick={() => void restore()}>恢复为当前内容</Button></Group>
            <Divider label="题干编辑稿" /><div className="editor-paper"><DocumentPreview document={historyContent.questionBody} assets={data?.assets ?? []} /></div>
            <Divider label="答案编辑稿" /><div className="editor-paper"><DocumentPreview document={historyContent.answerBody} assets={data?.assets ?? []} /></div>
          </> : !historyError && <Loader />}
        </>}
      </Stack>
    </Drawer>
  </div>
}
