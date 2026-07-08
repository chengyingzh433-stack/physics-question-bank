import { useCallback, useEffect, useState } from 'react'
import {
  Grid,
  Stack,
  Text,
  TextInput,
  Button,
  ActionIcon,
  Badge,
  Group,
  Paper,
  Tooltip,
  Divider
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash, IconLock } from '@tabler/icons-react'
import type { QuestionTypeDTO } from '@shared/types'
import TemplateRulesEditor from '../components/TemplateRulesEditor'

function TemplateView(): React.JSX.Element {
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string; created_at: string }[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTplName, setNewTplName] = useState('')

  const reloadTypes = useCallback(async () => {
    setTypes(await window.api.listQuestionTypes())
  }, [])
  const reloadTemplates = useCallback(async () => {
    setTemplates(await window.api.listTemplates())
  }, [])

  useEffect(() => {
    reloadTypes()
    reloadTemplates()
  }, [reloadTypes, reloadTemplates])

  const handleCreateType = useCallback(async () => {
    if (!newTypeName.trim()) return
    await window.api.createQuestionType(newTypeName.trim())
    setNewTypeName('')
    await reloadTypes()
    notifications.show({ message: '题型已添加', color: 'green' })
  }, [newTypeName, reloadTypes])

  const handleDeleteType = useCallback(
    async (id: number) => {
      const ok = await window.api.deleteQuestionType(id)
      if (!ok) {
        notifications.show({ message: '内置题型不可删除', color: 'orange' })
        return
      }
      await reloadTypes()
    },
    [reloadTypes]
  )

  const handleCreateTemplate = useCallback(async () => {
    if (!newTplName.trim()) return
    const id = await window.api.createTemplate(newTplName.trim())
    setNewTplName('')
    await reloadTemplates()
    setSelected(id)
  }, [newTplName, reloadTemplates])

  const handleDeleteTemplate = useCallback(
    async (id: number) => {
      modals.openConfirmModal({
        title: '删除模板',
        children: <Text size="sm">确定删除此模板及其所有规则？</Text>,
        labels: { confirm: '确认删除', cancel: '取消' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          await window.api.deleteTemplate(id)
          if (selected === id) setSelected(null)
          await reloadTemplates()
        }
      })
    },
    [selected, reloadTemplates]
  )

  return (
    <Stack gap="md">
      <Text size="xl" fw={700}>
        题型与模板管理
      </Text>

      <Grid>
        {/* 左栏:题型 */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="md" radius="md" withBorder>
            <Text fw={600} mb="sm">
              题型
            </Text>
            <Stack gap={4}>
              {types.map((t) => (
                <Group key={t.id} justify="space-between" wrap="nowrap">
                  <Group gap={4} wrap="nowrap">
                    {t.is_builtin && (
                      <Tooltip label="内置题型，不可删除">
                        <IconLock size={14} color="var(--mantine-color-gray-5)" />
                      </Tooltip>
                    )}
                    <Text size="sm">{t.name}</Text>
                    {t.is_builtin && (
                      <Badge size="xs" variant="light" color="gray">
                        内置
                      </Badge>
                    )}
                  </Group>
                  {!t.is_builtin && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => handleDeleteType(t.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              ))}
            </Stack>
            <Divider my="sm" />
            <Group>
              <TextInput
                placeholder="新题型名"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.currentTarget.value)}
                style={{ flex: 1 }}
                size="sm"
              />
              <Button size="sm" leftSection={<IconPlus size={14} />} onClick={handleCreateType}>
                添加
              </Button>
            </Group>
          </Paper>
        </Grid.Col>

        {/* 右栏:模板 */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" radius="md" withBorder>
            <Text fw={600} mb="sm">
              模板
            </Text>
            <Stack gap={4}>
              {templates.map((t) => (
                <Group key={t.id} justify="space-between" wrap="nowrap">
                  <Text
                    size="sm"
                    fw={selected === t.id ? 700 : 400}
                    c={selected === t.id ? 'sky.7' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(t.id)}
                  >
                    {t.name}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => handleDeleteTemplate(t.id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
            <Divider my="sm" />
            <Group>
              <TextInput
                placeholder="新模板名"
                value={newTplName}
                onChange={(e) => setNewTplName(e.currentTarget.value)}
                style={{ flex: 1 }}
                size="sm"
              />
              <Button size="sm" variant="light" leftSection={<IconPlus size={14} />} onClick={handleCreateTemplate}>
                新建模板
              </Button>
            </Group>

            {/* 选中模板的规则编辑——使用共享组件 */}
            <TemplateRulesEditor templateId={selected} types={types} />
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

export default TemplateView
