import { describe, it, expect } from 'vitest'
import { buildQuestionFilter, buildQuestionQuery } from './questionFilter'

describe('buildQuestionFilter', () => {
  it('无条件仅返回 image_path 非空', () => {
    const r = buildQuestionFilter({})
    expect(r.where).toBe('q.image_path IS NOT NULL')
    expect(r.params).toEqual([])
  })

  it('单个条件 type_id', () => {
    const r = buildQuestionFilter({ type_id: 3 })
    expect(r.where).toContain('q.type_id = ?')
    expect(r.params).toEqual([3])
  })

  it('多条件 AND 组合', () => {
    const r = buildQuestionFilter({
      type_id: 1,
      paper_id: 2,
      chapter_id: 3,
      difficulty_id: 4
    })
    expect(r.where).toContain('q.type_id = ?')
    expect(r.where).toContain('q.paper_id = ?')
    expect(r.where).toContain('q.chapter_id = ?')
    expect(r.where).toContain('q.difficulty_id = ?')
    expect(r.where.split(' AND ').length).toBe(5) // 4 条件 + image_path
    expect(r.params).toEqual([1, 2, 3, 4])
  })

  it('知识点命中任一（kp_ids）— where 不含 kp，kp 走 join', () => {
    const r = buildQuestionFilter({ kp_ids: [5, 6, 7] })
    expect(r.where).toBe('q.image_path IS NOT NULL')
    expect(r.params).toEqual([]) // kp params 在 buildQuestionQuery 层加
  })
})

describe('buildQuestionQuery', () => {
  it('知识点 join + DISTINCT', () => {
    const { sql, params } = buildQuestionQuery({ kp_ids: [1, 2] })
    expect(sql).toContain('SELECT DISTINCT q.* FROM questions q')
    expect(sql).toContain('question_knowledge_points qkp')
    expect(sql).toContain('qkp.kp_id IN (?,?)')
    expect(params).toEqual([1, 2])
  })

  it('无知识点时无 join', () => {
    const { sql } = buildQuestionQuery({ type_id: 1 })
    expect(sql).not.toContain('question_knowledge_points')
    expect(sql).toContain('q.type_id = ?')
  })

  it('组合：题型+章节+知识点', () => {
    const { sql, params } = buildQuestionQuery({
      type_id: 10,
      chapter_id: 20,
      kp_ids: [30, 40]
    })
    expect(sql).toContain('q.type_id = ?')
    expect(sql).toContain('q.chapter_id = ?')
    expect(sql).toContain('qkp.kp_id IN (?,?)')
    // params 顺序：where 条件先（type, chapter），kp join 后
    expect(params).toEqual([10, 20, 30, 40])
  })
})

// M13：年份/出处筛选。口径是 COALESCE(单题覆盖, 试卷默认)，单题覆盖优先。
describe('buildQuestionFilter — 年份/出处（M13）', () => {
  it('年份命中走 COALESCE 口径', () => {
    const r = buildQuestionFilter({ year: 2023 })
    expect(r.where).toContain('COALESCE(q.year_override, p.year) = ?')
    expect(r.params).toEqual([2023])
  })

  it('出处命中走 COALESCE 口径', () => {
    const r = buildQuestionFilter({ source: '新课标 I 卷' })
    expect(r.where).toContain('COALESCE(q.source_override, p.source) = ?')
    expect(r.params).toEqual(['新课标 I 卷'])
  })

  it('年份/出处为 null 时不加条件', () => {
    const r = buildQuestionFilter({ year: null, source: null })
    expect(r.where).toBe('q.image_path IS NOT NULL')
    expect(r.params).toEqual([])
  })

  it('出处为空串时不加条件（空串不是有效筛选值）', () => {
    const r = buildQuestionFilter({ source: '' })
    expect(r.where).toBe('q.image_path IS NOT NULL')
    expect(r.params).toEqual([])
  })

  it('年份+出处+题型组合，params 按加入顺序', () => {
    const r = buildQuestionFilter({ type_id: 1, year: 2024, source: '全国甲卷' })
    expect(r.where).toContain('q.type_id = ?')
    expect(r.where).toContain('COALESCE(q.year_override, p.year) = ?')
    expect(r.where).toContain('COALESCE(q.source_override, p.source) = ?')
    expect(r.params).toEqual([1, 2024, '全国甲卷'])
  })

  it('buildQuestionQuery 始终 JOIN papers（COALESCE 需要 p 别名）', () => {
    const { sql } = buildQuestionQuery({ year: 2023 })
    expect(sql).toContain('JOIN papers p ON p.id = q.paper_id')
    expect(sql).toContain('COALESCE(q.year_override, p.year) = ?')
  })
})
