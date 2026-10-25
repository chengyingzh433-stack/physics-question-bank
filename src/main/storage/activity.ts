// Files must not move while an asynchronous OCR/import operation owns them.
let activeUsers = 0
let moving = false

/** 更新不能截断资料迁移或正在写入的资源。用户可稍后重试安装。 */
export function assertStorageIdleForUpdate(): void {
  if (moving || activeUsers) throw new Error('资料正在处理或迁移，请等待完成，或暂停识别任务后再安装更新。')
}

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
