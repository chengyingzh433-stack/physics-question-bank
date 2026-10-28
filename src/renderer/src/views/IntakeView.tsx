import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ActionIcon, Alert, Badge, Button, Checkbox, Divider, Group, Loader, Menu, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPhotoPlus, IconTrash, IconArrowRight, IconClipboard, IconFileText, IconPencil } from '@tabler/icons-react'
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
  const [manualOpen, setManualOpen] = useState(false), [manualText, setManualText] = useState('')
  const creating = useRef(false)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [archive, setArchive] = useState(false)
  const refresh = useCallback(() => { setLoading(true); window.api.listIntakeDrafts().then(setRows).catch((e) => setError(errorText(e))).finally(() => setLoading(false)) }, [])
  useEffect(refresh, [refresh])
  const create = async (mode: 'manual' | 'files' | 'clipboard' | 'text', files?: File[]) => {
    if (creating.current) return
    creating.current = true; setBusy(true); setError('')
    try {
      let d = await window.api.createIntakeDraft()
      if (mode === 'files') {
        const result = files ? { draft: d, errors: [] as string[] } : await window.api.importIntakeFiles(d.id)
        if (files) {
          if (files.length > 40) throw new Error('每次最多添加 40 份原稿。')
          for (const file of files) {
            try { result.draft = await window.api.importIntakeFile(d.id, file) }
            catch (e) { result.errors.push(`${file.name}：${errorText(e)}`) }
          }
        }
        d = result.draft
        if (result.errors.length) throw new Error(`${result.errors.join('\n')}。已导入的原稿保存在组题草稿中，可继续整理。`)
        if (!d.sources.length) { await window.api.archiveIntakeDraft(d.id, d.revision, true); refresh(); return }
      } else if (mode === 'text') {
        d = await window.api.saveIntakeDraft(d.id, d.revision, '手工录题',
          [{ id: crypto.randomUUID(), role: 'question', label: '', text: manualText.trim(), assetId: null }])
      } else if (mode === 'clipboard') {
        const result = await window.api.pasteIntakeClipboard(d.id); d = result.draft
        if (result.text !== null) d = await window.api.saveIntakeDraft(d.id, d.revision, d.title,
          [{ id: crypto.randomUUID(), role: 'question', label: '', text: result.text, assetId: null }])
      }
      if (mode !== 'manual') {
        const title = d.sources[0]?.name || d.components[0]?.text.trim().split(/\r?\n/)[0]
        if (title) d = await window.api.saveIntakeDraft(d.id, d.revision, title.slice(0, 120), d.components)
        d = await prepareSingleImage(d)
        if (d.components.length) { d = await prepareIntakeReview(d); navigate(editLink(d)); return }
      }
      navigate(`/intake/${d.id}`)
    } catch (e) { setError(errorText(e)); refresh() } finally { creating.current = false; setBusy(false) }
  }
  return <Stack className="intake-home" gap="xl" maw={1160} mx="auto" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
    onDrop={(e) => { const files = Array.from(e.dataTransfer.files); if (files.length) { e.preventDefault(); void create('files', files) } }}
    onPaste={(e) => {
      if ((e.target as HTMLElement).closest('input,textarea,[contenteditable=true]')) return
      if (e.clipboardData.files.length || e.clipboardData.getData('text/plain')) { e.preventDefault(); void create('clipboard') }
    }}>
    <div className="page-heading"><Text className="eyebrow">从一道好题开始</Text><Title order={1}>今天，收录什么题？</Title><Text c="dimmed" mt={8}>选取原稿，整理图文，标好标签。你的题库，一题一题积累。</Text></div>
    <Paper withBorder p="xl" className="intake-start">
      <Group justify="space-between" mb="xl"><div><Text fw={600} size="lg">拖入文件，从这里开始</Text><Text size="sm" c="dimmed" mt={6}>图片 · PDF · Word（DOCX）　原稿保存在本机</Text></div><span className="intake-drop-icon"><IconPhotoPlus size={30} /></span></Group>
      <div className="intake-entry-grid">
        <Button className="intake-entry" size="xl" loading={busy} leftSection={<IconFileText size={23} />} rightSection={<IconArrowRight size={18} />} onClick={() => void create('files')}>选择文件</Button>
        <Button className="intake-entry" size="xl" disabled={busy} variant="default" leftSection={<IconClipboard size={23} />} onClick={() => void create('clipboard')}>粘贴截图或文字</Button>
        <Button className="intake-entry" size="xl" disabled={busy} variant="default" leftSection={<IconPencil size={23} />} onClick={() => setManualOpen(true)}>直接输入</Button>
      </div>
      <Group mt="lg" justify="space-between"><Text size="xs" c="dimmed">也可以在此页按 ⌘V / Ctrl+V 粘贴</Text><Text size="xs" c="dimmed">选取题目 → 校对与标签 → 保存入库</Text></Group>
    </Paper>
    <Group justify="space-between"><Title order={4}>继续未完成的题目</Title>
      <Button size="xs" disabled={busy} variant="subtle" onClick={() => void create('manual')}>分区组题：分别添加题干、选项、配图</Button></Group>
    <Modal opened={manualOpen} onClose={() => { if (!busy) setManualOpen(false) }} title="直接输入题目" closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack><Textarea label="题干" placeholder="输入或粘贴题干和选项，下一步可以添加答案、公式、配图及标签。" value={manualText} disabled={busy} autosize minRows={6} maxRows={14}
        maxLength={20000} onChange={(e) => setManualText(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Button loading={busy} disabled={!manualText.trim()} onClick={() => void create('text')}>继续校对</Button></Stack>
    </Modal>
    {error && <Alert color="red">{error}<Button ml="sm" variant="subtle" onClick={refresh}>重新读取</Button></Alert>}
    <Checkbox label="显示已入库和已归档记录" checked={archive} onChange={(e) => setArchive(e.currentTarget.checked)} />
    {loading ? <Loader /> : rows.filter((d) => archive || (d.status !== 'archived' && d.status !== 'published')).map((d) => <Paper key={d.id} withBorder p="md" className="intake-draft-row">
      <Group justify="space-between"><div><Group gap="sm"><Text fw={600}>{d.title}</Text><Badge color={d.status === 'published' ? 'green' : d.status === 'reviewing' ? 'orange' : 'gray'}>{statuses[d.status]}</Badge></Group>
        <Text size="xs" c="dimmed" mt={4}>{d.componentCount} 个部分 · {new Date(d.updatedAt).toLocaleString()}</Text></div>
        <Group><Button variant="default" component={Link} to={`/intake/${d.id}`}>查看原稿与组题</Button>
          {(d.status === 'reviewing' || d.status === 'published') && <Button component={Link} to={editLink(d)}>{d.status === 'published' ? '编辑题目' : '继续校对'}</Button>}</Group></Group>
    </Paper>)}
    {!loading && !rows.some((d) => archive || (d.status !== 'archived' && d.status !== 'published')) && <Text c="dimmed" ta="center" py="xl">还没有录题草稿。选择文件、粘贴截图，或开始手工输入。</Text>}
  </Stack>
}
function IntakeWorkspace({ draftId }: { draftId: string }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<IntakeDraft | null>(null), draftRef = useRef<IntakeDraft | null>(null)
  const [baseline, setBaseline] = useState(''), baselineRef = useRef('')
  const [busy, setBusy] = useState(false), lock = useRef(false), [error, setError] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [role, setRole] = useState<IntakeRole>('question'), [label, setLabel] = useState('A'), [text, setText] = useState('')
  const [page, setPage] = useState<IntakePage | null>(null)
  const [selection, setSelection] = useState<{ crop: OcrCrop | null; scale: number; valid: boolean }>({ crop: null, scale: 1, valid: false })
  const usedSelection = useRef('')
  const selectionKey = JSON.stringify([sourceId, page?.page, selection.crop, selection.scale])
  const pendingSelection = Boolean(selection.crop && selection.valid && usedSelection.current !== selectionKey)
  const [composition, setComposition] = useState<Composition | null>(null), compositionRef = useRef<Composition | null>(null)
  const accept = (d: IntakeDraft) => { draftRef.current = d; setDraft(d); baselineRef.current = snapshot(d); setBaseline(snapshot(d)) }
  const local = (d: IntakeDraft) => { draftRef.current = d; setDraft(d) }
  useEffect(() => {
    let alive = true
    window.api.getIntakeDraft(draftId).then((d) => { if (alive) { accept(d); setSourceId(d.sources[0]?.id ?? null); setAdvanced(d.components.length > 0 || d.sources.length === 0) } }).catch((e) => { if (alive) setError(errorText(e)) })
    return () => { alive = false; releaseComposition(compositionRef.current) }
  }, [draftId])
  const dirty = Boolean(draft && snapshot(draft) !== baseline)
  useUnsavedNavigation(dirty || Boolean(text.trim()) || pendingSelection || busy)
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
    if (result.text !== null) { setAdvanced(true); setText((v) => v ? `${v}\n${result.text}` : result.text!); return }
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
    if ((draftRef.current!.components.length || text.trim()) && pendingSelection) {
      setAdvanced(true)
      throw new Error('当前新选区尚未加入。请点击原稿下方的“将选区加入”，或切换“使用整页”取消本次选区，再继续。已添加的部分会保留。')
    }
    await collectText(); await persist()
    if (!draftRef.current!.components.length) {
      if (!activeSource || !page || !selection.valid) throw new Error('请先添加原稿或输入题目文字')
      const d = draftRef.current!
      const asset = await window.api.addIntakeCrop(d.id, activeSource.id, page.page, selection.crop, await cropPage(page.url, selection.crop, selection.scale))
      await saveComponents([{ id: crypto.randomUUID(), role: advanced ? role : 'question', label: advanced && role === 'option' ? label : '', text: '', assetId: asset.id }], [asset])
      usedSelection.current = selectionKey
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
  if (!draft) return <Stack p="lg">{error ? <Alert color="red">{error}</Alert> : <Loader />}<Button component={Link} to="/intake" variant="default">返回录题</Button></Stack>
  const activeSource = draft.sources.find((s) => s.id === sourceId)
  return <Stack gap="sm" className={`intake-workspace ${advanced ? 'is-advanced' : 'is-focused'}`} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
    onDrop={(e) => { const files = Array.from(e.dataTransfer.files); if (!files.length) return; e.preventDefault(); if (editing && !busy) void run(() => importFiles(files)) }}
    onPaste={(e) => {
      const files = Array.from(e.clipboardData.files).filter((f) => /^image\/(png|jpeg)$/.test(f.type))
      if (!files.length || !editing || busy) return
      e.preventDefault(); void run(() => importFiles(files))
    }}>
    <Group justify="space-between" className="intake-workspace-heading" wrap="nowrap">
      <Group gap="sm" wrap="nowrap"><Button component={Link} to="/intake" variant="subtle" size="xs">返回</Button><div><Title order={3}>选取一道题</Title><Text size="xs" c="dimmed">第 1 步 / 共 2 步 · 下一步校对内容与标签</Text></div></Group>
      <Group gap="xs"><Badge variant="light" color={editing ? 'sky' : 'gray'}>{statuses[draft.status]}</Badge>
        {editing && <Button size="xs" variant="default" disabled={busy || (!dirty && !text.trim())} onClick={() => void run(async () => { await collectText(); await persist() })}>暂存</Button>}
      </Group>
    </Group>
    {error && <Alert color="red" title="操作未完成" style={{ whiteSpace: 'pre-wrap' }}>{error}</Alert>}
    {!editing && <Alert color="blue">{draft.status === 'archived' ? '此草稿已归档，原稿和内容都已保留。' : '组题快照已保留。继续在校对页修改文字和图片；若要调整原稿选区，可复制成新草稿，当前版本及识别记录会保留。'}
      <Group mt="sm"><Button size="xs" variant="light" disabled={busy} onClick={() => void run(() => copy(true))}>复制并重新组题</Button>
        {draft.status === 'archived' && <Button size="xs" disabled={busy} onClick={() => void run(async () => { accept(await window.api.archiveIntakeDraft(draftId, draft.revision, false)) })}>恢复草稿</Button>}</Group></Alert>}
    <div className="intake-columns">
      <Paper withBorder p="sm" className="intake-source-panel"><Stack gap="xs" className="intake-source-inner">
        <Group justify="space-between"><Text fw={600}>原稿</Text><Group gap="xs">
          <Menu><Menu.Target><Button size="compact-xs" variant="default" disabled={busy || !editing} leftSection={<IconPhotoPlus size={14} />}>添加原稿</Button></Menu.Target><Menu.Dropdown>
            <Menu.Item onClick={() => void run(() => importFiles())}>选择图片 / PDF / Word</Menu.Item>
            <Menu.Item onClick={() => void run(() => paste(false))}>粘贴截图或文字</Menu.Item>
          </Menu.Dropdown></Menu>
          <Button size="compact-xs" variant="subtle" disabled={busy} onClick={() => setAdvanced((v) => !v)}>{advanced ? '收起分区工具' : '分区组题'}</Button></Group></Group>
        {draft.sources.length > 0 && <Group align="end" wrap="nowrap"><Select aria-label="选择原稿" size="xs" value={sourceId} style={{ flex: 1 }} disabled={busy} allowDeselect={false} searchable
          data={draft.sources.map((s) => ({ value: s.id, label: `${s.name} · ${s.kind.toUpperCase()}` }))}
          onChange={(id) => { setSourceId(id); setPage(null); setSelection({ crop: null, scale: 1, valid: false }) }} />
          <Button size="xs" variant="subtle" disabled={!sourceId || busy} onClick={() => void run(async () => { if (sourceId) await window.api.revealIntakeSource(draftId, sourceId) })}>查看原件</Button></Group>}
        {activeSource ? <IntakePreview key={activeSource.id} source={activeSource} disabled={busy} readOnly={!editing} onPage={setPage}
          onSelection={(crop, scale, valid) => setSelection({ crop, scale, valid })} onText={(value) => { setAdvanced(true); setText((old) => old ? `${old}\n${value}` : value) }} />
          : <div className="intake-empty"><Text fw={500}>拖入原稿，或直接开始输入</Text><Text size="sm" c="dimmed" mt="sm">支持 PNG / JPEG · PDF · DOCX<br />原稿保留，可多次框选组成一道题。</Text></div>}
        {activeSource && editing && (!advanced || role === 'question') && !draft.components.length && !text.trim() &&
          <Button loading={busy} disabled={!page || !selection.valid} onClick={() => void run(continueReview)}>将{selection.crop ? '选区' : '当前整页'}作为整道题，继续校对</Button>}
        {activeSource && editing && advanced && (role !== 'question' || draft.components.length > 0 || Boolean(text.trim())) && <Button disabled={busy || !page || !selection.valid} variant="light" onClick={() => void run(async () => {
          await persist()
          const asset = await window.api.addIntakeCrop(draftId, activeSource.id, page!.page, selection.crop, await cropPage(page!.url, selection.crop, selection.scale))
          await addAsset(asset); usedSelection.current = selectionKey
        })}>将{selection.crop ? '选区' : '整页'}加入「{roleNames[role]}{role === 'option' ? ` ${label}` : ''}」</Button>}
      </Stack></Paper>
      <Paper withBorder p="md" className="intake-compose-panel"><Stack gap="sm">
        <TextInput label="题目名称" description="用来在题库中找到这道题" value={draft.title} maxLength={120} disabled={busy || !editing} onChange={(e) => local({ ...draft, title: e.currentTarget.value })} />
        {!advanced && <div className="intake-focus-guide"><span className="step-number">1</span><Title order={4}>框住整道题</Title><Text size="sm" c="dimmed">在左侧原稿拖动框选，包含题干、选项与配图。无需分别添加，直接点下方“继续校对”。</Text><Divider my="lg" /><Text fw={600} size="sm">需要拼接多个区域？</Text><Text size="xs" c="dimmed" mt="xs">打开分区组题，分别添加文字、选项、答案和配图。</Text><Button variant="light" mt="sm" fullWidth onClick={() => setAdvanced(true)}>打开分区组题</Button>
        {draft.components.length > 0 && <Text size="sm" mt="md">已添加 {draft.components.length} 个部分，将按已添加内容组题。<Button variant="subtle" size="compact-xs" onClick={() => setAdvanced(true)}>查看与调整</Button></Text>}</div>}
        {advanced && <>
        <Group justify="space-between"><Text fw={600}>组成部分</Text><Badge variant="light">{draft.components.length} 个部分</Badge></Group>
        {editing && <>
          <Group align="end"><Select label="当前添加到" value={role} allowDeselect={false} disabled={busy} data={roleOptions} onChange={(v) => { if (v) setRole(v as IntakeRole) }} style={{ flex: 1 }} />
            {role === 'option' && <TextInput label="选项标记" value={label} maxLength={8} w={100} disabled={busy} onChange={(e) => setLabel(e.currentTarget.value)} />}</Group>
          {role === 'question' && <Text size="xs" c="dimmed">包含题干、选项和配图的完整题目，直接作为一道题录入，无需拆开。图片中的文字不会自动转成可编辑文字。</Text>}
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
        {draft.components.length === 0 && <Text c="dimmed" size="sm" py="lg">可以整题录入，也可以分别添加题干、选项、答案和配图。</Text>}
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
      </>}
      </Stack></Paper>
    </div>
    <Paper withBorder p="sm" className="intake-workspace-footer"><Group justify="space-between" wrap="nowrap">
      <div><Text size="sm" fw={500}>{draft.components.length ? `已添加 ${draft.components.length} 个部分` : selection.crop && selection.valid ? '选区已就绪' : selection.valid ? '将使用当前整页' : '请先框选一道题'}</Text><Text size="xs" c="dimmed">{text.trim() ? '输入文字会在继续时加入' : dirty ? '有未暂存的修改' : '原稿保留在本机'}</Text></div>
      <Group gap="xs"><Menu position="top-end"><Menu.Target><Button variant="subtle" color="gray" size="xs" disabled={busy}>更多</Button></Menu.Target><Menu.Dropdown>
        <Menu.Item onClick={() => void run(() => copy(false))}>沿用原稿，新建另一题</Menu.Item>
        {editing && <Menu.Item disabled={Boolean(text.trim()) || pendingSelection} onClick={() => void run(async () => { const d = await persist(); accept(await window.api.archiveIntakeDraft(draftId, d.revision, true)) })}>归档草稿（保留原稿）</Menu.Item>}
      </Menu.Dropdown></Menu>{editing && <Button variant="subtle" disabled={busy} onClick={() => void run(preview)}>预览</Button>}
        {editing ? <Button rightSection={<IconArrowRight size={16} />} loading={busy} disabled={!draft.components.length && !text.trim() && (!page || !selection.valid)} onClick={() => void run(continueReview)}>{!draft.components.length && !text.trim() && (!advanced || role === 'question') ? '整题录入，继续校对' : '继续校对'}</Button> : draft.status !== 'archived' && <Button component={Link} to={editLink(draft)}>进入校对</Button>}
        {!editing && <Button variant="default" disabled={busy} onClick={() => void run(() => copy(false))}>沿用原稿录下一题</Button>}
      </Group>
    </Group></Paper>
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
