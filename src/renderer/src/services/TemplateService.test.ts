import { describe, it, expect } from 'vitest'
import { applyTemplate } from './TemplateService'
import type { TemplateRuleDTO } from '@shared/types'

const rule = (id: number, from: number, to: number, type: number, order = 0): TemplateRuleDTO => ({
  id,
  template_id: 1,
  from_no: from,
  to_no: to,
  type_id: type,
  rule_order: order
})

describe('applyTemplate', () => {
  it('按 order_in_paper 落入区间赋 type_id', () => {
    const qs = [
      { id: 1, order_in_paper: 1 },
      { id: 2, order_in_paper: 2 },
      { id: 3, order_in_paper: 3 },
      { id: 4, order_in_paper: 4 }
    ]
    const rules = [rule(1, 1, 2, 10), rule(2, 3, 4, 20)]
    const r = applyTemplate(qs, rules)
    expect(r).toEqual([
      { questionId: 1, typeId: 10 },
      { questionId: 2, typeId: 10 },
      { questionId: 3, typeId: 20 },
      { questionId: 4, typeId: 20 }
    ])
  })

  it('未命中区间 → type_id=null', () => {
    const qs = [{ id: 1, order_in_paper: 5 }]
    const rules = [rule(1, 1, 3, 10)]
    const r = applyTemplate(qs, rules)
    expect(r[0].typeId).toBeNull()
  })

  it('order_in_paper=null → type_id=null', () => {
    const qs = [{ id: 1, order_in_paper: null }]
    const r = applyTemplate(qs, [rule(1, 1, 5, 10)])
    expect(r[0].typeId).toBeNull()
  })

  it('多条规则重叠时按 rule_order 先命中先用', () => {
    const qs = [{ id: 1, order_in_paper: 2 }]
    // 规则A(1-3,type=10,order=0) 与 规则B(2-2,type=20,order=1) 重叠
    // A 的 order 更小，先匹配 → type=10
    const rules = [rule(1, 1, 3, 10, 0), rule(2, 2, 2, 20, 1)]
    const r = applyTemplate(qs, rules)
    expect(r[0].typeId).toBe(10)
  })

  it('规则 order 反过来 → 先匹配 B', () => {
    const qs = [{ id: 1, order_in_paper: 2 }]
    const rules = [rule(1, 1, 3, 10, 1), rule(2, 2, 2, 20, 0)]
    const r = applyTemplate(qs, rules)
    expect(r[0].typeId).toBe(20)
  })

  it('to_no 为 null 视为 +∞（开区间右端）', () => {
    const qs = [
      { id: 1, order_in_paper: 1 },
      { id: 2, order_in_paper: 100 }
    ]
    const r = applyTemplate(qs, [
      { id: 1, template_id: 1, from_no: 1, to_no: 5, type_id: 10, rule_order: 0 },
      { id: 2, template_id: 1, from_no: 6, to_no: null, type_id: 20, rule_order: 1 }
    ])
    expect(r[0].typeId).toBe(10)
    expect(r[1].typeId).toBe(20) // 100 >= 6 且 <= +∞
  })

  it('from_no 为 null 视为 -∞（开区间左端）', () => {
    const qs = [{ id: 1, order_in_paper: 0 }]
    const r = applyTemplate(qs, [
      { id: 1, template_id: 1, from_no: null, to_no: 2, type_id: 30, rule_order: 0 }
    ])
    expect(r[0].typeId).toBe(30)
  })
})
