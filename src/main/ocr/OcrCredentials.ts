import { app, safeStorage } from 'electron'
import { readFile, writeFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDb } from '../storage/StorageService'
import type { OcrSettingsDTO, OcrSettingsInput } from '../../shared/ocr'

let sessionKey: string | null = null
let loaded = false
let remembered = false
let keyError: string | undefined
let serial: Promise<unknown> = Promise.resolve()
const vaultPath = (): string => join(app.getPath('userData'), 'doc2x-key.encrypted')
export const ocrEnabled = (): boolean => (getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get('doc2x_enabled') as { value: string } | undefined)?.value === 'true'

async function secureAvailable(): Promise<boolean> {
  try {
    return await safeStorage.isAsyncEncryptionAvailable() &&
      !(process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))
  } catch { return false }
}
function validateKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 4096 || /[^\x21-\x7e]/.test(value.trim())) {
    throw new Error('API Key 格式无效，请从 Doc2X 开放平台复制完整 Key')
  }
  return value.trim()
}
async function rememberKey(value: string): Promise<void> {
  if (!await secureAvailable()) throw new Error('系统安全存储暂不可用，请选择仅本次使用')
  const encrypted = await safeStorage.encryptStringAsync(value)
  const temporary = `${vaultPath()}.${randomUUID()}.tmp`
  try { await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 }); await rename(temporary, vaultPath()) }
  finally { await rm(temporary, { force: true }).catch(() => {}) }
}
async function load(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const info = await stat(vaultPath())
    if (info.size > 16384) throw new Error('凭据文件无效')
    remembered = true
    if (!await secureAvailable()) throw new Error('系统安全存储暂不可用')
    const decrypted = await safeStorage.decryptStringAsync(await readFile(vaultPath()))
    sessionKey = validateKey(decrypted.result)
    if (decrypted.shouldReEncrypt) await rememberKey(sessionKey)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') keyError = '已保存的 Key 无法解密，请重新输入；题库内容不受影响'
  }
}
async function settings(): Promise<OcrSettingsDTO> {
  await load()
  return { enabled: ocrEnabled(), hasKey: Boolean(sessionKey), remembered, secureStorageAvailable: await secureAvailable(), keyError }
}
function locked<T>(action: () => Promise<T>): Promise<T> {
  const next = serial.then(action, action)
  serial = next.then(() => undefined, () => undefined)
  return next
}
export const getOcrSettings = (): Promise<OcrSettingsDTO> => locked(settings)
export const saveOcrSettings = (input: OcrSettingsInput): Promise<OcrSettingsDTO> => locked(async () => {
  if (!input || typeof input.enabled !== 'boolean' ||
    (input.remember !== undefined && typeof input.remember !== 'boolean') ||
    (input.clearKey !== undefined && typeof input.clearKey !== 'boolean')) throw new Error('识别设置无效')
  if (input.clearKey && input.enabled) throw new Error('移除 API Key 时须同时关闭识别服务')
  await load()
  if (input.clearKey) {
    await rm(vaultPath(), { force: true })
    sessionKey = null; remembered = false; keyError = undefined
  } else if (input.apiKey !== undefined) {
    const nextKey = validateKey(input.apiKey)
    if (input.remember) await rememberKey(nextKey)
    else await rm(vaultPath(), { force: true })
    sessionKey = nextKey; remembered = Boolean(input.remember); keyError = undefined
  } else if (input.remember === false) {
    await rm(vaultPath(), { force: true }); remembered = false
  } else if (input.remember === true && sessionKey && !remembered) {
    await rememberKey(sessionKey); remembered = true
  }
  if (input.enabled && !sessionKey) throw new Error('请先配置 API Key，或保持识别服务关闭')
  getDb().prepare('INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run('doc2x_enabled', String(input.enabled))
  return settings()
})
export const requireOcrKey = (): Promise<string> => locked(async () => {
  await load()
  if (!ocrEnabled()) throw new Error('Doc2X 识别尚未启用，请在识别设置中启用')
  if (!sessionKey) throw new Error('请在本机重新填写 Doc2X API Key')
  return sessionKey
})
