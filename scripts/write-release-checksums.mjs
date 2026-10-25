// 为发布安装包生成完整性摘要；仅读取文件，不运行应用。
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const directory = join(root, 'release', version)
const allowed = new Set([
  `physics-question-bank-${version}-mac-arm64.dmg`,
  `physics-question-bank-${version}-mac-x64.dmg`,
  `教师题库-测试版-${version}-安装程序.exe`
])
const names = (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && allowed.has(entry.name))
  .map((entry) => entry.name).sort()
if (!names.length) throw new Error(`未找到 ${version} 的安装包，请先完成打包。`)
const lines = []
for (const name of names) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(directory, name))) hash.update(chunk)
  lines.push(`${hash.digest('hex')}  ${name}`)
}
await writeFile(join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8')
console.log(`已为 ${names.length} 个安装包生成 release/${version}/SHA256SUMS.txt`)
