import type { DB } from './StorageService'
import type { ChapterTemplateDTO } from '../../shared/types'
import { CHAPTER_TEMPLATES, DEFAULT_CHAPTER_TEMPLATE_KEY } from '../../shared/chapterTemplates'

const INITIALIZED_SETTING = 'chapter_templates_initialized'

/** 只扩展旧表，不重建或重新编号，保留题目/知识点对旧章节的引用。 */
export function migrateChapterTemplates(db: DB): void {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(chapters)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'parent_id')) {
      // SQLite 允许添加默认值为 NULL 的 REFERENCES 列，旧行成为根节点。
      db.exec('ALTER TABLE chapters ADD COLUMN parent_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL')
    }
    if (!columns.some((column) => column.name === 'template_key')) {
      db.exec('ALTER TABLE chapters ADD COLUMN template_key TEXT')
    }
    if (!columns.some((column) => column.name === 'node_key')) {
      db.exec('ALTER TABLE chapters ADD COLUMN node_key TEXT')
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_template_node
      ON chapters(template_key, node_key) WHERE template_key IS NOT NULL AND node_key IS NOT NULL`)
    db.exec('CREATE INDEX IF NOT EXISTS idx_chapters_parent ON chapters(parent_id)')
  })()
}

/** 套用只补入不存在的节点；已使用的 id、名称与题目关联均不改写。 */
export function installChapterTemplate(db: DB, key: string): void {
  const template = CHAPTER_TEMPLATES.find((item) => item.key === key)
  if (!template) throw new Error('未找到这个章节模板')

  db.transaction(() => {
    const lookup = db.prepare('SELECT id FROM chapters WHERE template_key = ? AND node_key = ?')
    const insert = db.prepare('INSERT INTO chapters (name, parent_id, template_key, node_key) VALUES (?, ?, ?, ?)')
    const resolvedIds = new Map<string, number>()
    const resolving = new Set<string>()
    const definitions = new Map(template.nodes.map((node) => [node.key, node]))
    const resolveNode = (nodeKey: string): number => {
      const resolved = resolvedIds.get(nodeKey)
      if (resolved !== undefined) return resolved
      const existing = lookup.get(key, nodeKey) as { id: number } | undefined
      if (existing) {
        resolvedIds.set(nodeKey, existing.id)
        return existing.id
      }
      const node = definitions.get(nodeKey)
      if (!node || resolving.has(nodeKey)) throw new Error('章节模板的层级定义无效')
      resolving.add(nodeKey)
      const parentId = node.parentKey === null ? null : resolveNode(node.parentKey)
      const id = Number(insert.run(node.name, parentId, key, node.key).lastInsertRowid)
      resolving.delete(nodeKey)
      resolvedIds.set(nodeKey, id)
      return id
    }
    for (const node of template.nodes) resolveNode(node.key)
  })()
}

export function listChapterTemplates(db: DB): ChapterTemplateDTO[] {
  const query = db.prepare('SELECT node_key FROM chapters WHERE template_key = ?')
  return CHAPTER_TEMPLATES.map((template) => {
    const installedKeys = new Set((query.all(template.key) as { node_key: string }[]).map((row) => row.node_key))
    return {
      key: template.key,
      name: template.name,
      subject: template.subject,
      edition: template.edition,
      node_count: template.nodes.length,
      installed: template.nodes.every((node) => installedKeys.has(node.key))
    }
  })
}

/** 新库与旧库首次升级均准备默认模板；后续启动由 marker 控制，不反复套用。 */
export function initializeChapterTemplates(db: DB): void {
  db.transaction(() => {
    migrateChapterTemplates(db)
    const initialized = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(INITIALIZED_SETTING)
    if (initialized) return
    installChapterTemplate(db, DEFAULT_CHAPTER_TEMPLATE_KEY)
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(INITIALIZED_SETTING, '1')
  })()
}
