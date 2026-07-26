import { useCallback, useEffect, useState } from 'react'
import {
  Text,
  Button,
  ActionIcon,
  Table,
  Select,
  NumberInput,
  Group,
  Divider
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { QuestionTypeDTO, TemplateRuleDTO } from '@shared/types'

interface TemplateRulesEditorProps {
  /** 当前选中的模板 id，null 时不渲染 */
  templateId: number | null
  /** 题型列表（用于 Select 和名称显示） */
  types: QuestionTypeDTO[]
  /** 规则变更后的回调（可选，用于通知父组件刷新） */
  onChange?: () => void
}

/**
 * 模板规则编辑器——共享组件。
 * 从 TemplateView 抽出，供 TemplateView / PaperReviewView / PostProcessView 复用。
 *
 * 红线：只管规则增删，不管题型/模板列表管理。
 * 红线：编辑模板不自动改已入库题目。
 */
function TemplateRulesEditor({ templateId, types, onChange }: TemplateRulesEditorProps): React.JSX.Element | null {
  const [rules, setRules] = useState<TemplateRuleDTO[]>([])
  const [fromNo, setFromNo] = useState<number | string>(1)
  const [toNo, setToNo] = useState<number | string>(5)
  const [ruleType, setRuleType] = useState<string | null>(null)

  useEffect(() => {
    if (templateId == null) {
      setRules([])
      return
    }
    window.api.listRules(templateId).then(setRules)
  }, [templateId])

  const handleAddRule = useCallback(async () => {
    if (templateId == null || ruleType == null) return
    await window.api.addRule(templateId, {
      from_no: Number(fromNo),
      to_no: Number(toNo),
      type_id: Number(ruleType),
      rule_order: rules.length
    })
    setRules(await window.api.listRules(templateId))
    onChange?.()
  }, [templateId, ruleType, fromNo, toNo, rules.length, onChange])

  const handleDeleteRule = useCallback(async (ruleId: number) => {
    if (templateId == null) return
    await window.api.deleteRule(ruleId)
    setRules(await window.api.listRules(templateId))
    onChange?.()
  }, [templateId, onChange])

  const typeSelectData = types.map((t) => ({ value: String(t.id), label: t.name }))

  if (templateId == null) return null

  return (
    <>
      <Divider my="sm" />
      <Text fw={600} size="sm" mb="xs">
        区间规则
      </Text>
      {rules.length > 0 && (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>起始题号</Table.Th>
              <Table.Th>结束题号</Table.Th>
              <Table.Th>题型</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rules.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.from_no}</Table.Td>
                <Table.Td>{r.to_no}</Table.Td>
                <Table.Td>
                  {types.find((t) => t.id === r.type_id)?.name ?? '?'}
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => handleDeleteRule(r.id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Group mt="sm" gap="xs" align="flex-end">
        <NumberInput
          label="起始"
          value={fromNo}
          onChange={(v) => setFromNo(v)}
          min={1}
          size="sm"
          w={70}
        />
        <Text size="sm" mt="lg">
          –
        </Text>
        <NumberInput
          label="结束"
          value={toNo}
          onChange={(v) => setToNo(v)}
          min={1}
          size="sm"
          w={70}
        />
        <Select
          label="题型"
          data={typeSelectData}
          value={ruleType}
          onChange={setRuleType}
          size="sm"
          w={120}
          placeholder="选题型"
        />
        <Button
          size="sm"
          leftSection={<IconPlus size={14} />}
          onClick={handleAddRule}
          disabled={ruleType == null}
          mt="lg"
        >
          添加规则
        </Button>
      </Group>
    </>
  )
}

export default TemplateRulesEditor
