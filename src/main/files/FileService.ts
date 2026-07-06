import { app, protocol, net } from 'electron'
import { join } from 'path'
import { copyFile, mkdir, access, writeFile } from 'fs/promises'
import { pathToFileURL } from 'url'

/** 试卷项目根目录：userData/projects/{paperId}/ */
export function paperDir(paperId: number): string {
  return join(app.getPath('userData'), 'projects', String(paperId))
}

/** 试卷图片目录：userData/projects/{paperId}/images/ */
export function imagesDir(paperId: number): string {
  return join(paperDir(paperId), 'images')
}

/** 确保 projects/{paperId}/ 与 images/ 存在。 */
export async function ensurePaperDir(paperId: number): Promise<void> {
  await mkdir(paperDir(paperId), { recursive: true })
  await mkdir(imagesDir(paperId), { recursive: true })
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

/** 在 app.whenReady 后调用：实际挂载文件读取。 */
export function handleAppProtocol(): void {
  const root = join(app.getPath('userData'), 'projects')
  protocol.handle('app', async (request) => {
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
