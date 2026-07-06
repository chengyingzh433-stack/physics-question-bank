import { useCallback, useEffect, useState } from 'react'
import type {
  PageDTO,
  ColumnDividerDTO,
  CutLineDTO,
  SegmentDTO,
  PaperDTO
} from '@shared/types'
import { deriveSegments } from './ColumnCropService'

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
  segments: Record<number, SegmentDTO[]>
  setColumnMode: (pageId: number, mode: number) => Promise<void>
  replaceDividers: (pageId: number, xRatios: number[]) => Promise<void>
  addCutLine: (pageId: number, colIndex: number, yRatio: number) => Promise<void>
  undoLastCutLine: (pageId: number) => Promise<void>
  deleteCutLine: (cutLineId: number, pageId: number) => Promise<void>
  reloadPage: (pageId: number) => Promise<void>
} {
  const [paper, setPaper] = useState<PaperDTO | null>(null)
  const [pages, setPages] = useState<PageDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dividers, setDividers] = useState<Record<number, ColumnDividerDTO[]>>({})
  const [cutLines, setCutLines] = useState<Record<number, CutLineDTO[]>>({})
  const [segments, setSegments] = useState<Record<number, SegmentDTO[]>>({})

  const loadAll = useCallback(async () => {
    const [p, pgs] = await Promise.all([
      window.api.getPaper(paperId),
      window.api.getPages(paperId)
    ])
    setPaper(p)
    setPages(pgs)
    const [divs, cuts, segs] = await Promise.all([
      Promise.all(pgs.map((pg) => window.api.listDividers(pg.id))),
      Promise.all(pgs.map((pg) => window.api.listCutLines(pg.id))),
      Promise.all(pgs.map((pg) => window.api.getSegmentsByPage(pg.id)))
    ])
    const divMap: Record<number, ColumnDividerDTO[]> = {}
    const cutMap: Record<number, CutLineDTO[]> = {}
    const segMap: Record<number, SegmentDTO[]> = {}
    pgs.forEach((pg, i) => {
      divMap[pg.id] = divs[i]
      cutMap[pg.id] = cuts[i]
      segMap[pg.id] = segs[i]
    })
    setDividers(divMap)
    setCutLines(cutMap)
    setSegments(segMap)
    setLoaded(true)
  }, [paperId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  /** 重算某页派生 segments 并持久化（M2-4）。 */
  const recomputeSegments = useCallback(
    async (page: PageDTO, divs: ColumnDividerDTO[], cuts: CutLineDTO[]) => {
      const segs = deriveSegments(
        { page_id: page.id, paper_id: paperId, column_mode: page.column_mode },
        divs,
        cuts
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
        await recomputeSegments({ ...page, column_mode: mode }, divs, cuts)
      }
    },
    [pages, cutLines, recomputeSegments]
  )

  const replaceDividers = useCallback(
    async (pageId: number, xRatios: number[]) => {
      await window.api.replaceDividers(pageId, xRatios)
      const divs = xRatios.map((x) => ({ page_id: pageId, x_ratio: x }))
      setDividers((m) => ({ ...m, [pageId]: divs }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, divs, cutLines[pageId] ?? [])
      }
    },
    [pages, cutLines, recomputeSegments]
  )

  const addCutLine = useCallback(
    async (pageId: number, colIndex: number, yRatio: number) => {
      await window.api.addCutLine(pageId, colIndex, yRatio)
      const cuts = await window.api.listCutLines(pageId)
      setCutLines((m) => ({ ...m, [pageId]: cuts }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cuts)
      }
    },
    [pages, dividers, recomputeSegments]
  )

  const undoLastCutLine = useCallback(
    async (pageId: number) => {
      await window.api.undoLastCutLine(pageId)
      const cuts = await window.api.listCutLines(pageId)
      setCutLines((m) => ({ ...m, [pageId]: cuts }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cuts)
      }
    },
    [pages, dividers, recomputeSegments]
  )

  const deleteCutLine = useCallback(
    async (cutLineId: number, pageId: number) => {
      await window.api.deleteCutLine(cutLineId)
      const cuts = await window.api.listCutLines(pageId)
      setCutLines((m) => ({ ...m, [pageId]: cuts }))
      const page = pages.find((p) => p.id === pageId)
      if (page) {
        await recomputeSegments(page, dividers[pageId] ?? [], cuts)
      }
    },
    [pages, dividers, recomputeSegments]
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
    segments,
    setColumnMode,
    replaceDividers,
    addCutLine,
    undoLastCutLine,
    deleteCutLine,
    reloadPage
  }
}
