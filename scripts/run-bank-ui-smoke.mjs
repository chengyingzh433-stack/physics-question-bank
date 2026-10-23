import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

if (!existsSync('out/renderer/index.html')) throw new Error('请先运行 npm run build')
const require = createRequire(import.meta.url)
const outfile = resolve('out/bank-ui-smoke.cjs')
await build({ entryPoints: ['scripts/bank-ui-smoke.ts'], outfile, bundle: true,
  platform: 'node', format: 'cjs', packages: 'external' })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [outfile], { env, stdio: 'inherit', windowsHide: true })
const timer = setTimeout(() => { child.kill(); process.exitCode = 1 }, 60000)
child.on('error', (error) => { clearTimeout(timer); console.error(error); process.exitCode = 1 })
child.on('exit', (code) => { clearTimeout(timer); process.exitCode = code ?? 1 })
