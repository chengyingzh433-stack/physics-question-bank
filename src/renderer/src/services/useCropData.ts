import { useCallback, useEffect, useState } from 'react'
import type {
  PageDTO,
  ColumnDividerDTO,
  CutLineDTO,
  ManualBoxDTO,
  SegmentDTO,
  PaperDTO
} from '@shared/types'
import { deriveAllSegments } from './ColumnCropService'

/**
 * 加载并管理某试卷的裁切数据，所有变更先写库再更新本地 state（A12: DB 是真值）。
 * 任何线变化后自动重算并持久化该页派生 segments（M2-4）。
 */
export function useCropData(paperId: number): {
  paper: PaperDTO | null
  pages: PageDTO[]
  loaded: boolean
  dividers: Record<number, ColumnDividerDTO[]>
  cutLines: Record<number, CutLineDTO[]>
  manualBoxes: Record<number, ManualBoxDTO[]>
  segments: Record<number, SegmentDTO[]>
  setColumnMode: (pageId: number, mode: number) => Promise<void>
  replaceDividers: (pageId: number, xRatios: number[]) => Promise<void>
  addCutLine: (pageId: number, colIndex: number, yRatio: number) => Promise<void>
  undoLastCutLine: (paperId: number) => Promise<void>
  deleteCutLine: (cutLineId: number, pageId: number) => Promise<void>
  addManualBox: (pageId: number, x0: number, y0: number, x1: number, y1: number, isExcluded: number) => Promise<void>
  deleteManualBox: (boxId: number, pageId: number) => Promise<void>
  undoLastManualBox: (paperId: number) => Promise<void>
  reloadPage: (pageId: number) => Promise<void>
} {
  const [paper, setPaper] = useState<PaperDTO | null>(null)
  const [pages, setPages] = useState<PageDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dividers, setDividers] = useState<Record<number, ColumnDividerDTO[]>>({})
  const [cutLines, setCutLines] = useState<Record<number, CutLineDTO[]>>({})
  const [manualBoxes, setManualBoxes] = useState<Record<number, ManualBoxDTO[]>>({})
  const [segments, setSegments] = useState<Record<number, SegmentDTO[]>>({})

  const loadAll = useCallback(async () => {
    const [p, pgs] = await Promise.all([
      window.api.getPaper(paperId),
      window.api.getPages(paperId)
    ])
    setPaper(p)
    setPages(pgs)
    const [divs, cuts, boxes, segs] = await Promise.all([
      Promise.all(pgs.map((pg) => window.api.listDividers(pg.id))),
      Promise.all(pgs.map((pg) => window.api.listCutLines(pg.id))),
      Promise.all(pgs.map((pg) => window.api.listManualBoxes(pg.id))),
      Promise.all(pgs.map((pg) => window.api.getSegmentsByPage(pg.id)))
    ])
    const divMap: Record<number, ColumnDividerDTO[]> = {}
    const cutMap: Record<number, CutLineDTO[]> = {}
    const boxMap: Record<number, ManualBoxDTO[]> = {}
    const segMap: Record<number, SegmentDTO[]> = {}
    pgs.forEach((pg, i) => {
      divMap[pg.id] = divs[i]
      cutMap[pg.id] = cuts[i]
      boxMap[pg.id] = boxes[i]
      segMap[pg.id] = segs[i]
    })
    setDividers(divMap)
    setCutLines(cutMap)
    setManualBoxes(boxMap)
    setSegments(segMap)
    setLoaded(true)
  }, [paperId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  /** 重算某页派生 segments 并持久化（M2-4）。使用 deriveAllSegments 合并推导+手画框。 */
  const recomputeSegments = useCallback(
    async (page: PageDTO, divs: ColumnDividerDTO[], cuts: CutLineDTO[], boxes: ManualBoxDTO[]) => {
      const segs = deriveAllSegments(
        { page_id: page.id, paper_id: paperId, column_mode: page.column_mode },
        divs,
        cuts,
        boxes
      )
      await window.api.replaceSegmentsForPage(page.id, paperId, segs)
      setSegments((m) => ({ ...m, [page.id]: segs }))
    },
    [paperId]
  )

  const setColumnMode = useCallback(
    async (pageId: number, mode: number) => {
      await window.api.setColumnMode(pageId, mode)
      setPages((arr) =>
        arr.map((p) => (p.id === pageId ? { ...p, column_mode: mode } : p))
      )
      // 列模式变化时，重置该页分隔线为均分 n-1 条
      const xs = Array.from({ length: mode - 1 }, (_, i) => (i + 1) / mode)
      await window.api.replaceDividers(pageId, xs)
      const divs = xs.map((x) => ({ page_id: pageId, x_ratio: x }))
      setDividers((m) => ({ ...m, [pageId]: divs }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        const cuts = cutLines[pageId] ?? []
        const boxes = manualBoxes[pageId] ?? []
        await recomputeSegments({ ...page, column_mode: mode }, divs, cuts, boxes)
      }
    },
    [pages, cutLines, manualBoxes, recomputeSegments]
  )

  const replaceDividers = useCallback(
    async (pageId: number, xRatios: number[]) => {
      await window.api.replaceDividers(pageId, xRatios)
      const divs = xRatios.map((x) => ({ page_id: pageId, x_ratio: x }))
      setDividers((m) => ({ ...m, [pageId]: divs }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, divs, cutLines[pageId] ?? [], manualBoxes[pageId] ?? [])
      }
    },
    [pages, cutLines, manualBoxes, recomputeSegments]
  )

  const addCutLine = useCallback(
    async (pageId: number, colIndex: number, yRatio: number) => {
      await window.api.addCutLine(pageId, colIndex, yRatio)
      const cuts = await window.api.listCutLines(pageId)
      setCutLines((m) => ({ ...m, [pageId]: cuts }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cuts, manualBoxes[pageId] ?? [])
      }
    },
    [pages, dividers, manualBoxes, recomputeSegments]
  )

  const undoLastCutLine = useCallback(
    async (paperId: number) => {
      console.log('[useCropData.undoLastCutLine] paperId =', paperId)
      const affectedPageId = await window.api.undoLastCutLine(paperId)
      console.log('[useCropData.undoLastCutLine] affectedPageId =', affectedPageId)
      if (affectedPageId == null) return // 没有刀可撤
      const cuts = await window.api.listCutLines(affectedPageId)
      console.log('[useCropData.undoLastCutLine] reloaded cuts =', cuts)
      setCutLines((m) => ({ ...m, [affectedPageId]: cuts }))
      const page = pages.find((p) => p.id === affectedPageId)
      if (page) {
        await recomputeSegments(page, dividers[affectedPageId] ?? [], cuts, manualBoxes[affectedPageId] ?? [])
      }
    },
    [pages, dividers, manualBoxes, recomputeSegments]
  )

  const deleteCutLine = useCallback(
    async (cutLineId: number, pageId: number) => {
      await window.api.deleteCutLine(cutLineId)
      const cuts = await window.api.listCutLines(pageId)
      setCutLines((m) => ({ ...m, [pageId]: cuts }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cuts, manualBoxes[pageId] ?? [])
      }
    },
    [pages, dividers, manualBoxes, recomputeSegments]
  )

  // ---- 手画框操作（先写库再 state，A12）----

  const addManualBox = useCallback(
    async (pageId: number, x0: number, y0: number, x1: number, y1: number, isExcluded: number) => {
      await window.api.addManualBox(pageId, paperId, x0, y0, x1, y1, isExcluded)
      const boxes = await window.api.listManualBoxes(pageId)
      setManualBoxes((m) => ({ ...m, [pageId]: boxes }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cutLines[pageId] ?? [], boxes)
      }
    },
    [pages, paperId, dividers, cutLines, recomputeSegments]
  )

  const deleteManualBox = useCallback(
    async (boxId: number, pageId: number) => {
      await window.api.deleteManualBox(boxId)
      const boxes = await window.api.listManualBoxes(pageId)
      setManualBoxes((m) => ({ ...m, [pageId]: boxes }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cutLines[pageId] ?? [], boxes)
      }
    },
    [pages, dividers, cutLines, recomputeSegments]
  )

  const undoLastManualBox = useCallback(
    async (paperId: number) => {
      const affectedPageId = await window.api.undoLastManualBox(paperId)
      if (affectedPageId == null) return // 没有框可撤
      const boxes = await window.api.listManualBoxes(affectedPageId)
      setManualBoxes((m) => ({ ...m, [affectedPageId]: boxes }))
      const page = pages.find((p) => p.id === affectedPageId)
      if (page) {
        await recomputeSegments(page, dividers[affectedPageId] ?? [], cutLines[affectedPageId] ?? [], boxes)
      }
    },
    [pages, dividers, cutLines, recomputeSegments]
  )

  const reloadPage = useCallback(async (pageId: number) => {
    const cuts = await window.api.listCutLines(pageId)
    setCutLines((m) => ({ ...m, [pageId]: cuts }))
  }, [])

  return {
    paper,
    pages,
    loaded,
    dividers,
    cutLines,
    manualBoxes,
    segments,
    setColumnMode,
    replaceDividers,
    addCutLine,
    undoLastCutLine,
    deleteCutLine,
    addManualBox,
    deleteManualBox,
    undoLastManualBox,
    reloadPage
  }
}
