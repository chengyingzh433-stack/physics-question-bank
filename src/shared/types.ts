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
}
