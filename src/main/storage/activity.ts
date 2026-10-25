// Files must not move while an asynchronous OCR/import operation owns them.
let activeUsers = 0
let moving = false

export async function withStorageUse<T>(action: () => Promise<T>): Promise<T> {
  if (moving) throw new Error('资料目录正在迁移，请完成后再操作')
  activeUsers++
  try { return await action() } finally { activeUsers-- }
}

export async function withStorageMigration<T>(action: () => Promise<T>): Promise<T> {
  if (moving || activeUsers) throw new Error('识别或图片保存正在使用资料目录，请停止等待或完成后再迁移')
  moving = true
  try { return await action() } finally { moving = false }
}
