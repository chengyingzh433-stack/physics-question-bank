import { describe, it, expect } from 'vitest'
import { buildSync } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// better-sqlite3 已按 Electron ABI 编译，直接在同一运行时验证，无须重编译或接触用户库。
const require = createRequire(import.meta.url)
const electronPath: string = require('electron')
const bundle = buildSync({
  entryPoints: [resolve('src/main/storage/bankStorage.fixture.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external'
}).outputFiles[0].text

describe('题库真实 SQLite 行为（内存库）', () => {
  for (const scenario of [
    'schema-idempotent', 'multiple-folders-and-counts', 'delete-folder-keeps-question-answer-basket',
    'remove-membership-and-rename', 'invalid-folder-names', 'metadata-search-and-literals',
    'combined-filter-parameter-order', 'atomic-folder-writes', 'basket-dedup-order-and-rollback',
    'deleted-question-cascades-membership'
  ]) {
    it(scenario, () => {
      const result = spawnSync(electronPath, ['-'], {
        input: bundle, encoding: 'utf8', timeout: 15000, windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', BANK_TEST_CASE: scenario }
      })
      expect(result.error, result.error?.message).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('PASS')
    })
  }
})
