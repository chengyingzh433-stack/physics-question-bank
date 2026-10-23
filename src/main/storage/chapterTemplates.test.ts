import { describe, it, expect } from 'vitest'
import { buildSync } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// 原生 SQLite 使用与发布程序一致的 Electron ABI；每个场景仅使用独立内存库。
const require = createRequire(import.meta.url)
const electronPath: string = require('electron')
const bundle = buildSync({
  entryPoints: [resolve('src/main/storage/chapterTemplates.fixture.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external'
}).outputFiles[0].text

describe('章节模板与可搜索知识点（真实 SQLite 内存库）', () => {
  for (const scenario of [
    'legacy-migration-preserves-bindings',
    'default-template-complete-hierarchy',
    'initialize-and-install-idempotent',
    'custom-chapters-deduplicate-by-parent',
    'template-and-custom-chapters-coexist',
    'parent-filter-includes-descendants',
    'invalid-inputs-do-not-write',
    'knowledge-points-normalize-and-deduplicate',
    'batch-question-knowledge-point-ids',
    'chapter-delete-preserves-template-and-children'
  ]) {
    it(scenario, () => {
      const result = spawnSync(electronPath, ['-'], {
        input: bundle, encoding: 'utf8', timeout: 15000, windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CHAPTER_TEMPLATE_TEST_CASE: scenario }
      })
      expect(result.error, result.error?.message).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('PASS')
    })
  }
})
