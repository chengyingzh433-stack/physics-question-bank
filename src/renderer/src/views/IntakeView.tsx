import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ActionIcon, Alert, Badge, Button, Checkbox, Divider, Group, Loader, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPhotoPlus, IconPlus, IconTrash } from '@tabler/icons-react'
import type { IntakeAsset, IntakeComponent, IntakeDraft, IntakeRole, IntakeSummary } from '@shared/intake'
import type { OcrCrop } from '@shared/ocr'
import { assetUrl } from '@shared/editable'
import { IntakePreview, cropPage, type IntakePage } from '../components/intake/IntakePreview'
import { composeQuestion, releaseComposition, roleNames, type Composition } from '../components/intake/composeQuestion'
import { useUnsavedNavigation } from '../components/useUnsavedNavigation'
import { prepareIntakeReview, prepareSingleImage } from '../components/intake/quickIntake'
import '../components/editor/QuestionEditor.css'
import '../components/intake/Intake.css'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const statuses = { editing: '组题草稿', reviewing: '待校对', published: '已入库', archived: '已归档' }
const roleOptions = Object.entries(roleNames).map(([value, label]) => ({ value, label }))
const snapshot = (d: IntakeDraft) => JSON.stringify([d.title, d.components])
const editLink = (d: { questionId: number }) => `/questions/${d.questionId}/edit?from=/intake`

export default function IntakeView() {
  const { draftId } = useParams()
  return draftId ? <IntakeWorkspace key={draftId} draftId={draftId} /> : <IntakeList />
}
function IntakeList() {
  const navigate = useNavigate(), [rows, setRows] = useState<IntakeSummary[]>([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [archive, setArchive] = useState(false)
  const refresh = useCallback(() => { setLoading(true); window.api.listIntakeDrafts().then(setRows).catch((e) => setError(errorText(e))).finally(() => setLoading(false)) }, [])
  useEffect(refresh, [refresh])
  const create = async (mode: 'manual' | 'files' | 'clipboard') => {
    if (busy) return
    setBusy(true); setError('')
    try {
      let d = await window.api.createIntakeDraft()
      if (mode === 'files') {
        const result = await window.api.importIntakeFiles(d.id); d = result.draft
        if (result.errors.length) throw new Error(`${result.errors.join('\n')}。已导入的原稿保存在组题草稿中，可继续整理。`)
        if (!d.sources.length) { await window.api.archiveIntakeDraft(d.id, d.revision, true); refresh(); return }
      } else if (mode === 'clipboard') {
        const result = await window.api.pasteIntakeClipboard(d.id); d = result.draft
        if (result.text !== null) d = await window.api.saveIntakeDraft(d.id, d.revision, d.title,
          [{ id: crypto.randomUUID(), role: 'stem', label: '', text: result.text, assetId: null }])
      }
      if (mode !== 'manual') {
        const title = d.sources[0]?.name || d.components[0]?.text.trim().split(/\r?\n/)[0]
        if (title) d = await window.api.saveIntakeDraft(d.id, d.revision, title.slice(0, 120), d.components)
        d = await prepareSingleImage(d)
        if (d.components.length) { d = await prepareIntakeReview(d); navigate(editLink(d)); return }
      }
      navigate(`/intake/${d.id}`)
    } catch (e) { setError(errorText(e)); refresh() } finally { setBusy(false) }
  }
  return <Stack p="lg" maw={1200} mx="auto">
    <Group justify="space-between"><div><Title order={2}>录题工作台</Title><Text c="dimmed" mt={4}>截图、图片、PDF、Word 汇入一道题，整理后识别与校对。</Text></div>
      <Button leftSection={<IconPlus size={18} />} disabled={busy} variant="default" onClick={() => void create('manual')}>分区组题 / 手工输入</Button></Group>
    <Group><Button loading={busy} onClick={() => void create('files')}>选择图片 / PDF / Word</Button>
      <Button disabled={busy} variant="light" onClick={() => void create('clipboard')}>粘贴截图或文字录题</Button></Group>
    <Text size="sm" c="dimmed">一张图片或一段文字直接进入校对；PDF、Word 和多份原稿先选取需要的内容，再继续校对、选标签并保存入库。</Text>
    <Paper withBorder p="lg"><Text fw={600}>两种方式可以混用</Text><Text size="sm" mt="xs">在原稿上框选题干、选项和配图；或把文字与图片直接加入对应部分。原稿保留在本机，云识别由你逐次确认。</Text>
      <Text size="xs" c="dimmed" mt="xs">支持 PNG / JPEG、PDF、DOCX；旧 DOC 请先另存为 DOCX 或 PDF。每次整理一道题，可以沿用同一份原稿继续录下一题。</Text></Paper>
    {error && <Alert color="red">{error}<Button ml="sm" variant="subtle" onClick={refresh}>重新读取</Button></Alert>}
    <Checkbox label="显示已归档草稿" checked={archive} onChange={(e) => setArchive(e.currentTarget.checked)} />
    {loading ? <Loader /> : rows.filter((d) => archive || d.status !== 'archived').map((d) => <Paper key={d.id} withBorder p="md">
      <Group justify="space-between"><div><Group gap="sm"><Text fw={600}>{d.title}</Text><Badge color={d.status === 'published' ? 'green' : d.status === 'reviewing' ? 'orange' : 'gray'}>{statuses[d.status]}</Badge></Group>
        <Text size="xs" c="dimmed" mt={4}>{d.componentCount} 个部分 · {new Date(d.updatedAt).toLocaleString()}</Text></div>
        <Group><Button variant="default" component={Link} to={`/intake/${d.id}`}>查看原稿与组题</Button>
          {(d.status === 'reviewing' || d.status === 'published') && <Button component={Link} to={editLink(d)}>{d.status === 'published' ? '编辑题目' : '继续校对'}</Button>}</Group></Group>
    </Paper>)}
    {!loading && !rows.some((d) => archive || d.status !== 'archived') && <Text c="dimmed" ta="center" py="xl">还没有录题草稿。选择文件、粘贴截图，或开始手工输入。</Text>}
  </Stack>
}
function IntakeWorkspace({ draftId }: { draftId: string }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<IntakeDraft | null>(null), draftRef = useRef<IntakeDraft | null>(null)
  const [baseline, setBaseline] = useState(''), baselineRef = useRef('')
  const [busy, setBusy] = useState(false), lock = useRef(false), [error, setError] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [role, setRole] = useState<IntakeRole>('stem'), [label, setLabel] = useState('A'), [text, setText] = useState('')
  const [page, setPage] = useState<IntakePage | null>(null)
  const [selection, setSelection] = useState<{ crop: OcrCrop | null; scale: number; valid: boolean }>({ crop: null, scale: 1, valid: false })
  const [composition, setComposition] = useState<Composition | null>(null), compositionRef = useRef<Composition | null>(null)
  const accept = (d: IntakeDraft) => { draftRef.current = d; setDraft(d); baselineRef.current = snapshot(d); setBaseline(snapshot(d)) }
  const local = (d: IntakeDraft) => { draftRef.current = d; setDraft(d) }
  useEffect(() => {
    let alive = true
    window.api.getIntakeDraft(draftId).then((d) => { if (alive) { accept(d); setSourceId(d.sources[0]?.id ?? null) } }).catch((e) => { if (alive) setError(errorText(e)) })
    return () => { alive = false; releaseComposition(compositionRef.current) }
  }, [draftId])
  const dirty = Boolean(draft && snapshot(draft) !== baseline)
  useUnsavedNavigation(dirty || Boolean(text.trim()) || busy)
  const editing = draft?.status === 'editing'
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { setError(errorText(e)) } finally { lock.current = false; setBusy(false) }
  }
  const persist = async (): Promise<IntakeDraft> => {
    const d = draftRef.current!
    if (snapshot(d) === baselineRef.current) return d
    const saved = await window.api.saveIntakeDraft(d.id, d.revision, d.title, d.components); accept(saved); return saved
  }
  const saveComponents = async (components: IntakeComponent[], assets?: IntakeAsset[]) => {
    const d = draftRef.current!
    const saved = await window.api.saveIntakeDraft(d.id, d.revision, d.title, components)
    if (assets) saved.assets = [...new Map([...saved.assets, ...assets].map((a) => [a.id, a])).values()]
    accept(saved)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (draftRef.current?.status === 'editing') void run(async () => { await collectText(); await persist() }) } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  })
  const addAsset = async (asset: IntakeAsset) => {
    const d = draftRef.current!
    await saveComponents([...d.components, { id: crypto.randomUUID(), role, label: role === 'option' ? label : '', text: '', assetId: asset.id }], [asset])
    if (role === 'option' && /^[A-Y]$/.test(label)) setLabel(String.fromCharCode(label.charCodeAt(0) + 1))
  }
  const addWholeImage = async (d: IntakeDraft, priorSources: Set<string>) => {
    const source = d.sources.find((s) => !priorSources.has(s.id) && s.kind === 'image')
    if (!source) throw new Error('请选择或粘贴 PNG/JPEG 图片')
    setSourceId(source.id)
    const data = await cropPage(assetUrl(source.previewPath), null)
    const asset = await window.api.addIntakeCrop(d.id, source.id, 1, null, data)
    await addAsset(asset)
  }
  const importFiles = async (files?: File[], directImage = false) => {
    await persist()
    const previous = new Set(draftRef.current!.sources.map((s) => s.id)), errors: string[] = []
    if (files) {
      if (files.length > 40) errors.push('每次最多导入 40 个文件')
      for (const file of files.slice(0, 40)) {
        try { accept(await window.api.importIntakeFile(draftId, file)) } catch (e) { errors.push(`${file.name}：${errorText(e)}`) }
      }
    } else {
      const result = await window.api.importIntakeFiles(draftId); accept(result.draft); errors.push(...result.errors)
    }
    const d = draftRef.current!, fresh = d.sources.filter((s) => !previous.has(s.id))
    if (fresh.length) setSourceId(fresh[0].id)
    if (directImage && fresh.length) await addWholeImage(d, previous)
    if (errors.length) setError(errors.join('\n'))
  }
  const paste = async (direct: boolean) => {
    await persist()
    const previous = new Set(draftRef.current!.sources.map((s) => s.id))
    const result = await window.api.pasteIntakeClipboard(draftId); accept(result.draft)
    if (result.text !== null) { setText((v) => v ? `${v}\n${result.text}` : result.text!); return }
    const source = result.draft.sources.find((s) => !previous.has(s.id))
    if (source) setSourceId(source.id)
    if (direct) await addWholeImage(result.draft, previous)
  }
  const copy = async (components: boolean) => {
    if (draftRef.current?.status === 'editing') { await collectText(); await persist() }
    const next = await window.api.createIntakeDraft(draftId, components); navigate(`/intake/${next.id}`)
  }
  const updateComponent = (id: string, patch: Partial<IntakeComponent>) => {
    const d = draftRef.current!; local({ ...d, components: d.components.map((c) => c.id === id ? { ...c, ...patch } : c) })
  }
  const collectText = async () => {
    if (!text.trim()) return
    const d = draftRef.current!
    await saveComponents([...d.components, { id: crypto.randomUUID(), role, label: role === 'option' ? label : '', text, assetId: null }])
    setText('')
    if (role === 'option' && /^[A-Y]$/.test(label)) setLabel(String.fromCharCode(label.charCodeAt(0) + 1))
  }
  const collectForReview = async () => {
    await collectText(); await persist()
    if (!draftRef.current!.components.length) {
      if (!activeSource || !page || !selection.valid) throw new Error('请先添加原稿或输入题目文字')
      const d = draftRef.current!
      const asset = await window.api.addIntakeCrop(d.id, activeSource.id, page.page, selection.crop, await cropPage(page.url, selection.crop, selection.scale))
      await saveComponents([{ id: crypto.randomUUID(), role: 'stem', label: '', text: '', assetId: asset.id }], [asset])
    }
    return draftRef.current!
  }
  const continueReview = async () => {
    const d = await prepareIntakeReview(await collectForReview()); accept(d); navigate(editLink(d))
  }
  const preview = async () => {
    const value = await composeQuestion(await collectForReview())
    releaseComposition(compositionRef.current); compositionRef.current = value; setComposition(value)
  }
  const closePreview = () => { if (lock.current) return; releaseComposition(compositionRef.current); compositionRef.current = null; setComposition(null) }
  if (!draft) return <Stack p="lg">{error ? <Alert color="red">{error}</Alert> : <Loader />}<Button component={Link} to="/intake" variant="default">返回录题工作台</Button></Stack>
  const activeSource = draft.sources.find((s) => s.id === sourceId)
  return <Stack p="md" className="intake-workspace" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
    onDrop={(e) => { const files = Array.from(e.dataTransfer.files); if (!files.length) return; e.preventDefault(); if (editing && !busy) void run(() => importFiles(files)) }}
    onPaste={(e) => {
      const files = Array.from(e.clipboardData.files).filter((f) => /^image\/(png|jpeg)$/.test(f.type))
      if (!files.length || !editing || busy) return
      e.preventDefault(); void run(() => importFiles(files))
    }}>
    <Group justify="space-between" align="start"><div><Button component={Link} to="/intake" variant="subtle" size="xs">返回录题工作台</Button><Title order={3}>组合一道题</Title></div>
      <Group><Badge color={editing ? 'blue' : 'green'}>{statuses[draft.status]}</Badge><Text size="xs" c="dimmed">{text.trim() ? '输入文字尚未加入组题' : dirty ? '有未保存修改' : '草稿已保存'}</Text>
        {editing && <Button variant="default" disabled={busy || (!dirty && !text.trim())} onClick={() => void run(async () => { await collectText(); await persist() })}>暂存（⌘ / Ctrl + S）</Button>}
        {editing && <Button variant="subtle" disabled={busy} onClick={() => void run(preview)}>预览组合</Button>}
        {editing ? <Button disabled={busy} onClick={() => void run(continueReview)}>继续校对与选标签</Button> : draft.status !== 'archived' && <Button component={Link} to={editLink(draft)}>进入校对与标签</Button>}</Group></Group>
    {error && <Alert color="red" title="操作未完成" style={{ whiteSpace: 'pre-wrap' }}>{error}</Alert>}
    {!editing && <Alert color="blue">{draft.status === 'archived' ? '此草稿已归档，原稿和内容都已保留。' : '组题快照已保留。继续在校对页修改文字和图片；若要调整原稿选区，可复制成新草稿，当前版本及识别记录会保留。'}
      <Group mt="sm"><Button size="xs" variant="light" disabled={busy} onClick={() => void run(() => copy(true))}>复制并重新组题</Button>
        {draft.status === 'archived' && <Button size="xs" disabled={busy} onClick={() => void run(async () => { accept(await window.api.archiveIntakeDraft(draftId, draft.revision, false)) })}>恢复草稿</Button>}</Group></Alert>}
    <TextInput label="题目名称 / 来源提示" value={draft.title} maxLength={120} disabled={busy || !editing} onChange={(e) => local({ ...draft, title: e.currentTarget.value })} />
    <div className="intake-columns">
      <Paper withBorder p="md" className="intake-source-panel"><Stack gap="sm">
        <Group justify="space-between"><Text fw={600}>1. 原稿与框选</Text><Badge variant="outline" color="gray">本机处理</Badge></Group>
        <Group gap="xs"><Button size="xs" disabled={busy || !editing} leftSection={<IconPhotoPlus size={16} />} onClick={() => void run(() => importFiles())}>添加图片 / PDF / Word</Button>
          <Button size="xs" variant="default" disabled={busy || !editing} onClick={() => void run(() => paste(false))}>粘贴截图或文字</Button></Group>
        <Text size="xs" c="dimmed">可将文件拖到此页，或按 ⌘V / Ctrl+V 粘贴截图。文字可在右侧输入框粘贴。</Text>
        {draft.sources.length > 0 && <Group align="end" wrap="nowrap"><Select label="原稿" value={sourceId} style={{ flex: 1 }} disabled={busy} allowDeselect={false} searchable
          data={draft.sources.map((s) => ({ value: s.id, label: `${s.name} · ${s.kind.toUpperCase()}` }))}
          onChange={(id) => { setSourceId(id); setPage(null); setSelection({ crop: null, scale: 1, valid: false }) }} />
          <Button size="xs" variant="subtle" disabled={!sourceId || busy} onClick={() => void run(async () => { if (sourceId) await window.api.revealIntakeSource(draftId, sourceId) })}>查看原件</Button></Group>}
        {activeSource ? <IntakePreview key={activeSource.id} source={activeSource} disabled={busy} readOnly={!editing} onPage={setPage}
          onSelection={(crop, scale, valid) => setSelection({ crop, scale, valid })} onText={(value) => setText((old) => old ? `${old}\n${value}` : value)} />
          : <div className="intake-empty"><Text fw={500}>拖入原稿，或直接开始输入</Text><Text size="sm" c="dimmed" mt="sm">支持 PNG / JPEG · PDF · DOCX<br />原稿保留，可多次框选组成一道题。</Text></div>}
        {activeSource && editing && <Button disabled={busy || !page || !selection.valid} variant="light" onClick={() => void run(async () => {
          await persist()
          const asset = await window.api.addIntakeCrop(draftId, activeSource.id, page!.page, selection.crop, await cropPage(page!.url, selection.crop, selection.scale))
          await addAsset(asset)
        })}>将{selection.crop ? '选区' : '整页'}加入「{roleNames[role]}{role === 'option' ? ` ${label}` : ''}」</Button>}
      </Stack></Paper>
      <Paper withBorder p="md" className="intake-compose-panel"><Stack gap="sm">
        <Group justify="space-between"><Text fw={600}>2. 文字、选项与图片</Text><Badge variant="light">{draft.components.length} 个部分</Badge></Group>
        {editing && <>
          <Group align="end"><Select label="当前添加到" value={role} allowDeselect={false} disabled={busy} data={roleOptions} onChange={(v) => { if (v) setRole(v as IntakeRole) }} style={{ flex: 1 }} />
            {role === 'option' && <TextInput label="选项标记" value={label} maxLength={8} w={100} disabled={busy} onChange={(e) => setLabel(e.currentTarget.value)} />}</Group>
          {role === 'option' && <Text size="xs" c="dimmed">选区已含 A/B 等标记时，可清空选项标记，避免重复添加。</Text>}
          <Textarea label="输入或粘贴文字" description="继续校对或暂存时会自动加入当前部分。需要分段时点击“加入组题”；公式在校对页插入。" autosize minRows={3} maxRows={9} value={text} disabled={busy} maxLength={20000} onChange={(e) => setText(e.currentTarget.value)} />
          <Group gap="xs"><Button size="xs" disabled={busy || !text.trim()} onClick={() => void run(async () => {
            const d = draftRef.current!
            await saveComponents([...d.components, { id: crypto.randomUUID(), role, label: role === 'option' ? label : '', text, assetId: null }]); setText('')
            if (role === 'option' && /^[A-Y]$/.test(label)) setLabel(String.fromCharCode(label.charCodeAt(0) + 1))
          })}>加入组题</Button>
            <Button size="xs" variant="default" disabled={busy} onClick={() => void run(() => paste(true))}>粘贴图片到此部分</Button>
            <Button size="xs" variant="subtle" disabled={busy || !text} onClick={() => setText('')}>清空输入框</Button></Group>
          <Divider label="按以下顺序组题 · 题干与答案分别汇总" />
        </>}
        {draft.components.length === 0 && <Text c="dimmed" size="sm" py="lg">先选择部分，再输入文字或从原稿框选。文字与图片可以交替排列。</Text>}
        {draft.components.map((c, index) => {
          const asset = draft.assets.find((a) => a.id === c.assetId), source = draft.sources.find((s) => s.id === asset?.sourceId)
          return <Paper key={c.id} withBorder p="sm" className="intake-component">
            <Group justify="space-between" mb="xs" wrap="nowrap"><Group gap="xs"><Text size="xs" c="dimmed">{index + 1}</Text>
              <Select aria-label={`第 ${index + 1} 部分类型`} data={roleOptions} value={c.role} size="xs" w={116} allowDeselect={false} disabled={busy || !editing}
                onChange={(v) => { if (v) updateComponent(c.id, { role: v as IntakeRole, label: v === 'option' ? c.label || 'A' : c.label }) }} />
              {c.role === 'option' && <TextInput aria-label="选项标记" value={c.label} w={55} size="xs" maxLength={8} disabled={busy || !editing} onChange={(e) => updateComponent(c.id, { label: e.currentTarget.value })} />}</Group>
              {editing && <Group gap={3}><ActionIcon variant="subtle" aria-label="上移" disabled={busy || index === 0} onClick={() => void run(async () => { const items = [...draft.components]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; await saveComponents(items) })}><IconArrowUp size={16} /></ActionIcon>
                <ActionIcon variant="subtle" aria-label="下移" disabled={busy || index === draft.components.length - 1} onClick={() => void run(async () => { const items = [...draft.components]; [items[index + 1], items[index]] = [items[index], items[index + 1]]; await saveComponents(items) })}><IconArrowDown size={16} /></ActionIcon>
                <ActionIcon color="red" variant="subtle" aria-label="移除此部分（保留原稿）" disabled={busy} onClick={() => void run(() => saveComponents(draft.components.filter((i) => i.id !== c.id)))}><IconTrash size={16} /></ActionIcon></Group>}</Group>
            {(!asset || c.text) && <Textarea aria-label="部分文字" autosize minRows={2} maxRows={6} value={c.text} maxLength={20000} disabled={busy || !editing} onChange={(e) => updateComponent(c.id, { text: e.currentTarget.value })} />}
            {asset && <><img className="intake-part-image" src={assetUrl(asset.path)} alt={`${roleNames[c.role]}原稿选区`} /><Text size="xs" c="dimmed">{source?.name ?? '图片'}{asset.page ? ` · 第 ${asset.page} 页` : ''} · {asset.width} × {asset.height}</Text></>}
          </Paper>
        })}
      </Stack></Paper>
    </div>
    <Group justify="space-between"><Text size="xs" c="dimmed">组题原稿与快照保留；只有校对页确认入库后才出现在题库。</Text><Group>
      {editing && <Button size="xs" variant="subtle" color="gray" disabled={busy || Boolean(text.trim())} onClick={() => void run(async () => { const d = await persist(); accept(await window.api.archiveIntakeDraft(draftId, d.revision, true)) })}>归档草稿</Button>}
      <Button size="xs" variant="default" disabled={busy} onClick={() => void run(() => copy(false))}>沿用原稿，录下一题</Button></Group></Group>
    <Modal opened={Boolean(composition)} onClose={closePreview} size="xl" title="组题预览（可选）" closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      {composition && <Stack><Alert color="blue">这些是本机生成的题干与答案快照。下一步可以手工校对，也可以按需交给 Doc2X 识别；点击此处不会上传原稿。</Alert>
        <Text fw={600}>题干</Text><img className="intake-composition-image" src={composition.questionUrl} alt="题干组题预览" />
        {composition.answerUrl && <><Text fw={600}>答案与解析</Text><img className="intake-composition-image" src={composition.answerUrl} alt="答案组题预览" /></>}
        {error && <Alert color="red">{error}</Alert>}
        <Button loading={busy} onClick={() => void run(async () => {
          const d = await window.api.prepareIntakeQuestion(draftId, draftRef.current!.revision, composition.question, composition.answer)
          accept(d); navigate(editLink(d))
        })}>继续校对与选标签</Button>
      </Stack>}
    </Modal>
  </Stack>
}
