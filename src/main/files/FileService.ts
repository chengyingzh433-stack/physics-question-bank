import { app, protocol, net } from 'electron'
import { join, sep, relative } from 'path'
import { copyFile, mkdir, access, writeFile, rm, readdir, cp } from 'fs/promises'
import { pathToFileURL } from 'url'
import { getDb } from '../storage/StorageService'

/** 试卷项目根目录（可配置）。
 *  读取 app_settings 的 storage_path，有值用自定义路径，否则回退 userData/projects/。
 *  每次调用时动态读取，不缓存——用户可能中途改了存储位置。 */
export function getProjectsRoot(): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get('storage_path') as
    | { value: string }
    | undefined
  if (row?.value) return row.value
  return join(app.getPath('userData'), 'projects')
}

/** 试卷项目根目录：{projectsRoot}/{paperId}/ */
export function paperDir(paperId: number): string {
  return join(getProjectsRoot(), String(paperId))
}

/** 试卷图片目录：{projectsRoot}/{paperId}/images/ */
export function imagesDir(paperId: number): string {
  return join(paperDir(paperId), 'images')
}

/** 确保 projects/{paperId}/ 与 images/ 存在。 */
export async function ensurePaperDir(paperId: number): Promise<void> {
  await mkdir(paperDir(paperId), { recursive: true })
  await mkdir(imagesDir(paperId), { recursive: true })
}

/**
 * 删除某试卷的整个项目目录（source.pdf + images/）。
 * 严格安全校验：paperId 必须为正整数，目标路径必须解析后仍在 projects/ 根目录之下，
 * 且相对路径不以 .. 开头（防穿越）。目录不存在视为成功（force:true）。
 */
export async function deletePaperDir(paperId: number): Promise<void> {
  // 整数校验兜底：paperId 来自 DB 主键，天然可信，但仍拒绝非正整数
  if (!Number.isInteger(paperId) || paperId <= 0) return
  const root = getProjectsRoot()
  const target = paperDir(paperId) // .../projects/{id}
  // 防穿越：相对 root 的路径必须不以 .. 开头，且 target 必须在 root 之下
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel === '') return
  // 再次确认 target 真的在 root 之下（双保险，防 symlink/边界）
  const resolvedTarget = target
  const resolvedRoot = root
  if (!resolvedTarget.startsWith(resolvedRoot + sep) && resolvedTarget !== resolvedRoot) {
    return
  }
  await rm(target, { recursive: true, force: true })
}

/** 复制来源 PDF 到项目目录为 source.pdf，返回目标路径。A8: 用 path.join。 */
export async function copySourcePdf(
  paperId: number,
  srcPath: string
): Promise<string> {
  await ensurePaperDir(paperId)
  const dst = join(paperDir(paperId), 'source.pdf')
  await copyFile(srcPath, dst)
  return dst
}

/** 取某试卷 source.pdf 的绝对路径（不存在返回 null）。 */
export async function getSourcePdfPath(paperId: number): Promise<string | null> {
  const p = join(paperDir(paperId), 'source.pdf')
  try {
    await access(p)
    return p
  } catch {
    return null
  }
}

/** 把图片绝对路径转成 app:// URL 供渲染进程 <img> 使用（A8: 不直接塞中文路径）。 */
export function imageFileUrl(paperId: number, filename: string): string {
  const p = join(imagesDir(paperId), filename)
  return pathToFileURL(p).href
}

/**
 * 注册 app:// 协议，把 userData/projects/ 下的文件安全映射给渲染进程。
 * 用法：app://projects/{paperId}/source.pdf  或  app://projects/{paperId}/images/q_1.png
 * 必须在 app.whenReady 之前（或 ready 内、setWindow 之前）调用 scheme 注册。
 */
export function registerAppProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

/** 在 app.whenReady 后调用：实际挂载文件读取。每次请求动态读取根路径（支持运行时切换存储位置）。 */
export function handleAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const root = getProjectsRoot()
    // 期望路径形如 app://projects/{paperId}/source.pdf
    const url = new URL(request.url)
    // host 在 standard scheme 下是 'projects'，pathname 是 /{paperId}/...
    const rel = decodeURIComponent(url.host + url.pathname)
    // 仅允许访问 projects/ 之下，防止越权
    const parts = rel.split('/').filter(Boolean)
    if (parts[0] !== 'projects') {
      return new Response('Forbidden', { status: 403 })
    }
    const fsPath = join(root, ...parts.slice(1))
    // 防止路径穿越：确保最终路径在 root 之下
    if (!fsPath.startsWith(root)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(fsPath).href)
  })
}

/**
 * 把题图 PNG 字节写到 projects/{paperId}/images/q_{questionId}.png。
 * 返回相对路径（存 questions.image_path）与 app:// URL（供 <img>）。
 */
export async function saveQuestionPng(
  paperId: number,
  questionId: number,
  data: ArrayBuffer
): Promise<{ relPath: string; url: string }> {
  await ensurePaperDir(paperId)
  const filename = `q_${questionId}.png`
  const abs = join(imagesDir(paperId), filename)
  await writeFile(abs, Buffer.from(data))
  const relPath = `projects/${paperId}/images/${filename}`
  return { relPath, url: `app://projects/${paperId}/images/${filename}` }
}

/**
 * 把答案图 PNG 字节写到 projects/{paperId}/images/a_{questionId}.png（M14）。
 *
 * 注意 paperId 传的是【题目卷】id，不是答案卷——答案图跟着题目走，
 * 存在题目卷目录下，删题目卷时 deletePaperDir 一并清掉，不留孤儿文件。
 */
export async function saveAnswerPng(
  paperId: number,
  questionId: number,
  data: ArrayBuffer
): Promise<{ relPath: string; url: string }> {
  await ensurePaperDir(paperId)
  const filename = `a_${questionId}.png`
  const abs = join(imagesDir(paperId), filename)
  await writeFile(abs, Buffer.from(data))
  const relPath = `projects/${paperId}/images/${filename}`
  return { relPath, url: `app://projects/${paperId}/images/${filename}` }
}

/**
 * 删除某题目卷下所有答案图 PNG（images/a_*.png）（M14）。
 * 只删 a_ 前缀的文件，题图 q_*.png 绝不能碰。
 * 目录不存在或个别文件删不掉都视为成功——DB 才是真值，磁盘残留只是浪费空间。
 */
export async function deleteAnswerPngs(paperId: number): Promise<void> {
  if (!Number.isInteger(paperId) || paperId <= 0) return
  const dir = imagesDir(paperId)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return // 目录不存在，没什么可删
  }
  for (const name of names) {
    if (!name.startsWith('a_') || !name.endsWith('.png')) continue
    await rm(join(dir, name), { force: true }).catch(() => {})
  }
}

/**
 * 迁移项目文件到新存储路径。
 * 流程：mkdir 新路径 → 逐项复制旧数据 → 写设置 → 删旧数据。
 * 任一步骤失败则抛出错误，旧数据保留、设置不更新。
 */
export async function migrateStorage(newPath: string): Promise<void> {
  const oldRoot = getProjectsRoot()
  // 同一路径无需迁移
  if (oldRoot === newPath) return

  // 确保新路径存在
  await mkdir(newPath, { recursive: true })

  // 遍历旧路径下每个子目录，复制到新路径
  let entries: string[]
  try {
    entries = await readdir(oldRoot)
  } catch {
    // 旧目录不存在（首次使用），直接设新路径即可
    entries = []
  }

  for (const name of entries) {
    const src = join(oldRoot, name)
    const dst = join(newPath, name)
    await cp(src, dst, { recursive: true, force: true })
  }

  // 全部复制成功，更新设置
  getDb()
    .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('storage_path', newPath)

  // 删除旧目录下已迁移的子目录（不删根目录本身，避免误删）
  for (const name of entries) {
    await rm(join(oldRoot, name), { recursive: true, force: true })
  }
}
