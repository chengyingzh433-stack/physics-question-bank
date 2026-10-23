// 由 chapterTemplates.test.ts 使用 Electron Node 模式执行，不打开用户数据库。
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { SCHEMA_V1 } from './schema'
import {
  initializeChapterTemplates, installChapterTemplate, listChapterTemplates, migrateChapterTemplates
} from './chapterTemplates'
import { DEFAULT_CHAPTER_TEMPLATE_KEY } from '../../shared/chapterTemplates'
import * as tags from './repositories/tagRepo'
import { batchGetQuestionKnowledgePoints, listBankQuestions } from './repositories/questionRepo'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
// 显式保留旧版两列章节表，保证测试实际执行 ALTER TABLE 升级路径。
db.exec('CREATE TABLE chapters (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
db.exec(SCHEMA_V1)
db.exec(`
  INSERT INTO papers (id, name, kind) VALUES (1, '原有试卷', 'paper');
  INSERT INTO chapters (id, name) VALUES (20, '原有力学专题');
  INSERT INTO knowledge_points (id, name, chapter_id) VALUES (30, '受力分析', 20);
  INSERT INTO question_types (id, name) VALUES (10, '计算题'), (11, '单选题');
  INSERT INTO questions (id, paper_id, order_in_paper, chapter_id, image_path, answer_image_path)
    VALUES (1, 1, 1, 20, 'q_1.png', 'a_1.png');
  INSERT INTO question_knowledge_points (question_id, kp_id) VALUES (1, 30);
`)

function rowCount(table: 'chapters' | 'knowledge_points'): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
}

function templateHierarchy(): {
  books: ReturnType<typeof tags.listChapters>
  chapters: ReturnType<typeof tags.listChapters>
  sections: ReturnType<typeof tags.listChapters>
} {
  const rows = tags.listChapters(db).filter((row) => row.id !== 20)
  const books = rows.filter((row) => row.parent_id === null)
  const bookIds = new Set(books.map((row) => row.id))
  const chapters = rows.filter((row) => row.parent_id !== null && bookIds.has(row.parent_id))
  const chapterIds = new Set(chapters.map((row) => row.id))
  const sections = rows.filter((row) => row.parent_id !== null && chapterIds.has(row.parent_id))
  return { books, chapters, sections }
}

function addQuestion(id: number, chapterId: number, typeId = 10): void {
  db.prepare(`INSERT INTO questions (id, paper_id, order_in_paper, chapter_id, type_id, image_path)
    VALUES (?, 1, ?, ?, ?, ?)`).run(id, id, chapterId, typeId, `q_${id}.png`)
}

const questionIds = (criteria: Parameters<typeof listBankQuestions>[1]): number[] =>
  listBankQuestions(db, criteria).map((question) => question.id)

const scenarios: Record<string, () => void> = {
  'legacy-migration-preserves-bindings': () => {
    assert.deepEqual(
      (db.prepare('PRAGMA table_info(chapters)').all() as { name: string }[]).map((column) => column.name),
      ['id', 'name']
    )
    migrateChapterTemplates(db)
    assert.equal(rowCount('chapters'), 1, '仅迁移结构时不添加模板')
    initializeChapterTemplates(db)
    const chapter = tags.listChapters(db).find((row) => row.id === 20)
    assert.ok(chapter)
    assert.equal(chapter.name, '原有力学专题')
    assert.equal(chapter.parent_id, null)
    assert.deepEqual(tags.listKnowledgePoints(db), [{ id: 30, name: '受力分析', chapter_id: 20 }])
    assert.deepEqual(tags.getQuestionKnowledgePoints(db, 1), [30])
    assert.equal(listBankQuestions(db, {})[0].chapter_id, 20)
    assert.equal(listBankQuestions(db, {})[0].answer_image_path, 'a_1.png')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  },

  'default-template-complete-hierarchy': () => {
    initializeChapterTemplates(db)
    const { books, chapters, sections } = templateHierarchy()
    assert.equal(books.length, 6)
    assert.equal(chapters.length, 27)
    assert.equal(sections.length, 125)
    assert.equal(rowCount('chapters'), 159, '158 个模板节点加 1 个原有自定义章节')
    assert.deepEqual(books.map((book) => book.name), [
      '必修第一册', '必修第二册', '必修第三册',
      '选择性必修第一册', '选择性必修第二册', '选择性必修第三册'
    ])
    assert.deepEqual(books.map((book) => chapters.filter((chapter) => chapter.parent_id === book.id).length),
      [4, 4, 5, 4, 5, 5])
    for (const chapter of chapters) {
      assert.ok(sections.some((section) => section.parent_id === chapter.id), `${chapter.name} 应包含节`)
    }
    assert.ok(sections.some((section) => section.name === '必修第一册 / 第一章 运动的描述 / 1 质点 参考系'))
    assert.ok(sections.some((section) => section.name.includes('选择性必修第三册 / 第五章 原子核 / 5 “基本”粒子')))
    assert.equal(new Set(tags.listChapters(db).map((chapter) => chapter.name)).size, 159)
    assert.equal(listChapterTemplates(db).length, 1)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  },

  'initialize-and-install-idempotent': () => {
    initializeChapterTemplates(db)
    const initialRows = tags.listChapters(db)
    const initialTemplates = listChapterTemplates(db)
    migrateChapterTemplates(db)
    initializeChapterTemplates(db)
    installChapterTemplate(db, DEFAULT_CHAPTER_TEMPLATE_KEY)
    installChapterTemplate(db, DEFAULT_CHAPTER_TEMPLATE_KEY)
    initializeChapterTemplates(db)
    assert.deepEqual(tags.listChapters(db), initialRows, '重复启动和应用模板不能改变既有 ID 或增加重复项')
    assert.deepEqual(listChapterTemplates(db), initialTemplates)
    assert.deepEqual(tags.getQuestionKnowledgePoints(db, 1), [30])
  },

  'custom-chapters-deduplicate-by-parent': () => {
    initializeChapterTemplates(db)
    const parentA = tags.createChapter(db, ' 专题一 ')
    const parentB = tags.createChapter(db, '专题二')
    const childA = tags.createChapter(db, ' 复习 ', parentA)
    const count = rowCount('chapters')
    assert.equal(tags.createChapter(db, '复习', parentA), childA)
    assert.equal(tags.createChapter(db, '  原有力学专题  '), 20, '旧版自定义章节也按同级同名复用')
    assert.equal(rowCount('chapters'), count)
    const childB = tags.createChapter(db, '复习', parentB)
    const root = tags.createChapter(db, '复习')
    assert.notEqual(childB, childA)
    assert.notEqual(root, childA)
    assert.notEqual(root, childB)
    const rows = tags.listChapters(db)
    assert.equal(rows.find((row) => row.id === parentA)?.name, '专题一')
    assert.equal(rows.find((row) => row.id === childA)?.name, '专题一 / 复习')
    assert.equal(rows.find((row) => row.id === childB)?.parent_id, parentB)
    assert.equal(rows.find((row) => row.id === root)?.parent_id, null)
  },

  'template-and-custom-chapters-coexist': () => {
    initializeChapterTemplates(db)
    const { chapters } = templateHierarchy()
    const templateChapter = chapters[0]
    const customRoot = tags.createChapter(db, '校本拓展')
    const customChild = tags.createChapter(db, '校本拓展', templateChapter.id)
    const before = tags.listChapters(db)
    installChapterTemplate(db, DEFAULT_CHAPTER_TEMPLATE_KEY)
    initializeChapterTemplates(db)
    assert.deepEqual(tags.listChapters(db), before)
    assert.equal(tags.listChapters(db).find((row) => row.id === customChild)?.name,
      `${templateChapter.name} / 校本拓展`)
    assert.equal(tags.listChapters(db).find((row) => row.id === customRoot)?.parent_id, null)
    assert.deepEqual(questionIds({ chapter_id: 20 }), [1])
  },

  'parent-filter-includes-descendants': () => {
    initializeChapterTemplates(db)
    const { books, chapters, sections } = templateHierarchy()
    const book = books[0]
    const chapter = chapters.find((row) => row.parent_id === book.id)!
    const section = sections.find((row) => row.parent_id === chapter.id)!
    const otherChapter = chapters.find((row) => row.parent_id === books[1].id)!
    const customChild = tags.createChapter(db, '教师专题', section.id)
    const customGrandchild = tags.createChapter(db, '拓展练习', customChild)
    addQuestion(2, section.id)
    addQuestion(3, chapter.id)
    addQuestion(4, customGrandchild, 11)
    addQuestion(5, otherChapter.id)
    addQuestion(6, book.id)
    tags.setQuestionKnowledgePoints(db, 2, [30])
    assert.deepEqual(questionIds({ chapter_id: book.id }), [2, 3, 4, 6])
    assert.deepEqual(questionIds({ chapter_id: chapter.id }), [2, 3, 4])
    assert.deepEqual(questionIds({ chapter_id: section.id }), [2, 4])
    assert.deepEqual(questionIds({ chapter_id: customChild }), [4])
    assert.deepEqual(questionIds({ chapter_id: otherChapter.id }), [5])
    assert.deepEqual(questionIds({ chapter_id: 20 }), [1])
    assert.deepEqual(questionIds({ chapter_id: 99999 }), [])
    assert.deepEqual(questionIds({ chapter_id: chapter.id, type_id: 10, kp_ids: [30], search: '参考系' }), [2],
      '递归条件与知识点 JOIN、题型和搜索同时启用时参数顺序仍正确')
  },

  'invalid-inputs-do-not-write': () => {
    initializeChapterTemplates(db)
    const chaptersBefore = tags.listChapters(db)
    const pointsBefore = tags.listKnowledgePoints(db)
    assert.throws(() => installChapterTemplate(db, 'does-not-exist'))
    assert.throws(() => tags.createChapter(db, '   '), /空/)
    assert.throws(() => tags.createChapter(db, '题'.repeat(101)), /100/)
    assert.throws(() => tags.createChapter(db, '不存在的父级', 99999), /不存在/)
    assert.throws(() => tags.createKnowledgePoint(db, '  ', null), /空/)
    assert.throws(() => tags.createKnowledgePoint(db, '知'.repeat(101), null), /100/)
    assert.throws(() => tags.createKnowledgePoint(db, '不存在的章节', 99999))
    assert.deepEqual(tags.listChapters(db), chaptersBefore)
    assert.deepEqual(tags.listKnowledgePoints(db), pointsBefore)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  },

  'knowledge-points-normalize-and-deduplicate': () => {
    initializeChapterTemplates(db)
    const scopedId = tags.createKnowledgePoint(db, ' 受力分析 ', 20)
    assert.equal(scopedId, 30, '复用原有知识点并保留题目关联')
    assert.equal(rowCount('knowledge_points'), 1)
    const globalId = tags.createKnowledgePoint(db, '  受力分析  ', null)
    assert.notEqual(globalId, scopedId)
    assert.equal(tags.createKnowledgePoint(db, '受力分析', null), globalId)
    const { chapters } = templateHierarchy()
    const anotherScopeId = tags.createKnowledgePoint(db, '受力分析', chapters[0].id)
    assert.notEqual(anotherScopeId, scopedId)
    assert.notEqual(anotherScopeId, globalId)
    assert.equal(rowCount('knowledge_points'), 3)
    assert.ok(tags.listKnowledgePoints(db).every((point) => point.name === '受力分析'))
    assert.deepEqual(tags.getQuestionKnowledgePoints(db, 1), [30])
    assert.deepEqual(questionIds({ kp_ids: [30] }), [1])
  },

  'batch-question-knowledge-point-ids': () => {
    initializeChapterTemplates(db)
    addQuestion(2, 20)
    addQuestion(3, 20)
    const secondPoint = tags.createKnowledgePoint(db, '牛顿第二定律', 20)
    const thirdPoint = tags.createKnowledgePoint(db, '运动学分析', null)
    tags.setQuestionKnowledgePoints(db, 1, [thirdPoint, 30, secondPoint])
    tags.setQuestionKnowledgePoints(db, 2, [secondPoint])
    // 真实库没有这两个字段；批量标签读取必须遵循 ID[] API 契约。
    const columns = (db.prepare('PRAGMA table_info(knowledge_points)').all() as { name: string }[])
      .map((column) => column.name)
    assert.equal(columns.includes('created_at'), false)
    assert.equal(columns.includes('updated_at'), false)
    const result: Map<number, number[]> = batchGetQuestionKnowledgePoints(db, [3, 2, 1, 1])
    assert.ok(result instanceof Map)
    assert.deepEqual([...result], [[1, [30, secondPoint, thirdPoint]], [2, [secondPoint]]])
    assert.equal(result.get(3), undefined, '无知识点的题目不创建映射项')
    for (const [questionId, pointIds] of result) {
      assert.equal(typeof questionId, 'number')
      assert.ok(pointIds.every((pointId) => typeof pointId === 'number' && Number.isInteger(pointId)))
    }
    assert.deepEqual(batchGetQuestionKnowledgePoints(db, [3]), new Map())
    assert.deepEqual(batchGetQuestionKnowledgePoints(db, []), new Map())
  },

  'chapter-delete-preserves-template-and-children': () => {
    initializeChapterTemplates(db)
    const { books, sections } = templateHierarchy()
    const before = rowCount('chapters')
    assert.throws(() => tags.deleteChapter(db, books[0].id))
    assert.throws(() => tags.deleteChapter(db, sections[0].id))
    assert.equal(rowCount('chapters'), before)
    const parent = tags.createChapter(db, '可删除的自定义')
    const child = tags.createChapter(db, '子章节', parent)
    addQuestion(2, child)
    const point = tags.createKnowledgePoint(db, '子章节知识点', child)
    tags.setQuestionKnowledgePoints(db, 2, [point])
    assert.throws(() => tags.deleteChapter(db, parent))
    assert.equal(rowCount('chapters'), before + 2)
    tags.deleteChapter(db, child)
    assert.equal(listBankQuestions(db, {}).find((question) => question.id === 2)?.chapter_id, null)
    assert.equal(tags.listKnowledgePoints(db).find((knowledge) => knowledge.id === point)?.chapter_id, null)
    assert.deepEqual(tags.getQuestionKnowledgePoints(db, 2), [point])
    tags.deleteChapter(db, parent)
    assert.equal(rowCount('chapters'), before)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  }
}

try {
  const scenario = scenarios[process.env.CHAPTER_TEMPLATE_TEST_CASE ?? '']
  assert.ok(scenario, '需要指定 CHAPTER_TEMPLATE_TEST_CASE')
  scenario()
  process.stdout.write('PASS')
} finally {
  db.close()
}
