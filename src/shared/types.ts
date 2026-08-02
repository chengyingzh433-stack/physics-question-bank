// 主进程与渲染进程共享的类型契约（IPC DTO、领域模型）。

/** 试卷状态机：导入中→裁切中→后期处理中→已入库 */
export type PaperStatus = 'importing' | 'cropping' | 'processing' | 'done'

/** 试卷种类（M14）：题目卷 或 挂在题目卷下的答案卷。 */
export type PaperKind = 'paper' | 'answer'

export interface PaperDTO {
  id: number
  name: string
  source_pdf_path: string | null
  original_filename: string | null
  page_count: number
  status: PaperStatus
  /** 试卷默认年份（M13）。题目未覆盖时继承此值。 */
  year: number | null
  /** 试卷默认出处（M13），如"新课标 I 卷"。题目未覆盖时继承此值。 */
  source: string | null
  /** 'paper'=题目卷，'answer'=答案卷（M14）。 */
  kind: PaperKind
  /** 答案卷指向的题目卷 id；题目卷为 null（M14）。 */
  parent_paper_id: number | null
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
  rotation: number
}

export interface NewPageDTO {
  paper_id: number
  page_index: number
  width_pt: number
  height_pt: number
  rotation: number
}

export interface Api {
  ping(): Promise<string>
  // papers
  listPapers(): Promise<PaperDTO[]>
  getPaper(id: number): Promise<PaperDTO | null>
  /** 导入试卷。M14: options.kind='answer' + parentPaperId 时建答案卷。 */
  importPaper(
    name: string,
    options?: { kind?: PaperKind; parentPaperId?: number | null }
  ): Promise<PaperDTO | null>
  /** 取某题目卷的答案卷（M14）。无则 null。 */
  getAnswerPaper(parentPaperId: number): Promise<PaperDTO | null>
  deletePaper(id: number): Promise<void>
  /** 更新试卷默认年份/出处（M13）。 */
  updatePaperMeta(
    paperId: number,
    fields: { year?: number | null; source?: string | null }
  ): Promise<void>
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
  /** 撤销全局最后一刀（跨所有页）。返回被删刀所在的 page_id 或 null。 */
  undoLastCutLine(paperId: number): Promise<number | null>
  deleteCutLine(cutLineId: number): Promise<void>
  // manual boxes
  listManualBoxes(pageId: number): Promise<ManualBoxDTO[]>
  addManualBox(
    pageId: number,
    paperId: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    isExcluded: number
  ): Promise<number>
  deleteManualBox(boxId: number): Promise<void>
  /** 撤销全局最后一个框（跨所有页）。返回被删框所在的 page_id 或 null。 */
  undoLastManualBox(paperId: number): Promise<number | null>
  // segments
  getSegmentsByPage(pageId: number): Promise<SegmentDTO[]>
  getSegmentsByPaper(paperId: number): Promise<SegmentDTO[]>
  replaceSegmentsForPage(
    pageId: number,
    paperId: number,
    segments: Omit<SegmentDTO, 'id' | 'page_id' | 'paper_id'>[]
  ): Promise<void>
  setSegmentDeleted(segmentId: number, isDeleted: boolean): Promise<void>
  // questions
  listQuestionsByPaper(paperId: number): Promise<QuestionDTO[]>
  getQuestionSegments(questionId: number): Promise<SegmentDTO[]>
  getQuestionSegmentMap(questionId: number): Promise<QuestionSegmentMap[]>
  createQuestionWithSegments(
    paperId: number,
    segmentIds: number[],
    orderInPaper: number | null
  ): Promise<number>
  deleteQuestion(questionId: number): Promise<void>
  renumberQuestions(paperId: number): Promise<void>
  setQuestionOrder(questionId: number, orderInPaper: number): Promise<void>
  /** 更新单题年份/出处覆盖（M13）。null/空串 = 清除覆盖回退继承。 */
  updateQuestionSourceOverride(
    questionId: number,
    fields: { year_override?: number | null; source_override?: string | null }
  ): Promise<void>
  setQuestionImage(
    questionId: number,
    imagePath: string,
    widthPx: number,
    heightPx: number
  ): Promise<void>
  setPaperStatus(
    paperId: number,
    status: 'importing' | 'cropping' | 'processing' | 'done'
  ): Promise<void>
  saveQuestionPng(
    paperId: number,
    questionId: number,
    data: ArrayBuffer
  ): Promise<{ relPath: string; url: string }>
  /** 保存答案图 PNG（M14）。paperId 传题目卷 id，答案图存在题目卷目录下。 */
  saveAnswerPng(
    paperId: number,
    questionId: number,
    data: ArrayBuffer
  ): Promise<{ relPath: string; url: string }>
  /** 绑定/解绑答案图到题目（M14）。imagePath=null 时解绑。 */
  setAnswerImage(
    questionId: number,
    imagePath: string | null,
    widthPx: number | null,
    heightPx: number | null
  ): Promise<void>
  /** 清空某题目卷下所有题的答案图绑定 + 删掉磁盘上的答案 PNG（M14）。返回清掉的题数。 */
  clearAnswersByPaper(paperId: number): Promise<number>
  // question types
  listQuestionTypes(): Promise<{ id: number; name: string; is_builtin: number }[]>
  createQuestionType(name: string): Promise<number>
  renameQuestionType(id: number, name: string): Promise<void>
  deleteQuestionType(id: number): Promise<boolean>
  setQuestionType(questionId: number, typeId: number | null): Promise<void>
  // templates
  listTemplates(): Promise<{ id: number; name: string; created_at: string }[]>
  createTemplate(name: string): Promise<number>
  deleteTemplate(id: number): Promise<void>
  listRules(templateId: number): Promise<TemplateRuleDTO[]>
  addRule(
    templateId: number,
    rule: { from_no: number; to_no: number; type_id: number; rule_order?: number }
  ): Promise<number>
  deleteRule(ruleId: number): Promise<void>
  // tags
  listChapters(): Promise<{ id: number; name: string }[]>
  createChapter(name: string): Promise<number>
  deleteChapter(id: number): Promise<void>
  listKnowledgePoints(): Promise<{ id: number; name: string; chapter_id: number | null }[]>
  createKnowledgePoint(name: string, chapterId: number | null): Promise<number>
  deleteKnowledgePoint(id: number): Promise<void>
  listDifficulties(): Promise<{ id: number; name: string; sort_order: number }[]>
  createDifficulty(name: string, sortOrder: number): Promise<number>
  deleteDifficulty(id: number): Promise<void>
  setQuestionChapter(questionId: number, chapterId: number | null): Promise<void>
  setQuestionDifficulty(questionId: number, difficultyId: number | null): Promise<void>
  setQuestionKnowledgePoints(questionId: number, kpIds: number[]): Promise<void>
  getQuestionKnowledgePoints(questionId: number): Promise<number[]>
  // bank
  listBankQuestions(criteria: QuestionFilterCriteria): Promise<BankQuestionDTO[]>
  /** 题库筛选可选的年份/出处清单（M13，distinct 按 effective 口径）。 */
  listYearSources(): Promise<{ years: number[]; sources: string[] }>
  // basket (paper_set draft)
  getOrCreateDraftSet(): Promise<number>
  listSetItems(setId: number): Promise<PaperSetItemDTO[]>
  listSetQuestionIds(setId: number): Promise<number[]>
  addToSet(setId: number, questionId: number): Promise<number>
  removeFromSet(itemId: number): Promise<void>
  updateSetItem(
    itemId: number,
    fields: {
      order_index?: number
      group_header?: string | null
      display_number?: string | null
    }
  ): Promise<void>
  /** M14: answerMode 控制答案包含方式（'none'=不含/默认，'append'=末尾参考答案区，'inline'=每题后紧跟）。 */
  exportBasketPdf(setId: number, title: string, answerMode?: 'none' | 'append' | 'inline'): Promise<string | null>

  /** 备份数据库到用户选定路径（M12-2）。返回保存路径，取消返回 null。 */
  backupDatabase(): Promise<string | null>

  /** 读/写应用设置（M12-2）。key 如 'export_dpi'。 */
  getSetting(key: string, defaultValue: string): Promise<string>
  setSetting(key: string, value: string): Promise<void>

  /** 存储位置：弹出选择目录对话框 */
  openDirectoryDialog(): Promise<string | null>
  /** 存储位置：迁移项目文件到新路径 */
  migrateStorage(newPath: string): Promise<void>
  /** 存储位置：获取默认路径（userData/projects/） */
  getDefaultStoragePath(): Promise<string>
  /** 存储位置：获取当前路径（含自定义路径） */
  getCurrentStoragePath(): Promise<string>
}

export interface PaperSetItemDTO {
  id: number
  set_id: number
  question_id: number
  order_index: number | null
  group_header: string | null
  display_number: string | null
}

export interface QuestionFilterCriteria {
  type_id?: number | null
  paper_id?: number | null
  chapter_id?: number | null
  difficulty_id?: number | null
  kp_ids?: number[]
  /** 年份筛选（M13），走 COALESCE(单题覆盖, 试卷默认) 口径。 */
  year?: number | null
  /** 出处筛选（M13），走 COALESCE(单题覆盖, 试卷默认) 口径。 */
  source?: string | null
}

export interface BankQuestionDTO {
  id: number
  paper_id: number
  order_in_paper: number | null
  type_id: number | null
  chapter_id: number | null
  difficulty_id: number | null
  is_merged: number
  image_path: string | null
  width_px: number | null
  height_px: number | null
  year_override: number | null
  source_override: string | null
  effective_year: number | null
  effective_source: string | null
  answer_image_path: string | null
  answer_width_px: number | null
  answer_height_px: number | null
  paper_name: string
}

export interface ChapterDTO {
  id: number
  name: string
}
export interface KnowledgePointDTO {
  id: number
  name: string
  chapter_id: number | null
}
export interface DifficultyDTO {
  id: number
  name: string
  sort_order: number
}

export interface TemplateRuleDTO {
  id: number
  template_id: number
  from_no: number | null
  to_no: number | null
  type_id: number | null
  rule_order: number | null
}

export interface QuestionTypeDTO {
  id: number
  name: string
  is_builtin: number
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

export interface ManualBoxDTO {
  id?: number
  page_id?: number
  paper_id?: number
  x_start_ratio: number // 0..1
  x_end_ratio: number // 0..1
  y_start_ratio: number // 0..1
  y_end_ratio: number // 0..1
  is_excluded: number // 0=分割框, 1=排除框
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

export interface QuestionDTO {
  id: number
  paper_id: number
  order_in_paper: number | null
  type_id: number | null
  chapter_id: number | null
  difficulty_id: number | null
  is_merged: number
  image_path: string | null
  width_px: number | null
  height_px: number | null
  /** 单题年份覆盖（M13）。null = 继承试卷 year。 */
  year_override: number | null
  /** 单题出处覆盖（M13）。null = 继承试卷 source。 */
  source_override: string | null
  /** SQL 层 COALESCE(year_override, papers.year) 的结果，前端只显示不计算。 */
  effective_year: number | null
  /** SQL 层 COALESCE(source_override, papers.source) 的结果，前端只显示不计算。 */
  effective_source: string | null
  /** 绑定的答案图相对路径（M14），null = 未绑定答案。 */
  answer_image_path: string | null
  answer_width_px: number | null
  answer_height_px: number | null
  created_at: string | null
  updated_at: string | null
}

export interface QuestionSegmentMap {
  segment_id: number
  merge_order: number
}
