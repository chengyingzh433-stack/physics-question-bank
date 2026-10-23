import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { ChapterDTO, ChapterTemplateDTO } from '@shared/types'
import { CHAPTER_TEMPLATES } from '@shared/chapterTemplates'

/** 同一菜单同时呈现模板层级和个人章节；完整路径也参与搜索。 */
export function chapterOptions(chapters: ChapterDTO[]) {
  const groups = new Map<string, { value: string; label: string }[]>()
  for (const chapter of chapters) {
    const template = CHAPTER_TEMPLATES.find((item) => item.key === chapter.template_key)
    const group = template ? `${template.name} · ${chapter.name.split(' / ')[0]}` : '自定义章节'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push({ value: String(chapter.id), label: chapter.name })
  }
  return Array.from(groups, ([group, items]) => ({ group, items }))
}

interface Props {
  chapters: ChapterDTO[]
  value: number | null
  onChange: (id: number | null) => Promise<void> | void
  onRefresh?: (chapters: ChapterDTO[]) => void
  placeholder?: string
  disabled?: boolean
}

export function ChapterPicker({ chapters, value, onChange, onRefresh, placeholder, disabled }: Props) {
  const [opened, setOpened] = useState(false)
  const [templates, setTemplates] = useState<ChapterTemplateDTO[]>([])
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = chapterOptions(chapters)
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() }
    catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  const openManager = () => {
    setOpened(true)
    void run(async () => {
      const rows = await window.api.listChapterTemplates()
      setTemplates(rows); setTemplateKey((prev) => prev ?? rows[0]?.key ?? null)
    })
  }
  const choose = async (id: number | null) => {
    setBusy(true)
    try { await onChange(id) }
    catch (e) { notifications.show({ title: '章节保存失败', message: String(e), color: 'red' }) }
    finally { setBusy(false) }
  }
  const selectedTemplate = templates.find((item) => item.key === templateKey)
  return <Stack gap={4}>
    <Select label="章节" data={data} value={value == null ? null : String(value)}
      onChange={(id) => void choose(id == null ? null : Number(id))}
      searchable clearable size="xs" disabled={disabled || busy} maxDropdownHeight={280}
      placeholder={placeholder ?? '选择章节，或输入关键词'} nothingFoundMessage="没有匹配章节，可在下方自定义"
      styles={{ option: { whiteSpace: 'normal', overflowWrap: 'anywhere' } }} />
    {onRefresh && <Button variant="subtle" size="compact-xs" style={{ alignSelf: 'flex-start' }}
      disabled={disabled || busy} onClick={openManager}>章节模板 / 自定义</Button>}
    <Modal opened={opened} onClose={() => !busy && setOpened(false)} title="章节模板与自定义" centered
      closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack>
        {error && <Alert color="red" title="操作未完成">{error}</Alert>}
        <Text size="sm" c="dimmed">套用模板会补充预设目录，已有章节和题目归类会保留。</Text>
        <Select label="预设模板" data={templates.map((item) => ({ value: item.key, label: item.name }))}
          value={templateKey} onChange={setTemplateKey} disabled={busy} searchable nothingFoundMessage="暂无匹配模板" />
        {selectedTemplate && <Text size="xs" c="dimmed">{selectedTemplate.node_count} 个目录节点 · {selectedTemplate.installed ? '已装入，可补齐缺项' : '尚未装入'}</Text>}
        <Button variant="light" disabled={!templateKey || busy} loading={busy} onClick={() => void run(async () => {
          await window.api.installChapterTemplate(templateKey!)
          onRefresh?.(await window.api.listChapters())
          setTemplates(await window.api.listChapterTemplates())
          notifications.show({ message: '章节模板已就绪，可以直接选择', color: 'green' })
        })}>套用章节模板</Button>
        <Text fw={600} size="sm" mt="sm">自定义章节</Text>
        <Select label="上级章节" data={data} value={parentId} onChange={setParentId} clearable searchable
          placeholder="不选则新建顶级章节" disabled={busy} maxDropdownHeight={220}
          styles={{ option: { whiteSpace: 'normal' } }} />
        <TextInput label="章节名称" placeholder="例如：力学综合专题" value={name}
          onChange={(event) => setName(event.currentTarget.value)} disabled={busy} maxLength={100} />
        <Group justify="flex-end"><Button disabled={busy || !name.trim()} onClick={() => void run(async () => {
          const id = await window.api.createChapter(name.trim(), parentId == null ? null : Number(parentId))
          onRefresh?.(await window.api.listChapters())
          await onChange(id)
          setName(''); setOpened(false)
        })}>新建章节并选中</Button></Group>
      </Stack>
    </Modal>
  </Stack>
}
