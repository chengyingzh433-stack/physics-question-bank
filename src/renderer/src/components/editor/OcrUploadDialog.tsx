import { useRef, useState } from 'react'
import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import type { QuestionContentInput } from '@shared/editable'
import { ocrDraftFingerprint, type OcrCrop, type OcrJobDTO, type OcrPart, type OcrPreparedInput } from '@shared/ocr'
import { OcrImageSelection } from './OcrImageSelection'
import { ocrErrorMessage } from './ocrMessages'

export function OcrUploadDialog({ opened, questionId, part, sourceUrl, onClose, currentDraft, onStarted }: {
  opened: boolean; questionId: number; part: OcrPart; sourceUrl: string
  onClose: () => void; currentDraft: () => { content: QuestionContentInput; revision: number }
  onStarted: (job: OcrJobDTO) => void
}) {
  const [crop, setCrop] = useState<OcrCrop | null>(null)
  const [scale, setScale] = useState(1)
  const [valid, setValid] = useState(false)
  const [prepared, setPrepared] = useState<OcrPreparedInput | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const prepare = async () => {
    if (lock.current || !valid) return
    lock.current = true; setBusy(true); setError('')
    try { setPrepared(await window.api.prepareOcrInput(questionId, part, crop, scale)); setConfirmed(false) }
    catch (e) { setError(String(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  const start = async () => {
    if (!prepared || !confirmed || prepared.bytes > 7 * 1024 * 1024 || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const draft = currentDraft()
      const job = await window.api.startOcrJob({ inputToken: prepared.token, expectedRevision: draft.revision,
        draftFingerprint: ocrDraftFingerprint(draft.content), confirmed: true })
      onStarted(job); onClose()
    } catch (e) { setError(String(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Modal opened={opened} onClose={() => { if (!busy) onClose() }} title={`识别${part === 'question' ? '题干' : '答案'}原图`} size="xl"
    closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
    <Stack>
      {error && <Alert color="red">{ocrErrorMessage(error)}</Alert>}
      {!prepared ? <>
        <Alert color="blue">先在本机准备副本，再确认上传。只处理此题的{part === 'question' ? '题干' : '答案'}，原图和其他题目均保留。</Alert>
        <OcrImageSelection url={sourceUrl} disabled={busy} onChange={(nextCrop, nextScale, nextValid) => { setCrop(nextCrop); setScale(nextScale); setValid(nextValid) }} />
        <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={onClose}>取消</Button>
          <Button loading={busy} disabled={!valid} onClick={() => void prepare()}>生成上传预览</Button></Group>
      </> : <>
        <Text fw={600}>以下就是将发送给 Doc2X 的图片副本</Text>
        <div className="crop-scroll"><img src={prepared.previewDataUrl} alt="待确认上传的识别副本" style={{ display: 'block', maxWidth: '100%', margin: 'auto', background: 'white' }} /></div>
        <Text size="sm">{prepared.width} × {prepared.height} 像素 · {(prepared.bytes / 1024 / 1024).toFixed(2)} MiB · {prepared.crop ? '所选区域' : '整张原图'} · 缩放 {Math.round(prepared.scale * 100)}%</Text>
        {prepared.bytes > 7 * 1024 * 1024 && <Alert color="orange">副本超过 7 MiB，请返回缩小范围或尺寸后再预览。</Alert>}
        <Checkbox checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.currentTarget.checked)}
          label="我确认将以上图片上传至 Doc2X，并使用账户的一次单图解析额度。" />
        <Text size="xs" c="dimmed">识别结果会先存为候选，不自动覆盖编辑稿。提交状态不明时不会自动重新扣次提交。</Text>
        <Group justify="space-between"><Button variant="default" disabled={busy} onClick={() => { setPrepared(null); setConfirmed(false) }}>返回调整副本</Button>
          <Button loading={busy} disabled={!confirmed || prepared.bytes > 7 * 1024 * 1024} onClick={() => void start()}>确认上传并识别</Button></Group>
      </>}
    </Stack>
  </Modal>
}
