import { ipcMain } from 'electron'
import { getDb } from '../storage/StorageService'
import { exportBasketDocx, normalizeWordOptions } from '../export/ExportServiceDocx'
import { DEFAULT_WORD_OPTIONS } from '../../shared/editable'

function requireSet(setId: number): void {
  if (!Number.isSafeInteger(setId) || setId <= 0 || !getDb().prepare('SELECT id FROM paper_sets WHERE id = ?').get(setId)) {
    throw new Error('组卷篮不存在，请重新打开组卷篮。')
  }
}

export function registerWordIpc(): void {
  ipcMain.handle('sets:reorder', (_event, setId: number, itemIds: number[]) => {
    requireSet(setId)
    const db = getDb()
    db.transaction(() => {
      const existing = db.prepare('SELECT id FROM paper_set_items WHERE set_id = ?').all(setId) as { id: number }[]
      if (!Array.isArray(itemIds) || itemIds.length !== existing.length || new Set(itemIds).size !== itemIds.length ||
        itemIds.some((id) => !Number.isSafeInteger(id) || !existing.some((row) => row.id === id))) {
        throw new Error('组卷篮已改变，请重新加载后调整题序。')
      }
      const update = db.prepare('UPDATE paper_set_items SET order_index = ? WHERE id = ? AND set_id = ?')
      itemIds.forEach((id, index) => update.run(index, id, setId))
    })()
  })
  ipcMain.handle('export:wordOptions', (_event, setId: number) => {
    requireSet(setId)
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(`word_options:${setId}`) as { value: string } | undefined
    return row ? normalizeWordOptions(JSON.parse(row.value)) : { ...DEFAULT_WORD_OPTIONS }
  })
  ipcMain.handle('export:saveWordOptions', (_event, setId: number, input: unknown) => {
    requireSet(setId)
    const options = normalizeWordOptions(input)
    getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(`word_options:${setId}`, JSON.stringify(options))
  })
  ipcMain.handle('export:basketDocx', (_event, setId: number, input: unknown) => {
    requireSet(setId)
    return exportBasketDocx(setId, normalizeWordOptions(input))
  })
}
