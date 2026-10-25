import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Divider, Drawer, Group, Loader, Modal, Paper, Radio, Select, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCloudUpload, IconDeviceFloppy, IconHistory, IconSettings } from '@tabler/icons-react'
import { assetUrl, hasEditableContent, type EditableQuestionDTO, type QuestionAssetDTO, type QuestionContentInput } from '@shared/editable'
import { ocrDraftFingerprint, type OcrCandidateDTO, type OcrCandidateInput, type OcrJobDTO, type OcrPart, type OcrRecoveryDTO, type OcrSettingsDTO } from '@shared/ocr'
import { DocumentPreview } from './DocumentPreview'
import { QuestionDocumentEditor } from './QuestionDocumentEditor'
import { OcrSettingsDialog } from './OcrSettingsDialog'
import { OcrUploadDialog } from './OcrUploadDialog'
import { ocrErrorMessage } from './ocrMessages'

const STATUS: Record<OcrJobDTO['status'], string> = {
  submitting: '正在提交', processing: '识别中', paused: '已暂停本地等待', unknown: '提交状态不明', failed: '未完成', ready: '结果已返回，待校对'
}
const LABEL: Record<OcrPart, string> = { question: '题干', answer: '答案' }
const ISSUE_LABEL = { table: '表格待补全', missing_image: '图片待补全', formula: '公式待检查', unsupported: '格式需处理', conversion: '转换需处理' }
const candidateInput = (value: OcrCandidateDTO): OcrCandidateInput => ({ document: value.document, issues: value.issues, reviewed: value.reviewed })
const reasonLabel = (value: string) => ({ before_adopt: '采用识别候选前的编辑稿', before_restore: '恢复草稿前的编辑稿',
  before_restore_history: '恢复历史版本前的编辑稿', before_reload_latest: '读取最新版本前的编辑稿' })[value] ?? value

interface Props {
  initiallyExpanded?: boolean
  data: EditableQuestionDTO; part: OcrPart; content: QuestionContentInput; revision: number; savedContent: QuestionContentInput
  disabled: boolean; currentDraft: () => { content: QuestionContentInput; revision: number }
  onApplyDraft: (content: QuestionContentInput, part?: OcrPart) => void
  onAssets: (assets: QuestionAssetDTO[]) => void
  onSourceSnapshot: (snapshot: EditableQuestionDTO) => void
  onReloadSaved: (snapshot: EditableQuestionDTO) => void
  onDirty: (dirty: boolean) => void
  onProtectCurrentDraft: (busy: boolean) => void
}

export function OcrWorkspace({ initiallyExpanded = false, data, part, content, revision, savedContent, disabled, currentDraft, onApplyDraft, onAssets, onSourceSnapshot, onReloadSaved, onDirty, onProtectCurrentDraft }: Props) {
  const questionId = data.question.id
  const [settings, setSettings] = useState<OcrSettingsDTO | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploadPart, setUploadPart] = useState<OcrPart | null>(null)
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [jobs, setJobs] = useState<OcrJobDTO[]>([])
  const [jobsError, setJobsError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<OcrCandidateDTO | null>(null)
  const [candidateBaseline, setCandidateBaseline] = useState('')
  const [candidateReviewConfirmation, setCandidateReviewConfirmation] = useState<number | undefined>()
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateEditorVersion, setCandidateEditorVersion] = useState(0)
  const [candidateEditorBusy, setCandidateEditorBusy] = useState(false)
  const [candidatePreview, setCandidatePreview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adoptOpen, setAdoptOpen] = useState(false)
  const [adoptMode, setAdoptMode] = useState<'replace' | 'append'>('replace')
  const [acceptDraft, setAcceptDraft] = useState(false)
  const [draftConflict, setDraftConflict] = useState(false)
  const [sourceChanged, setSourceChanged] = useState(false)
  const [acceptSource, setAcceptSource] = useState(false)
  const [latestSource, setLatestSource] = useState<{ sourceFingerprint: string; imagePath: string } | null>(null)
  const [recoveriesOpen, setRecoveriesOpen] = useState(false)
  const [recoveries, setRecoveries] = useState<OcrRecoveryDTO[]>([])
  const [recoveryId, setRecoveryId] = useState<string | null>(null)
  const [recoveriesLoading, setRecoveriesLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [candidateReload, setCandidateReload] = useState(0)
  const mutationLock = useRef(false)
  const active = useRef(true)
  const refreshingJobs = useRef(false)
  const candidateRef = useRef(candidate); candidateRef.current = candidate
  const selectedIdRef = useRef(selectedId); selectedIdRef.current = selectedId
  const currentDraftRef = useRef(currentDraft); currentDraftRef.current = currentDraft
  const onAssetsRef = useRef(onAssets); onAssetsRef.current = onAssets
  const candidateDirty = Boolean(candidate && JSON.stringify(candidateInput(candidate)) !== candidateBaseline)
  const candidateDirtyRef = useRef(candidateDirty); candidateDirtyRef.current = candidateDirty
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null
  const running = jobs.find((job) => job.status === 'submitting' || job.status === 'processing')
  const originalPath = part === 'question' ? data.question.image_path : data.question.answer_image_path
  const uploadPath = uploadPart === 'question' ? data.question.image_path : data.question.answer_image_path
  const issuesUnresolved = candidate?.issues.some((issue) => !issue.resolution.trim()) ?? false
  const recovery = recoveries.find((item) => item.id === recoveryId)
  const draftChanged = Boolean(selectedJob && selectedJob.baseRevision !== revision) || draftConflict
  const draftFingerprint = ocrDraftFingerprint(content)
  const currentOrigin = selectedJob ? content.recognition?.[selectedJob.part] : undefined
  const savedOrigin = selectedJob ? savedContent.recognition?.[selectedJob.part] : undefined
  const included = currentOrigin?.jobId === selectedId
  const saved = included && savedOrigin?.jobId === selectedId && savedOrigin.candidateRevision === currentOrigin?.candidateRevision &&
    ocrDraftFingerprint(savedContent) === ocrDraftFingerprint(content)
  const sources = [
    ...(data.question.image_path ? [{ label: '原题图', url: assetUrl(data.question.image_path) }] : []),
    ...(data.question.answer_image_path ? [{ label: '原答案图', url: assetUrl(data.question.answer_image_path) }] : [])
  ]

  const refreshJobs = useCallback(async () => {
    if (refreshingJobs.current) return
    refreshingJobs.current = true
    try {
      const result = await window.api.listOcrJobs(questionId)
      if (!active.current) return
      setJobs(result); setJobsError('')
      if (!selectedIdRef.current && result.length) setSelectedId(result[0].id)
    } catch (e) { if (active.current) setJobsError(String(e)) }
    finally { refreshingJobs.current = false }
  }, [questionId])
  useEffect(() => {
    active.current = true
    void refreshJobs()
    window.api.getOcrSettings().then((value) => { if (active.current) setSettings(value) }).catch((e) => { if (active.current) setJobsError(String(e)) })
    // This only reads locally persisted state. Network polling belongs to the main process.
    const timer = window.setInterval(() => void refreshJobs(), 2500)
    return () => { active.current = false; window.clearInterval(timer) }
  }, [refreshJobs])
  useEffect(() => {
    onDirty(candidateDirty || candidateEditorBusy || busy)
    return () => onDirty(false)
  }, [candidateDirty, candidateEditorBusy, busy, onDirty])
  useEffect(() => {
    if (!selectedId || selectedJob?.status !== 'ready') {
      if (candidateRef.current?.jobId !== selectedId) { setCandidate(null); setCandidateBaseline('') }
      return
    }
    let alive = true
    setCandidateLoading(true); setError('')
    window.api.getOcrCandidate(selectedId).then(async (value) => {
      if (!alive || candidateDirtyRef.current) return
      const assets = await window.api.listOcrAssets(questionId)
      if (!alive || candidateDirtyRef.current) return
      // Mount the editor only after its image records are available. Tiptap's
      // independent node views do not observe an assets ref changing on its own.
      onAssetsRef.current(assets)
      setCandidate(value); setCandidateBaseline(value ? JSON.stringify(candidateInput(value)) : ''); setCandidateEditorVersion((old) => old + 1)
      setCandidateReviewConfirmation(undefined)
    }).catch((e) => { if (alive) setError(String(e)) }).finally(() => { if (alive) setCandidateLoading(false) })
    return () => { alive = false }
  }, [selectedId, selectedJob?.status, questionId, candidateReload])
  useEffect(() => { setAcceptDraft(false) }, [draftFingerprint, revision])

  const selectJob = (id: string | null) => {
    if (busy || candidateEditorBusy || disabled) return
    if (candidateDirty && !window.confirm('当前候选有未保存的校对修改。放弃这些修改并切换任务？')) return
    candidateDirtyRef.current = false; setCandidate(null); setCandidateBaseline(''); setSelectedId(id); setError('')
  }
  const saveCandidate = async () => {
    if (!candidate || mutationLock.current || candidateEditorBusy || !candidateDirty) return
    mutationLock.current = true; setBusy(true); setError('')
    try {
      const value = await window.api.saveOcrCandidate(candidate.jobId, { ...candidateInput(candidate),
        ...(candidateReviewConfirmation ? { reviewConfirmedRevision: candidateReviewConfirmation } : {}) }, candidate.revision)
      setCandidate(value); setCandidateBaseline(JSON.stringify(candidateInput(value)))
      setCandidateReviewConfirmation(undefined)
      notifications.show({ message: '候选校对稿已保存在本机，尚未替换正式编辑稿。', color: 'green' })
    } catch (e) { setError(String(e)) }
    finally { mutationLock.current = false; setBusy(false) }
  }
  const handleCandidateEditorBusy = useCallback((value: boolean) => setCandidateEditorBusy(value), [])
  const taskAction = async (action: 'pause' | 'resume') => {
    if (!selectedJob || mutationLock.current) return
    mutationLock.current = true; setBusy(true); setError('')
    try {
      if (action === 'pause') await window.api.pauseOcrJob(selectedJob.id)
      else await window.api.resumeOcrJob(selectedJob.id)
      await refreshJobs()
    } catch (e) { setError(String(e)) }
    finally { mutationLock.current = false; setBusy(false) }
  }
  const beginUpload = (target = part) => {
    if (disabled || busy || candidateEditorBusy) return
    if (!settings?.enabled || !settings.hasKey) { setSettingsOpen(true); return }
    const path = target === 'question' ? data.question.image_path : data.question.answer_image_path
    if (!path) { setError(`当前题目没有${LABEL[target]}原图，可继续手工编辑。`); setExpanded(true); return }
    if (running) { selectJob(running.id); setExpanded(true); return }
    setUploadPart(target)
  }
  const adopt = async () => {
    if (!candidate || mutationLock.current || candidateDirty || issuesUnresolved || disabled) return
    mutationLock.current = true; setBusy(true); onProtectCurrentDraft(true); setError('')
    const snapshot = currentDraftRef.current()
    const fingerprint = ocrDraftFingerprint(snapshot.content)
    try {
      const result = await window.api.adoptOcrCandidate({ jobId: candidate.jobId, candidateRevision: candidate.revision,
        mode: adoptMode, currentContent: snapshot.content, expectedRevision: snapshot.revision,
        acceptDraftChange: acceptDraft, acceptSourceChange: acceptSource,
        ...(acceptSource && latestSource ? { confirmedSourceFingerprint: latestSource.sourceFingerprint } : {}) })
      const latest = currentDraftRef.current()
      if (ocrDraftFingerprint(latest.content) !== fingerprint || latest.revision !== snapshot.revision) {
        throw new Error('采用时编辑稿又发生了变化，已保留恢复草稿。请关闭此窗口，核对当前稿后重新采用。')
      }
      onApplyDraft(result.content, candidate.part); setAdoptOpen(false)
      notifications.show({ title: '候选已加入编辑稿', message: '采用前的完整草稿已保留。请继续校对并点击顶部“保存”，正式版本和 Word 导出模式不会自动改变。', color: 'green' })
    } catch (e) {
      const message = String(e)
      if (/OCR_SOURCE_CHANGED|SOURCE_CHANGED|原图.*(?:改变|变化)|来源.*(?:改变|变化)/i.test(message)) {
        setSourceChanged(true); setAcceptSource(false); setLatestSource(null)
        try {
          const source = await window.api.getOcrSource(candidate.jobId)
          const snapshot = await window.api.getEditableQuestion(questionId)
          setLatestSource(source); onSourceSnapshot(snapshot)
        } catch (sourceError) { setError(`${message}；最新原图未能读取：${String(sourceError)}`); return }
      }
      if (/OCR_DRAFT_CHANGED|DRAFT_CHANGED|草稿.*(?:改变|变化)/i.test(message)) { setDraftConflict(true); setAcceptDraft(false) }
      setError(message)
    } finally { mutationLock.current = false; setBusy(false); onProtectCurrentDraft(false) }
  }
  const discard = async () => {
    if (!candidate || mutationLock.current || candidateEditorBusy) return
    if (!window.confirm('丢弃这份候选？候选的未保存修改会放弃；当前编辑稿、原图和恢复草稿均保留。')) return
    mutationLock.current = true; setBusy(true); setError('')
    try {
      await window.api.discardOcrCandidate(candidate.jobId, candidate.revision)
      candidateDirtyRef.current = false; setCandidate(null); setCandidateBaseline(''); setCandidateReload((old) => old + 1)
    } catch (e) { setError(String(e)) }
    finally { mutationLock.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!recoveriesOpen) return
    let alive = true
    setRecoveriesLoading(true); setRecoveryError('')
    Promise.all([window.api.listOcrRecoveries(questionId), window.api.listOcrAssets(questionId)]).then(([rows, assets]) => {
      if (!alive) return
      setRecoveries(rows); setRecoveryId(rows[0]?.id ?? null); onAssetsRef.current(assets)
    }).catch((e) => { if (alive) setRecoveryError(String(e)) }).finally(() => { if (alive) setRecoveriesLoading(false) })
    return () => { alive = false }
  }, [recoveriesOpen, questionId])
  const restoreDraft = async () => {
    if (!recovery || mutationLock.current || disabled) return
    if (!window.confirm('把所选完整草稿恢复到编辑区？当前题干、答案及导出模式会先另存为恢复草稿，正式版本暂不改变。')) return
    mutationLock.current = true; setBusy(true); onProtectCurrentDraft(true); setRecoveryError('')
    const snapshot = currentDraftRef.current()
    try {
      await window.api.createOcrRecovery(questionId, snapshot.content, 'before_restore')
      const latest = currentDraftRef.current()
      if (ocrDraftFingerprint(snapshot.content) !== ocrDraftFingerprint(latest.content) || snapshot.revision !== latest.revision) throw new Error('当前编辑稿发生变化，请重新确认恢复。')
      const assets = await window.api.listOcrAssets(questionId)
      onAssets(assets); onApplyDraft(recovery.content); setRecoveriesOpen(false)
      notifications.show({ message: '草稿已恢复到编辑区，尚未生成正式版本；请核对后保存。', color: 'green' })
    } catch (e) { setRecoveryError(String(e)) }
    finally { mutationLock.current = false; setBusy(false); onProtectCurrentDraft(false) }
  }
  const reloadLatest = async () => {
    if (mutationLock.current || disabled) return
    if (!window.confirm('先保留当前完整编辑稿，再读取题库中的最新正式版本？候选校对稿不受影响，可从“恢复草稿”找回当前内容。')) return
    mutationLock.current = true; setBusy(true); onProtectCurrentDraft(true)
    const snapshot = currentDraftRef.current()
    try {
      await window.api.createOcrRecovery(questionId, snapshot.content, 'before_reload_latest')
      const latest = await window.api.getEditableQuestion(questionId)
      const now = currentDraftRef.current()
      if (ocrDraftFingerprint(now.content) !== ocrDraftFingerprint(snapshot.content) || now.revision !== snapshot.revision) throw new Error('读取期间编辑稿发生变化，恢复草稿已保留，请重新操作。')
      onReloadSaved(latest); setAdoptOpen(false); setError('')
      notifications.show({ message: '已载入最新正式版本，之前的完整编辑稿在“恢复草稿”中。', color: 'green' })
    } catch (e) { setError(String(e)) }
    finally { mutationLock.current = false; setBusy(false); onProtectCurrentDraft(false) }
  }
  const controlsDisabled = disabled || busy || candidateEditorBusy
  return <Paper withBorder p="md" className="ocr-workspace">
    <Stack gap="sm">
      <Group justify="space-between" align="start">
        <div><Text fw={600}>单题识别与校对</Text><Text size="xs" c="dimmed">Doc2X 云识别 · 原图保留 · 候选先校对、再决定是否采用</Text></div>
        <Group gap="xs"><Button size="xs" variant="subtle" leftSection={<IconSettings size={14} />} disabled={controlsDisabled} onClick={() => setSettingsOpen(true)}>识别设置</Button>
          <Button size="xs" variant="default" leftSection={<IconHistory size={14} />} disabled={controlsDisabled} onClick={() => setRecoveriesOpen(true)}>恢复草稿</Button>
          <Button size="xs" leftSection={<IconCloudUpload size={14} />} disabled={controlsDisabled || !originalPath} onClick={() => beginUpload()}>
            {running ? '查看进行中的任务' : `识别${LABEL[part]}原图`}</Button></Group>
      </Group>
      {!originalPath && <Text size="sm" c="dimmed">当前没有{LABEL[part]}原图，可继续手工编写。</Text>}
      {!settings?.enabled && <Text size="xs" c="dimmed">云识别尚未启用。配置密钥后，每次仍需确认上传图片。</Text>}
      {jobsError && <Alert color="orange">本地任务状态暂未读取成功：{ocrErrorMessage(jobsError)}<Button variant="subtle" size="xs" onClick={() => void refreshJobs()}>重新读取</Button></Alert>}
      {jobs.length > 0 && <Group justify="space-between"><Text size="sm">本题保留 {jobs.length} 次识别任务{running ? `；${LABEL[running.part]}正在处理，你可以继续编辑正文。` : '。'}</Text>
        <Button size="xs" variant="light" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起候选区' : '查看任务与候选'}</Button></Group>}
      <div style={{ display: expanded ? undefined : 'none' }} onKeyDownCapture={(event) => {
        if (candidate && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault(); event.stopPropagation(); void saveCandidate()
        }
      }}>
        <Stack gap="md">
          {error && !adoptOpen && <Alert color="red" withCloseButton onClose={() => setError('')}>{ocrErrorMessage(error)}
            {candidate && /候选.*(?:改变|修改|变更)/.test(error) && <Button size="xs" variant="subtle" disabled={controlsDisabled} onClick={() => {
              if (candidateDirty && !window.confirm('重新读取会放弃此候选尚未保存的校对修改。当前题目编辑稿不受影响。继续读取最新候选？')) return
              candidateDirtyRef.current = false; setCandidate(null); setCandidateBaseline(''); setCandidateReload((old) => old + 1)
            }}>重新读取最新候选</Button>}
          </Alert>}
          <Select label="识别任务" placeholder="尚无识别任务" value={selectedId} disabled={controlsDisabled} allowDeselect={false}
            data={jobs.map((job) => ({ value: job.id, label: `${LABEL[job.part]} · ${new Date(job.createdAt).toLocaleString()} · ${STATUS[job.status]}` }))} onChange={selectJob} />
          {selectedJob && <>
            <Group justify="space-between"><Group gap="xs"><Badge>{STATUS[selectedJob.status]}</Badge>
              {included && <Badge color={saved ? 'green' : 'orange'}>{saved ? '已保存到题库' : '已加入编辑稿，未保存当前修改'}</Badge>}
              <Text size="xs" c="dimmed">识别对象：{LABEL[selectedJob.part]}{selectedJob.crop ? '选区' : '整图'}</Text></Group>
              <Group gap="xs">
                {(selectedJob.status === 'submitting' || selectedJob.status === 'processing') && <Button size="xs" variant="default" disabled={controlsDisabled} onClick={() => void taskAction('pause')}>停止本地等待</Button>}
                {(selectedJob.status === 'paused' || selectedJob.status === 'failed') && selectedJob.remoteUid && <Button size="xs" variant="light" disabled={controlsDisabled || Boolean(running)} onClick={() => void taskAction('resume')}>继续查询原任务</Button>}
                {!running && <Button size="xs" variant="default" disabled={controlsDisabled} onClick={() => {
                  if (selectedJob.status !== 'unknown' || window.confirm('上次提交状态不明，Doc2X 可能已接收并计费。重新提交可能再次消耗额度，是否继续准备新的上传？')) beginUpload(selectedJob.part)
                }}>重新准备识别</Button>}
              </Group></Group>
            {selectedJob.error && <Alert color={selectedJob.status === 'unknown' ? 'orange' : 'red'}>{ocrErrorMessage(selectedJob.error)}</Alert>}
            {selectedJob.status === 'unknown' && <Alert color="orange">未获得远端任务号，无法确定上次提交是否成功。不会自动重新提交；如要再识别，必须重新确认图片及额度。</Alert>}
            {selectedJob.status === 'paused' && <Text size="sm" c="dimmed">只停止本机等待，远端可能仍在处理且已消耗额度。继续查询会使用原任务号。</Text>}
            {candidateLoading && <Group><Loader size="sm" /><Text size="sm">读取本地候选…</Text></Group>}
            {candidate?.discarded ? <Alert color="gray">此候选已丢弃，原图和编辑稿仍保留。需要找回采用前内容时，可打开“恢复草稿”。
              <Button variant="subtle" size="xs" disabled={controlsDisabled} onClick={async () => {
                if (mutationLock.current) return
                mutationLock.current = true; setBusy(true); setError('')
                try {
                  const value = await window.api.saveOcrCandidate(candidate.jobId, candidateInput(candidate), candidate.revision)
                  setCandidate(value); setCandidateBaseline(JSON.stringify(candidateInput(value))); setCandidateEditorVersion((old) => old + 1)
                } catch (e) { setError(String(e)) }
                finally { mutationLock.current = false; setBusy(false) }
              }}>恢复此候选</Button>
            </Alert> : candidate && <>
              <Divider label={`候选校对 · ${LABEL[candidate.part]} · 候选版本 ${candidate.revision}`} />
              <div className="ocr-candidate-columns">
                <Paper withBorder p="sm" className="ocr-source-panel"><Text size="sm" fw={600} mb="xs">本次送识别的图片</Text>
                  <img src={assetUrl(selectedJob.inputImagePath)} alt={`本次${LABEL[selectedJob.part]}识别的输入副本`} className="original-question-image" />
                  <Text size="xs" c="dimmed" mt="xs">配图或表格缺失时，在候选编辑器使用“原图裁取”补入。未支持的表格不能直接变成可编辑表格。</Text>
                </Paper>
                <Stack gap="sm">
                  <Group justify="space-between"><Badge color={candidate.reviewed ? 'green' : 'orange'}>{candidate.reviewed ? '用户已校对' : '待人工校对'}</Badge>
                    <Button size="xs" variant="subtle" disabled={controlsDisabled} onClick={() => setCandidatePreview((old) => !old)}>{candidatePreview ? '继续校对' : '预览候选'}</Button></Group>
                  <div style={{ display: candidatePreview ? 'none' : undefined }}><QuestionDocumentEditor key={`candidate-${candidate.jobId}-${candidateEditorVersion}`}
                    questionId={questionId} initialDocument={candidate.document} assets={data.assets}
                    sources={[{ label: '本次识别输入副本', url: assetUrl(selectedJob.inputImagePath) }, ...sources]} disabled={busy || disabled}
                    onBusy={handleCandidateEditorBusy} onChange={(document) => { setCandidateReviewConfirmation(undefined); setCandidate((old) => old ? { ...old, document, reviewed: false } : old) }}
                    onAsset={(asset) => onAssets([...data.assets.filter((item) => item.id !== asset.id), asset])} /></div>
                  {candidatePreview && <div className="editor-paper"><DocumentPreview document={candidate.document} assets={data.assets} /></div>}
                  <Text size="xs" c="dimmed">在候选区域使用 ⌘ / Ctrl + S 会保存候选校对稿，不会替换顶部的当前编辑稿。</Text>
                </Stack>
              </div>
              {candidate.issues.length > 0 && <Stack gap="sm"><Text fw={600} size="sm">需要逐项处理</Text>
                {candidate.issues.map((issue, index) => <Paper key={issue.id} withBorder p="sm"><Stack gap="xs">
                  <Group gap="xs"><Badge color={issue.resolution.trim() ? 'green' : 'orange'}>{issue.resolution.trim() ? '已记录处理方式' : '待处理'}</Badge><Text size="sm" fw={600}>{ISSUE_LABEL[issue.kind]}</Text></Group>
                  <Text size="sm">{issue.message}</Text>
                  {issue.original && <details><summary>查看对应原始识别内容</summary><pre className="ocr-raw-text">{issue.original}</pre></details>}
                  <Textarea label="处理方式（采用前必填）" value={issue.resolution} disabled={controlsDisabled} autosize minRows={1} maxLength={2000}
                    placeholder="例如：已从原图裁取表格并插入；或已对照原图手工补全公式。请说明实际处理结果。"
                    onChange={(event) => { const resolution = event.currentTarget.value; setCandidateReviewConfirmation(undefined); setCandidate((old) => old ? { ...old, reviewed: false,
                      issues: old.issues.map((value, i) => i === index ? { ...value, resolution } : value) } : old) }} />
                </Stack></Paper>)}
              </Stack>}
              <details><summary>查看原始识别 Markdown（仅文本）</summary><pre className="ocr-raw-text">{candidate.rawMarkdown || '服务未返回 Markdown 正文。'}</pre></details>
              <Checkbox checked={candidate.reviewed} disabled={controlsDisabled || issuesUnresolved || !hasEditableContent(candidate.document)}
                label="我已对照原图检查文字、公式和配图，完成本份候选的校对。"
                description={issuesUnresolved ? '请先记录所有待处理项的处理方式。' : '继续修改候选后会自动回到“待人工校对”。'}
                onChange={(event) => { const reviewed = event.currentTarget.checked; setCandidateReviewConfirmation(reviewed ? candidate.revision + 1 : undefined); setCandidate((old) => old ? { ...old, reviewed } : old) }} />
              <Group justify="space-between"><Button size="xs" variant="subtle" color="red" disabled={controlsDisabled} onClick={() => void discard()}>丢弃此候选</Button>
                <Group><Text size="xs" c={candidateDirty ? 'orange' : 'dimmed'}>{candidateDirty ? '候选有未保存修改' : '候选已保存于本机'}</Text>
                  <Button variant="default" leftSection={<IconDeviceFloppy size={15} />} disabled={controlsDisabled || !candidateDirty} onClick={() => void saveCandidate()}>保存候选</Button>
                  <Button disabled={controlsDisabled || candidateDirty || issuesUnresolved || !hasEditableContent(candidate.document)} onClick={() => {
                    setAdoptMode('replace'); setAcceptDraft(false); setDraftConflict(false); setSourceChanged(false); setAcceptSource(false); setLatestSource(null); setError(''); setAdoptOpen(true)
                  }}>采用到当前编辑稿</Button></Group></Group>
              {candidateDirty && <Text size="xs" c="dimmed">请先保存候选，再采用到编辑稿。</Text>}
            </>}
            {!candidateLoading && selectedJob.status === 'ready' && !candidate && <Button variant="light" onClick={() => setCandidateReload((old) => old + 1)}>重新读取候选</Button>}
          </>}
        </Stack>
      </div>
    </Stack>
    <OcrSettingsDialog opened={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={setSettings} />
    {uploadPart && uploadPath && <OcrUploadDialog key={`${questionId}-${uploadPart}`} opened questionId={questionId} part={uploadPart}
      sourceUrl={assetUrl(uploadPath)} currentDraft={currentDraft} onClose={() => setUploadPart(null)} onStarted={(job) => {
        setJobs((old) => [job, ...old.filter((item) => item.id !== job.id)]); setExpanded(true)
        if (!candidateDirty) selectJob(job.id)
        notifications.show({ message: '识别已开始，结果将保存在本机候选区。等待期间可继续编辑正文。', color: 'blue' })
      }} />}
    <Modal opened={adoptOpen} onClose={() => { if (!busy) setAdoptOpen(false) }} title={`采用${candidate ? LABEL[candidate.part] : ''}识别候选`} size="lg"
      closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack>
        {error && <Alert color="red">{ocrErrorMessage(error)}
          {/OCR_REVISION_CONFLICT|其他窗口/.test(error) && <Button variant="subtle" size="xs" disabled={busy} onClick={() => void reloadLatest()}>保留完整草稿并加载最新版本</Button>}
        </Alert>}
        <Text size="sm">操作前会保存整题恢复草稿，包含当前未保存的题干、答案和导出方式。这里只更新{candidate ? LABEL[candidate.part] : '所选部分'}编辑稿，正式版本需另行保存。</Text>
        <Radio.Group value={adoptMode} onChange={(value) => setAdoptMode(value as 'replace' | 'append')}><Stack gap="xs">
          <Radio disabled={busy} value="replace" label="替换当前部分" description="用候选替换这一部分；另一部分及导出方式保持不变。" />
          <Radio disabled={busy} value="append" label="追加到当前部分末尾" description="保留现有内容并追加候选，合并后需要重新校对。" />
        </Stack></Radio.Group>
        {draftChanged && <Alert color="orange"><Text size="sm">当前编辑稿或正式版本与发起识别时已有变化。采用将以现在的编辑稿为基础。</Text>
          <Checkbox mt="sm" disabled={busy} checked={acceptDraft} onChange={(event) => setAcceptDraft(event.currentTarget.checked)} label="我已核对最新编辑稿，确认按以上方式采用并保留恢复草稿。" /></Alert>}
        {sourceChanged && <Alert color="orange"><Text size="sm">原图已经变化。请核对以下最新原图，确认候选仍适用于这道题。</Text>
          {latestSource && <img src={`${assetUrl(latestSource.imagePath)}?v=${encodeURIComponent(latestSource.sourceFingerprint)}`} alt="变化后的最新原图" className="original-question-image" />}
          <Checkbox mt="sm" disabled={busy || !latestSource} checked={acceptSource} onChange={(event) => setAcceptSource(event.currentTarget.checked)} label="我已核对变化后的原图，仍决定采用这份候选。" /></Alert>}
        {!candidate?.reviewed && <Text size="sm" c="orange">候选尚未标记为已校对，采用后仍会显示“待复核”。</Text>}
        <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={() => setAdoptOpen(false)}>暂不采用</Button>
          <Button loading={busy} disabled={draftChanged && !acceptDraft || sourceChanged && !acceptSource} onClick={() => void adopt()}>保留恢复草稿并采用</Button></Group>
      </Stack>
    </Modal>
    <Drawer opened={recoveriesOpen} onClose={() => { if (!busy) setRecoveriesOpen(false) }} title="完整恢复草稿" position="right" size="xl"
      closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack>
        <Text size="sm" c="dimmed">恢复草稿包含采用识别内容前的未保存编辑状态。恢复后仍在编辑区，点击“保存”才形成正式版本。</Text>
        {recoveryError && <Alert color="red">{ocrErrorMessage(recoveryError)}</Alert>}
        {recoveriesLoading ? <Loader /> : recoveries.length === 0 ? <Text c="dimmed">尚无恢复草稿；首次采用候选前会自动保留。</Text> : <>
          <Select label="选择恢复草稿" value={recoveryId} disabled={busy} allowDeselect={false} onChange={setRecoveryId}
            data={recoveries.map((item) => ({ value: item.id, label: `${new Date(item.createdAt).toLocaleString()} · ${reasonLabel(item.reason)}` }))} />
          {recovery && <>
            <Button loading={busy} disabled={disabled} onClick={() => void restoreDraft()}>保护当前稿并恢复到编辑区</Button>
            <Text size="xs">题干导出：{recovery.content.questionMode === 'original' ? '原图' : '可编辑内容'}；答案导出：{recovery.content.answerMode === 'original' ? '原图' : '可编辑内容'}</Text>
            <Divider label="题干" /><div className="editor-paper"><DocumentPreview document={recovery.content.questionBody} assets={data.assets} /></div>
            <Divider label="答案" /><div className="editor-paper"><DocumentPreview document={recovery.content.answerBody} assets={data.assets} /></div>
          </>}
        </>}
      </Stack>
    </Drawer>
  </Paper>
}
