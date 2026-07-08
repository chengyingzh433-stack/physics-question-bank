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
}

/** 仅测试/关闭时使用。 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
