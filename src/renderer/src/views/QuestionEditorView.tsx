import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Checkbox, Divider, Drawer, Group, Loader, Paper, Select, Stack, Tabs, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconDeviceFloppy, IconHistory } from '@tabler/icons-react'
import { assetUrl, normalizeEditableDocument, emptyQuestionMetadata, metadataFingerprint, hasEditableContent, newQuestionContent, type QuestionMetadataInput, type ContentRevisionDTO, type EditableQuestionDTO, type QuestionContentDTO, type QuestionContentInput } from '@shared/editable'
import { QuestionDocumentEditor } from '../components/editor/QuestionDocumentEditor'
import { DocumentPreview } from '../components/editor/DocumentPreview'
import { QuestionMetadataFields } from '../components/editor/QuestionMetadataFields'
import { OcrWorkspace } from '../components/editor/OcrWorkspace'
import { ocrDraftFingerprint, type OcrPart } from '@shared/ocr'
import { ocrErrorMessage } from '../components/editor/ocrMessages'
import '../components/editor/QuestionEditor.css'
import type { IntakeDraft } from '@shared/intake'
import { clearLocalEdit, readLocalEdit, recoveryKey, writeLocalEdit, type LocalEditRecovery } from '../components/editor/localEditRecovery'
import { useUnsavedNavigation } from '../components/useUnsavedNavigation'

const errorMessage = ocrErrorMessage
const contentInput = (value: QuestionContentInput): QuestionContentInput => ({ schemaVersion: 1,
  questionMode: value.questionMode, answerMode: value.answerMode, questionBody: normalizeEditableDocument(value.questionBody), answerBody: normalizeEditableDocument(value.answerBody),
  ...(value.recognition ? { recognition: value.recognition } : {}) })


export default function QuestionEditorView() {
  const { questionId: questionIdParam } = useParams()
  const questionId = Number(questionIdParam)
  const [search] = useSearchParams()
  const from = search.get('from') === '/intake' ? '/intake' : search.get('from') === '/basket' ? '/basket' : '/bank'
  const navigate = useNavigate()
  const [intake, setIntake] = useState<IntakeDraft | null>(null)
  const [completed, setCompleted] = useState(false)
  const [recovery, setRecovery] = useState<LocalEditRecovery | null>(null)
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [ocrOpen, setOcrOpen] = useState(false)
  const [data, setData] = useState<EditableQuestionDTO | null>(null)
  const [content, setContent] = useState<QuestionContentInput>(newQuestionContent)
  const [baseline, setBaseline] = useState('')
  const [metadata, setMetadata] = useState<QuestionMetadataInput>(emptyQuestionMetadata)
  const [savedMetadata, setSavedMetadata] = useState<QuestionMetadataInput>(emptyQuestionMetadata)
  const [metadataBusy, setMetadataBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [savedAt, setSavedAt] = useState('')
  const [tab, setTab] = useState<'question' | 'answer'>('question')
  const [editorVersion, setEditorVersion] = useState(0)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [ocrDirty, setOcrDirty] = useState(false)
  const [ocrProtecting, setOcrProtecting] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ContentRevisionDTO[]>([])
  const [historyValue, setHistoryValue] = useState<string | null>(null)
  const [historyContent, setHistoryContent] = useState<QuestionContentDTO | null>(null)
  const [historyError, setHistoryError] = useState('')
  const writeLock = useRef(false)
  const dirty = Boolean(data && (JSON.stringify(content) !== baseline || metadataFingerprint(metadata) !== metadataFingerprint(savedMetadata)))
  const busy = saving || editorBusy || ocrProtecting || metadataBusy || Boolean(recovery)
  useUnsavedNavigation(dirty || busy || ocrDirty)
  const draftRef = useRef({ content, revision }); draftRef.current = { content, revision }
  const currentDraft = useCallback(() => draftRef.current, [])
  const savedContent = useMemo<QuestionContentInput>(() => baseline ? JSON.parse(baseline) : newQuestionContent(), [baseline])
  const receiveDraft = useCallback((next: QuestionContentInput, target?: OcrPart) => {
    backupRef.current(contentInput(next)); setContent(contentInput(next)); setEditorVersion((value) => value + 1); setPreview(false)
    if (target) setTab(target)
  }, [])
  const receiveAssets = useCallback((assets: EditableQuestionDTO['assets']) => {
    setData((old) => old ? { ...old, assets: [...new Map([...old.assets, ...assets].map((asset) => [asset.id, asset])).values()] } : old)
  }, [])
  const receiveSourceSnapshot = useCallback((snapshot: EditableQuestionDTO) => {
    setData((old) => old ? { ...old, question: snapshot.question,
      assets: [...new Map([...old.assets, ...snapshot.assets].map((asset) => [asset.id, asset])).values()] } : old)
  }, [])
  const receiveReloadSaved = useCallback((snapshot: EditableQuestionDTO) => {
    const next = snapshot.content ? contentInput(snapshot.content) : newQuestionContent()
    setData(snapshot); setContent(next); setBaseline(JSON.stringify(next)); setRevision(snapshot.content?.revision ?? 0)
    setSavedAt(snapshot.content?.updatedAt ?? ''); setEditorVersion((value) => value + 1); setError(''); setPreview(false)
  }, [])
  const backup = (nextContent: QuestionContentInput, nextMetadata = metadata) => {
    if (!data || recovery) return
    try {
      writeLocalEdit(recoveryKey(data), { version: 1, content: nextContent, metadata: nextMetadata,
        baseRevision: revision, baseMetadata: savedMetadata, updatedAt: new Date().toISOString() })
      setRecoveryError('')
    } catch { setRecoveryError('本机恢复副本未能写入，请及时点击暂存。当前修改仍在页面中。') }
  }
  const backupRef = useRef(backup); backupRef.current = backup
  useEffect(() => { if (dirty && !recovery) backupRef.current(content, metadata) }, [content, metadata, dirty, recovery])
  const clearBackup = () => {
    if (!data) return
    try { clearLocalEdit(recoveryKey(data)); setRecoveryNotice(''); setRecoveryError('') }
    catch { setRecoveryError('题目已保存，但旧的本机恢复副本未能清理。下次恢复前请核对时间。') }
  }
  const recoverLocal = () => {
    if (!recovery) return
    const conflict = recovery.baseRevision !== revision || metadataFingerprint(recovery.baseMetadata) !== metadataFingerprint(savedMetadata)
    if (conflict && !window.confirm('正式题目或标签已发生变化。将旧的本机修改放回编辑区进行核对？此操作不会立即覆盖正式题目。')) return
    setContent(contentInput(recovery.content)); setMetadata(recovery.metadata); setRecovery(null)
    setEditorVersion((v) => v + 1); setRecoveryNotice('已恢复未提交修改，请核对后保存。')
  }
  useEffect(() => {
    let alive = true
    window.api.getIntakeForQuestion(questionId).then((value) => { if (alive) setIntake(value) }).catch((e) => { if (alive) setError(errorMessage(e)) })
    return () => { alive = false }
  }, [questionId])
  const publishIntake = async () => {
    if (!intake || !data || ocrDirty || busy || writeLock.current) return
    writeLock.current = true; setSaving(true); setError('')
    try {
      const result = await window.api.saveQuestionEdits(questionId, { content, expectedRevision: revision, metadata,
        expectedMetadata: savedMetadata, publish: { draftId: intake.id, confirmed: true } })
      applySnapshot(result); setIntake({ ...intake, status: 'published' }); setCompleted(true)
      notifications.show({ title: '题目和标签已保存入库', message: '题库卡片会显示这次保存的内容。', color: 'green' })
    } catch (e) { setError(errorMessage(e)) } finally { writeLock.current = false; setSaving(false) }
  }
  const applySaved = (value: QuestionContentDTO) => {
    const next = contentInput(value)
    setContent(next); setBaseline(JSON.stringify(next)); setRevision(value.revision); setSavedAt(value.updatedAt)
  }
  const applySnapshot = (result: EditableQuestionDTO) => {
    if (result.content) applySaved(result.content)
    setData(result); setMetadata(result.metadata); setSavedMetadata(result.metadata); clearBackup()
  }
  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setData(null); setHistoryOpen(false); setCompleted(false); setRecovery(null); setRecoveryNotice('')
    if (!Number.isSafeInteger(questionId) || questionId < 1) {
      setError('题目编号无效'); setLoading(false); return
    }
    window.api.getEditableQuestion(questionId).then((result) => {
      if (!alive) return
      const next = result.content ? contentInput(result.content) : newQuestionContent()
      setData(result); setContent(next); setBaseline(JSON.stringify(next)); setRevision(result.content?.revision ?? 0)
      setMetadata(result.metadata); setSavedMetadata(result.metadata)
      setSavedAt(result.content?.updatedAt ?? ''); setTab('question'); setEditorVersion((value) => value + 1)
      try {
        const cached = readLocalEdit(recoveryKey(result))
        if (cached && (JSON.stringify(contentInput(cached.content)) !== JSON.stringify(next) || metadataFingerprint(cached.metadata) !== metadataFingerprint(result.metadata))) setRecovery(cached)
        else clearLocalEdit(recoveryKey(result))
      } catch (e) { setRecoveryError(errorMessage(e)) }
    }).catch((e) => { if (alive) setError(errorMessage(e)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [questionId, reload])

  const save = async () => {
    if (!data || writeLock.current || busy || !dirty) return
    writeLock.current = true; setSaving(true); setError('')
    try {
      const result = await window.api.saveQuestionEdits(questionId, { content, expectedRevision: revision, metadata, expectedMetadata: savedMetadata })
      applySnapshot(result)
      notifications.show({ title: '题目和标签已保存', message: '题卡已使用最新保存的内容；Word 导出仍按所选内容模式使用。', color: 'green' })
    } catch (e) { setError(errorMessage(e)) }
    finally { writeLock.current = false; setSaving(false) }
  }
  const saveRef = useRef(save); saveRef.current = save
  const protectAndReload = async () => {
    if (writeLock.current || busy) return
    if (!window.confirm('保留当前完整编辑稿，再读取题库中的最新正式版本？之后可从“恢复草稿”找回本次内容。')) return
    writeLock.current = true; setSaving(true)
    try {
      await window.api.createOcrRecovery(questionId, content, 'before_reload_latest')
      receiveReloadSaved(await window.api.getEditableQuestion(questionId))
    } catch (e) { setError(errorMessage(e)) }
    finally { writeLock.current = false; setSaving(false) }
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
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
    if (!window.confirm(`将版本 ${historyContent.revision} 恢复为新的当前版本。当前完整编辑稿会先保留到“恢复草稿”，已有历史版本也会保留。继续？`)) return
    writeLock.current = true; setSaving(true); setHistoryError('')
    try {
      const snapshot = currentDraft()
      await window.api.createOcrRecovery(questionId, snapshot.content, 'before_restore_history')
      const latest = currentDraft()
      if (latest.revision !== snapshot.revision || ocrDraftFingerprint(latest.content) !== ocrDraftFingerprint(snapshot.content)) throw new Error('当前编辑稿发生变化，恢复草稿已保留，请重新确认恢复。')
      const saved = await window.api.restoreContentRevision(questionId, historyContent.revision, revision)
      applySaved(saved); setEditorVersion((value) => value + 1); setHistoryOpen(false); setError('')
      notifications.show({ message: `已恢复内容，并保存为版本 ${saved.revision}`, color: 'green' })
    } catch (e) { setHistoryError(errorMessage(e)) }
    finally { writeLock.current = false; setSaving(false) }
  }
  const leave = () => {
    if (busy) return
    if (ocrDirty && !window.confirm('识别候选还有未保存修改，请先在识别区保存。仍要离开并放弃候选修改？')) return
    if (dirty && !window.confirm(recoveryError ? '本机恢复副本未能写入。建议取消并暂存，仍要放弃当前修改并返回？' : '当前修改尚未提交，本机恢复副本已保留。返回后可以重新进入题目恢复，是否返回？')) return
    navigate(from)
  }
  const body = tab === 'question' ? content.questionBody : content.answerBody
  const mode = tab === 'question' ? content.questionMode : content.answerMode
  const recognition = content.recognition?.[tab]
  const original = tab === 'question' ? data?.question.image_path : data?.question.answer_image_path
  const sources = data ? [
    ...(data.question.image_path ? [{ label: '原题图', url: assetUrl(data.question.image_path) }] : []),
    ...(data.question.answer_image_path ? [{ label: '答案图', url: assetUrl(data.question.answer_image_path) }] : [])
  ] : []

  return <div className="question-editor-view">
    <Paper className="question-editor-header" withBorder p="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} disabled={busy} onClick={leave}>返回{from === '/intake' ? '录题' : from === '/basket' ? '组卷篮' : '题库'}</Button>
          <div><Title order={3}>{intake?.status === 'reviewing' ? '校对这道题' : '编辑题目'}</Title><Text size="xs" c="dimmed">{data ? `${data.question.paper_name} · 第 ${data.question.order_in_paper ?? '—'} 题 · #${questionId}` : '读取题目内容'}</Text></div></Group>
        <Group gap="xs"><Badge color={dirty ? 'orange' : 'gray'} variant="light">{dirty ? '有未保存修改' : revision ? `已保存 · 版本 ${revision}` : '尚未保存编辑内容'}</Badge>
          <Button size="xs" variant="subtle" disabled={!data || busy} leftSection={<IconHistory size={16} />} onClick={() => setHistoryOpen(true)}>历史版本</Button>
          <Button disabled={!data || !dirty || busy} loading={saving} leftSection={<IconDeviceFloppy size={16} />} onClick={() => void save()}>{intake?.status === 'reviewing' ? '暂存' : '保存修改'}</Button></Group>
      </Group>
    </Paper>
    {loading ? <Group justify="center" p="xl"><Loader /><Text>读取题目…</Text></Group> : <Stack p="md">
      {error && <Alert color="red" title="暂未完成操作">{error}<Text size="xs" mt="xs">当前编辑内容仍保留在此页。</Text>
        {data && /标签/.test(error) && <Button mt="sm" variant="light" disabled={busy} onClick={async () => {
          if (!window.confirm('用题库中的最新标签替换当前未保存的标签？正文修改会保留。')) return
          setSaving(true)
          try { const latest = await window.api.getEditableQuestion(questionId); setMetadata(latest.metadata); setSavedMetadata(latest.metadata); setError('') }
          catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
        }}>重新读取最新标签</Button>}
        {data && /版本|其他窗口|OCR_REVISION_CONFLICT/.test(error) && <Button mt="sm" variant="light" disabled={busy} onClick={() => void protectAndReload()}>保留完整草稿并加载最新版本</Button>}
        {!data && <Button mt="sm" variant="light" onClick={() => setReload((value) => value + 1)}>重新读取</Button>}</Alert>}
      {data && <>
        {recoveryError && <Alert color="orange">{recoveryError}</Alert>}
        {recoveryNotice && <Alert color="blue" withCloseButton onClose={() => setRecoveryNotice('')}>{recoveryNotice}</Alert>}
        {recovery && <Alert color="orange" title="发现上次未提交的修改">
          <Text size="sm">本机副本时间：{new Date(recovery.updatedAt).toLocaleString()}。请选择恢复修改，或继续使用已保存版本。</Text>
          <Group mt="xs"><Button size="xs" onClick={recoverLocal}>恢复修改</Button><Button size="xs" variant="default" onClick={() => {
            if (!window.confirm('放弃这份尚未提交的本机修改，使用已保存版本？')) return
            clearBackup(); setRecovery(null)
          }}>使用已保存版本</Button></Group>
        </Alert>}
        {completed ? <Paper withBorder p="lg"><Stack>
          <Title order={2}>已保存到题库</Title><Text>这道题的内容和标签已经保存，可以继续录下一题。</Text>
          <Group><Button onClick={() => navigate('/intake')}>继续录下一题</Button><Button variant="light" onClick={() => navigate('/bank')}>查看题库</Button>
            <Button variant="subtle" onClick={() => setCompleted(false)}>继续修改这道题</Button></Group>
          <div className="editor-paper"><DocumentPreview document={content.questionBody} assets={data.assets} /></div>
        </Stack></Paper> : <>
        <Group justify="space-between" gap="xs">
          <Text size="sm" c="dimmed">{intake?.status === 'reviewing' ? '1 选择原稿 → 2 校对内容与标签 → 3 保存入库' : '修改正文或标签后，点击保存修改。'} · 原稿始终保留</Text>
          <Group gap="xs"><Button size="xs" variant="light" disabled={busy} onClick={() => setOcrOpen(true)}>图片转文字 / 识别</Button>
            <Button size="xs" variant="subtle" onClick={() => document.getElementById('question-labels')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>选标签</Button></Group>
        </Group>
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
              {body.content.some((b) => b.type === 'image') && !body.content.some((b) => b.type === 'paragraph' && b.content?.some((n) => n.type === 'text' || n.type === 'inlineMath')) &&
                <Text size="sm" c="dimmed">当前内容仍是图片。需要修改图片中的文字时，请点击“图片转文字 / 识别”；也可以保留题图直接入库。</Text>}
              <Group justify="space-between"><Text fw={600}>{tab === 'question' ? '题干编辑稿' : '答案编辑稿'}</Text>
                <Button variant="subtle" size="xs" disabled={busy} onClick={() => setPreview((value) => !value)}>{preview ? '继续编辑' : '预览编辑稿'}</Button></Group>
              <details className="editor-export-options"><summary>Word 导出设置</summary><Select label="Word 导出使用" value={mode} allowDeselect={false} disabled={busy}
                description={mode === 'original' ? '编辑稿可先保存为草稿，导出仍使用原图。' : '导出使用下方文字、公式和独立配图。'}
                data={[{ value: 'original', label: original ? '原图' : '原图（当前暂无原图）' }, { value: 'editable', label: '可编辑内容', disabled: !hasEditableContent(body) }]}
                onChange={(value) => { if (value === 'original' || value === 'editable') setContent((prev) => ({ ...prev, [tab === 'question' ? 'questionMode' : 'answerMode']: value })) }} /></details>
              {mode === 'editable' && !hasEditableContent(body) && <Alert color="orange">编辑稿已清空，请补充内容或改用原图后保存。</Alert>}
              <div style={{ display: preview ? 'none' : undefined }}><QuestionDocumentEditor key={`${questionId}-${editorVersion}-${tab}`}
                questionId={questionId} initialDocument={body} assets={data.assets} sources={sources} disabled={saving || ocrProtecting || Boolean(recovery)}
                onBusy={handleEditorBusy} onChange={(document) => {
                  const nextBody = normalizeEditableDocument(document)
                  const origin = content.recognition?.[tab]
                  const recognition = origin ? { ...content.recognition, [tab]: { jobId: origin.jobId, candidateRevision: origin.candidateRevision,
                    sourceFingerprint: origin.sourceFingerprint, reviewState: 'needs_review' as const } } : content.recognition
                  const next = { ...content, [tab === 'question' ? 'questionBody' : 'answerBody']: nextBody,
                    [tab === 'question' ? 'questionMode' : 'answerMode']: hasEditableContent(nextBody) ? 'editable' as const : 'original' as const,
                    ...(recognition ? { recognition } : {}) }
                  backup(next); setContent(next)
                }}
                onAsset={(asset) => setData((prev) => prev ? { ...prev, assets: [...prev.assets.filter((value) => value.id !== asset.id), asset] } : prev)} /></div>
              {preview && <div className="editor-paper"><DocumentPreview document={body} assets={data.assets} /></div>}
              {recognition && intake?.status !== 'reviewing' && <Checkbox checked={recognition.reviewState === 'reviewed'} disabled={busy || !hasEditableContent(body)}
                label="我已对照原图完成当前部分的校对" description="正文继续修改后会回到待复核；此状态随正式版本保存。"
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  setContent((prev) => ({ ...prev, recognition: { ...prev.recognition, [tab]: { ...recognition,
                    reviewState: checked ? 'reviewed' : 'needs_review', reviewConfirmedRevision: checked ? revision + 1 : undefined } } }))
                }} />}
              {savedAt && <Text size="xs" c="dimmed">上次保存：{new Date(savedAt).toLocaleString()}</Text>}
            </Stack>
          </Paper>
        </div>
        <div id="question-labels"><QuestionMetadataFields value={metadata} onChange={(next) => { backup(content, next); setMetadata(next) }} disabled={busy} onBusy={setMetadataBusy} /></div>
        {intake && <details><summary>原稿与分区组题</summary><Text size="xs" c="dimmed">原稿和组成部分保留在本机。重新选择区域可从原稿页复制为新草稿。</Text>
          <Button mt="xs" size="xs" variant="default" disabled={busy || dirty || ocrDirty} onClick={() => navigate(`/intake/${intake.id}`)}>查看原稿与组成部分</Button></details>}
        <Paper withBorder p="sm" className="intake-publish-bar"><Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">{intake?.status === 'reviewing' ? '核对题干、答案和标签后，保存到题库。' : '保存后题卡会同步显示修改。'}</Text>
          <Button loading={saving} disabled={busy || ocrDirty || (intake?.status !== 'reviewing' && !dirty)} onClick={() => void (intake?.status === 'reviewing' ? publishIntake() : save())}>
            {intake?.status === 'reviewing' ? '保存并入库' : '保存修改'}</Button>
        </Group>{ocrDirty && <Text size="xs" c="orange" mt="sm">识别候选仍有未保存修改，请打开识别区保存或处理候选。</Text>}</Paper>
        </>}
        <Drawer opened={ocrOpen} onClose={() => { if (!ocrProtecting) setOcrOpen(false) }} position="right" size="90%" title="图片转文字 · Doc2X" keepMounted
          closeOnEscape={!ocrProtecting} closeOnClickOutside={!ocrProtecting} withCloseButton={!ocrProtecting}>
          <OcrWorkspace key={questionId} initiallyExpanded data={data} part={tab} content={content} revision={revision} savedContent={savedContent}
            disabled={saving || editorBusy || Boolean(recovery)} currentDraft={currentDraft} onApplyDraft={receiveDraft} onAssets={receiveAssets}
            onSourceSnapshot={receiveSourceSnapshot} onReloadSaved={receiveReloadSaved} onDirty={setOcrDirty} onProtectCurrentDraft={setOcrProtecting} />
        </Drawer>
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
