import { app, BrowserWindow, type Event as ElectronEvent } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, statfs, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { assertStorageIdleForUpdate } from '../storage/activity'
import { macInstallerScript, windowsInstallerScript, type HelperPaths } from './UpdateInstallerHelpers'

interface VerifiedUpdate { filePath: string; version: string; sha256: string }
export interface UpdateInstallResult {
  status: 'success' | 'error'; version: string; message: string; backupPath?: string; logPath?: string
}
interface PreparedInstall { paths: HelperPaths; command: string; args: string[]; stageDirectory?: string; snapshotPath?: string }
const run = promisify(execFile)
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const BUNDLE_ID = 'com.cyz.physics-question-bank'
const REPORT_NAME = 'update-install-result.json'
let installing = false
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const within = (root: string, target: string): boolean => {
  const value = relative(root, target)
  return value !== '' && !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && value !== '..' && !isAbsolute(value)
}
const commandEnvironment = (): NodeJS.ProcessEnv => ({ ...process.env, DITTONORSRC: '', LC_ALL: 'C' })

async function execute(command: string, args: string[], timeout = 30_000): Promise<string> {
  const result = await run(command, args, { timeout, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', windowsHide: true, env: commandEnvironment() })
  return result.stdout.trim()
}

/** Hash an opened regular file; reject symlinks, writable shared files and changes. */
async function verifyFile(filePath: string, sha256: string): Promise<void> {
  const before = await lstat(filePath)
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > 2 * 1024 * 1024 * 1024) throw new Error('更新包不是有效的本地安装文件')
  if (process.platform !== 'win32' && ((before.mode & 0o022) !== 0 || before.uid !== process.getuid?.())) throw new Error('更新包的文件权限不安全，请重新下载')
  const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const first = await handle.stat()
    if (first.dev !== before.dev || first.ino !== before.ino) throw new Error('更新包在读取前发生变化，请重新下载')
    const hash = createHash('sha256')
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
    const last = await handle.stat()
    if (first.size !== last.size || first.mtimeMs !== last.mtimeMs || first.ctimeMs !== last.ctimeMs || hash.digest('hex') !== sha256) throw new Error('更新包校验不一致，已停止安装，请重新下载')
  } finally { await handle.close() }
}

async function plistValue(bundle: string, key: string): Promise<string> {
  const plist = join(bundle, 'Contents', 'Info.plist')
  if ((await lstat(plist)).isSymbolicLink()) throw new Error('安装包的应用资料路径无效')
  return execute('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])
}

/** Read Mach-O CPU types directly; this does not require Xcode/lipo or execution. */
async function executableSupports(file: string, arch: string): Promise<boolean> {
  const handle = await open(file, 'r')
  try {
    const data = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(data, 0, data.length, 0)
    if (bytesRead < 12) return false
    const expected = arch === 'arm64' ? 0x0100000c : arch === 'x64' ? 0x01000007 : -1
    const magic = data.readUInt32BE(0)
    if ([0xfeedface, 0xfeedfacf].includes(magic)) return data.readUInt32BE(4) === expected
    if ([0xcefaedfe, 0xcffaedfe].includes(magic)) return data.readUInt32LE(4) === expected
    const little = magic === 0xbebafeca || magic === 0xbfbafeca
    if (![0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic)) return false
    const uint = (offset: number): number => little ? data.readUInt32LE(offset) : data.readUInt32BE(offset)
    const count = uint(4), stride = [0xcafebabf, 0xbfbafeca].includes(magic) ? 32 : 20
    if (!count || count > 64 || 8 + count * stride > bytesRead) return false
    for (let i = 0; i < count; i++) if (uint(8 + i * stride) === expected) return true
    return false
  } finally { await handle.close() }
}

async function validateBundle(bundle: string, version: string): Promise<void> {
  if (!(await lstat(bundle)).isDirectory() || (await lstat(bundle)).isSymbolicLink()) throw new Error('安装包没有有效的应用目录')
  if (await plistValue(bundle, 'CFBundleIdentifier') !== BUNDLE_ID) throw new Error('安装包属于其他应用，已停止安装')
  if (await plistValue(bundle, 'CFBundleShortVersionString') !== version) throw new Error('安装包内的版本与所选版本不一致')
  const executable = await plistValue(bundle, 'CFBundleExecutable')
  if (!executable || /[\\/\u0000-\u001f]/.test(executable) || executable === '.' || executable === '..') throw new Error('应用可执行文件名称无效')
  const binary = join(bundle, 'Contents', 'MacOS', executable)
  if ((await lstat(binary)).isSymbolicLink() || !within(await realpath(bundle), await realpath(binary))) throw new Error('应用可执行文件不在应用目录中')
  await access(binary, constants.X_OK)
  if (!await executableSupports(binary, process.arch)) throw new Error('安装包不支持这台 Mac 的处理器')
}

/** Reject external bundle links and special files before copying a mounted app. */
async function inspectBundleTree(bundle: string): Promise<number> {
  const root = await realpath(bundle)
  const pending = [root]
  let count = 0, bytes = 0
  while (pending.length) {
    const directory = pending.pop()!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++count > 80_000) throw new Error('安装包包含过多文件，已停止安装')
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        if (!within(root, await realpath(path))) throw new Error('安装包包含应用目录之外的链接')
      } else if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) bytes += (await lstat(path)).size
      else throw new Error('安装包包含不支持的文件类型')
      if (bytes > 4 * 1024 * 1024 * 1024) throw new Error('解开的应用超过本机更新限制')
    }
  }
  return bytes
}

async function writeReports(paths: HelperPaths, version: string, backupPath?: string): Promise<void> {
  const common = { version, logPath: join(paths.directory, 'install.log'), ...(backupPath ? { backupPath } : {}) }
  const success: UpdateInstallResult = { ...common, status: 'success', message: process.platform === 'darwin'
    ? '新版应用已替换并请求重新打开；旧版副本已保留。请核对当前版本与日常功能。'
    : 'Windows 安装程序已退出。请核对当前版本，确认是否已完成更新。' }
  const failure: UpdateInstallResult = { ...common, status: 'error', message: process.platform === 'darwin'
    ? '上次应用替换或重新打开未完成。原应用或旧版副本仍保留；请查看备份位置后重试安装。'
    : '上次 Windows 安装未完成或被取消。原题库与密钥保留，请重新检查版本并决定是否重试。' }
  await writeFile(paths.success, JSON.stringify(success), { flag: 'wx', mode: 0o600 })
  await writeFile(paths.failure, JSON.stringify(failure), { flag: 'wx', mode: 0o600 })
}

async function prepareMac(paths: HelperPaths, image: string, version: string, checkCancelled: () => void): Promise<PreparedInstall> {
  const executable = await realpath(process.execPath)
  const current = resolve(dirname(executable), '..', '..')
  if (!current.endsWith('.app') || current.includes('/AppTranslocation/') || current.startsWith('/Volumes/')) throw new Error('请先把软件放入“应用程序”并从那里打开，再安装更新')
  if (await realpath(current) !== current || (await lstat(current)).isSymbolicLink()) throw new Error('当前应用路径无效，请从“应用程序”中的实际副本打开')
  await validateBundle(current, app.getVersion())
  const parent = dirname(current)
  if ((await lstat(parent)).mode & 0o002) throw new Error('当前安装目录允许其他用户任意改写，请先将软件移到“应用程序”')
  try { await access(parent, constants.W_OK | constants.X_OK) }
  catch { throw new Error('当前安装位置不可写，请把软件移到可写的“应用程序”目录后再更新') }
  const stageDirectory = await mkdtemp(join(parent, '.physics-question-bank-update-'))
  const staged = join(stageDirectory, basename(current))
  const mount = join(paths.directory, 'image')
  const suffix = paths.token.slice(0, 8)
  const oldVersion = app.getVersion().replace(/[^0-9A-Za-z.-]/g, '_').slice(0, 64)
  const backup = join(parent, `${basename(current, '.app')} - 旧版 ${oldVersion} (${suffix}).app`)
  const failed = join(stageDirectory, '未能打开的新版.app')
  let mounted = false
  try {
    await mkdir(mount, { mode: 0o700 })
    checkCancelled()
    try {
      // stdout is a plist, never parsed as shell source. No Finder auto-open.
      await execute('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, '-plist', image], 90_000)
      mounted = true
      checkCancelled()
      const candidates = (await readdir(mount, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.endsWith('.app'))
      if (candidates.length !== 1) throw new Error('更新磁盘镜像须包含唯一的应用')
      const source = join(mount, candidates[0].name)
      await validateBundle(source, version)
      const bytes = await inspectBundleTree(source)
      const disk = await statfs(parent)
      if (Number(disk.bavail) * Number(disk.bsize) < bytes * 1.1 + 32 * 1024 * 1024) throw new Error('安装目录空间不足，请至少留出一份新应用所需空间')
      checkCancelled()
      // Preserve quarantine, xattrs and ACLs; do not bypass Gatekeeper.
      await execute('/usr/bin/ditto', ['--rsrc', '--extattr', '--acl', '--qtn', source, staged], 180_000)
      checkCancelled()
      await validateBundle(staged, version)
    } finally {
      if (mounted) { await execute('/usr/bin/hdiutil', ['detach', mount], 30_000); mounted = false }
    }
    const currentInfo = await lstat(current), stagedInfo = await lstat(staged)
    await writeReports(paths, version, backup)
    const scriptPath = join(paths.directory, 'install.sh')
    await writeFile(scriptPath, macInstallerScript({ ...paths, current, staged, backup, failed,
      currentIdentity: `${currentInfo.dev}:${currentInfo.ino}`, stagedIdentity: `${stagedInfo.dev}:${stagedInfo.ino}` }), { flag: 'wx', mode: 0o700 })
    return { paths, command: '/bin/sh', args: [scriptPath], stageDirectory }
  } catch (error) {
    // A failed attach can still have mounted a volume. Attempt a normal detach;
    // never recursively remove a directory that may still be a mounted image.
    await execute('/usr/bin/hdiutil', ['detach', mount], 15_000).catch(() => {})
    await rm(stageDirectory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function prepareWindows(paths: HelperPaths, installer: string, update: VerifiedUpdate): Promise<PreparedInstall> {
  const systemRoot = process.env.SystemRoot
  if (!systemRoot || !isAbsolute(systemRoot)) throw new Error('无法定位 Windows 系统安装工具')
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  await access(powershell, constants.F_OK)
  await writeReports(paths, update.version)
  const script = windowsInstallerScript({ ...paths, installer, sha256: update.sha256, currentExecutable: process.execPath })
  // EncodedCommand avoids shell/path interpolation and leaves normal NSIS UI on.
  // No ExecutionPolicy override or silent installer arguments are used.
  return { paths, command: powershell, args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], snapshotPath: installer }
}

async function startHelper(prepared: PreparedInstall): Promise<ChildProcess> {
  const log = await open(join(prepared.paths.directory, 'install.log'), 'wx', 0o600)
  let child: ChildProcess
  let failure: Error | null = null
  try {
    child = spawn(prepared.command, prepared.args, { detached: true, windowsHide: true, cwd: prepared.paths.directory, stdio: ['ignore', log.fd, log.fd], env: commandEnvironment() })
    child.on('error', (error) => { failure = error })
  }
  finally { await log.close() }
  const expires = Date.now() + 8000
  while (Date.now() < expires) {
    if (failure) throw failure
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('更新安装助手未能准备好，请重新下载安装包')
    try { if ((await readFile(prepared.paths.ready, 'utf8')) === prepared.paths.token) return child } catch { /* Helper is still starting. */ }
    await pause(100)
  }
  throw new Error('更新安装助手准备超时，请稍后重试')
}

/** Only a final normal quit can authorize the detached helper to act. */
function arrangeNormalQuit(prepared: PreparedInstall, child: ChildProcess, onCancelled: () => void): void {
  const { paths } = prepared
  let cancelled = false, committed = false, willQuit = false
  const observers: { target: Electron.WebContents; listener: (event: ElectronEvent) => void }[] = []
  const closeObservers: { target: BrowserWindow; listener: (event: ElectronEvent) => void }[] = []
  const remove = (): void => {
    clearTimeout(timeout)
    app.removeListener('before-quit', beforeQuit)
    app.removeListener('will-quit', beforeFinalQuit)
    app.removeListener('quit', commit)
    app.removeListener('browser-window-created', newWindow)
    for (const observer of observers) if (!observer.target.isDestroyed()) observer.target.removeListener('will-prevent-unload', observer.listener)
    for (const observer of closeObservers) if (!observer.target.isDestroyed()) observer.target.removeListener('close', observer.listener)
  }
  const cancel = (): void => {
    if (cancelled || committed) return
    cancelled = true
    // This tombstone is never removed. A later ordinary user quit cannot re-arm.
    try { writeFileSync(paths.cancelled, paths.token, { mode: 0o600 }) } catch { /* Missing armed ticket is also fail closed. */ }
    try { unlinkSync(paths.armed) } catch { /* Not yet armed. */ }
    remove(); installing = false; onCancelled()
    if (prepared.stageDirectory) void rm(prepared.stageDirectory, { recursive: true, force: true }).catch(() => {})
    if (prepared.snapshotPath) void rm(prepared.snapshotPath, { force: true }).catch(() => {})
  }
  const permitted = (): boolean => !cancelled && Date.now() < paths.deadline - 10_000 && !existsSync(paths.expired) && child.exitCode === null && child.signalCode === null
  const beforeQuit = (event: ElectronEvent): void => {
    try { assertStorageIdleForUpdate(); if (!permitted()) throw new Error('退出授权已取消') }
    catch { event.preventDefault(); cancel() }
    queueMicrotask(() => { if (event.defaultPrevented) cancel() })
  }
  const beforeFinalQuit = (event: ElectronEvent): void => {
    try { assertStorageIdleForUpdate(); if (!permitted()) throw new Error('退出授权已取消'); willQuit = true }
    catch { event.preventDefault(); cancel() }
    queueMicrotask(() => { if (event.defaultPrevented) cancel() })
  }
  const commit = (_event: ElectronEvent, exitCode: number): void => {
    if (!willQuit || exitCode !== 0 || !permitted()) { cancel(); return }
    try { writeFileSync(paths.armed, paths.token, { flag: 'wx', mode: 0o600 }); committed = true; remove() }
    catch { cancel() }
  }
  const timeout = setTimeout(cancel, Math.max(0, paths.deadline - Date.now()))
  const watchWindow = (window: BrowserWindow): void => {
    const listener = (event: ElectronEvent): void => {
      // The app's existing synchronous dialog listener runs first. Electron's
      // preventDefault here means leave despite beforeunload; false means stay.
      queueMicrotask(() => { if (!event.defaultPrevented) cancel() })
    }
    window.webContents.on('will-prevent-unload', listener)
    observers.push({ target: window.webContents, listener })
    const close = (event: ElectronEvent): void => { queueMicrotask(() => { if (event.defaultPrevented) cancel() }) }
    window.on('close', close)
    closeObservers.push({ target: window, listener: close })
  }
  const newWindow = (_event: ElectronEvent, window: BrowserWindow): void => watchWindow(window)
  for (const window of BrowserWindow.getAllWindows()) watchWindow(window)
  app.on('browser-window-created', newWindow)
  app.on('before-quit', beforeQuit)
  app.on('will-quit', beforeFinalQuit)
  app.on('quit', commit)
  child.once('exit', cancel)
  child.once('error', cancel)
  child.unref()
  // Give the initiating IPC its reply before normal close/beforeunload handling.
  setTimeout(() => { if (!cancelled) app.quit() }, 100)
}

export async function installVerifiedUpdate(update: VerifiedUpdate, onCancelled: () => void): Promise<void> {
  if (installing) throw new Error('已有更新安装正在准备，请稍候')
  if (!app.isPackaged) throw new Error('开发模式不替换应用，请使用安装后的版本')
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('此系统暂不支持应用内安装，请从发布页手工下载安装包')
  if (!isAbsolute(update.filePath) || /[\u0000-\u001f]/.test(update.filePath) || !VERSION.test(update.version) || !/^[a-f0-9]{64}$/.test(update.sha256)) throw new Error('更新安装信息无效，请重新检查版本')
  if (extname(update.filePath).toLowerCase() !== (process.platform === 'darwin' ? '.dmg' : '.exe')) throw new Error('更新安装包与当前系统不匹配')
  assertStorageIdleForUpdate()
  installing = true
  let prepared: PreparedInstall | undefined, paths: HelperPaths | undefined, requestedQuit = false
  const preparingQuit = (event: ElectronEvent): void => { event.preventDefault(); requestedQuit = true }
  const checkCancelled = (): void => { if (requestedQuit) throw new Error('更新准备已取消') }
  app.on('before-quit', preparingQuit)
  try {
    await verifyFile(update.filePath, update.sha256)
    checkCancelled()
    const root = join(app.getPath('userData'), 'update-installer')
    await mkdir(root, { recursive: true, mode: 0o700 })
    if ((await lstat(root)).isSymbolicLink()) throw new Error('更新暂存目录不能是符号链接')
    if (process.platform !== 'win32') await chmod(root, 0o700)
    const directory = await mkdtemp(join(await realpath(root), 'attempt-'))
    const token = randomUUID()
    paths = { directory, token, parentPid: process.pid, deadline: 0,
      ready: join(directory, 'ready'), armed: join(directory, 'armed'), cancelled: join(directory, 'cancelled'), expired: join(directory, 'expired'),
      report: join(app.getPath('userData'), REPORT_NAME), success: join(directory, 'success.json'), failure: join(directory, 'failure.json') }
    const snapshot = join(directory, process.platform === 'darwin' ? 'verified.dmg' : 'verified.exe')
    await copyFile(update.filePath, snapshot, constants.COPYFILE_EXCL)
    if (process.platform !== 'win32') await chmod(snapshot, 0o600)
    await verifyFile(snapshot, update.sha256)
    checkCancelled()
    // The permission window starts after slow mounting/copying, when ready to
    // request a normal quit. Helpers receive this deadline in their source.
    if (process.platform === 'darwin') {
      paths.deadline = Date.now() + 10 * 60_000
      prepared = await prepareMac(paths, snapshot, update.version, checkCancelled)
      // The mounted image has been normally detached and the staged app is
      // independent. Keep the service's cache, not another full DMG per retry.
      await rm(snapshot, { force: true })
    } else {
      paths.deadline = Date.now() + 2 * 60_000
      prepared = await prepareWindows(paths, snapshot, update)
    }
    checkCancelled()
    assertStorageIdleForUpdate()
    // Rebuild the Mac script with a fresh short deadline after preparation.
    // prepareMac carries its private path manifest in the generated script;
    // replacing only the exact numeric assignment does not interpolate data.
    if (process.platform === 'darwin') {
      paths.deadline = Date.now() + 2 * 60_000
      const scriptPath = prepared.args[0]
      const source = await readFile(scriptPath, 'utf8')
      await writeFile(scriptPath, source.replace(/^DEADLINE=\d+$/m, `DEADLINE=${Math.floor(paths.deadline / 1000)}`), { mode: 0o700 })
    }
    const child = await startHelper(prepared)
    checkCancelled()
    assertStorageIdleForUpdate()
    app.removeListener('before-quit', preparingQuit)
    arrangeNormalQuit(prepared, child, onCancelled)
  } catch (error) {
    if (paths) try { writeFileSync(paths.cancelled, paths.token, { mode: 0o600 }) } catch { /* No final-quit ticket exists. */ }
    if (prepared?.stageDirectory) await rm(prepared.stageDirectory, { recursive: true, force: true }).catch(() => {})
    if (process.platform === 'win32' && paths) await rm(join(paths.directory, 'verified.exe'), { force: true }).catch(() => {})
    installing = false
    if (requestedQuit) onCancelled()
    else throw error
  } finally {
    app.removeListener('before-quit', preparingQuit)
    if (requestedQuit) setTimeout(() => app.quit(), 0)
  }
}

/** A one-time startup message; per-attempt logs and recoverable apps are retained. */
export async function readUpdateInstallResult(): Promise<UpdateInstallResult | null> {
  const path = join(app.getPath('userData'), REPORT_NAME)
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384) return null
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!value || typeof value !== 'object') return null
    const result = value as UpdateInstallResult
    if (!['success', 'error'].includes(result.status) || typeof result.version !== 'string' || !VERSION.test(result.version) || typeof result.message !== 'string' || result.message.length > 2000) return null
    if ([result.backupPath, result.logPath].some((entry) => entry !== undefined && (typeof entry !== 'string' || !isAbsolute(entry) || entry.length > 4096))) return null
    await rm(path, { force: true })
    return result
  } catch { return null }
}
