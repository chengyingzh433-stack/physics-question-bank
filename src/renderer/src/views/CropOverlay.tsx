import { useRef, useState, useCallback, type MouseEvent } from 'react'
import type { PageDTO, ColumnDividerDTO, CutLineDTO, ManualBoxDTO } from '@shared/types'
import type { ToolMode } from './CropView'

interface CropOverlayProps {
  page: PageDTO
  dividers: ColumnDividerDTO[]
  cutLines: CutLineDTO[]
  manualBoxes: ManualBoxDTO[]
  toolMode: ToolMode
  onReplaceDividers: (xRatios: number[]) => void
  onAddCutLine: (colIndex: number, yRatio: number) => void
  onDeleteCutLine: (cutLineId: number) => void
  onAddManualBox: (x0: number, y0: number, x1: number, y1: number, isExcluded: number) => void
  onDeleteManualBox: (boxId: number) => void
}

const EPS = 0.02 // A13: 拖动时不越过相邻线/边界的最小间距

/** 计算某列的 x 区间 [xStart, xEnd]（比例）。 */
function colXRange(colIndex: number, mode: number, dividers: ColumnDividerDTO[]): [number, number] {
  const xs = [0, ...dividers.map((d) => d.x_ratio).sort((a, b) => a - b).slice(0, mode - 1), 1]
  const clamped = xs.map((x) => Math.max(0, Math.min(1, x)))
  const start = clamped[Math.min(colIndex, clamped.length - 1)] ?? 0
  const end = clamped[Math.min(colIndex + 1, clamped.length - 1)] ?? 1
  return [start, end]
}

/** 从鼠标事件算出比例坐标。 */
function clientToRatio(e: MouseEvent, el: HTMLElement): { xRatio: number; yRatio: number } {
  const rect = el.getBoundingClientRect()
  return {
    xRatio: (e.clientX - rect.left) / rect.width,
    yRatio: (e.clientY - rect.top) / rect.height
  }
}

function CropOverlay(props: CropOverlayProps): React.JSX.Element | null {
  const { page, dividers, cutLines, manualBoxes, toolMode } = props
  const mode = page.column_mode
  const hostRef = useRef<HTMLDivElement>(null)

  // 分隔线拖动状态
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // 横切预览状态
  const [hoverY, setHoverY] = useState<number | null>(null)
  const [hoverCol, setHoverCol] = useState<number>(0)
  const [hoverDivider, setHoverDivider] = useState<number | null>(null)
  const [justPlacedLine, setJustPlacedLine] = useState<number | null>(null)

  // 框选拖动状态（独立于分隔线拖动，避免串味）
  const [boxDragStart, setBoxDragStart] = useState<{ x: number; y: number } | null>(null)
  const [boxDragEnd, setBoxDragEnd] = useState<{ x: number; y: number } | null>(null)

  // 鼠标在某列内 → 该列 index
  const colAtX = useCallback(
    (clientX: number): number => {
      const el = hostRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect() // A4: 天然含缩放
      const xRatio = (clientX - rect.left) / rect.width
      for (let c = 0; c < mode; c++) {
        const [xs, xe] = colXRange(c, mode, dividers)
        if (xRatio >= xs && xRatio <= xe) return c
      }
      return Math.max(0, mode - 1)
    },
    [mode, dividers]
  )

  // ---- 分隔线拖动（A13: clamp 到相邻±EPS）----
  const onDividerMouseDown = (e: MouseEvent, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDragIdx(idx)
  }

  const onHostMouseMove = (e: MouseEvent) => {
    const el = hostRef.current
    if (!el) return
    const { xRatio, yRatio } = clientToRatio(e, el)

    if (dragIdx !== null) {
      // 拖动分隔线
      const left = dragIdx === 0 ? EPS : (dividers[dragIdx - 1]?.x_ratio ?? EPS) + EPS
      const right =
        dragIdx >= dividers.length - 1
          ? 1 - EPS
          : (dividers[dragIdx + 1]?.x_ratio ?? 1 - EPS) - EPS
      const clamped = Math.max(left, Math.min(right, xRatio))
      const newXs = dividers.map((d, i) => (i === dragIdx ? clamped : d.x_ratio))
      props.onReplaceDividers(newXs)
      return
    }

    // 框选拖动中 → 更新终点
    if (boxDragStart !== null) {
      setBoxDragEnd({ x: xRatio, y: yRatio })
      return
    }

    // 横切模式：跟随光标画示意线（限当前列）
    if (toolMode === 'cut') {
      const c = colAtX(e.clientX)
      setHoverCol(c)
      setHoverY(Math.max(0, Math.min(1, yRatio)))
    }
  }

  const onHostMouseDown = (e: MouseEvent) => {
    if (toolMode !== 'box-split' && toolMode !== 'box-exclude') return
    if (dragIdx !== null) return
    const el = hostRef.current
    if (!el) return
    const { xRatio, yRatio } = clientToRatio(e, el)
    setBoxDragStart({ x: xRatio, y: yRatio })
    setBoxDragEnd({ x: xRatio, y: yRatio })
  }

  const onHostMouseUp = () => {
    // 分隔线拖动结束
    if (dragIdx !== null) {
      setDragIdx(null)
      return
    }

    // 框选落框
    if (boxDragStart !== null && boxDragEnd !== null) {
      const x0 = Math.min(boxDragStart.x, boxDragEnd.x)
      const x1 = Math.max(boxDragStart.x, boxDragEnd.x)
      const y0 = Math.min(boxDragStart.y, boxDragEnd.y)
      const y1 = Math.max(boxDragStart.y, boxDragEnd.y)
      const isExcluded = toolMode === 'box-exclude' ? 1 : 0
      // 只有拖出一定面积才落框（避免误触）
      if (x1 - x0 > 0.01 && y1 - y0 > 0.01) {
        props.onAddManualBox(x0, y0, x1, y1, isExcluded)
      }
      setBoxDragStart(null)
      setBoxDragEnd(null)
      return
    }
  }

  const onHostMouseLeave = () => {
    setDragIdx(null)
    setHoverY(null)
    setHoverDivider(null)
    setBoxDragStart(null)
    setBoxDragEnd(null)
  }

  // 横切模式下点击落刀
  const onHostClick = (e: MouseEvent) => {
    if (toolMode !== 'cut') return
    if (dragIdx !== null) return
    const el = hostRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const yRatio = (e.clientY - rect.top) / rect.height
    const c = colAtX(e.clientX)
    props.onAddCutLine(c, Math.max(0, Math.min(1, yRatio)))
    // 落刀视觉反馈:短暂高亮
    setJustPlacedLine(yRatio)
    setTimeout(() => setJustPlacedLine(null), 400)
  }

  // 框选预览矩形的比例坐标（归一化）
  const previewRect =
    boxDragStart !== null && boxDragEnd !== null
      ? {
          left: Math.min(boxDragStart.x, boxDragEnd.x),
          top: Math.min(boxDragStart.y, boxDragEnd.y),
          width: Math.abs(boxDragEnd.x - boxDragStart.x),
          height: Math.abs(boxDragEnd.y - boxDragStart.y)
        }
      : null

  const isBoxMode = toolMode === 'box-split' || toolMode === 'box-exclude'

  return (
    <div
      ref={hostRef}
      onMouseMove={onHostMouseMove}
      onMouseDown={onHostMouseDown}
      onMouseUp={onHostMouseUp}
      onMouseLeave={onHostMouseLeave}
      onClick={onHostClick}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: toolMode === 'cut'
          ? 'crosshair'
          : isBoxMode
            ? 'crosshair'
            : dragIdx !== null
              ? 'ew-resize'
              : 'default'
      }}
    >
      {/* 列分隔线（可拖动）— 主题色 + hover 加粗 */}
      {dividers.slice(0, mode - 1).map((d, i) => {
        const isHover = hoverDivider === i || dragIdx === i
        return (
          <div
            key={i}
            onMouseDown={(e) => onDividerMouseDown(e, i)}
            onMouseEnter={() => setHoverDivider(i)}
            onMouseLeave={() => setHoverDivider(null)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${d.x_ratio * 100}%`,
              width: isHover ? 8 : 5,
              marginLeft: isHover ? -4 : -2.5,
              background: isHover
                ? 'var(--mantine-color-sky-4)'
                : 'rgba(56, 152, 236, 0.5)',
              cursor: 'ew-resize',
              transition: 'width 0.1s, margin-left 0.1s, background 0.1s',
              zIndex: 10
            }}
          />
        )
      })}

      {/* 列边界提示（虚线） */}
      {Array.from({ length: mode + 1 }, (_, i) => i / mode).map((x, i) => (
        <div
          key={`b${i}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${x * 100}%`,
            width: 1,
            background: 'rgba(255,255,255,0.15)'
          }}
        />
      ))}

      {/* 已落横切线 — 主题色,hover 变红 */}
      {cutLines.map((l) => {
        const [xs] = colXRange(l.col_index, mode, dividers)
        const [, xe] = colXRange(l.col_index, mode, dividers)
        return (
          <div
            key={l.id}
            style={{
              position: 'absolute',
              left: `${xs * 100}%`,
              width: `${(xe - xs) * 100}%`,
              top: `${l.y_ratio * 100}%`,
              height: 2,
              background: 'var(--mantine-color-sky-6)',
              cursor: 'pointer',
              transition: 'background 0.15s, height 0.15s'
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (l.id !== undefined) props.onDeleteCutLine(l.id)
            }}
            title="点击删除"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--mantine-color-red-5)'
              ;(e.currentTarget as HTMLDivElement).style.height = '3px'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--mantine-color-sky-6)'
              ;(e.currentTarget as HTMLDivElement).style.height = '2px'
            }}
          />
        )
      })}

      {/* 落刀短暂高亮反馈 */}
      {justPlacedLine !== null && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${justPlacedLine * 100}%`,
            height: 4,
            background: 'var(--mantine-color-yellow-4)',
            pointerEvents: 'none',
            animation: 'fadeOut 0.4s forwards'
          }}
        />
      )}

      {/* 跟随光标的示意线（横切模式） */}
      {toolMode === 'cut' && hoverY !== null && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${hoverY * 100}%`,
            height: 0,
            borderTop: '1px dashed rgba(255,200,0,0.9)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* 当前列高亮（横切模式） */}
      {toolMode === 'cut' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${colXRange(hoverCol, mode, dividers)[0] * 100}%`,
            width: `${(colXRange(hoverCol, mode, dividers)[1] - colXRange(hoverCol, mode, dividers)[0]) * 100}%`,
            background: 'rgba(56, 152, 236, 0.08)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* 已落手画框 */}
      {manualBoxes.map((box) => {
        const isExcluded = box.is_excluded === 1
        return (
          <div
            key={`box-${box.id}`}
            onClick={(e) => {
              e.stopPropagation()
              if (box.id !== undefined) props.onDeleteManualBox(box.id)
            }}
            title={isExcluded ? '点击删除排除框' : '点击删除分割框'}
            style={{
              position: 'absolute',
              left: `${box.x_start_ratio * 100}%`,
              top: `${box.y_start_ratio * 100}%`,
              width: `${(box.x_end_ratio - box.x_start_ratio) * 100}%`,
              height: `${(box.y_end_ratio - box.y_start_ratio) * 100}%`,
              background: isExcluded
                ? 'rgba(255, 50, 50, 0.15)'
                : 'rgba(56, 152, 236, 0.12)',
              border: isExcluded
                ? '2px dashed var(--mantine-color-red-5)'
                : '2px solid var(--mantine-color-sky-5)',
              cursor: 'pointer',
              zIndex: 15
            }}
          />
        )
      })}

      {/* 框选拖动预览矩形 */}
      {previewRect && (
        <div
          style={{
            position: 'absolute',
            left: `${previewRect.left * 100}%`,
            top: `${previewRect.top * 100}%`,
            width: `${previewRect.width * 100}%`,
            height: `${previewRect.height * 100}%`,
            border: toolMode === 'box-exclude'
              ? '2px dashed var(--mantine-color-red-5)'
              : '2px dashed var(--mantine-color-sky-5)',
            background: toolMode === 'box-exclude'
              ? 'rgba(255, 50, 50, 0.08)'
              : 'rgba(56, 152, 236, 0.08)',
            pointerEvents: 'none',
            zIndex: 20
          }}
        />
      )}

      {/* 落刀高亮动画 */}
      <style>{`
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default CropOverlay
