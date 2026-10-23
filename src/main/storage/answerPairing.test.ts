import { describe, it, expect } from 'vitest'
import { buildSync } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath: string = require('electron')
const bundle = buildSync({ entryPoints: [resolve('src/main/storage/answerPairing.fixture.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' }).outputFiles[0].text

describe('旋转页与答案配对（隔离 SQLite 文件库）', () => {
  for (const scenario of ['rotation-roundtrip', 'swapped-pairs-survive-reopen', 'explicit-empty-and-ordered-multiple',
    'invalid-second-binding-rolls-back-all', 'reject-foreign-duplicate-or-incomplete', 'recrop-does-not-rebind-reused-ids',
    'soft-delete-invalidates-whole-composite', 'answer-paper-deletion-clears-images', 'schema-idempotent-preserves-pairs', 'question-deletion-cascades']) {
    it(scenario, () => {
      const result = spawnSync(electronPath, ['-'], { input: bundle, encoding: 'utf8', timeout: 15000, windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ANSWER_TEST_CASE: scenario } })
      expect(result.error, result.error?.message).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('PASS')
    })
  }
})
