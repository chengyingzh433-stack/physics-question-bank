// 题库组合筛选查询构造器（纯函数，便于单测）。
// 条件 AND 组合；知识点命中任一即可。

export interface QuestionFilterCriteria {
  type_id?: number | null
  paper_id?: number | null
  chapter_id?: number | null
  difficulty_id?: number | null
  kp_ids?: number[] // 命中任一
  /** 年份筛选（M13），按 COALESCE(q.year_override, p.year) 口径。 */
  year?: number | null
  /** 出处筛选（M13），按 COALESCE(q.source_override, p.source) 口径。 */
  source?: string | null
}

export interface BuiltFilter {
  where: string
  params: (string | number)[]
}

/**
 * 构造题库筛选 SQL 的 WHERE 子句（不含前置 WHERE 关键字）。
 * 筛选知识点时 JOIN question_knowledge_points，命中任一 kp_id。
 * 仅返回 image_path 非空（已入库）且来自题目卷（p.kind='paper'）的题。
 * 年份/出处走 effective 口径（M13）：单题覆盖优先于试卷默认，调用方须 JOIN papers p。
 */
export function buildQuestionFilter(c: QuestionFilterCriteria): BuiltFilter {
  // p.kind = 'paper' 确保答案卷的 question 行不进题库（M14.5 B2）
  const conditions: string[] = ['q.image_path IS NOT NULL', "p.kind = 'paper'"]
  const params: (string | number)[] = []

  if (c.type_id != null) {
    conditions.push('q.type_id = ?')
    params.push(c.type_id)
  }
  if (c.paper_id != null) {
    conditions.push('q.paper_id = ?')
    params.push(c.paper_id)
  }
  if (c.chapter_id != null) {
    conditions.push('q.chapter_id = ?')
    params.push(c.chapter_id)
  }
  if (c.difficulty_id != null) {
    conditions.push('q.difficulty_id = ?')
    params.push(c.difficulty_id)
  }
  if (c.year != null) {
    conditions.push('COALESCE(q.year_override, p.year) = ?')
    params.push(c.year)
  }
  if (c.source != null && c.source !== '') {
    conditions.push('COALESCE(q.source_override, p.source) = ?')
    params.push(c.source)
  }
  // 知识点走 EXISTS 子查询（见 buildQuestionQuery / listBankQuestions），不进 where 条件

  return {
    where: conditions.join(' AND '),
    params
  }
}

/** 完整查询 SQL（含 join）。DISTINCT 因为知识点 join 会放大行数。 */
export function buildQuestionQuery(c: QuestionFilterCriteria): { sql: string; params: (string | number)[] } {
  let kpJoin = ''
  const kpParams: number[] = []
  if (c.kp_ids && c.kp_ids.length > 0) {
    const placeholders = c.kp_ids.map(() => '?').join(',')
    kpJoin = ` JOIN question_knowledge_points qkp ON qkp.question_id = q.id AND qkp.kp_id IN (${placeholders})`
    kpParams.push(...c.kp_ids)
  }
  const { where, params } = buildQuestionFilter(c)
  const sql = `SELECT DISTINCT q.* FROM questions q JOIN papers p ON p.id = q.paper_id${kpJoin} WHERE ${where} ORDER BY q.paper_id ASC, q.order_in_paper ASC`
  return { sql, params: [...params, ...kpParams] }
}
