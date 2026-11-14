import { useEffect, useRef, useState } from 'react'
import { Alert, Group, Select, SegmentedControl, Stack, Text } from '@mantine/core'
import type { IntakeViewport } from '@shared/intake'
import type { OcrCrop } from '@shared/ocr'

/** Only selects local pixels. The main process prepares the immutable upload copy. */
export function OcrImageSelection({ url, disabled, onChange, purpose = 'ocr', initialView, onView }: {
  url: string; disabled: boolean; purpose?: 'ocr' | 'intake'
  initialView?: IntakeViewport; onView?: (view: IntakeViewport) => void
  onChange: (crop: OcrCrop | null, scale: number, valid: boolean) => void
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(initialView?.zoom ?? 1)
  const scroll = useRef<HTMLDivElement>(null), restored = useRef(false)
  const viewCallback = useRef(onView); viewCallback.current = onView
  const reportView = () => {
    const node = scroll.current
    if (node && restored.current) viewCallback.current?.({ page: initialView?.page ?? 1, zoom, left: Math.max(0, Math.min(1, node.scrollLeft / Math.max(1, node.scrollWidth - node.clientWidth))), top: Math.max(0, Math.min(1, node.scrollTop / Math.max(1, node.scrollHeight - node.clientHeight))) })
  }
  useEffect(() => {
    if (!size || !scroll.current) return
    const node = scroll.current
    if (!restored.current) { node.scrollLeft = (initialView?.left ?? 0) * Math.max(0, node.scrollWidth - node.clientWidth); node.scrollTop = (initialView?.top ?? 0) * Math.max(0, node.scrollHeight - node.clientHeight); restored.current = true }
    reportView()
  }, [size, zoom])
  const [mode, setMode] = useState(purpose === 'intake' ? 'region' : 'full')
  const [selection, setSelection] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [scale, setScale] = useState('1')
  const [error, setError] = useState('')
  const dragging = useRef(false)
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const crop: OcrCrop | null = selection && size ? {
    x: Math.min(selection.x1, selection.x2), y: Math.min(selection.y1, selection.y2),
    width: Math.abs(selection.x2 - selection.x1), height: Math.abs(selection.y2 - selection.y1)
  } : null
  const cropKey = JSON.stringify(crop)
  useEffect(() => {
    onChangeRef.current(mode === 'region' ? crop : null, Number(scale),
      Boolean(size && !error && (mode === 'full' || crop && crop.width * size.width >= 5 && crop.height * size.height >= 5)))
  }, [mode, cropKey, scale, size, error])
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  return <Stack gap="xs" className={purpose === 'intake' ? 'intake-selection' : undefined}>
    <Group justify="space-between" align="end">
      <div>{purpose !== 'intake' && <Text fw={500} size="sm" mb={4}>识别范围</Text>}<SegmentedControl size="xs" value={mode} disabled={disabled}
        data={[{ value: 'full', label: '使用整页' }, { value: 'region', label: '框选一道题' }]} onChange={setMode} /></div>
      {purpose === 'intake' && <Select size="xs" w={115} aria-label="原稿视图缩放" value={String(zoom)} allowDeselect={false} disabled={disabled}
        data={[{ value: '0.5', label: '视图 50%' }, { value: '0.75', label: '视图 75%' }, { value: '1', label: '适合宽度' }, { value: '1.25', label: '视图 125%' }, { value: '1.5', label: '视图 150%' }, { value: '2', label: '视图 200%' }, { value: '3', label: '视图 300%' }]}
        onChange={(value) => { if (value) setZoom(Number(value)) }} />}
      <Select size="xs" w={120} aria-label="副本尺寸" label={purpose === 'intake' ? undefined : '上传副本尺寸'} description={purpose === 'intake' ? undefined : '只缩小副本，原图保留。'} value={scale} allowDeselect={false}
        disabled={disabled} data={[{ value: '1', label: '原始尺寸' }, { value: '0.75', label: '75%' }, { value: '0.5', label: '50%' }, { value: '0.25', label: '25%' }]}
        onChange={(value) => { if (value) setScale(value) }} />
    </Group>
    {error && <Alert color="red">{error}</Alert>}
    <div className="crop-scroll" ref={scroll} onScroll={reportView}>
      <div className="crop-surface" style={{ width: `${zoom * 100}%`, cursor: mode === 'region' && !disabled ? 'crosshair' : 'default' }}
        onPointerDown={(event) => {
          if (mode !== 'region' || !size || disabled || event.button !== 0) return
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true
          const next = point(event); setSelection({ x1: next.x, y1: next.y, x2: next.x, y2: next.y })
        }} onPointerMove={(event) => {
          if (!dragging.current) return
          const next = point(event); setSelection((old) => old ? { ...old, x2: next.x, y2: next.y } : old)
        }} onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }}>
        <img src={url} alt={purpose === 'intake' ? '录题原稿，可拖动框选' : '本次识别的原图'} draggable={false} onLoad={(event) => {
          setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setError('')
        }} onError={() => { setSize(null); setError('原图无法读取，请返回检查原图文件。') }} />
        {mode === 'region' && selection && <div className="crop-selection" style={{
          left: `${Math.min(selection.x1, selection.x2) * 100}%`, top: `${Math.min(selection.y1, selection.y2) * 100}%`,
          width: `${Math.abs(selection.x2 - selection.x1) * 100}%`, height: `${Math.abs(selection.y2 - selection.y1) * 100}%`
        }} />}
      </div>
    </div>
    <Text size="xs" c="dimmed">{size ? `原图 ${size.width} × ${size.height} 像素` : '正在读取原图…'}
      {mode === 'region' ? crop && size ? `；选区 ${Math.round(crop.width * size.width)} × ${Math.round(crop.height * size.height)} 像素` : '；请在图上拖动框选' : '；只处理当前这张图片'}</Text>
  </Stack>
}
