import { useEffect, useState } from 'react'
import { Badge, Button, Group, Modal, Stack, Text, Divider } from '@mantine/core'
import type { BankQuestionDTO, KnowledgePointDTO } from '@shared/types'

interface Props {
  question: BankQuestionDTO | null
  labels: string[]
  knowledgePoints: KnowledgePointDTO[]
  inBasket: boolean
  busy: boolean
  onClose: () => void
  onBasket: () => void
  onPrevious?: () => void
  onNext?: () => void
}

export function QuestionPreview({ question, labels, knowledgePoints, inBasket, busy, onClose, onBasket, onPrevious, onNext }: Props) {
  const [kpIds, setKpIds] = useState<number[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setKpIds([])
    setError('')
    if (question) window.api.getQuestionKnowledgePoints(question.id)
      .then((ids) => { if (active) setKpIds(ids) })
      .catch(() => { if (active) setError('知识点加载失败，可关闭后重试') })
    return () => { active = false }
  }, [question?.id])

  return <Modal opened={question != null} onClose={onClose} size="xl" closeButtonProps={{ 'aria-label': '关闭题目预览' }}
    title={question ? `${question.paper_name} · 第 ${question.order_in_paper ?? '—'} 题 · #${question.id}` : '题目预览'}>
    {question && <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="default" size="xs" disabled={!onPrevious} onClick={onPrevious}>上一题</Button>
          <Button variant="default" size="xs" disabled={!onNext} onClick={onNext}>下一题</Button>
        </Group>
        <Button size="xs" variant={inBasket ? 'light' : 'filled'} disabled={busy} onClick={onBasket}>
          {inBasket ? '移出组卷篮' : '加入组卷篮'}
        </Button>
      </Group>
      <Group gap="xs">
        {labels.map((label, i) => <Badge key={`${i}-${label}`} variant="light">{label}</Badge>)}
        {kpIds.map((id) => <Badge key={id} variant="outline">{knowledgePoints.find((kp) => kp.id === id)?.name ?? `知识点 ${id}`}</Badge>)}
      </Group>
      {error && <Text c="red" size="sm">{error}</Text>}
      <img src={`app://projects/${question.paper_id}/images/q_${question.id}.png`}
        alt={`第 ${question.order_in_paper} 题完整题图`} style={{ width: '100%', background: 'white' }} />
      <Divider label="参考答案" />
      {question.answer_image_path
        ? <img src={`app://projects/${question.paper_id}/images/a_${question.id}.png`}
          alt="参考答案" style={{ width: '100%', background: 'white' }} />
        : <Text size="sm" c="dimmed">未匹配答案</Text>}
    </Stack>}
  </Modal>
}
