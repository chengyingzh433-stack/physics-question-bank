// 主进程与渲染进程共享的类型契约（IPC DTO、领域模型）。

/** 试卷状态机：导入中→裁切中→后期处理中→已入库 */
export type PaperStatus = 'importing' | 'cropping' | 'processing' | 'done'

export interface PaperDTO {
  id: number
  name: string
  source_pdf_path: string | null
  original_filename: string | null
  page_count: number
  status: PaperStatus
  created_at: string | null
  updated_at: string | null
}

export interface PageDTO {
  id: number
  paper_id: number
  page_index: number
  width_pt: number | null
  height_pt: number | null
  column_mode: number
}

export interface NewPageDTO {
  paper_id: number
  page_index: number
  width_pt: number
  height_pt: number
}

export interface Api {
  ping(): Promise<string>
  // papers
  listPapers(): Promise<PaperDTO[]>
  getPaper(id: number): Promise<PaperDTO | null>
  importPaper(name: string): Promise<PaperDTO | null>
  deletePaper(id: number): Promise<void>
  // pages
  bulkAddPages(pages: NewPageDTO[]): Promise<void>
  setPageCount(paperId: number, n: number): Promise<void>
  getPages(paperId: number): Promise<PageDTO[]>
  // files
  getSourcePdfPath(paperId: number): Promise<string | null>
  // pages crop
  getPage(pageId: number): Promise<PageDTO | null>
  setColumnMode(pageId: number, mode: number): Promise<void>
  listDividers(pageId: number): Promise<ColumnDividerDTO[]>
  replaceDividers(pageId: number, xRatios: number[]): Promise<void>
  listCutLines(pageId: number): Promise<CutLineDTO[]>
  addCutLine(pageId: number, colIndex: number, yRatio: number): Promise<number>
  undoLastCutLine(pageId: number): Promise<number | null>
  deleteCutLine(cutLineId: number): Promise<void>
  // segments
  getSegmentsByPage(pageId: number): Promise<SegmentDTO[]>
  getSegmentsByPaper(paperId: number): Promise<SegmentDTO[]>
  replaceSegmentsForPage(
    pageId: number,
    paperId: number,
    segments: Omit<SegmentDTO, 'id' | 'page_id' | 'paper_id'>[]
  ): Promise<void>
}

// ---- 裁切相关 DTO ----

export interface ColumnDividerDTO {
  id?: number
  page_id?: number
  x_ratio: number // 0..1，竖向分隔线位置
}

export interface CutLineDTO {
  id?: number
  page_id?: number
  col_index: number // 归属哪一列
  y_ratio: number // 0..1，横向切刀位置
  created_seq?: number
}

export interface SegmentDTO {
  id?: number
  paper_id?: number
  page_id?: number
  col_index: number
  x_start_ratio: number
  x_end_ratio: number
  y_start_ratio: number
  y_end_ratio: number
  order_index?: number
  is_deleted?: number
}
