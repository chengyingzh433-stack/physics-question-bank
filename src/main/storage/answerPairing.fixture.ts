import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCHEMA_V1 } from './schema'
import { addPages, getPages, deletePaper } from './repositories/paperRepo'
import { replaceSegmentsForPage, setSegmentDeleted } from './repositories/segmentRepo'
import { commitAnswerBindings, getAnswerPairings } from './repositories/answerPairingRepo'
import type { AnswerBindingDTO } from '../../shared/types'

const dir = mkdtempSync(join(tmpdir(), 'answer-pairing-db-'))
const path = join(dir, 'test.db')
let db = new Database(path)
db.exec(SCHEMA_V1)
db.exec(`
  INSERT INTO papers (id,name,kind,parent_paper_id) VALUES
    (1,'题目','paper',NULL),(2,'答案','answer',1),(3,'其他卷','paper',NULL),(4,'其他答案','answer',3);
  INSERT INTO questions (id,paper_id) VALUES (1,1),(2,1);
  INSERT INTO pages (id,paper_id,page_index,width_pt,height_pt) VALUES (1,2,0,400,600),(2,4,0,400,600);
  INSERT INTO segments (id,paper_id,page_id,col_index,x_start_ratio,x_end_ratio,y_start_ratio,y_end_ratio,order_index)
    VALUES (1,2,1,0,0,1,0,0.5,0),(2,2,1,0,0,1,0.5,1,1),(3,4,2,0,0,1,0,1,0);
`)
const binding = (questionId: number, segmentIds: number[]): AnswerBindingDTO => ({
  questionId, segmentIds, imagePath: segmentIds.length ? `projects/1/images/a_${questionId}_test.png` : null,
  widthPx: segmentIds.length ? 400 : null, heightPx: segmentIds.length ? 300 : null
})
const swapped = [binding(1, [2]), binding(2, [1])]
const image = (id: number) => (db.prepare('SELECT answer_image_path FROM questions WHERE id=?').get(id) as { answer_image_path: string | null }).answer_image_path
const scenarios: Record<string, () => void> = {
  'rotation-roundtrip': () => {
    addPages(db, [0, 90, 180, 270].map((rotation, page_index) => ({
      paper_id: 1, page_index, rotation, width_pt: rotation % 180 ? 600 : 400, height_pt: rotation % 180 ? 400 : 600
    })))
    assert.deepEqual(getPages(db, 1).map((p) => [p.rotation, p.width_pt, p.height_pt]),
      [[0, 400, 600], [90, 600, 400], [180, 400, 600], [270, 600, 400]])
  },
  'swapped-pairs-survive-reopen': () => {
    commitAnswerBindings(db, 1, 2, swapped)
    db.close(); db = new Database(path); db.pragma('foreign_keys = ON')
    assert.deepEqual(getAnswerPairings(db, 1), [{ questionId: 1, segmentIds: [2] }, { questionId: 2, segmentIds: [1] }])
    assert.equal(image(1), swapped[0].imagePath)
  },
  'explicit-empty-and-ordered-multiple': () => {
    commitAnswerBindings(db, 1, 2, [binding(1, [2, 1]), binding(2, [])])
    assert.deepEqual(getAnswerPairings(db, 1), [{ questionId: 1, segmentIds: [2, 1] }, { questionId: 2, segmentIds: [] }])
    assert.equal(image(2), null)
    commitAnswerBindings(db, 1, 2, [binding(1, []), binding(2, [])])
    assert.equal(getAnswerPairings(db, 1).length, 2)
    assert.equal(image(1), null)
  },
  'invalid-second-binding-rolls-back-all': () => {
    commitAnswerBindings(db, 1, 2, swapped)
    assert.throws(() => commitAnswerBindings(db, 1, 2, [binding(1, []), binding(2, [999])]), /片段已变化/)
    assert.deepEqual(getAnswerPairings(db, 1).map((p) => p.segmentIds), [[2], [1]])
    assert.equal(image(1), swapped[0].imagePath)
  },
  'reject-foreign-duplicate-or-incomplete': () => {
    assert.throws(() => commitAnswerBindings(db, 1, 4, swapped), /不属于/)
    assert.throws(() => commitAnswerBindings(db, 1, 2, [binding(1, [3]), binding(2, [])]), /片段已变化/)
    assert.throws(() => commitAnswerBindings(db, 1, 2, [binding(1, [1]), binding(1, [2])]), /重复/)
    assert.throws(() => commitAnswerBindings(db, 1, 2, [binding(1, [1])]), /数量已变化/)
    assert.throws(() => commitAnswerBindings(db, 1, 2, [binding(1, [1, 1]), binding(2, [])]), /片段已变化/)
    assert.deepEqual(getAnswerPairings(db, 1), [])
  },
  'recrop-does-not-rebind-reused-ids': () => {
    commitAnswerBindings(db, 1, 2, swapped)
    replaceSegmentsForPage(db, 1, 2, [{ col_index: 0, x_start_ratio: 0, x_end_ratio: 1, y_start_ratio: 0, y_end_ratio: 1 }])
    assert.deepEqual(getAnswerPairings(db, 1).map((p) => p.segmentIds), [[], []])
    assert.equal(image(1), null); assert.equal(image(2), null)
  },
  'soft-delete-invalidates-whole-composite': () => {
    commitAnswerBindings(db, 1, 2, [binding(1, [1, 2]), binding(2, [])])
    setSegmentDeleted(db, 1, true)
    assert.deepEqual(getAnswerPairings(db, 1)[0].segmentIds, [])
    assert.equal(image(1), null)
    setSegmentDeleted(db, 1, false)
    assert.deepEqual(getAnswerPairings(db, 1)[0].segmentIds, [])
  },
  'answer-paper-deletion-clears-images': () => {
    commitAnswerBindings(db, 1, 2, swapped)
    deletePaper(db, 2)
    assert.equal(image(1), null); assert.equal(image(2), null)
    assert.deepEqual(getAnswerPairings(db, 1), [])
  },
  'schema-idempotent-preserves-pairs': () => {
    commitAnswerBindings(db, 1, 2, swapped)
    db.exec(SCHEMA_V1)
    assert.deepEqual(getAnswerPairings(db, 1).map((p) => p.segmentIds), [[2], [1]])
  },
  'question-deletion-cascades': () => {
    commitAnswerBindings(db, 1, 2, swapped)
    db.prepare('DELETE FROM questions WHERE id=1').run()
    assert.deepEqual(getAnswerPairings(db, 1), [{ questionId: 2, segmentIds: [1] }])
    deletePaper(db, 1)
    assert.deepEqual(db.prepare('SELECT * FROM answer_pairings').all(), [])
  }
}
try {
  scenarios[process.env.ANSWER_TEST_CASE!](); process.stdout.write('PASS')
} finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
