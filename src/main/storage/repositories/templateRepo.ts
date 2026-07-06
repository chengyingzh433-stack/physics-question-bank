import type { DB } from '../StorageService'

export interface TemplateRow {
  id: number
  name: string
  created_at: string
}

export interface TemplateRuleRow {
  id: number
  template_id: number
  from_no: number | null
  to_no: number | null
  type_id: number | null
  rule_order: number | null
}

export function listTemplates(db: DB): TemplateRow[] {
  return db.prepare(`SELECT * FROM templates ORDER BY id ASC`).all() as TemplateRow[]
}

export function createTemplate(db: DB, name: string): number {
  const r = db
    .prepare(`INSERT INTO templates (name, created_at) VALUES (?, ?)`)
    .run(name, new Date().toISOString())
  return Number(r.lastInsertRowid)
}

export function deleteTemplate(db: DB, id: number): void {
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id) // rules 级联删
}

export function listRules(db: DB, templateId: number): TemplateRuleRow[] {
  return db
    .prepare(`SELECT * FROM template_rules WHERE template_id = ? ORDER BY rule_order ASC, id ASC`)
    .all(templateId) as TemplateRuleRow[]
}

export function addRule(
  db: DB,
  templateId: number,
  rule: { from_no: number; to_no: number; type_id: number; rule_order?: number }
): number {
  const r = db
    .prepare(
      `INSERT INTO template_rules (template_id, from_no, to_no, type_id, rule_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(templateId, rule.from_no, rule.to_no, rule.type_id, rule.rule_order ?? 0)
  return Number(r.lastInsertRowid)
}

export function deleteRule(db: DB, ruleId: number): void {
  db.prepare(`DELETE FROM template_rules WHERE id = ?`).run(ruleId)
}
