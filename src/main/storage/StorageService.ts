import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { SCHEMA_V1, BUILTIN_TYPES, BUILTIN_DIFFICULTIES } from './schema'

export type DB = Database.Database

let dbInstance: DB | null = null

/** 打开（或返回已存在的）数据库单例句柄。 */
export function getDb(): DB {
  if (dbInstance) return dbInstance

  const dbPath = join(app.getPath('userData'), 'app.db')
  const db = new Database(dbPath)
  // A10: 每个连接显式开启外键（schema 里也有 PRAGMA，但对当前连接必须再确保一次）
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  dbInstance = db
  return db
}

/** 应用启动时调用：建表 + 种子数据。幂等。 */
export function initDatabase(): void {
  const db = getDb()

  // 执行建表脚本（含 PRAGMA，CREATE TABLE IF NOT EXISTS 幂等）
  db.exec(SCHEMA_V1)

  // 种子数据仅在 schema_meta 为空（首次）时写入
  const row = db.prepare('SELECT COUNT(*) AS c FROM schema_meta').get() as { c: number }
  if (row.c === 0) {
    const now = new Date().toISOString()
    const seed = db.transaction(() => {
      db.prepare('INSERT INTO schema_meta (version) VALUES (?)').run(1)

      const insertType = db.prepare(
        'INSERT INTO question_types (name, is_builtin) VALUES (?, 1)'
      )
      for (const name of BUILTIN_TYPES) insertType.run(name)

      const insertDiff = db.prepare(
        'INSERT INTO difficulties (name, sort_order) VALUES (?, ?)'
      )
      BUILTIN_DIFFICULTIES.forEach((name, i) => insertDiff.run(name, i))

      // 用一下 now 避免未用告警；schema_meta 无时间戳列，这里仅留作扩展点
      void now
    })
    seed()
  }

  // 幂等迁移：pages.rotation（T5，A6 旋转页支持）
  const cols = db.prepare("PRAGMA table_info(pages)").all() as { name: string }[]
  if (!cols.some((c) => c.name === 'rotation')) {
    db.exec('ALTER TABLE pages ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0')
  }

  // 幂等迁移：年份/出处（M13）。papers 存默认值，questions 存单题覆盖，
  // 读取口径统一 COALESCE(q.*_override, p.*)。空（NULL）表示继承，不用 0/空串。
  const paperCols = db.prepare("PRAGMA table_info(papers)").all() as { name: string }[]
  if (!paperCols.some((c) => c.name === 'year')) {
    db.exec('ALTER TABLE papers ADD COLUMN year INTEGER')
  }
  if (!paperCols.some((c) => c.name === 'source')) {
    db.exec('ALTER TABLE papers ADD COLUMN source TEXT')
  }
  const questionCols = db.prepare("PRAGMA table_info(questions)").all() as { name: string }[]
  if (!questionCols.some((c) => c.name === 'year_override')) {
    db.exec('ALTER TABLE questions ADD COLUMN year_override INTEGER')
  }
  if (!questionCols.some((c) => c.name === 'source_override')) {
    db.exec('ALTER TABLE questions ADD COLUMN source_override TEXT')
  }

  // 幂等迁移：答案卷 + 答案绑定（M14）。
  // 答案 PDF 复用 papers 表：kind='answer' 且 parent_paper_id 指向题目卷，
  // 这样 pages/dividers/cut_lines/manual_boxes/segments 五张几何表零改动复用。
  // 答案图落在题目行上（answer_image_path），删题目卷时级联清理，答案跟题走。
  // 注意：SQLite 的 ALTER TABLE ADD COLUMN 不支持带 REFERENCES 的外键约束，
  // 老库迁移出来的 parent_paper_id 没有 FK 约束（新库走 SCHEMA_V1 才有）。
  // 级联删除由 papers:delete 的应用层逻辑兜底（先删子答案卷再删自己）。
  if (!paperCols.some((c) => c.name === 'kind')) {
    db.exec("ALTER TABLE papers ADD COLUMN kind TEXT NOT NULL DEFAULT 'paper'")
  }
  if (!paperCols.some((c) => c.name === 'parent_paper_id')) {
    db.exec('ALTER TABLE papers ADD COLUMN parent_paper_id INTEGER')
  }
  if (!questionCols.some((c) => c.name === 'answer_image_path')) {
    db.exec('ALTER TABLE questions ADD COLUMN answer_image_path TEXT')
  }
  if (!questionCols.some((c) => c.name === 'answer_width_px')) {
    db.exec('ALTER TABLE questions ADD COLUMN answer_width_px INTEGER')
  }
  if (!questionCols.some((c) => c.name === 'answer_height_px')) {
    db.exec('ALTER TABLE questions ADD COLUMN answer_height_px INTEGER')
  }
}

/** 仅测试/关闭时使用。 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
