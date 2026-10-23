// 由 bankStorage.test.ts 在 Electron Node 模式执行，所有读写仅限内存库。
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { SCHEMA_V1 } from './schema'
import * as folders from './repositories/folderRepo'
import * as sets from './repositories/setRepo'
import { listBankQuestions } from './repositories/questionRepo'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(SCHEMA_V1)
db.exec(`
  INSERT INTO papers (id, name, kind, year, source) VALUES
    (1, '高一力学月考', 'paper', 2024, '校本'),
    (2, '100%_精选', 'paper', 2025, '全国卷'),
    (3, '高一力学月考答案', 'answer', 2024, '校本');
  INSERT INTO question_types (id, name) VALUES (10, '计算题'), (11, '单选题');
  INSERT INTO chapters (id, name) VALUES (20, '牛顿运动定律');
  INSERT INTO knowledge_points (id, name) VALUES (30, '受力分析'), (31, '临界条件');
  INSERT INTO questions (id, paper_id, order_in_paper, type_id, chapter_id, image_path, answer_image_path, year_override, source_override) VALUES
    (1, 1, 1, 10, 20, 'q_1.png', 'a_1.png', NULL, NULL),
    (2, 1, 2, 11, NULL, 'q_2.png', NULL, 2026, '期末精选'),
    (3, 2, 1, 10, NULL, 'q_3.png', NULL, NULL, NULL),
    (4, 3, 1, 10, 20, 'answer.png', NULL, NULL, NULL),
    (5, 1, 3, 10, 20, NULL, NULL, NULL, NULL);
  INSERT INTO question_knowledge_points VALUES (1, 30), (1, 31), (2, 31), (4, 30);
`)
const ids = (criteria: Parameters<typeof listBankQuestions>[1]) => listBankQuestions(db, criteria).map((q) => q.id)

const scenarios: Record<string, () => void> = {
  'schema-idempotent': () => {
    const id = folders.createFolder(db, '力学')
    folders.addQuestionsToFolder(db, id, [1])
    db.exec(SCHEMA_V1)
    assert.deepEqual(ids({}), [1, 2, 3])
    assert.equal(folders.listFolders(db)[0].question_count, 1)
  },
  'multiple-folders-and-counts': () => {
    const a = folders.createFolder(db, '期末复习')
    const b = folders.createFolder(db, '好题')
    assert.equal(folders.addQuestionsToFolder(db, a, [1, 1, 2]), 2)
    assert.equal(folders.addQuestionsToFolder(db, a, [1]), 0)
    assert.equal(folders.addQuestionsToFolder(db, b, [1]), 1)
    assert.deepEqual(folders.listFolders(db).map((f) => f.question_count), [2, 1])
    assert.deepEqual(ids({ folder_id: a }), [1, 2])
    assert.deepEqual(ids({ folder_id: b }), [1])
    assert.deepEqual(ids({ unfiled: true }), [3])
  },
  'delete-folder-keeps-question-answer-basket': () => {
    const a = folders.createFolder(db, '待删题夹')
    const b = folders.createFolder(db, '保留题夹')
    folders.addQuestionsToFolder(db, a, [1, 2]); folders.addQuestionsToFolder(db, b, [1])
    const sid = sets.getOrCreateDraftSet(db)
    sets.addManyToSet(db, sid, [1, 2])
    folders.deleteFolder(db, a)
    assert.deepEqual(ids({}), [1, 2, 3])
    assert.deepEqual(ids({ folder_id: b }), [1])
    assert.deepEqual(ids({ unfiled: true }), [2, 3])
    assert.equal(listBankQuestions(db, {})[0].answer_image_path, 'a_1.png')
    assert.deepEqual(sets.listSetQuestionIds(db, sid), [1, 2])
  },
  'remove-membership-and-rename': () => {
    const id = folders.createFolder(db, ' 原题夹 ')
    folders.addQuestionsToFolder(db, id, [1, 2])
    assert.equal(folders.removeQuestionsFromFolder(db, id, [1, 1]), 1)
    folders.renameFolder(db, id, ' 新题夹 ')
    assert.deepEqual(folders.listFolders(db), [{ id, name: '新题夹', question_count: 1 }])
    assert.deepEqual(ids({}), [1, 2, 3])
  },
  'invalid-folder-names': () => {
    const id = folders.createFolder(db, '精选')
    assert.throws(() => folders.createFolder(db, ' 精选 '), /同名/)
    assert.throws(() => folders.createFolder(db, ' '), /1–60/)
    assert.throws(() => folders.createFolder(db, '题'.repeat(61)), /1–60/)
    const second = folders.createFolder(db, '月考')
    assert.throws(() => folders.renameFolder(db, second, '精选'), /同名/)
    folders.renameFolder(db, id, '精选')
    assert.throws(() => folders.renameFolder(db, 999, '不存在'), /不存在/)
  },
  'metadata-search-and-literals': () => {
    assert.deepEqual(ids({ search: '月考' }), [1, 2])
    assert.deepEqual(ids({ search: '校本' }), [1]) // 单题出处覆盖优先
    assert.deepEqual(ids({ search: '期末精选' }), [2])
    assert.deepEqual(ids({ search: '计算题' }), [1, 3])
    assert.deepEqual(ids({ search: '牛顿' }), [1])
    assert.deepEqual(ids({ search: '临界' }), [1, 2])
    assert.deepEqual(ids({ search: ' %_ ' }), [3]) // 按字面搜索
    assert.deepEqual(ids({ search: "' OR 1=1 --" }), [])
    assert.deepEqual(ids({ search: '  ' }), [1, 2, 3])
  },
  'combined-filter-parameter-order': () => {
    const folder = folders.createFolder(db, '好题')
    folders.addQuestionsToFolder(db, folder, [1, 2])
    assert.deepEqual(ids({ type_id: 10, chapter_id: 20, kp_ids: [30, 31], year: 2024,
      source: '校本', folder_id: folder, search: '受力', answer_status: 'with' }), [1])
    assert.deepEqual(ids({ type_id: 11, kp_ids: [31], year: 2026 }), [2])
    assert.deepEqual(ids({ answer_status: 'without' }), [2, 3])
    assert.deepEqual(ids({ paper_id: 3 }), []) // 答案卷隔离
    assert.deepEqual(ids({ folder_id: folder, unfiled: true }), [])
  },
  'atomic-folder-writes': () => {
    const id = folders.createFolder(db, '好题')
    for (const badId of [4, 5, 999, -1, 1.5]) {
      assert.throws(() => folders.addQuestionsToFolder(db, id, [1, badId]))
      assert.equal(folders.listFolders(db)[0].question_count, 0)
    }
    assert.throws(() => folders.addQuestionsToFolder(db, 999, [1]), /不存在/)
  },
  'basket-dedup-order-and-rollback': () => {
    const sid = sets.getOrCreateDraftSet(db)
    assert.equal(sets.addManyToSet(db, sid, [2, 1, 2]), 2)
    assert.equal(sets.addManyToSet(db, sid, [1, 3]), 1)
    assert.deepEqual(sets.listSetItems(db, sid).map((i) => i.question_id), [2, 1, 3])
    sets.removeQuestionFromSet(db, sid, 3)
    assert.throws(() => sets.addManyToSet(db, sid, [3, 4]))
    assert.deepEqual(sets.listSetItems(db, sid).map((i) => i.question_id), [2, 1])
    assert.throws(() => sets.addManyToSet(db, 999, [3]), /不存在/)
  },
  'deleted-question-cascades-membership': () => {
    const id = folders.createFolder(db, '好题')
    folders.addQuestionsToFolder(db, id, [1])
    db.prepare('DELETE FROM questions WHERE id = ?').run(1)
    assert.equal(folders.listFolders(db)[0].question_count, 0)
    assert.deepEqual(db.prepare('SELECT * FROM question_folder_items').all(), [])
  }
}

try {
  const scenario = scenarios[process.env.BANK_TEST_CASE ?? '']
  assert.ok(scenario, '需要指定 BANK_TEST_CASE')
  scenario()
  process.stdout.write('PASS')
} finally { db.close() }
