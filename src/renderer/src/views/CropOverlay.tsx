import { useRef, useState, useCallback, type MouseEvent } from 'react'
import type { PageDTO, ColumnDividerDTO, CutLineDTO } from '@shared/types'
import type { ToolMode } from './CropView'

interface CropOverlayProps {
  page: PageDTO
  dividers: ColumnDividerDTO[]
  cutLines: CutLineDTO[]
  toolMode: ToolMode
  onReplaceDividers: (xRatios: number[]) => void
  onAddCutLine: (colIndex: number, yRatio: number) => void
  onDeleteCutLine: (cutLineId: number) => void
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

function CropOverlay(props: CropOverlayProps): React.JSX.Element | null {
  const { page, dividers, cutLines, toolMode } = props
  const mode = page.column_mode
  const hostRef = useRef<HTMLDivElement>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [hoverY, setHoverY] = useState<number | null>(null)
  const [hoverCol, setHoverCol] = useState<number>(0)

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
    const rect = el.getBoundingClientRect()
    const xRatio = (e.clientX - rect.left) / rect.width
    const yRatio = (e.clientY - rect.top) / rect.height

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

    // 横切模式：跟随光标画示意线（限当前列）
    if (toolMode === 'cut') {
      const c = colAtX(e.clientX)
      setHoverCol(c)
      setHoverY(Math.max(0, Math.min(1, yRatio)))
    }
  }

  const onHostMouseUp = () => {
    setDragIdx(null)
  }

  const onHostMouseLeave = () => {
    setDragIdx(null)
    setHoverY(null)
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
  }

  return (
    <div
      ref={hostRef}
      onMouseMove={onHostMouseMove}
      onMouseUp={onHostMouseUp}
      onMouseLeave={onHostMouseLeave}
      onClick={onHostClick}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: toolMode === 'cut' ? 'crosshair' : dragIdx !== null ? 'ew-resize' : 'default'
      }}
    >
      {/* 列分隔线（可拖动） */}
      {dividers.slice(0, mode - 1).map((d, i) => (
        <div
          key={i}
          onMouseDown={(e) => onDividerMouseDown(e, i)}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${d.x_ratio * 100}%`,
            width: 6,
            marginLeft: -3,
            background: 'rgba(0, 120, 215, 0.6)',
            cursor: 'ew-resize'
          }}
        />
      ))}

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
            background: 'rgba(255,255,255,0.25)'
          }}
        />
      ))}

      {/* 已落横切线 */}
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
              background: 'crimson',
              cursor: 'pointer'
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (l.id !== undefined) props.onDeleteCutLine(l.id)
            }}
            title="点击删除"
          />
        )
      })}

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
            background: 'rgba(255,200,0,0.08)',
            pointerEvents: 'none'
          }}
        />
      )}
    </div>
  )
}

export default CropOverlay
