import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ActionIcon, Alert, Badge, Button, Card, Checkbox, Divider, Drawer, Group,
  Loader, Modal, NavLink, Pagination, Paper, ScrollArea, Select,
  Stack, Text, TextInput, Title, Tooltip
} from '@mantine/core'
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconFolder, IconPlus, IconSearch, IconFilter, IconShoppingCart, IconPencil, IconTrash } from '@tabler/icons-react'
import type {
  BankQuestionDTO, QuestionFilterCriteria, QuestionFolderDTO, QuestionTypeDTO,
  ChapterDTO, KnowledgePointDTO, DifficultyDTO, PaperDTO
} from '@shared/types'
import { ChapterPicker } from '../components/ChapterPicker'
import { KnowledgePointPicker } from '../components/KnowledgePointPicker'
import { QuestionPreview } from '../components/bank/QuestionPreview'
import { notifyBasketChanged } from '../components/useBasketCount'
import './BankView.css'

const PAGE_SIZE = 24
const options = (rows: { id: number; name: string }[]) => rows.map((r) => ({ value: String(r.id), label: r.name }))

function BankView(): React.JSX.Element {
  const navigate = useNavigate()
  const wide = useMediaQuery('(min-width: 1100px)')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [questions, setQuestions] = useState<BankQuestionDTO[]>([])
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [chapters, setChapters] = useState<ChapterDTO[]>([])
  const [kps, setKps] = useState<KnowledgePointDTO[]>([])
  const [diffs, setDiffs] = useState<DifficultyDTO[]>([])
  const [papers, setPapers] = useState<PaperDTO[]>([])
  const [folders, setFolders] = useState<QuestionFolderDTO[]>([])
  const [yearSources, setYearSources] = useState<{ years: number[]; sources: string[] }>({ years: [], sources: [] })
  const [criteria, setCriteria] = useState<QuestionFilterCriteria>({})
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 250)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [draftSetId, setDraftSetId] = useState<number | null>(null)
  const [inBasket, setInBasket] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metaError, setMetaError] = useState('')
  const [busy, setBusy] = useState(false)
  const writeLock = useRef(false)
  const queryVersion = useRef(0)
  const [revision, setRevision] = useState(0)
  const [zoomId, setZoomId] = useState<number | null>(null)
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename' | 'delete'; id?: number; name: string } | null>(null)
  const [addDialog, setAddDialog] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)

  const reloadMeta = useCallback(async () => {
    try {
      const [ts, chs, ks, ds, ps, fs, ys, sid] = await Promise.all([
        window.api.listQuestionTypes(), window.api.listChapters(), window.api.listKnowledgePoints(),
        window.api.listDifficulties(), window.api.listPapers(), window.api.listQuestionFolders(),
        window.api.listYearSources(), window.api.getOrCreateDraftSet()
      ])
      const ids = await window.api.listSetQuestionIds(sid)
      setTypes(ts); setChapters(chs); setKps(ks); setDiffs(ds)
      setPapers(ps.filter((p) => p.kind === 'paper')); setFolders(fs); setYearSources(ys)
      setDraftSetId(sid); setInBasket(new Set(ids)); setMetaError('')
    } catch (e) { setMetaError(`分类信息加载失败：${String(e)}`) }
  }, [])
  useEffect(() => { void reloadMeta() }, [reloadMeta])

  // 筛选到达时立即废弃旧请求，避免输入期间返回的旧结果被选中。
  const resetResults = () => {
    queryVersion.current++
    setQuestions([]); setSelected(new Set()); setPage(1); setZoomId(null); setLoading(true)
  }
  const changeCriteria = (next: QuestionFilterCriteria) => {
    resetResults()
    setCriteria(next)
  }
  const changeSearch = (value: string) => {
    resetResults()
    setSearch(value)
  }
  useEffect(() => {
    if (search !== debouncedSearch) return
    let active = true
    const version = ++queryVersion.current
    setLoading(true); setError('')
    window.api.listBankQuestions({ ...criteria, search: debouncedSearch })
      .then((rows) => {
        if (!active || version !== queryVersion.current) return
        setQuestions(rows)
        const ids = new Set(rows.map((q) => q.id))
        setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))))
        setPage((p) => Math.min(p, Math.max(1, Math.ceil(rows.length / PAGE_SIZE))))
      })
      .catch((e) => { if (active && version === queryVersion.current) setError(`题库加载失败：${String(e)}`) })
      .finally(() => { if (active && version === queryVersion.current) setLoading(false) })
    return () => { active = false }
  }, [criteria, debouncedSearch, search, revision])

  const runWrite = async (action: () => Promise<void>) => {
    if (writeLock.current) return
    writeLock.current = true; setBusy(true)
    try { await action() }
    catch (e) { notifications.show({ title: '操作失败', message: String(e), color: 'red' }) }
    finally { writeLock.current = false; setBusy(false) }
  }
  const refreshFolders = async () => setFolders(await window.api.listQuestionFolders())
  const refreshBasket = async () => {
    notifyBasketChanged()
    if (draftSetId != null) setInBasket(new Set(await window.api.listSetQuestionIds(draftSetId)))
  }
  const addToBasket = (ids: number[], clearSelection = false) => runWrite(async () => {
    if (draftSetId == null) return
    const count = await window.api.addManyToSet(draftSetId, ids)
    await refreshBasket()
    if (clearSelection) setSelected(new Set())
    notifications.show({ message: count ? `已加入 ${count} 题，自动跳过重复题目` : '所选题目已在组卷篮中', color: 'green' })
  })
  const toggleBasket = (id: number) => inBasket.has(id)
    ? runWrite(async () => {
      if (draftSetId == null) return
      await window.api.removeQuestionFromSet(draftSetId, id)
      await refreshBasket()
    })
    : addToBasket([id])
  const toggleSelected = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const visible = questions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allOnPage = visible.length > 0 && visible.every((q) => selected.has(q.id))
  const someOnPage = visible.some((q) => selected.has(q.id))
  const currentFolder = folders.find((f) => f.id === criteria.folder_id)
  const scopeName = currentFolder?.name ?? (criteria.unfiled ? '未归类' : '全部题目')
  const zoomIndex = questions.findIndex((q) => q.id === zoomId)
  const zoomQuestion = questions[zoomIndex] ?? null
  const labelFor = (rows: { id: number; name: string }[], id: number | null) => rows.find((r) => r.id === id)?.name ?? ''
  const previewLabels = zoomQuestion ? [
    labelFor(types, zoomQuestion.type_id), labelFor(chapters, zoomQuestion.chapter_id),
    labelFor(diffs, zoomQuestion.difficulty_id), zoomQuestion.effective_source,
    zoomQuestion.effective_year?.toString()
  ].filter((label): label is string => Boolean(label)) : []
  const clearFilters = () => { changeCriteria({}); setSearch('') }
  const activeCount = Object.values(criteria).filter((value) => Array.isArray(value) ? value.length > 0 : value != null && value !== false).length + (search.trim() ? 1 : 0)

  const filterPanel = <Stack gap="sm" p="sm">
    <Group justify="space-between">
      <Text fw={600}>我的题夹</Text>
      <Tooltip label="新建题夹"><ActionIcon variant="subtle" aria-label="新建题夹" disabled={busy}
        onClick={() => setFolderDialog({ mode: 'create', name: '' })}><IconPlus size={16} /></ActionIcon></Tooltip>
    </Group>
    <div>
      <NavLink component="button" label="全部题目" active={!criteria.folder_id && !criteria.unfiled} disabled={busy}
        onClick={() => changeCriteria({ ...criteria, folder_id: null, unfiled: false })} />
      <NavLink component="button" label="未归类" active={criteria.unfiled} disabled={busy}
        onClick={() => changeCriteria({ ...criteria, folder_id: null, unfiled: true })} />
      {folders.map((folder) => <NavLink component="button" key={folder.id} label={<Text size="sm" truncate>{folder.name}</Text>}
        leftSection={<IconFolder size={15} />} rightSection={<Badge size="xs" variant="light">{folder.question_count}</Badge>}
        active={criteria.folder_id === folder.id} disabled={busy}
        onClick={() => changeCriteria({ ...criteria, folder_id: folder.id, unfiled: false })} />)}
    </div>
    {currentFolder && <Group gap="xs">
      <Button size="compact-xs" variant="subtle" leftSection={<IconPencil size={13} />} disabled={busy}
        onClick={() => setFolderDialog({ mode: 'rename', id: currentFolder.id, name: currentFolder.name })}>重命名</Button>
      <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={13} />} disabled={busy}
        onClick={() => setFolderDialog({ mode: 'delete', id: currentFolder.id, name: currentFolder.name })}>删除题夹</Button>
    </Group>}
    <Text size="xs" c="dimmed">同一道好题可以放入多个题夹。</Text>
    <Divider />
    <Text fw={600} size="sm">组合筛选</Text>
    {([
      ['type_id', '题型', options(types)], ['paper_id', '来源试卷', options(papers)],
      ['difficulty_id', '难度', options(diffs)],
      ['year', '年份', yearSources.years.map((y) => ({ value: String(y), label: String(y) }))]
    ] as const).map(([key, label, data]) => <Select key={key} label={label} placeholder="全部" size="xs"
      data={data} searchable clearable disabled={busy} value={criteria[key] != null ? String(criteria[key]) : null}
      onChange={(v) => changeCriteria({ ...criteria, [key]: v ? Number(v) : null })} />)}
    <Select label="出处" data={yearSources.sources} searchable clearable placeholder="全部" size="xs" disabled={busy}
      value={criteria.source ?? null} onChange={(v) => changeCriteria({ ...criteria, source: v })} />
    <ChapterPicker chapters={chapters} value={criteria.chapter_id ?? null} disabled={busy} placeholder="全部章节（含下级）"
      onChange={(id) => changeCriteria({ ...criteria, chapter_id: id })} onRefresh={setChapters} />
    <KnowledgePointPicker label="知识点（命中任一）" points={kps} value={criteria.kp_ids ?? []} disabled={busy}
      onChange={(ids) => changeCriteria({ ...criteria, kp_ids: ids })} />
    <Select label="答案" placeholder="全部" clearable size="xs" disabled={busy}
      data={[{ value: 'with', label: '已匹配答案' }, { value: 'without', label: '未匹配答案' }]}
      value={criteria.answer_status ?? null} onChange={(v) => changeCriteria({ ...criteria, answer_status: v as 'with' | 'without' | null })} />
    <Button variant="subtle" size="xs" disabled={busy} onClick={clearFilters}>清除所有条件</Button>
  </Stack>

  return <div className="bank-workspace">
    {wide && <Paper withBorder className="bank-sidebar"><ScrollArea h="100%">{filterPanel}</ScrollArea></Paper>}
    <Drawer opened={!wide && filtersOpen} onClose={() => setFiltersOpen(false)} title="分类与筛选" size={300} closeButtonProps={{ 'aria-label': '关闭筛选' }}>
      {filterPanel}<Button fullWidth mt="md" onClick={() => setFiltersOpen(false)}>查看结果</Button>
    </Drawer>
    <div className="bank-content">
      <Group justify="space-between" wrap="wrap">
        <div><Title order={3}>我的题库</Title><Text size="sm" c="dimmed" lineClamp={1}>{scopeName}</Text></div>
        <Button variant="light" leftSection={<IconShoppingCart size={16} />} onClick={() => navigate('/basket')} disabled={busy}>
          组卷篮 · {inBasket.size}
        </Button>
      </Group>
      <Group gap="xs" wrap="nowrap">
        {!wide && <Button variant="default" leftSection={<IconFilter size={16} />} onClick={() => setFiltersOpen(true)}>分类 / 筛选{activeCount ? ` (${activeCount})` : ''}</Button>}
        <TextInput style={{ flex: 1 }} aria-label="搜索资料和标签" placeholder="搜索试卷名、出处、题型、章节、知识点"
          leftSection={<IconSearch size={16} />} value={search} disabled={busy} onChange={(e) => changeSearch(e.currentTarget.value)} />
        {activeCount > 0 && <Button variant="subtle" size="xs" disabled={busy} onClick={clearFilters}>清空条件</Button>}
      </Group>
      <Text size="xs" c="dimmed">搜索资料与标签，暂不搜索题图正文。翻页保留勾选，切换筛选会清空勾选。</Text>
      {metaError && <Alert color="red" title="无法读取分类"><Text size="sm">{metaError}</Text><Button size="xs" onClick={reloadMeta}>重试</Button></Alert>}
      <Paper withBorder p="xs">
        <Group justify="space-between" gap="xs">
          <Group gap="sm">
            <Checkbox label="选择本页" size="xs" checked={allOnPage} indeterminate={someOnPage && !allOnPage}
              disabled={busy || loading || !!error || !visible.length} onChange={() => setSelected((prev) => {
                const next = new Set(prev)
                visible.forEach((q) => allOnPage ? next.delete(q.id) : next.add(q.id))
                return next
              })} />
            <Text size="sm">{loading ? '正在查找…' : `${questions.length} 题`} · 已选 {selected.size} 题</Text>
          </Group>
          {selected.size > 0 && <Button variant="subtle" size="compact-xs" disabled={busy} onClick={() => setSelected(new Set())}>取消勾选</Button>}
        </Group>
        {selected.size > 0 && <Group gap="xs" mt="xs">
          <Button size="xs" disabled={busy || loading || !!error || draftSetId == null} onClick={() => addToBasket([...selected], true)}>加入组卷篮</Button>
          <Button size="xs" variant="light" disabled={busy || loading || !!error} onClick={() => { setDestination(null); setAddDialog(true) }}>加入题夹</Button>
          {currentFolder && <Button size="xs" variant="subtle" color="orange" disabled={busy || loading || !!error} onClick={() => runWrite(async () => {
            const count = await window.api.removeQuestionsFromFolder(currentFolder.id, [...selected])
            await refreshFolders(); setSelected(new Set()); setRevision((r) => r + 1)
            notifications.show({ message: `已从当前题夹移出 ${count} 题，原题仍保留`, color: 'green' })
          })}>移出当前题夹</Button>}
        </Group>}
      </Paper>
      <ScrollArea className="bank-results" offsetScrollbars key={`${page}-${JSON.stringify(criteria)}-${debouncedSearch}`}>
        {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text c="dimmed">正在读取题目</Text></Group>
          : error ? <Alert color="red" title="加载失败">{error}<Button ml="sm" size="xs" onClick={() => setRevision((r) => r + 1)}>重试</Button></Alert>
          : questions.length === 0 ? <Stack align="center" p="xl">
            <IconSearch size={32} /><Text fw={500}>没有找到题目</Text>
            <Text size="sm" c="dimmed">可以放宽筛选；新题夹可从“全部题目”勾选后加入。</Text>
            <Button variant="light" onClick={clearFilters}>查看全部题目</Button>
          </Stack> : <div className="bank-grid">
            {visible.map((q) => <Card key={q.id} withBorder p="sm" className="bank-card"
              style={{ borderColor: selected.has(q.id) ? 'var(--mantine-color-sky-5)' : undefined }}>
              <Group justify="space-between" mb="xs">
                <Checkbox label={`选中 #${q.id}`} size="xs" checked={selected.has(q.id)} disabled={busy} onChange={() => toggleSelected(q.id)} />
                <Badge size="xs" variant="light" color={q.answer_image_path ? 'teal' : 'gray'}>{q.answer_image_path ? '有答案' : '无答案'}</Badge>
              </Group>
              <button type="button" className="bank-image-button" aria-label={`预览题目 ${q.id}`} onClick={() => setZoomId(q.id)}>
                <img loading="lazy" src={`app://projects/${q.paper_id}/images/q_${q.id}.png`} alt={`第 ${q.order_in_paper} 题`} />
              </button>
              <Text size="sm" fw={500} mt="xs" lineClamp={1} title={q.paper_name}>{q.paper_name}</Text>
              <Text size="xs" c="dimmed">第 {q.order_in_paper ?? '—'} 题 · {labelFor(types, q.type_id) || '未标题型'}</Text>
              <Text size="xs" c="dimmed" lineClamp={1} mih={18}>{[q.effective_year, q.effective_source].filter(Boolean).join(' · ')}</Text>
              <Button size="xs" fullWidth mt="sm" variant="light" disabled={busy}
                onClick={() => navigate(`/questions/${q.id}/edit?from=/bank`)}>编辑题目与答案</Button>
              <Button size="xs" fullWidth mt="sm" variant={inBasket.has(q.id) ? 'light' : 'default'}
                disabled={busy || draftSetId == null} onClick={() => toggleBasket(q.id)}>
                {inBasket.has(q.id) ? '已入篮 · 点击移出' : '加入组卷篮'}
              </Button>
            </Card>)}
          </div>}
      </ScrollArea>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">每页 {PAGE_SIZE} 题</Text>
        <Pagination size="sm" total={Math.max(1, Math.ceil(questions.length / PAGE_SIZE))} value={page}
          siblings={0} disabled={loading || busy} onChange={setPage} />
      </Group>
    </div>
    <QuestionPreview question={zoomQuestion} labels={previewLabels} knowledgePoints={kps}
      inBasket={zoomQuestion ? inBasket.has(zoomQuestion.id) : false} busy={busy || draftSetId == null}
      onClose={() => setZoomId(null)} onBasket={() => { if (zoomQuestion) void toggleBasket(zoomQuestion.id) }}
      onPrevious={zoomIndex > 0 ? () => setZoomId(questions[zoomIndex - 1].id) : undefined}
      onNext={zoomIndex >= 0 && zoomIndex < questions.length - 1 ? () => setZoomId(questions[zoomIndex + 1].id) : undefined} />
    <Modal opened={folderDialog != null} onClose={() => { if (!busy) setFolderDialog(null) }} closeButtonProps={{ 'aria-label': '关闭题夹管理' }}
      title={folderDialog?.mode === 'delete' ? '删除题夹' : folderDialog?.mode === 'rename' ? '重命名题夹' : '新建题夹'}>
      {folderDialog && <Stack>
        {folderDialog.mode === 'delete'
          ? <Text>删除“{folderDialog.name}”？只删除题夹及归类关系，原题、答案和组卷篮均保留。</Text>
          : <TextInput label="题夹名称" placeholder="例如：高一力学精选、期末复习好题" maxLength={60} disabled={busy}
            data-autofocus value={folderDialog.name} onChange={(e) => setFolderDialog({ ...folderDialog, name: e.currentTarget.value })} />}
        <Button color={folderDialog.mode === 'delete' ? 'red' : undefined} loading={busy}
          disabled={folderDialog.mode !== 'delete' && !folderDialog.name.trim()} onClick={() => runWrite(async () => {
            if (folderDialog.mode === 'create') await window.api.createQuestionFolder(folderDialog.name)
            else if (folderDialog.mode === 'rename') await window.api.renameQuestionFolder(folderDialog.id!, folderDialog.name)
            else {
              await window.api.deleteQuestionFolder(folderDialog.id!)
              changeCriteria({ ...criteria, folder_id: null, unfiled: false })
            }
            await refreshFolders(); setFolderDialog(null)
          })}>{folderDialog.mode === 'delete' ? '删除题夹，保留原题' : '保存'}</Button>
      </Stack>}
    </Modal>
    <Modal opened={addDialog} onClose={() => { if (!busy) setAddDialog(false) }} title={`将 ${selected.size} 题加入题夹`} closeButtonProps={{ 'aria-label': '关闭归类' }}>
      <Stack>
        <Text size="sm" c="dimmed">保留已有归类，同题可以放入多个题夹。</Text>
        <Select label="目标题夹" searchable data={options(folders)} value={destination} disabled={busy} onChange={setDestination} placeholder="选择题夹" />
        {folders.length === 0 && <Button variant="subtle" onClick={() => { setAddDialog(false); setFolderDialog({ mode: 'create', name: '' }) }}>先新建一个题夹</Button>}
        <Button loading={busy} disabled={!destination || !selected.size} onClick={() => runWrite(async () => {
          const count = await window.api.addQuestionsToFolder(Number(destination), [...selected])
          await refreshFolders(); setSelected(new Set()); setAddDialog(false); setRevision((r) => r + 1)
          notifications.show({ message: `已归入 ${count} 题，自动跳过重复题目`, color: 'green' })
        })}>确认加入</Button>
      </Stack>
    </Modal>
  </div>
}

export default BankView
