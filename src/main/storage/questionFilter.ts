// 题库组合筛选查询构造器（纯函数，便于单测）。
// 条件 AND 组合；知识点命中任一即可。

import type { QuestionFilterCriteria } from '../../shared/types'
export type { QuestionFilterCriteria } from '../../shared/types'

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
export function buildQuestionFilter(c: QuestionFilterCriteria, includeEditableAnswers = false): BuiltFilter {
  // 旧 PDF 题图与已发布录题进入题库；答案卷及待校对录题保持隐藏。
  const conditions: string[] = ['q.image_path IS NOT NULL', "(p.kind = 'paper' OR (p.kind = 'intake' AND p.status = 'done'))"]
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
    conditions.push(`q.chapter_id IN (
      WITH RECURSIVE chapter_descendants(id) AS (
        SELECT id FROM chapters WHERE id = ?
        UNION
        SELECT ch.id FROM chapters ch JOIN chapter_descendants d ON ch.parent_id = d.id
      ) SELECT id FROM chapter_descendants
    )`)
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
  if (c.folder_id != null) {
    conditions.push('EXISTS (SELECT 1 FROM question_folder_items fi WHERE fi.question_id = q.id AND fi.folder_id = ?)')
    params.push(c.folder_id)
  }
  if (c.unfiled) {
    conditions.push('NOT EXISTS (SELECT 1 FROM question_folder_items fi WHERE fi.question_id = q.id)')
  }
  const hasAnswer = includeEditableAnswers ? `(NULLIF(q.answer_image_path, '') IS NOT NULL OR EXISTS (
    SELECT 1 FROM question_contents saved,
      json_each(CASE WHEN json_valid(saved.content_json) THEN saved.content_json ELSE '{}' END, '$.answerBody.content') block
    WHERE saved.question_id = q.id AND (
      json_extract(block.value, '$.type') = 'image' OR EXISTS (
        SELECT 1 FROM json_each(block.value, '$.content') node
        WHERE (json_extract(node.value, '$.type') = 'text' AND length(trim(json_extract(node.value, '$.text'), ' ' || char(9,10,13))) > 0)
          OR (json_extract(node.value, '$.type') = 'inlineMath' AND length(trim(json_extract(node.value, '$.attrs.latex'), ' ' || char(9,10,13))) > 0)
      )
    )
  ))` : "(NULLIF(q.answer_image_path, '') IS NOT NULL)"
  if (c.answer_status === 'with') conditions.push(hasAnswer)
  if (c.answer_status === 'without') conditions.push(`NOT ${hasAnswer}`)
  const search = c.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
    conditions.push(`(p.name LIKE ? ESCAPE '\\'
      OR COALESCE(q.source_override, p.source) LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM question_types t WHERE t.id = q.type_id AND t.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM chapters ch WHERE ch.id = q.chapter_id AND ch.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM question_knowledge_points sk JOIN knowledge_points k ON k.id = sk.kp_id
        WHERE sk.question_id = q.id AND k.name LIKE ? ESCAPE '\\'))`)
    params.push(pattern, pattern, pattern, pattern, pattern)
  }

  return {
    where: conditions.join(' AND '),
    params
  }
}

/** 完整查询 SQL（含 join）。DISTINCT 因为知识点 join 会放大行数。 */
export function buildQuestionQuery(c: QuestionFilterCriteria, columns = 'q.*', includeEditableAnswers = false): { sql: string; params: (string | number)[] } {
  let kpJoin = ''
  const kpParams: number[] = []
  if (c.kp_ids && c.kp_ids.length > 0) {
    const placeholders = c.kp_ids.map(() => '?').join(',')
    kpJoin = ` JOIN question_knowledge_points qkp ON qkp.question_id = q.id AND qkp.kp_id IN (${placeholders})`
    kpParams.push(...c.kp_ids)
  }
  const { where, params } = buildQuestionFilter(c, includeEditableAnswers)
  const sql = `SELECT DISTINCT ${columns} FROM questions q JOIN papers p ON p.id = q.paper_id${kpJoin} WHERE ${where} ORDER BY q.paper_id ASC, q.order_in_paper ASC, q.id ASC`
  // JOIN 的占位符位于 WHERE 之前，必须同序绑定。
  return { sql, params: [...kpParams, ...params] }
}
