import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Modal, Stack, Text, Divider, SegmentedControl } from '@mantine/core'
import type { BankQuestionDTO, KnowledgePointDTO } from '@shared/types'
import { useNavigate } from 'react-router-dom'
import { assetUrl, type EditableQuestionDTO } from '@shared/editable'
import { SavedQuestionBody } from './SavedQuestionBody'

interface Props {
  question: BankQuestionDTO | null
  detail?: EditableQuestionDTO
  error?: string
  onRetry: () => void
  labels: string[]
  knowledgePoints: KnowledgePointDTO[]
  inBasket: boolean
  busy: boolean
  onClose: () => void
  onBasket: () => void
  onPrevious?: () => void
  onNext?: () => void
}

export function QuestionPreview({ question, detail, error, onRetry, labels, knowledgePoints, inBasket, busy, onClose, onBasket, onPrevious, onNext }: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('latest')
  useEffect(() => { setMode('latest') }, [question?.id])
  const kpIds = detail?.metadata.knowledgePointIds ?? []

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
        <Button size="xs" variant="light" disabled={busy} onClick={() => navigate(`/questions/${question.id}/edit?from=/bank`)}>编辑题目 / 标签</Button>
        {labels.map((label, i) => <Badge key={`${i}-${label}`} variant="light">{label}</Badge>)}
        {kpIds.map((id) => <Badge key={id} variant="outline">{knowledgePoints.find((kp) => kp.id === id)?.name ?? `知识点 ${id}`}</Badge>)}
      </Group>
      <SegmentedControl aria-label="题卡内容版本" value={mode} onChange={setMode}
        data={[{ value: 'latest', label: '最新保存的题卡' }, { value: 'original', label: '对照原图' }]} />
      {mode === 'original' ? <>
        <Text size="xs" c="dimmed">原图保持录入时的样子，手工修改请查看最新题卡。</Text>
        {question.image_path && <img className="saved-question-original" src={assetUrl(question.image_path)} alt="原始题图" />}
        <Divider label="原始参考答案" />
        {question.answer_image_path ? <img className="saved-question-original" src={assetUrl(question.answer_image_path)} alt="原始答案图" /> : <Text size="sm" c="dimmed">没有原始答案图。手工录入的答案请查看最新题卡。</Text>}
      </> : error ? <Alert color="red">{error}<Button ml="sm" size="xs" onClick={onRetry}>重新读取</Button></Alert> : detail ? <>
        <Text size="xs" c="dimmed">{mode === 'latest' ? `编辑稿优先显示${detail.content ? ` · 版本 ${detail.content.revision}` : ''}；未编辑的部分显示原图。` : '原图保持录入时的样子。'}</Text>
        <div className="saved-question-paper"><SavedQuestionBody detail={detail} original={mode === 'original'} /></div>
        <Divider label="参考答案" />
        <div className="saved-question-paper"><SavedQuestionBody detail={detail} answer original={mode === 'original'} /></div>
      </> : <Loader size="sm" />}
    </Stack>}
  </Modal>
}
