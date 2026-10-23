import { useState } from 'react'
import { Button, MultiSelect, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'

interface Props {
  points: { id: number; name: string }[]
  value: number[]
  onChange: (ids: number[]) => Promise<void> | void
  onCreate?: (name: string) => Promise<void>
  disabled?: boolean
  label?: string
}

export function KnowledgePointPicker({ points, value, onChange, onCreate, disabled, label = '知识点' }: Props) {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const term = search.trim()
  const exactMatch = points.some((point) => point.name.toLocaleLowerCase() === term.toLocaleLowerCase())
  const canCreate = Boolean(onCreate && term && !exactMatch)
  const save = async (action: () => Promise<void> | void) => {
    if (busy) return
    setBusy(true)
    try { await action(); setSearch('') }
    catch (e) { notifications.show({ title: '知识点保存失败', message: String(e), color: 'red' }) }
    finally { setBusy(false) }
  }
  return <Stack gap={4}>
    <MultiSelect label={label} data={points.map((point) => ({ value: String(point.id), label: point.name }))}
      value={value.map(String)} onChange={(ids) => void save(() => onChange(ids.map(Number)))}
      searchable clearable hidePickedOptions size="xs" searchValue={search} onSearchChange={setSearch}
      placeholder="输入前几个字查找，可多选" disabled={disabled || busy} maxDropdownHeight={210} limit={8}
      nothingFoundMessage={onCreate ? '未找到匹配项，点击输入框右侧新建' : '没有匹配的知识点'}
      rightSectionWidth={canCreate ? 92 : undefined}
      rightSectionPointerEvents={canCreate ? 'all' : undefined}
      rightSection={canCreate ? <Button variant="light" size="compact-xs" loading={busy}
        disabled={disabled || busy} aria-label={`新建并选中「${term}」`} title={`新建并选中「${term}」`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void save(() => onCreate!(term))}>新建并选中</Button> : undefined}
      filter={({ options, search: query, limit }) => {
        const keyword = query.trim().toLocaleLowerCase()
        const rows = options.filter((item): item is { value: string; label: string } => 'value' in item)
        const matches = rows.filter((item) => item.label.toLocaleLowerCase().includes(keyword))
        matches.sort((a, b) => Number(b.label.toLocaleLowerCase().startsWith(keyword)) - Number(a.label.toLocaleLowerCase().startsWith(keyword)))
        return matches.slice(0, limit)
      }} />
  </Stack>
}
