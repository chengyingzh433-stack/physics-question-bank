import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Modal, SegmentedControl, Stack, Text } from '@mantine/core'

type Point = { x: number; y: number }
type Selection = { start: Point; end: Point }
type Source = { label: string; url: string }

export function ImageCropDialog({ opened, sources, onClose, onSave }: {
  opened: boolean; sources: Source[]; onClose: () => void
  onSave: (data: ArrayBuffer, name: string) => Promise<void>
}) {
  const [sourceIndex, setSourceIndex] = useState('0')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const image = useRef<HTMLImageElement>(null)
  const dragging = useRef(false)
  const source = sources[Number(sourceIndex)] ?? sources[0]
  const currentSourceUrl = useRef(source?.url)
  currentSourceUrl.current = source?.url
  useEffect(() => { if (opened) { setSourceIndex('0'); setSelection(null); setError(''); dragging.current = false } }, [opened])
  useEffect(() => {
    const current = image.current
    // Modal transitions can retain a fully loaded image across close/reopen.
    // In that case no new load event fires, so read the existing image state.
    setImageReady(Boolean(opened && current?.complete && current.naturalWidth > 0 && current.getAttribute('src') === source?.url))
  }, [opened, source?.url])
  const point = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  const box = selection ? {
    x: Math.min(selection.start.x, selection.end.x), y: Math.min(selection.start.y, selection.end.y),
    width: Math.abs(selection.end.x - selection.start.x), height: Math.abs(selection.end.y - selection.start.y)
  } : null
  const crop = async () => {
    if (!box || !image.current || !imageReady || busy) return
    setBusy(true); setError('')
    try {
      const original = image.current
      const x = Math.floor(box.x * original.naturalWidth), y = Math.floor(box.y * original.naturalHeight)
      const width = Math.max(1, Math.round(box.width * original.naturalWidth))
      const height = Math.max(1, Math.round(box.height * original.naturalHeight))
      if (width < 5 || height < 5) throw new Error('选区太小，请重新框选至少 5 × 5 像素的区域。')
      const canvas = document.createElement('canvas')
      // Bound memory usage while preserving the original source file untouched.
      const scale = Math.min(1, 6000 / Math.max(width, height))
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建裁图画布')
      context.drawImage(original, x, y, width, height, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片编码失败')), 'image/png'))
      await onSave(await blob.arrayBuffer(), `${source.label}裁图.png`)
      onClose()
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  return <Modal opened={opened} onClose={() => { if (!busy) onClose() }} closeOnEscape={!busy} closeOnClickOutside={!busy}
    withCloseButton={!busy} title="从原图提取配图" size="xl">
    <Stack>
      <Text size="sm" c="dimmed">拖动框选所需图形，生成独立配图。原题图和答案图会完整保留。</Text>
      {sources.length > 1 && <SegmentedControl value={sourceIndex} disabled={busy} data={sources.map((item, i) => ({ value: String(i), label: item.label }))}
        onChange={(value) => { setSourceIndex(value); setSelection(null); setImageReady(false); setError('') }} />}
      {error && <Alert color="red">{error}</Alert>}
      <div className="crop-scroll">
        {source && <div className="crop-surface" onPointerDown={(event) => {
          if (!imageReady || busy || event.button !== 0) return
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
          dragging.current = true; const start = point(event); setSelection({ start, end: start })
        }} onPointerMove={(event) => {
          if (!dragging.current) return
          const end = point(event); setSelection((prev) => prev ? { ...prev, end } : prev)
        }} onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }}>
          <img key={source.url} ref={image} src={source.url} crossOrigin="anonymous" alt={source.label} draggable={false}
            onLoad={(event) => {
              const loaded = event.currentTarget
              if (loaded.getAttribute('src') === currentSourceUrl.current && loaded === image.current) {
                setImageReady(loaded.complete && loaded.naturalWidth > 0)
              }
            }} onError={(event) => {
              if (event.currentTarget.getAttribute('src') !== currentSourceUrl.current || event.currentTarget !== image.current) return
              setImageReady(false); setError('原图读取失败，请关闭后重试。')
            }} />
          {box && <div className="crop-selection" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
        </div>}
      </div>
      <Group justify="space-between"><Button variant="subtle" disabled={busy || !imageReady}
        onClick={() => setSelection({ start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })}>选取整张图</Button>
        <Group><Button variant="default" disabled={busy} onClick={onClose}>取消</Button>
          <Button disabled={!box || box.width === 0 || box.height === 0 || !imageReady} loading={busy} onClick={() => void crop()}>保存配图并插入</Button></Group>
      </Group>
    </Stack>
  </Modal>
}
