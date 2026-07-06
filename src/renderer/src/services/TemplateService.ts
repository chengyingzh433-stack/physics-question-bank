import type { TemplateRuleDTO } from '@shared/types'

export interface QuestionForTemplate {
  id: number
  order_in_paper: number | null
}

export interface ApplyResult {
  questionId: number
  typeId: number | null
}

/**
 * 按 order_in_paper 把每题落进哪条区间规则，赋对应 type_id。
 * - 规则区间 [from_no, to_no] 闭区间，按 rule_order 顺序匹配，先命中先用。
 * - order_in_paper 为 null 的题不赋值（type_id=null）。
 * - 未命中任何规则的题 type_id=null。
 */
export function applyTemplate(
  questions: QuestionForTemplate[],
  rules: TemplateRuleDTO[]
): ApplyResult[] {
  // 按 rule_order 排序规则
  const sortedRules = [...rules].sort(
    (a, b) => (a.rule_order ?? 0) - (b.rule_order ?? 0)
  )
  return questions.map((q) => {
    const order = q.order_in_paper
    if (order == null) return { questionId: q.id, typeId: null }
    for (const r of sortedRules) {
      const from = r.from_no ?? -Infinity
      const to = r.to_no ?? Infinity
      if (order >= from && order <= to) {
        return { questionId: q.id, typeId: r.type_id }
      }
    }
    return { questionId: q.id, typeId: null }
  })
}
