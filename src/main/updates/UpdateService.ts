import { app, BrowserWindow, net, shell } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { getDb } from '../storage/StorageService'
import { assertStorageIdleForUpdate } from '../storage/activity'
import { installVerifiedUpdate, readUpdateInstallResult } from './UpdateInstaller'
import type { UpdatePreferences, UpdateRelease, UpdateState } from '../../shared/updates'

const OWNER = 'chengyingzh433-stack'
const REPOSITORY = 'physics-question-bank'
const REPOSITORY_URL = `https://github.com/${OWNER}/${REPOSITORY}`
const API_URL = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/releases`
const PREFERENCE_KEY = 'updates:preferences'
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024
const MAX_API_BYTES = 8 * 1024 * 1024
const MAX_CHECKSUM_BYTES = 256 * 1024
const MAX_RELEASE_PAGES = 5
const DOWNLOAD_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'])

interface Version { text: string; core: bigint[]; prerelease: string[] }
interface Asset { id: number; name: string; size: number; url: string; sha256: string | null }
interface Release { view: UpdateRelease; tag: string; asset: Asset | null; checksum: Asset | null }
interface Verified { filePath: string; version: string; sha256: string; size: number; assetId: number }
interface Operation { kind: 'check' | 'download'; controller: AbortController; cancelled: boolean; promise: Promise<UpdateState> }
class UpdateError extends Error {}

let state: UpdateState | null = null
let selected: Release | null = null
let verified: Verified | null = null
let operation: Operation | null = null
let initialized = false
let startupNotice: string | null = null
let startupCleanup: Promise<void> = Promise.resolve()

/** Strict SemVer comparison, including numeric prerelease identifiers; build metadata is ignored. */
function version(value: unknown): Version | null {
  if (typeof value !== 'string' || value.length > 180) return null
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value)
  if (!match) return null
  const prerelease = match[4]?.split('.') ?? []
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return null
  return { text: value, core: match.slice(1, 4).map((part) => BigInt(part)), prerelease }
}

function compare(left: Version, right: Version): number {
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1
  if (!left.prerelease.length || !right.prerelease.length) return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length ? -1 : 1
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    const a = left.prerelease[i], b = right.prerelease[i]
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1
    if (a === b) continue
    const numericA = /^\d+$/.test(a), numericB = /^\d+$/.test(b)
    if (numericA && numericB) return BigInt(a) > BigInt(b) ? 1 : -1
    if (numericA !== numericB) return numericA ? -1 : 1
    return a > b ? 1 : -1
  }
  return 0
}

function current(): UpdateState {
  if (state) return state
  const currentVersion = app.getVersion()
  const defaults: UpdatePreferences = { autoCheck: true, includePrerelease: Boolean(version(currentVersion)?.prerelease.length) }
  let preferences = defaults
  try {
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(PREFERENCE_KEY) as { value: string } | undefined
    if (row) preferences = validatePreferences(JSON.parse(row.value))
  } catch { /* A malformed preference must not prevent the question bank from opening. */ }
  state = { phase: 'idle', currentVersion, platform: process.platform, arch: process.arch, packaged: app.isPackaged,
    preferences, release: null, checkedAt: null, downloadedBytes: 0, totalBytes: 0, message: null }
  return state
}

function validatePreferences(value: unknown): UpdatePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UpdateError('软件更新设置无效')
  const input = value as Record<string, unknown>
  if (typeof input.autoCheck !== 'boolean' || typeof input.includePrerelease !== 'boolean') throw new UpdateError('软件更新开关必须为开启或关闭')
  return { autoCheck: input.autoCheck, includePrerelease: input.includePrerelease }
}

export function getUpdateState(): UpdateState {
  const value = current()
  return { ...value, preferences: { ...value.preferences }, release: value.release ? { ...value.release } : null }
}

function message(text: string): string { return startupNotice ? `${startupNotice}\n${text}` : text }
function setError(error: unknown): void { Object.assign(current(), { phase: 'error', message: message(errorMessage(error)) }) }

function errorMessage(error: unknown): string {
  if (error instanceof UpdateError) return error.message
  const value = error as NodeJS.ErrnoException
  if (value?.code === 'ENOSPC') return '磁盘空间不足，未完成更新。请清理空间后重新下载。'
  if (value?.code === 'EACCES' || value?.code === 'EPERM') return '无法写入更新缓存，请检查当前账户对应用数据目录的访问权限。'
  if (value?.name === 'AbortError') return '连接超时，更新未完成。请检查网络或系统代理后重试。'
  return '无法完成更新请求，请检查网络、系统代理或 GitHub 服务后重试；当前应用与题库保持不变。'
}

function assertNotInstalling(): void {
  if (current().phase === 'installing') throw new UpdateError('正在准备安装并等待应用退出，请先完成或取消本次安装。')
}

export function saveUpdatePreferences(input: UpdatePreferences): UpdateState {
  assertNotInstalling()
  if (operation) throw new UpdateError('正在检查或下载更新，请完成或取消后再修改更新设置。')
  const preferences = validatePreferences(input)
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(PREFERENCE_KEY, JSON.stringify(preferences))
  if (current().preferences.includePrerelease !== preferences.includePrerelease) {
    selected = null; verified = null
    Object.assign(current(), { phase: 'idle', release: null, downloadedBytes: 0, totalBytes: 0,
      message: '更新范围已更改，请重新检查版本。已下载缓存会保留，匹配时可以复用。' })
  }
  current().preferences = preferences
  return getUpdateState()
}

function safeHttps(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new UpdateError('发布信息含有无效的下载地址，已停止更新。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) throw new UpdateError('更新地址不符合 HTTPS 安全要求，已停止更新。')
  return url
}

function fixedAssetUrl(raw: unknown, tag: string, name: string): string {
  if (typeof raw !== 'string') throw new UpdateError('发布文件没有可用的公开下载地址。')
  const url = safeHttps(raw)
  let parts: string[]
  try { parts = url.pathname.split('/').slice(1).map(decodeURIComponent) } catch { throw new UpdateError('发布文件地址编码无效。') }
  const expected = [OWNER, REPOSITORY, 'releases', 'download', tag, name]
  if (url.hostname !== 'github.com' || url.search || parts.length !== expected.length || parts.some((part, index) => part !== expected[index])) {
    throw new UpdateError('安装包不属于指定 GitHub 仓库和版本，已禁止下载。')
  }
  return `${REPOSITORY_URL}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`
}

function validateRequestUrl(raw: string, kind: 'api' | 'asset', original: string): void {
  const url = safeHttps(raw)
  if (kind === 'api') {
    if (raw !== original || url.hostname !== 'api.github.com' || url.pathname !== `/repos/${OWNER}/${REPOSITORY}/releases`) throw new UpdateError('更新接口发生了非预期跳转，已停止读取。')
    return
  }
  if (!DOWNLOAD_HOSTS.has(url.hostname)) throw new UpdateError('安装包跳转到了未允许的下载服务器，已停止下载。')
  if (url.hostname === 'github.com' && raw !== original) throw new UpdateError('安装包跳转到了其他仓库或路径，已停止下载。')
  if (url.hostname !== 'github.com' && !/^\/github-production-release-asset\//.test(url.pathname) && !/^\/github-production-release-asset-\d+\//.test(url.pathname)) {
    throw new UpdateError('安装包下载路径不是 GitHub 发布资源，已停止下载。')
  }
}

/** net.request keeps system proxy support and exposes redirects before following them. */
function fetchChecked(url: string, kind: 'api' | 'asset', signal: AbortSignal): Promise<Response> {
  validateRequestUrl(url, kind, url)
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const request = net.request({ url, method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      bypassCustomProtocolHandlers: true,
      headers: kind === 'api' ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } : { Accept: 'application/octet-stream' } })
    let stream: Readable | null = null
    let redirects = 0
    const cleanup = (): void => signal.removeEventListener('abort', abort)
    const fail = (error: unknown): void => {
      cleanup(); reject(error)
      if (stream && !stream.destroyed) stream.destroy(error instanceof Error ? error : new Error('Update request failed'))
      request.abort()
    }
    const abort = (): void => fail(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    request.on('error', (error) => {
      cleanup(); reject(error)
      if (stream && !stream.destroyed) stream.destroy(error)
    })
    request.on('redirect', (status, method, next) => {
      try {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (kind === 'api' || ++redirects > 5 || method !== 'GET' || ![301, 302, 303, 307, 308].includes(status)) throw new UpdateError('更新服务重定向异常，请稍后重新检查。')
        validateRequestUrl(next, kind, url)
        // Electron requires this call synchronously in its redirect event.
        request.followRedirect()
      } catch (error) { fail(error) }
    })
    request.on('response', (incoming) => {
      try {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const headers = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
          else headers.set(name, value)
        }
        if (incoming.statusCode !== 200) {
          if (incoming.statusCode === 403 || incoming.statusCode === 429) {
            const reset = Number(headers.get('x-ratelimit-reset'))
            const when = Number.isFinite(reset) && reset > Date.now() / 1000 && reset < Date.now() / 1000 + 7 * 86400
              ? `，可在 ${new Date(reset * 1000).toLocaleTimeString()} 后重试` : '，请稍后重试'
            throw new UpdateError(`GitHub 暂时限制了公开请求${when}。无需填写 GitHub 令牌。`)
          }
          if (incoming.statusCode === 404) throw new UpdateError('发布版本或安装包暂不可用，请重新检查版本，或在 GitHub 发布页查看。')
          throw new UpdateError(`GitHub 返回 HTTP ${incoming.statusCode}，未完成更新。请稍后重试。`)
        }
        // Electron 44's IncomingMessage is a backpressured Node Readable despite its
        // public EventEmitter-only typing; its own net-fetch uses the same bridge.
        // https://github.com/electron/electron/blob/v44.9.3/lib/common/api/net-client-request.ts
        if (!(incoming instanceof Readable)) throw new UpdateError('当前网络组件不支持安全流式下载，请从发布页手动获取更新。')
        stream = incoming
        stream.on('error', () => { /* The web stream receives this error; retain a handler if its construction fails. */ })
        stream.once('close', () => { cleanup(); if (!stream?.readableEnded) request.abort() })
        const body = Readable.toWeb(stream, { strategy: { highWaterMark: 1024 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } })
        resolve(new Response(body as ReadableStream<Uint8Array>, { status: incoming.statusCode, headers }))
      } catch (error) { fail(error) }
    })
    try { request.end() } catch (error) { fail(error) }
  })
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<string> {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maximum) { await response.body?.cancel(); throw new UpdateError('发布信息超过安全大小限制，已停止更新。') }
  const reader = response.body?.getReader()
  if (!reader) throw new UpdateError('GitHub 返回了空的发布信息。')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const value = await reader.read()
      if (value.done) break
      size += value.value.byteLength
      if (size > maximum) throw new UpdateError('发布信息超过安全大小限制，已停止更新。')
      chunks.push(value.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))
}

function packageNames(releaseVersion: string): string[] {
  if (process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch)) return [`physics-question-bank-${releaseVersion}-mac-${process.arch}.dmg`]
  if (process.platform === 'win32' && ['arm64', 'x64'].includes(process.arch)) return [
    `physics-question-bank-${releaseVersion}-win-${process.arch}.exe`,
    ...(process.arch === 'x64' ? [`教师题库-测试版-${releaseVersion}-安装程序.exe`] : [])
  ]
  return []
}

function parseAsset(value: unknown, tag: string, maximum: number): Asset | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.state !== 'uploaded' || typeof row.name !== 'string' || !Number.isSafeInteger(row.id) || (row.id as number) <= 0 ||
    !Number.isSafeInteger(row.size) || (row.size as number) <= 0 || (row.size as number) > maximum) return null
  const digest = typeof row.digest === 'string' ? /^sha256:([a-f0-9]{64})$/i.exec(row.digest)?.[1].toLowerCase() ?? null : null
  return { id: row.id as number, name: row.name, size: row.size as number, url: fixedAssetUrl(row.browser_download_url, tag, row.name), sha256: digest }
}

function parseRelease(value: unknown): Release | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.draft !== false || typeof row.tag_name !== 'string' || !Array.isArray(row.assets) || typeof row.prerelease !== 'boolean') return null
  const parsed = version(row.tag_name.replace(/^v/, ''))
  if (!parsed || typeof row.published_at !== 'string' || !Number.isFinite(Date.parse(row.published_at))) return null
  const prerelease = row.prerelease || parsed.prerelease.length > 0
  if (prerelease && !current().preferences.includePrerelease) return null
  let asset: Asset | null = null
  for (const name of packageNames(parsed.text)) {
    const matches = row.assets.filter((item) => item && typeof item === 'object' && (item as Record<string, unknown>).name === name)
    if (matches.length > 1) throw new UpdateError('同一版本存在重名安装包，请到发布页核对后重试。')
    if (matches.length) asset = parseAsset(matches[0], row.tag_name, MAX_PACKAGE_BYTES)
    if (asset) break
  }
  const manifests = row.assets.filter((item) => item && typeof item === 'object' && (item as Record<string, unknown>).name === 'SHA256SUMS.txt')
  const checksum = manifests.length === 1 ? parseAsset(manifests[0], row.tag_name, MAX_CHECKSUM_BYTES) : null
  return { tag: row.tag_name, asset, checksum, view: { version: parsed.text,
    name: typeof row.name === 'string' ? row.name.slice(0, 300) : row.tag_name,
    notes: typeof row.body === 'string' ? row.body.slice(0, 60000) : '', publishedAt: row.published_at,
    pageUrl: `${REPOSITORY_URL}/releases/tag/${encodeURIComponent(row.tag_name)}`, prerelease,
    assetName: asset?.name ?? null, assetSize: asset?.size ?? null } }
}

async function discover(signal: AbortSignal): Promise<Release[]> {
  const releases: Release[] = []
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const response = await fetchChecked(`${API_URL}?per_page=100&page=${page}`, 'api', signal)
    const hasNext = /rel="next"/.test(response.headers.get('link') ?? '')
    const result: unknown = JSON.parse(await readBounded(response, MAX_API_BYTES, signal))
    if (!Array.isArray(result)) throw new UpdateError('GitHub 发布列表格式无效，未改变当前版本。')
    for (const item of result) { const release = parseRelease(item); if (release) releases.push(release) }
    if (!hasNext) return releases
  }
  throw new UpdateError('发布记录数量超过本版检查范围，请从 GitHub 发布页获取更新。')
}

export function checkForUpdates(): Promise<UpdateState> {
  assertNotInstalling()
  if (operation) {
    if (operation.kind === 'check') return operation.promise
    throw new UpdateError('安装包正在下载，请完成或取消后再检查。')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  Object.assign(current(), { phase: 'checking', message: message('正在读取 GitHub 发布版本…') })
  const task: Operation = { kind: 'check', controller, cancelled: false, promise: Promise.resolve(getUpdateState()) }
  operation = task
  task.promise = (async () => {
    try {
      const installed = version(current().currentVersion)
      if (!installed) throw new UpdateError('当前应用版本格式不受支持，请通过 GitHub 发布页手动安装正式发布包。')
      const releases = (await discover(controller.signal)).filter((release) => compare(version(release.view.version)!, installed) > 0)
        .sort((a, b) => compare(version(b.view.version)!, version(a.view.version)!))
      selected = releases.find((release) => release.asset) ?? releases[0] ?? null
      const reusable = selected?.asset && verified && verified.version === selected.view.version && verified.assetId === selected.asset.id &&
        verified.size === selected.asset.size && (!selected.asset.sha256 || selected.asset.sha256 === verified.sha256)
      if (!reusable) verified = null
      Object.assign(current(), { checkedAt: new Date().toISOString(), release: selected?.view ?? null,
        downloadedBytes: reusable ? verified!.size : 0, totalBytes: selected?.asset?.size ?? 0,
        phase: selected ? reusable ? 'ready' : 'available' : 'current', message: message(selected
          ? selected.asset ? reusable ? '安装包已下载并核对，可安装更新。' : `发现 ${selected.view.version}，可由你选择下载和安装。`
            : `发现 ${selected.view.version}，但没有适用于 ${process.platform} / ${process.arch} 的安装包，请查看发布页。`
          : current().preferences.includePrerelease ? '当前已是所选更新范围内的最新版本。' : '当前没有更高的正式版。测试版可在开启“接收测试版”后检查。') })
    } catch (error) { current().checkedAt = new Date().toISOString(); setError(error) }
    finally { clearTimeout(timeout); if (operation === task) operation = null }
    return getUpdateState()
  })()
  return task.promise
}

async function expectedDigest(release: Release, signal: AbortSignal): Promise<string> {
  if (!release.asset) throw new UpdateError('此发布没有匹配的安装包。')
  if (release.asset.sha256) return release.asset.sha256
  if (!release.checksum) throw new UpdateError('发布者尚未提供安装包 SHA-256，已禁止自动安装。请在发布页反馈此问题。')
  const response = await fetchChecked(release.checksum.url, 'asset', signal)
  const text = await readBounded(response, MAX_CHECKSUM_BYTES, signal)
  const matches: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})[ \t]+\*?(.+)$/i.exec(line)
    if (match && match[2].trim() === release.asset.name) matches.push(match[1].toLowerCase())
  }
  if (matches.length !== 1) throw new UpdateError('校验文件中缺少安装包的唯一 SHA-256 记录，已停止更新。')
  return matches[0]
}

async function fileDigest(path: string, expectedSize: number, signal: AbortSignal): Promise<string> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expectedSize || info.size > MAX_PACKAGE_BYTES) throw new UpdateError('更新缓存大小或文件类型不正确，请重新下载。')
  const hash = createHash('sha256')
  const stream = createReadStream(path, { highWaterMark: 1024 * 1024, signal })
  let size = 0
  for await (const data of stream) {
    size += (data as Buffer).length
    if (size > expectedSize) { stream.destroy(); throw new UpdateError('更新缓存发生变化，请重新下载。') }
    hash.update(data)
  }
  if (size !== expectedSize) throw new UpdateError('更新缓存不完整，请重新下载。')
  return hash.digest('hex')
}

function cacheDirectory(): string { return join(app.getPath('userData'), 'update-cache') }

/** The previous process may have exited before its finally block removed a partial download. */
async function cleanStalePartials(): Promise<void> {
  const cutoff = Date.now() - 60_000
  try {
    const root = cacheDirectory()
    for (const name of await readdir(root)) {
      if (!/^(?:physics-question-bank-[0-9A-Za-z.+-]+-(?:mac|win)-(?:arm64|x64)\.(?:dmg|exe)|教师题库-测试版-[0-9A-Za-z.+-]+-安装程序\.exe)\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.part$/.test(name)) continue
      const path = join(root, name), info = await lstat(path)
      if (info.isFile() && !info.isSymbolicLink() && info.mtimeMs < cutoff) await rm(path, { force: true })
    }
  } catch { /* Never let stale download cleanup prevent normal app startup. */ }
}

/** Only prune updater-owned regular package files; installer staging/backup directories are untouched. */
async function pruneCache(keep: string): Promise<void> {
  try {
    const root = cacheDirectory()
    const files: { path: string; modified: number }[] = []
    for (const name of await readdir(root)) {
      if (!/^(?:physics-question-bank-[0-9A-Za-z.+-]+-(?:mac|win)-(?:arm64|x64)\.(?:dmg|exe)|教师题库-测试版-[0-9A-Za-z.+-]+-安装程序\.exe)$/.test(name)) continue
      const path = join(root, name), info = await lstat(path)
      if (info.isFile() && !info.isSymbolicLink() && path !== keep) files.push({ path, modified: info.mtimeMs })
    }
    files.sort((a, b) => b.modified - a.modified)
    for (const file of files.slice(1)) await rm(file.path, { force: true }).catch(() => {})
  } catch { /* Cache housekeeping is not allowed to invalidate a verified download. */ }
}

export function downloadUpdate(): Promise<UpdateState> {
  assertNotInstalling()
  if (!app.isPackaged) throw new UpdateError('开发运行模式不能下载应用更新，请使用已安装的正式发布包。')
  if (operation) {
    if (operation.kind === 'download') return operation.promise
    throw new UpdateError('正在检查版本，请等待检查完成后下载。')
  }
  const release = selected
  if (!release?.asset) throw new UpdateError('没有匹配当前系统的安装包，请先检查版本。')
  const installed = version(current().currentVersion)
  if (!installed || compare(version(release.view.version)!, installed) <= 0) throw new UpdateError('不能下载相同版本或较旧版本作为更新。')
  const controller = new AbortController()
  const task: Operation = { kind: 'download', controller, cancelled: false, promise: Promise.resolve(getUpdateState()) }
  operation = task; verified = null
  Object.assign(current(), { phase: 'downloading', downloadedBytes: 0, totalBytes: release.asset.size, message: '正在核对安装包信息…' })
  task.promise = (async () => {
    let partial: string | null = null
    let idle: ReturnType<typeof setTimeout> | null = null
    const total = setTimeout(() => controller.abort(), 30 * 60_000)
    const activity = (): void => { if (idle) clearTimeout(idle); idle = setTimeout(() => controller.abort(), 60_000) }
    activity()
    try {
      const asset = release.asset!
      const digest = await expectedDigest(release, controller.signal)
      // Initialization must finish deleting old partials before a new one exists.
      await startupCleanup
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const directory = cacheDirectory()
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const target = join(directory, asset.name)
      let cached = false
      try { cached = await fileDigest(target, asset.size, controller.signal) === digest } catch (error) {
        if (controller.signal.aborted) throw error
      }
      if (!cached) {
        await rm(target, { force: true })
        partial = join(directory, `${asset.name}.${randomUUID()}.part`)
        const response = await fetchChecked(asset.url, 'asset', controller.signal)
        activity()
        const lengthHeader = response.headers.get('content-length')
        if (lengthHeader !== null && Number(lengthHeader) !== asset.size) { await response.body?.cancel(); throw new UpdateError('下载大小与发布记录不一致，已停止更新。请重新检查版本。') }
        const reader = response.body?.getReader()
        if (!reader) throw new UpdateError('安装包下载返回了空内容。')
        let handle: Awaited<ReturnType<typeof open>> | null = null
        const hash = createHash('sha256')
        let bytes = 0
        try {
          handle = await open(partial, 'wx', 0o600)
          while (true) {
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
            const result = await reader.read()
            if (result.done) break
            activity(); bytes += result.value.byteLength
            if (bytes > asset.size || bytes > MAX_PACKAGE_BYTES) throw new UpdateError('安装包超过声明大小，已停止下载。')
            hash.update(result.value)
            let offset = 0
            while (offset < result.value.byteLength) {
              const written = await handle.write(result.value, offset, result.value.byteLength - offset)
              if (!written.bytesWritten) throw new UpdateError('更新缓存写入中断，请检查磁盘空间后重试。')
              offset += written.bytesWritten
            }
            Object.assign(current(), { downloadedBytes: bytes, message: '正在下载；完成后会核对 SHA-256。' })
          }
          if (bytes !== asset.size) throw new UpdateError('安装包下载不完整，请重新下载。')
          if (hash.digest('hex') !== digest) throw new UpdateError('安装包 SHA-256 与发布记录不符，文件已丢弃，禁止安装。请重新检查发布版本。')
          await handle.sync()
        } finally { await reader.cancel().catch(() => {}); await handle?.close() }
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await rename(partial, target); partial = null
      }
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      await pruneCache(target)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      verified = { filePath: target, version: release.view.version, sha256: digest, size: asset.size, assetId: asset.id }
      Object.assign(current(), { phase: 'ready', downloadedBytes: asset.size, totalBytes: asset.size,
        message: '安装包已下载并核对 SHA-256。点击安装后会正常退出应用，未保存内容仍会提醒。' })
    } catch (error) {
      verified = null
      if (task.cancelled) Object.assign(current(), { phase: 'available', downloadedBytes: 0, message: '已取消下载，当前应用保持不变。' })
      else setError(error)
    } finally {
      clearTimeout(total); if (idle) clearTimeout(idle)
      if (partial) await rm(partial, { force: true }).catch(() => {})
      if (operation === task) operation = null
    }
    return getUpdateState()
  })()
  return task.promise
}

export async function cancelUpdateDownload(): Promise<UpdateState> {
  if (operation?.kind !== 'download') return getUpdateState()
  const task = operation
  task.cancelled = true; task.controller.abort()
  return task.promise
}

export async function installUpdate(): Promise<UpdateState> {
  assertNotInstalling()
  if (operation) throw new UpdateError('请等待检查或下载完成后再安装。')
  if (!app.isPackaged) throw new UpdateError('开发运行模式不能替换应用，请使用已安装的正式发布包。')
  const packageFile = verified
  if (!packageFile || !selected?.asset || selected.view.version !== packageFile.version || selected.asset.id !== packageFile.assetId) throw new UpdateError('没有已核对的安装包，请先完成下载。')
  const installed = version(app.getVersion())
  if (!installed || compare(version(packageFile.version)!, installed) <= 0) throw new UpdateError('不能安装相同版本或降级更新。')
  assertStorageIdleForUpdate()
  Object.assign(current(), { phase: 'installing', message: '正在准备安装。应用正常退出后才会替换；如有未保存修改，请按退出提示选择。' })
  try {
    await installVerifiedUpdate({ filePath: packageFile.filePath, version: packageFile.version, sha256: packageFile.sha256 }, () => {
      Object.assign(current(), { phase: 'ready', message: '本次退出或安装已取消。安装包仍保留，可保存当前工作后再次安装。' })
      if (BrowserWindow.getAllWindows().length === 0) app.emit('activate')
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : '请保存当前工作后重试。'
    Object.assign(current(), { phase: 'ready', message: `安装尚未开始：${detail}` })
  }
  return getUpdateState()
}

export async function openUpdateRelease(): Promise<void> {
  // The renderer supplies no URLs. Every link is constructed from the fixed repository and validated tag.
  await shell.openExternal(selected?.view.pageUrl ?? `${REPOSITORY_URL}/releases`)
}

export function initializeUpdates(): void {
  if (initialized) return
  initialized = true; current()
  app.on('before-quit', () => { if (operation) { operation.cancelled = true; operation.controller.abort() } })
  startupCleanup = cleanStalePartials()
  void readUpdateInstallResult().then(async (report) => {
    if (report) {
      startupNotice = report.message
      if (report.backupPath) startupNotice += `\n旧版本备份：${report.backupPath}`
      if (!operation && current().phase === 'idle') Object.assign(current(), { phase: report.status === 'error' ? 'error' : 'idle', message: startupNotice })
      if (report.status === 'error') return
    }
    await startupCleanup
    if (!app.isPackaged) return
    const timer = setTimeout(() => {
      if (current().preferences.autoCheck && !current().checkedAt && !operation && current().phase === 'idle') void checkForUpdates().catch((error) => setError(error))
    }, 6000)
    timer.unref()
  }).catch(() => {
    if (!operation && current().phase === 'idle') Object.assign(current(), { message: '上次安装记录暂时无法读取，可手动检查更新。' })
  })
}
